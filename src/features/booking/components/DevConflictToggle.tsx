type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** Visible only when `NEXT_PUBLIC_DEV_TOOLS=1`; makes the server answer 409. */
export function DevConflictToggle({ checked, onChange, disabled }: Props) {
  if (process.env.NEXT_PUBLIC_DEV_TOOLS !== "1") return null;
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-accent"
      />
      Инструмент разработчика: следующее сохранение вернёт 409
    </label>
  );
}
