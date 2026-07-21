interface Props {
  value: string; // valor datetime-local (YYYY-MM-DDTHH:MM)
  onChange: (v: string) => void;
  label?: string;
}

// Campo de hora editable. Por defecto muestra la hora vigente, pero se puede ajustar.
export function TimeField({ value, onChange, label = "Hora de administración" }: Props) {
  return (
    <div className="field time-field">
      <label>{label}</label>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
