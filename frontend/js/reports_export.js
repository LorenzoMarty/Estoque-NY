import { copyToClipboard } from "./ui.js";
import { I18N_PTBR } from "./i18n.js";
import { downloadCsv, formatDateTimePtBr, formatInt } from "./utils.js";

const { DateTime } = window.luxon;

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(
    Number(value || 0)
  );
}

function turnoverClassLabel(classKey) {
  if (classKey === "high") return I18N_PTBR.reports.turnover_class.high;
  if (classKey === "medium") return I18N_PTBR.reports.turnover_class.medium;
  return I18N_PTBR.reports.turnover_class.low;
}

export function exportReportsCsv(view) {
  const today = DateTime.now().toFormat("yyyy-LL-dd");
  const rows = [];

  rows.push(
    {
      secao: I18N_PTBR.reports.sections.overview.title,
      indicador: I18N_PTBR.reports.kpis.stock_value.label,
      valor: formatCurrency(view.kpis.stockValue),
    },
    {
      secao: I18N_PTBR.reports.sections.overview.title,
      indicador: I18N_PTBR.reports.kpis.stored_items.label,
      valor: formatInt(view.kpis.storedItems),
    },
    {
      secao: I18N_PTBR.reports.sections.overview.title,
      indicador: I18N_PTBR.reports.kpis.low_stock.label,
      valor: formatInt(view.kpis.lowStockCount),
    },
    {
      secao: I18N_PTBR.reports.sections.overview.title,
      indicador: I18N_PTBR.reports.kpis.stockout.label,
      valor: formatInt(view.kpis.stockoutCount),
    },
    {
      secao: I18N_PTBR.reports.sections.overview.title,
      indicador: I18N_PTBR.reports.kpis.avg_turnover.label,
      valor: Number(view.kpis.avgTurnover || 0).toFixed(2),
    }
  );

  (view.turnoverRows || []).slice(0, 40).forEach((row) => {
    rows.push({
      secao: I18N_PTBR.reports.sections.turnover.title,
      indicador: row.item_name,
      valor: `${formatInt(row.issued_qty)} ${I18N_PTBR.reports.tables.turnover.issued_qty.toLowerCase()}`,
      observacao: `${row.days_in_stock} ${I18N_PTBR.reports.tables.turnover.days_in_stock.toLowerCase()} / ${turnoverClassLabel(
        row.turnover_class
      )}`,
    });
  });

  (view.abcRows || []).slice(0, 40).forEach((row) => {
    rows.push({
      secao: I18N_PTBR.reports.sections.abc.title,
      indicador: row.item_name,
      valor: `${Number(row.share_percent || 0).toFixed(2)}%`,
      observacao: `Classe ${row.class_name}`,
    });
  });

  (view.criticalAdjustments || []).slice(0, 40).forEach((row) => {
    rows.push({
      secao: I18N_PTBR.reports.sections.divergence.title,
      indicador: row.item_name,
      valor: row.qty_label,
      observacao: `${row.reason || "-"} (${formatDateTimePtBr(row.occurred_at)})`,
    });
  });

  if (!rows.length) return false;

  downloadCsv({
    filename: `relatorio_estoque_${today}.csv`,
    columns: [
      { key: "secao", label: "Seção" },
      { key: "indicador", label: "Indicador" },
      { key: "valor", label: "Valor" },
      { key: "observacao", label: "Observação" },
    ],
    rows,
  });

  return true;
}

export function exportReportsPdf() {
  const today = DateTime.now().toFormat("yyyy-LL-dd");
  const filename = `relatorio_estoque_${today}.pdf`;
  const previousTitle = document.title;

  document.title = filename;
  document.body.classList.add("reports-print-mode");
  window.print();

  window.setTimeout(() => {
    document.body.classList.remove("reports-print-mode");
    document.title = previousTitle;
  }, 160);
}

export async function copyReportsSummary(view, filtersLabel) {
  const lines = [
    `${I18N_PTBR.reports.title} - resumo gerencial`,
    `${I18N_PTBR.reports.sections.exports.generated_at}: ${formatDateTimePtBr(DateTime.now().toISO())}`,
    `${I18N_PTBR.reports.sections.exports.applied_filters}: ${
      filtersLabel || I18N_PTBR.reports.defaults.standard
    }`,
    "",
    `${I18N_PTBR.reports.kpis.stock_value.label}: ${formatCurrency(view.kpis.stockValue)}`,
    `${I18N_PTBR.reports.kpis.stored_items.label}: ${formatInt(view.kpis.storedItems)}`,
    `${I18N_PTBR.reports.kpis.low_stock.label}: ${formatInt(view.kpis.lowStockCount)}`,
    `${I18N_PTBR.reports.kpis.stockout.label}: ${formatInt(view.kpis.stockoutCount)}`,
    `${I18N_PTBR.reports.kpis.avg_turnover.label}: ${Number(view.kpis.avgTurnover || 0).toFixed(2)}`,
    `${I18N_PTBR.reports.sections.divergence.total_adjustments}: ${formatInt(view.adjustmentCount)}`,
    `${I18N_PTBR.reports.sections.divergence.common_reason}: ${view.mostCommonReason || "-"}`,
  ];

  await copyToClipboard(lines.join("\n"));
}
