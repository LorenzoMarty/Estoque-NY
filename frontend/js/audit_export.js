import { downloadCsv, formatDateTimePtBr } from "./utils.js";

const { DateTime } = window.luxon;

function serializeJson(value) {
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function exportAuditCsv(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return false;
  }

  const today = DateTime.now().toFormat("yyyy-LL-dd");
  const csvRows = rows.map((row) => ({
    data_hora: formatDateTimePtBr(row.occurred_at),
    usuario: row.user_name || "-",
    acao: row.action || "-",
    detalhe_acao: row.action_detail || "-",
    recurso: row.resource_type || "-",
    recurso_id: row.resource_id || "-",
    severidade: row.severity || "-",
    origem_ip: row.origin_ip || "-",
    origem_dispositivo: row.origin_device || "-",
    referencia: row.reference_id || "-",
    motivo: row.reason || "-",
    observacoes: row.notes || "-",
    json_before: serializeJson(row.before_data),
    json_after: serializeJson(row.after_data),
  }));

  downloadCsv({
    filename: `auditoria_${today}.csv`,
    columns: [
      { key: "data_hora", label: "Data/Hora" },
      { key: "usuario", label: "Usuario" },
      { key: "acao", label: "Acao" },
      { key: "detalhe_acao", label: "Detalhe da acao" },
      { key: "recurso", label: "Recurso" },
      { key: "recurso_id", label: "ID do recurso" },
      { key: "severidade", label: "Severidade" },
      { key: "origem_ip", label: "IP origem" },
      { key: "origem_dispositivo", label: "Dispositivo" },
      { key: "referencia", label: "Referencia" },
      { key: "motivo", label: "Motivo" },
      { key: "observacoes", label: "Observacoes" },
      { key: "json_before", label: "Before JSON" },
      { key: "json_after", label: "After JSON" },
    ],
    rows: csvRows,
  });

  return true;
}
