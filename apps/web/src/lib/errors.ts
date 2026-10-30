import { ApiError } from "@kup/shared";

export function errorMessage(e: unknown, fallback = "Что-то пошло не так. Попробуйте ещё раз."): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return "Слишком много запросов. Подождите немного и попробуйте снова.";
    if (e.status >= 500) return "Сервер временно недоступен. Попробуйте позже.";
    return e.message || fallback;
  }
  if (e instanceof TypeError) return "Нет соединения с сервером.";
  return fallback;
}
