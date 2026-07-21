import { useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { YesNo } from "./YesNo";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { nowLocalInput, isoFromLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const PRODUCTS = [
  "Concentrado de hematíes",
  "Plasma fresco congelado",
  "Pool de plaquetas",
  "Complejo protrombínico",
  "Fibrinógeno humano purificado",
];

export function BloodProductModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [product, setProduct] = useState("");
  const [time, setTime] = useState(nowLocalInput());
  const [adverse, setAdverse] = useState<boolean | null>(null);
  const [registry, setRegistry] = useState("");

  function save() {
    if (!product.trim()) return; // solo el producto orienta el registro
    const at = isoFromLocalInput(time);
    append(
      cs.caseId,
      "BLOOD_PRODUCT",
      { id: "bp-" + Date.now(), at, product: product.trim(), adverseReaction: adverse, registryNumber: registry.trim() },
      at,
    );
    onDone("Hemoderivado registrado");
    onClose();
  }

  return (
    <Modal title="Registrar hemoderivado" onClose={onClose}>
      <div className="field">
        <label>Producto</label>
        <div className="chips" style={{ marginBottom: 10 }}>
          {PRODUCTS.map((p) => (
            <button key={p} className={`chip ${product === p ? "on" : ""}`} onClick={() => setProduct(p)}>
              {p}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Otro producto" value={product} onChange={(e) => setProduct(e.target.value)} />
      </div>

      <TimeField value={time} onChange={setTime} />

      <div className="field">
        <label>Número de registro del hemoderivado (opcional)</label>
        <input type="text" value={registry} onChange={(e) => setRegistry(e.target.value)} placeholder="Nº de unidad / bolsa" />
      </div>

      <div className="field">
        <label>Reacción adversa (opcional)</label>
        <YesNo value={adverse} onChange={setAdverse} />
      </div>

      <div className="alert">Ningún dato es obligatorio salvo el tipo de producto.</div>
      <button className="btn primary block lg" onClick={save} disabled={!product.trim()}>
        Guardar hemoderivado
      </button>
    </Modal>
  );
}
