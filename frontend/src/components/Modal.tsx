import { type ReactNode, useRef } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: Props) {
  // Solo se cierra si el gesto EMPIEZA y TERMINA en el fondo. Evita cierres espurios
  // al interactuar con campos (p. ej. el selector de hora nativo genera un clic
  // que, de otro modo, llegaba al fondo y cerraba el modal al "meter un dato").
  const downOnBackdrop = useRef(false);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div className="modal">
        <div className="modal-grip" />
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
        <button type="button" className="btn ghost block" style={{ marginTop: 12 }} onClick={onClose}>
          Cancelar / volver
        </button>
      </div>
    </div>
  );
}
