import { useStore } from "../store/store";
import { dmy, hhmm } from "../utils/time";

interface Props {
  onOpen: (id: string) => void;
}

export function Home({ onOpen }: Props) {
  const createCase = useStore((s) => s.createCase);
  const cases = useStore((s) => s.listCases());
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);

  return (
    <div>
      <div className="card">
        <h2>Anestesista responsable</h2>
        <p className="sub">Se asocia a cada evento para la trazabilidad y la firma.</p>
        <input type="text" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Nombre" />
      </div>

      <button className="btn primary block lg" onClick={() => onOpen(createCase())}>
        + Nuevo procedimiento
      </button>
      <p className="sub" style={{ textAlign: "center", marginTop: 8 }}>
        Se generara automaticamente un Identificador Anestesico (IA).
      </p>

      <div className="section-title">Procedimientos</div>
      {cases.length === 0 && <div className="empty">No hay procedimientos todavia.</div>}
      {cases.map((c) => (
        <div className="case-item" key={c.caseId} onClick={() => onOpen(c.caseId)}>
          <div style={{ flex: 1 }}>
            <div className="ia">{c.ia}</div>
            <div className="sub" style={{ margin: 0 }}>
              {dmy(c.createdAt)} - {hhmm(c.createdAt)}
            </div>
          </div>
          <span className={`tag ${c.phase === "CLOSED" ? "closed" : "active"}`}>
            {c.phase === "PREOP" ? "Preparacion" : c.phase === "OR" ? "En quirofano" : "Cerrado"}
          </span>
        </div>
      ))}
    </div>
  );
}
