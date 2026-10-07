type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** Visible only when `NEXT_PUBLIC_DEV_TOOLS=1`; makes the server answer 409. */
export function DevConflictToggle({ checked, onChange, disabled }: Props) {
  if (process.env.NEXT_PUBLIC_DEV_TOOLS !== "1") return null;
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      />
      Инструмент разработчика: принудительный конфликт
    </label>
  );
}
