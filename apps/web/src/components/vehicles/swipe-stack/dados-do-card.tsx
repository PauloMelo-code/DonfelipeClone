"use client";

import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineEdit } from "../inline-edit";
import { lerEstado, lerOrigem } from "./origem";
import { SeloDeMargem } from "./selo-de-margem";
import { formatKm, formatPrice, type CardProps } from "./tipos";

// ---------------------------------------------------------------------------
// Os dados do carro, com os campos que o operador conserta na hora.
//
// Ano, km e preco sao editaveis em linha porque a extracao erra: o anuncio vem
// mal escrito e o operador ve o erro antes de aprovar. Sem `onUpdateField` os
// mesmos campos viram texto simples.
// ---------------------------------------------------------------------------

type Props = Pick<CardProps, "vehicle" | "onUpdateField">;

/** Marcadores do canto direito: score de qualidade, VIP e hibrido. */
function Selos({ vehicle }: Pick<CardProps, "vehicle">) {
  const score = vehicle.qualityScore;
  return (
    <div className="flex flex-col items-end gap-1">
      <SeloDeMargem price={vehicle.price} fipePrice={vehicle.fipePrice} />
      {score != null && (
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-xs font-bold",
          score >= 8 ? "bg-success/20 border-success/50 text-success"
            : score >= 5 ? "bg-warning/15 border-warning/40 text-warning"
              : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {score >= 8 ? "🔥 " : ""}Score {score}/10
        </span>
      )}
      {vehicle.isVip && (
        <span className="rounded-full border border-yellow-400/60 bg-yellow-400/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
          ⭐ VIP
        </span>
      )}
      {vehicle.fuel === "HIBRIDO" && (
        <span className="rounded-full border border-success/30 px-2 py-0.5 text-xs text-success">Hibrido</span>
      )}
    </div>
  );
}

export function DadosDoCard({ vehicle, onUpdateField }: Props) {
  const estado = lerEstado(vehicle);
  const origem = vehicle.sourceGroup ? lerOrigem(vehicle.sourceGroup) : null;

  return (
    <>
      {estado.uf && (
        <div className="flex items-center gap-2 -mt-1 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-gold/15 border border-brand-gold/30 px-2 py-0.5 text-xs font-semibold text-brand-gold uppercase tracking-wide">
            <MapPin className="h-3 w-3" /> {estado.uf}
            {estado.veioDoGrupo && <span className="text-[10px] opacity-60 normal-case ml-0.5">(grupo)</span>}
          </span>
          {vehicle.location && <span className="text-xs text-muted-foreground">{vehicle.location}</span>}
        </div>
      )}

      {origem && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 -mt-1">
          <span>{origem.icone}</span>
          <span className="font-medium text-muted-foreground">{origem.rotulo}:</span>
          <span className="truncate flex-1 text-foreground/70">{origem.nome}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        {onUpdateField ? (
          <InlineEdit
            value={vehicle.year}
            type="number"
            onSave={(v) => onUpdateField(vehicle.id, "year", v)}
            className="text-foreground"
          />
        ) : <span>{vehicle.year}</span>}
        <span className="text-border">&bull;</span>
        {onUpdateField ? (
          <InlineEdit
            value={vehicle.km}
            type="number"
            onSave={(v) => onUpdateField(vehicle.id, "km", v)}
            format={(v) => `${Number(v).toLocaleString("pt-BR")} km`}
            className="text-foreground"
          />
        ) : <span>{formatKm(vehicle.km)}</span>}
        {vehicle.transmission && (
          <><span className="text-border">&bull;</span><span>{vehicle.transmission}</span></>
        )}
        {vehicle.fuel && (
          <><span className="text-border">&bull;</span><span>{vehicle.fuel}</span></>
        )}
      </div>

      {vehicle.color && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Cor: {vehicle.color}</span>
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <div>
          {vehicle.fipePrice && (
            <p className="text-xs text-muted-foreground">FIPE: {formatPrice(vehicle.fipePrice)}</p>
          )}
          <p className="text-xl font-bold text-brand-gold">
            {onUpdateField ? (
              <InlineEdit
                value={vehicle.price}
                type="number"
                onSave={(v) => onUpdateField(vehicle.id, "price", v)}
                format={(v) => formatPrice(Number(v))}
              />
            ) : formatPrice(vehicle.price)}
          </p>
        </div>
        <Selos vehicle={vehicle} />
      </div>

      {vehicle.rawDescription && (
        <div
          className="rounded-xl px-3 py-2.5 max-h-[30vh] overflow-y-auto"
          style={{ background: "#005C4B", WebkitOverflowScrolling: "touch" }}
        >
          <p className="text-[12px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">
            {vehicle.rawDescription}
          </p>
        </div>
      )}
    </>
  );
}
