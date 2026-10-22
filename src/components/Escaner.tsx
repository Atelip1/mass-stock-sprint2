"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * RF-22: lectura del código de barras con la cámara del celular (EAN-13 y EAN-8).
 * La cámara solo funciona con HTTPS (Vercel) o en localhost.
 */
export function Escaner({ onLeer, onCerrar }: { onLeer: (codigo: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const alLeer = useRef(onLeer);
  useEffect(() => {
    alLeer.current = onLeer;
  }, [onLeer]);

  useEffect(() => {
    let controles: IScannerControls | null = null;
    let cancelado = false;

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const pistas = new Map();
        pistas.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);
        const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 150 });
        controles = await lector.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video.current!,
          (resultado, _err, c) => {
            if (resultado && !cancelado) {
              cancelado = true;
              c.stop();
              navigator.vibrate?.(80);
              alLeer.current(resultado.getText());
            }
          },
        );
        if (cancelado) controles.stop();
      } catch (e) {
        const nombre = (e as { name?: string }).name;
        setError(
          nombre === "NotAllowedError"
            ? "No diste permiso para usar la cámara. Actívalo en la configuración del navegador o escribe el código abajo."
            : nombre === "NotFoundError" || nombre === "OverconstrainedError"
              ? "Este dispositivo no tiene cámara disponible. Escribe el código abajo."
              : !window.isSecureContext
                ? "La cámara solo funciona con HTTPS. Abre el sistema desde su dirección segura o escribe el código abajo."
                : "No se pudo abrir la cámara. Escribe el código abajo.",
        );
      }
    })();

    return () => {
      cancelado = true;
      controles?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-texto/60 p-4" role="dialog" aria-modal aria-label="Escanear con la cámara">
      <div className="panel w-full max-w-md p-4 shadow-xl">
        <h2 className="text-lg font-bold">Escanear con la cámara</h2>
        <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-md bg-texto">
          <video ref={video} className="h-full w-full object-cover" muted playsInline />
          {!error && <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 bg-peligro shadow-[0_0_8px_2px_rgba(200,30,30,0.6)]" />}
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">Apunta al código de barras del empaque</p>
        </div>
        {error && <p className="mt-3 text-sm text-peligro">{error}</p>}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onLeer(manual.trim());
          }}
        >
          <input
            className="campo"
            inputMode="numeric"
            placeholder="O escribe el código"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            aria-label="Código de barras"
          />
          <button className="btn-secundario" type="submit">
            Usar
          </button>
        </form>
        <div className="mt-3 flex justify-end">
          <button className="btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
