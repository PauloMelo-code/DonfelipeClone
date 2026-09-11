import bcrypt from "bcryptjs";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  configuracoes, gruposWhatsapp, historicoPublicacao,
  trilhaAuditoria, usuarios, veiculos,
  type NovoGrupoWhatsapp,
} from "../../src/lib/db/schema";
import { CONFIGURACOES, GRUPOS_DESTINO, GRUPOS_FONTE, MARGEM } from "./dados/grupos";
import { VEICULOS } from "./dados/veiculos";
import { daysAgo, formatAd, hash, rawWhatsApp } from "./formato";
import type { StatusDeDemo, VeiculoGravado } from "./tipos";

// ---------------------------------------------------------------------------
// Os passos que montam a base de demonstracao, na ordem em que precisam rodar.
//
// A ordem importa por causa das chaves estrangeiras: grupos antes de veiculos,
// veiculos antes de historico e auditoria. Apagar segue a ordem inversa.
// ---------------------------------------------------------------------------

type Db = PostgresJsDatabase<Record<string, never>>;

const sorteio = (n: number) => Math.floor(Math.random() * n);

/**
 * Zera as tabelas.
 *
 * Delete FISICO e proposital: este e um seed de demonstracao que recria a base
 * do zero. A regra de soft delete vale pro codigo da aplicacao, nao pro reset
 * de um banco de desenvolvimento.
 */
export async function limpar(db: Db) {
  // Ordem inversa das dependencias: quem aponta pra alguem sai primeiro.
  await db.delete(trilhaAuditoria);
  await db.delete(historicoPublicacao);
  await db.delete(veiculos);
  await db.delete(gruposWhatsapp);
  await db.delete(configuracoes);
  await db.delete(usuarios);
  console.log("Cleaned existing data.");
}

export async function criarAdmin(db: Db, senha: string) {
  const [admin] = await db
    .insert(usuarios)
    .values({
      email: "admin@donfelipe.com.br",
      name: "Paulo Vitor",
      password: await bcrypt.hash(senha, 10),
      role: "ADMIN",
    })
    .returning();
  console.log("Admin:", admin.email);
  return admin;
}

export async function criarConfiguracoes(db: Db) {
  for (const c of CONFIGURACOES) await db.insert(configuracoes).values(c);
  console.log("Settings:", CONFIGURACOES.length);
}

export async function criarGrupos(db: Db) {
  const inserir = async (dados: NovoGrupoWhatsapp) => {
    const [g] = await db.insert(gruposWhatsapp).values(dados).returning();
    return g;
  };
  const fonte = await Promise.all(GRUPOS_FONTE.map(inserir));
  const destino = await Promise.all(GRUPOS_DESTINO.map(inserir));
  console.log("Groups: SOURCE=" + fonte.length + " TARGET=" + destino.length);
  return { fonte, destino };
}

/** Preco de venda so existe depois que o carro foi aprovado. */
function precoDeVenda(status: StatusDeDemo, preco: number): number | null {
  return status === "PENDING" || status === "REJECTED" ? null : preco * (1 + MARGEM / 100);
}

