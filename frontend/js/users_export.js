import { downloadCsv, formatDateTimePtBr } from "./utils.js";

const { DateTime } = window.luxon;

function yesNo(value) {
  return value ? "Sim" : "Nao";
}

export function exportUsersCsv(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return false;
  }

  const today = DateTime.now().toFormat("yyyy-LL-dd");
  const csvRows = rows.map((row) => ({
    nome: row.name || "-",
    email: row.email || "-",
    papel: row.role_name || row.role_code || "-",
    status: row.is_active ? "Ativo" : "Inativo",
    ultimo_acesso: formatDateTimePtBr(row.last_login_at),
    criado_em: formatDateTimePtBr(row.created_at),
    admin: yesNo(row.is_admin),
  }));

  downloadCsv({
    filename: `usuarios_${today}.csv`,
    columns: [
      { key: "nome", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "papel", label: "Papel" },
      { key: "status", label: "Status" },
      { key: "ultimo_acesso", label: "Ultimo acesso" },
      { key: "criado_em", label: "Criado em" },
      { key: "admin", label: "Administrador" },
    ],
    rows: csvRows,
  });

  return true;
}
