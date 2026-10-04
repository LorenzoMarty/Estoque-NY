import { Text } from "@mantine/core";
import { STOCK_STATUS_META, type StockStatus, type StockSummary } from "../../shared/stock";

const ORDER: StockStatus[] = ["in_stock", "low_stock", "out_of_stock"];

export function StockSummaryBar({ summary }: { summary: StockSummary }) {
  return (
    <section className="stock-summary" aria-label="Resumo de estoque">
      <div className="stock-summary-head">
        <strong>{summary.total.toLocaleString("pt-BR")}</strong>
        <Text c="dimmed" size="sm">
          produtos no catálogo
        </Text>
      </div>
      {summary.total > 0 && (
        <div className="stock-bar" role="img" aria-label="Distribuição por situação de estoque">
          {ORDER.filter((status) => summary[status] > 0).map((status) => (
            <span key={status} data-status={status} style={{ flexGrow: summary[status] }} />
          ))}
        </div>
      )}
      <ul className="stock-legend">
        {ORDER.map((status) => (
          <li key={status}>
            <span className="stock-legend-dot" data-status={status} aria-hidden />
            {STOCK_STATUS_META[status].label} <strong>{summary[status].toLocaleString("pt-BR")}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
