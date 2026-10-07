import { useId } from "react";
import type { DateString } from "@/domain/booking/types";
import { addDays } from "../lib/date";

type Props = {
  value: DateString;
  onChange: (date: DateString) => void;
  /** Today in the room time zone; `null` until the client clock is known. */
  today: DateString | null;
};

const shortcutClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-surface px-4 font-medium text-text hover:bg-surface-muted active:scale-[0.98] active:bg-surface-muted disabled:opacity-60";

export function DatePicker({ value, onChange, today }: Props) {
  const id = useId();
  const disabled = today === null;
  return (
    <div className="flex flex-col gap-2">
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
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label="Предыдущий день"
          disabled={disabled}
          onClick={() => onChange(addDays(value, -1))}
          className={shortcutClass}
        >
          ‹
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => today && onChange(today)}
          className={shortcutClass}
        >
          Сегодня
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => today && onChange(addDays(today, 1))}
          className={shortcutClass}
        >
          Завтра
        </button>
        <button
          type="button"
          aria-label="Следующий день"
          disabled={disabled}
          onClick={() => onChange(addDays(value, 1))}
          className={shortcutClass}
        >
          ›
        </button>
      </div>
    </div>
  );
}
