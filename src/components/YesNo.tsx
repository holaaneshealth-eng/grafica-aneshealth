interface Props {
  value: boolean | null;
  onChange: (v: boolean) => void;
}

// Toggle Si / No con estado explicito. "No" es una respuesta valida.
export function YesNo({ value, onChange }: Props) {
  return (
    <div className="yesno">
      <button type="button" className={`yes ${value === true ? "on" : ""}`} onClick={() => onChange(true)}>
        Si
      </button>
      <button type="button" className={`no ${value === false ? "on" : ""}`} onClick={() => onChange(false)}>
        No
      </button>
    </div>
  );
}
