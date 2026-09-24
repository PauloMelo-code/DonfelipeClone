"use client";

import { Clock, MapPin } from "lucide-react";
import { InlineEdit } from "../inline-edit";
import { lerEstado, lerOrigem } from "./origem";
import { QuadroDoAnuncio, type EdicaoDoTexto } from "./quadro-do-anuncio";
import { anuncioParaExibir } from "@/lib/vehicle-formatter";
import { Selos } from "./selo-de-margem";
import { formatKm, formatPrice, horaDaCaptura, quandoChegou, type CardProps } from "./tipos";

// ---------------------------------------------------------------------------
// Os dados do carro, com os campos que o operador conserta na hora.
//
// Ano, km e preco sao editaveis em linha porque a extracao erra: o anuncio vem
// mal escrito e o operador ve o erro antes de aprovar. O texto do anuncio
// tambem se edita aqui mesmo, direto na caixa. Sem `onUpdateField` tudo vira
// texto simples.
// ---------------------------------------------------------------------------

type Props = Pick<CardProps, "vehicle" | "onUpdateField"> & {
  edicaoDoTexto?: EdicaoDoTexto;
};

export function DadosDoCard({ vehicle, onUpdateField, edicaoDoTexto }: Props) {
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

      {vehicle.capturedAt && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground/80 -mt-1"
          title={`Capturado em ${horaDaCaptura(vehicle.capturedAt)}`}
        >
          <Clock className="h-3 w-3 shrink-0" />
          <span>Capturado {quandoChegou(vehicle.capturedAt)}</span>
        </div>
      )}

      {origem && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 -mt-1">
          <origem.icone className="h-3 w-3 shrink-0" />
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
        <Selos vehicle={vehicle} texto={edicaoDoTexto?.rascunho ?? anuncioParaExibir(vehicle)} />
      </div>

      <QuadroDoAnuncio vehicle={vehicle} edicao={edicaoDoTexto} />
    </>
  );
}
