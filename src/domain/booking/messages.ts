import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  SLOT_STEP_MINUTES,
  TITLE_MAX_LENGTH,
  WORKDAY_END,
  WORKDAY_START,
} from "./config";
import type { ValidationCode } from "./types";

/** The only place for user-facing error texts. */
export const VALIDATION_MESSAGES: Record<ValidationCode, string> = {
  INVALID_BODY: "Некорректный запрос",
  INVALID_DATE: "Укажите корректную дату",
  INVALID_TIME: "Укажите время в формате ЧЧ:ММ",
  OFF_STEP: `Время должно быть кратно ${SLOT_STEP_MINUTES} минутам`,
  INVALID_TITLE: "Название должно быть строкой",
  TITLE_TOO_LONG: `Название не длиннее ${TITLE_MAX_LENGTH} символов`,
  OUTSIDE_WORKING_HOURS: `Бронирование возможно с ${WORKDAY_START} до ${WORKDAY_END}`,
  START_NOT_BEFORE_END: "Начало должно быть раньше окончания",
  TOO_SHORT: `Минимальная длительность — ${MIN_DURATION_MINUTES} минут`,
  TOO_LONG: `Максимальная длительность — ${MAX_DURATION_MINUTES} минут`,
  PAST_DATE: "Нельзя бронировать на прошедшую дату",
  START_IN_PAST: "Время начала уже прошло",
  END_IN_PAST: "Время окончания уже прошло",
  BOOKING_FINISHED: "Бронирование уже завершено и не может быть изменено",
};

export function getValidationMessage(code: ValidationCode): string {
  return VALIDATION_MESSAGES[code];
}

/** Request-level error codes; `NETWORK` is raised client-side only. */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "NETWORK"
  | "UNKNOWN";

export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: "Некорректный запрос",
  VALIDATION: "Проверьте введённые данные",
  CONFLICT:
    "Это время только что заняли. Список броней обновлён, введённые данные сохранены — выберите другое время",
  NOT_FOUND: "Бронь не найдена",
  NETWORK: "Нет соединения с сервером. Попробуйте ещё раз",
  UNKNOWN: "Что-то пошло не так. Попробуйте ещё раз",
};

export const SLOT_BUSY_MESSAGE = "Это время занято";

/** Short labels appended to disabled time options, e.g. "10:15 — занято". */
export const SLOT_REASON_LABELS = {
  BUSY: "занято",
  PAST: "прошло",
} as const;

/** Short reasons an end time option is unavailable, derived from validateBooking codes. */
export const END_REASON_LABELS: Partial<Record<ValidationCode, string>> = {
  OFF_STEP: "не по шагу",
  OUTSIDE_WORKING_HOURS: "вне рабочего времени",
  START_NOT_BEFORE_END: "раньше начала",
  TOO_SHORT: "слишком коротко",
  TOO_LONG: "слишком долго",
  END_IN_PAST: "прошло",
  START_IN_PAST: "прошло",
  PAST_DATE: "прошло",
  BOOKING_FINISHED: "завершена",
};

export const TIME_HINT_MESSAGE = `Рабочее время ${WORKDAY_START}–${WORKDAY_END}, шаг ${SLOT_STEP_MINUTES} мин, длительность ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} мин`;
