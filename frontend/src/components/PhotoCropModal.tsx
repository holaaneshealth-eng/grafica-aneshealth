import { useEffect, useRef, useState } from "react";

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void; // JPEG recortado (o entero), ya orientado
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = "nw" | "ne" | "sw" | "se";
const MIN = 40; // tamaño mínimo del recorte en px de pantalla

// Carga la imagen respetando la orientación EXIF (iPhone/iPad/Android) y la deja en un
// canvas ya orientado, que sirve tanto para mostrar como para recortar.
async function loadOriented(file: Blob): Promise<HTMLCanvasElement> {
  const draw = (src: CanvasImageSource, w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(src, 0, 0, w, h);
    return c;
  };
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      const c = draw(bmp, bmp.width, bmp.height);
      bmp.close();
      return c;
    } catch {
      /* fallback */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("No se pudo cargar la foto"));
      i.src = url;
    });
    return draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoCropModal({ file, onCancel, onConfirm }: Props) {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [disp, setDisp] = useState<{ w: number; h: number; url: string } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ corner: Corner; x0: number; y0: number; rect: Rect } | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const canvas = await loadOriented(file);
      if (dead) return;
      const maxW = Math.min(window.innerWidth * 0.92, 900);
      const maxH = window.innerHeight * 0.6;
      const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
      const w = Math.round(canvas.width * scale);
      const h = Math.round(canvas.height * scale);
      setSrc(canvas);
      setDisp({ w, h, url: canvas.toDataURL("image/jpeg", 0.85) });
      setRect({ x: 0, y: 0, w, h }); // inicialmente toda la imagen
    })();
    return () => {
      dead = true;
    };
  }, [file]);

  function onDown(e: React.PointerEvent, corner: Corner) {
    if (!rect) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { corner, x0: e.clientX, y0: e.clientY, rect: { ...rect } };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !disp) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    let { x, y, w, h } = d.rect;
    if (d.corner === "se") {
      w = d.rect.w + dx;
      h = d.rect.h + dy;
    } else if (d.corner === "nw") {
      x = d.rect.x + dx;
      y = d.rect.y + dy;
      w = d.rect.w - dx;
      h = d.rect.h - dy;
    } else if (d.corner === "ne") {
      y = d.rect.y + dy;
      w = d.rect.w + dx;
      h = d.rect.h - dy;
    } else {
      x = d.rect.x + dx;
      w = d.rect.w - dx;
      h = d.rect.h + dy;
    }
    // límites y tamaño mínimo
    if (w < MIN) {
      if (d.corner === "nw" || d.corner === "sw") x -= MIN - w;
      w = MIN;
    }
    if (h < MIN) {
      if (d.corner === "nw" || d.corner === "ne") y -= MIN - h;
      h = MIN;
    }
    if (x < 0) {
      w += x;
      x = 0;
    }
    if (y < 0) {
      h += y;
      y = 0;
    }
    if (x + w > disp.w) w = disp.w - x;
    if (y + h > disp.h) h = disp.h - y;
    setRect({ x, y, w, h });
  }
  function onUp() {
    drag.current = null;
  }

  function output(full: boolean) {
    if (!src) return;
    const out = document.createElement("canvas");
    if (full || !rect || !disp) {
      out.width = src.width;
      out.height = src.height;
      out.getContext("2d")!.drawImage(src, 0, 0);
    } else {
      const sx = src.width / disp.w; // px de imagen por px de pantalla
      const ix = Math.round(rect.x * sx);
      const iy = Math.round(rect.y * sx);
      const iw = Math.max(1, Math.round(rect.w * sx));
      const ih = Math.max(1, Math.round(rect.h * sx));
      out.width = iw;
      out.height = ih;
      out.getContext("2d")!.drawImage(src, ix, iy, iw, ih, 0, 0, iw, ih);
    }
    out.toBlob((b) => b && onConfirm(b), "image/jpeg", 0.9);
  }

  const handle = (corner: Corner, style: React.CSSProperties) => (
    <div
      onPointerDown={(e) => onDown(e, corner)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{
        position: "absolute",
        width: 30,
        height: 30,
        borderRadius: 6,
        background: "var(--accent)",
        border: "2px solid #04211f",
        touchAction: "none",
        ...style,
      }}
    />
  );

  return (
    <div className="modal-backdrop" style={{ alignItems: "center" }}>
      <div className="modal" style={{ maxWidth: "none", width: "auto", borderRadius: 16 }}>
        <div className="modal-head">
          <h3>Ajusta el recorte</h3>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Cancelar">
            ✕
          </button>
        </div>
        <p className="sub">Arrastra las esquinas para encuadrar la tabla de tendencias, o usa la foto entera.</p>
        {!disp || !rect ? (
          <div className="alert">Cargando foto…</div>
        ) : (
          <div style={{ position: "relative", width: disp.w, height: disp.h, margin: "0 auto", touchAction: "none", userSelect: "none" }}>
            <img src={disp.url} width={disp.w} height={disp.h} draggable={false} alt="" style={{ display: "block", borderRadius: 4 }} />
            <div
              style={{
                position: "absolute",
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                border: "2px solid var(--accent)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                boxSizing: "border-box",
              }}
            >
              {handle("nw", { left: -15, top: -15 })}
              {handle("ne", { right: -15, top: -15 })}
              {handle("sw", { left: -15, bottom: -15 })}
              {handle("se", { right: -15, bottom: -15 })}
            </div>
          </div>
        )}
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn lg" onClick={() => output(true)} disabled={!src}>
            Usar foto entera
          </button>
          <button className="btn primary lg" onClick={() => output(false)} disabled={!src}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
