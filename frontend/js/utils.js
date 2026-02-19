const { DateTime } = window.luxon;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatInt(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatSignedInt(value) {
  const parsed = Number(value || 0);
  const signal = parsed > 0 ? "+" : "";
  return `${signal}${formatInt(parsed)}`;
}

export function formatDateTimePtBr(iso) {
  if (!iso) return "-";
  const parsed = DateTime.fromISO(String(iso));
  if (!parsed.isValid) return "-";
  return parsed.setLocale("pt-BR").toFormat("dd/MM/yyyy HH:mm");
}

export function formatHourMinutePtBr(iso) {
  if (!iso) return "--:--";
  const parsed = DateTime.fromISO(String(iso));
  if (!parsed.isValid) return "--:--";
  return parsed.setLocale("pt-BR").toFormat("HH:mm");
}

export function resolvePeriodRange(filters) {
  const now = DateTime.now();
  const period = String(filters?.period || "30");

  if (period === "custom") {
    const from = DateTime.fromISO(String(filters?.customFrom || "")).startOf("day");
    const to = DateTime.fromISO(String(filters?.customTo || "")).endOf("day");
    if (from.isValid && to.isValid && from <= to) {
      return { from, to };
    }
  }

  const days = Number(period);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return {
    from: now.minus({ days: safeDays - 1 }).startOf("day"),
    to: now.endOf("day"),
  };
}

export function debounce(callback, waitMs = 220) {
  let timeoutId = null;

  const debounced = (...args) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, waitMs);
  };

  debounced.cancel = () => {
    if (!timeoutId) return;
    window.clearTimeout(timeoutId);
    timeoutId = null;
  };

  return debounced;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCsvCell(value) {
  const cell = String(value ?? "");
  const escaped = cell.replaceAll('"', '""');
  return `"${escaped}"`;
}

export function downloadCsv({ filename, columns, rows }) {
  const headers = columns.map((column) => escapeCsvCell(column.label)).join(";");
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(row[column.key])).join(";")
  );
  const csv = `\uFEFF${[headers, ...lines].join("\r\n")}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function toDatetimeLocalValue(iso) {
  const parsed = DateTime.fromISO(String(iso || DateTime.now().toISO()));
  if (!parsed.isValid) return "";
  return parsed.toFormat("yyyy-LL-dd'T'HH:mm");
}

export function toIsoFromDatetimeLocal(value) {
  const parsed = DateTime.fromISO(String(value || ""));
  if (!parsed.isValid) return DateTime.now().toISO();
  return parsed.toISO();
}
