import type { FieldValues, UseFormGetValues, UseFormSetError, Path } from "react-hook-form";
import { ApiError } from "./httpClient";

interface FieldIssue {
  loc?: unknown[];
  msg?: string;
}

/**
 * Maps an API failure onto a form: backend `validation_error` issues whose last `loc` segment is a form
 * field become field-level errors; everything else is returned as the form-level message
 * (null when every issue was mapped to a field).
 */
export function mapApiError<T extends FieldValues>(
  error: unknown,
  form: { setError: UseFormSetError<T>; getValues: UseFormGetValues<T> },
  fallback: string
): string | null {
  if (!(error instanceof Error)) return fallback;
  const details = error instanceof ApiError && error.code === "validation_error" ? error.payload?.error?.details : null;
  if (!Array.isArray(details)) return error.message || fallback;

  const fields = Object.keys(form.getValues());
  const unmapped: string[] = [];
  for (const issue of details as FieldIssue[]) {
    const field = issue.loc?.[issue.loc.length - 1];
    const message = issue.msg || "Valor inválido.";
    if (typeof field === "string" && fields.includes(field)) {
      form.setError(field as Path<T>, { type: "server", message });
    } else {
      unmapped.push(message);
    }
  }
  return unmapped.length ? unmapped.join(" ") : null;
}