export async function criarVeiculos(
  db: Db,
  gruposFonte: { groupId: string }[],
): Promise<VeiculoGravado[]> {
  const gravados: VeiculoGravado[] = [];

  for (let i = 0; i < VEICULOS.length; i++) {
    const v = VEICULOS[i];
    const vehicleHash = hash(v.model, v.year, v.km, v.price);
    const jaTratado = v.status === "APPROVED" || v.status === "PUBLISHED";

    const [linha] = await db
      .insert(veiculos)
      .values({
        model: v.model,
        brand: v.brand,
        year: v.year,
        yearModel: v.yearModel,
        km: v.km,
        price: v.price,
        sellingPrice: precoDeVenda(v.status, v.price),
        fipePrice: v.fipePrice,
        transmission: v.transmission,
        fuel: v.fuel,
        color: v.color,
        plate: v.plate,
        features: JSON.stringify(v.features),
        photos: JSON.stringify(v.photos),
        // O texto cru como chegaria do grupo: e o "antes" da demonstracao.
        rawDescription: rawWhatsApp(v, i),
        sourceGroupId: gruposFonte[sorteio(gruposFonte.length)].groupId,
        sourceMessageId: `MSG${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
        sellerPhone: `419${String(sorteio(90000000) + 10000000)}`,
        vehicleHash,
        status: v.status,
        formattedAd: jaTratado ? formatAd({ ...v, margin: MARGEM }) : null,
        rejectionReason: v.rejectionReason,
        capturedAt: daysAgo(v.capturedDaysAgo),
        approvedAt: v.approvedDaysAgo != null ? daysAgo(v.approvedDaysAgo) : null,
        publishedAt: v.publishedDaysAgo != null ? daysAgo(v.publishedDaysAgo) : null,
      })
      .returning();

    gravados.push({
      id: linha.id,
      model: v.model,
      vehicleHash,
      status: v.status,
      price: v.price,
      publishedDaysAgo: v.publishedDaysAgo,
    });
  }

  const contagem = { PENDING: 0, APPROVED: 0, PUBLISHED: 0, REJECTED: 0 };
  for (const v of gravados) contagem[v.status]++;
  console.log("Vehicles:", JSON.stringify(contagem));
  return gravados;
}

/** Uma em cada doze publicacoes falha, pra a tela ter erro real pra mostrar. */
const CHANCE_DE_FALHA = 0.08;

export async function criarHistorico(
  db: Db,
  gravados: VeiculoGravado[],
  gruposDestino: { groupId: string }[],
) {
  let total = 0;
  for (const v of gravados.filter((x) => x.status === "PUBLISHED")) {
    const quantos = 2 + sorteio(2);
    const sorteados = [...gruposDestino].sort(() => Math.random() - 0.5).slice(0, quantos);

    for (const g of sorteados) {
      const deuCerto = Math.random() > CHANCE_DE_FALHA;
      await db.insert(historicoPublicacao).values({
        vehicleId: v.id,
        vehicleHash: v.vehicleHash,
        targetGroupId: g.groupId,
        postedAt: daysAgo(v.publishedDaysAgo || 1),
        messageId: deuCerto ? `3EB0${Math.random().toString(36).slice(2, 14).toUpperCase()}` : null,
        success: deuCerto,
        errorMessage: deuCerto ? null : "Timeout ao enviar mensagem para o grupo",
      });
      total++;
    }
  }
  console.log("Post history records:", total);
}

/**
 * A trilha de auditoria de cada carro.
 *
 * Todo veiculo tem a captura; os demais eventos dependem de onde ele parou.
 * A ordem das datas acompanha a historia: capturado ha mais tempo, depois
 * aprovado, depois publicado.
 */
export async function criarAuditoria(db: Db, gravados: VeiculoGravado[], adminId: string) {
  const entradas: Array<{ acao: string; veiculo: VeiculoGravado; detalhes: object; dias: number }> = [];

  for (const v of gravados) {
    entradas.push({
      acao: "VEHICLE_CAPTURED",
      veiculo: v,
      detalhes: { model: v.model, source: "webhook" },
      dias: 10 + sorteio(5),
    });

    if (v.status === "APPROVED" || v.status === "PUBLISHED") {
      entradas.push({
        acao: "VEHICLE_APPROVED",
        veiculo: v,
        detalhes: { model: v.model, sellingPrice: v.price * (1 + MARGEM / 100) },
        dias: 5 + sorteio(3),
      });
    }
    if (v.status === "PUBLISHED") {
      entradas.push({
        acao: "VEHICLE_PUBLISHED",
        veiculo: v,
        detalhes: { model: v.model, groupsPublished: 2 + sorteio(2) },
        dias: v.publishedDaysAgo || 1,
      });
    }
    if (v.status === "REJECTED") {
      entradas.push({
        acao: "VEHICLE_REJECTED",
        veiculo: v,
        detalhes: { model: v.model },
        dias: 3 + sorteio(2),
      });
    }
  }

  for (const e of entradas) {
    await db.insert(trilhaAuditoria).values({
      action: e.acao,
      entityType: "Vehicle",
      entityId: e.veiculo.id,
      userId: adminId,
      vehicleId: e.veiculo.id,
      details: JSON.stringify(e.detalhes),
      createdAt: daysAgo(e.dias),
    });
  }
  console.log("Audit logs:", entradas.length);
}
