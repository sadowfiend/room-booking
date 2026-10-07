import { useId } from "react";
import type { DateString } from "@/domain/booking/types";

type Props = {
  value: DateString;
  onChange: (date: DateString) => void;
};

export function DatePicker({ value, onChange }: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        Дата
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => {
          // Empty value means the user cleared the field; keep the current date.
          if (e.target.value) onChange(e.target.value);
        }}
        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text sm:w-auto"
      />
    </div>
  );
}
