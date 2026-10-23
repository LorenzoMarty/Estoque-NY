import { Sparkline } from "./Sparkline";
import { trendArrow, type Kpi, type KpiKey } from "./kpis";

export const KPI_META: Record<KpiKey, { label: string; color: string }> = {
  stock_total: { label: "Saldo total", color: "#1d4ed8" },
  active_variations: { label: "Variações ativas", color: "#1d4ed8" },
  stockout: { label: "Rupturas", color: "#b91c1c" },
  low_stock: { label: "Estoque baixo", color: "#b45309" },
  pending_transfers: { label: "Transferências pendentes", color: "#7c3aed" },
  open_counts: { label: "Contagens abertas", color: "#b45309" },
};

const TREND_TONE = { up: "good", down: "critical", flat: "neutral" } as const;

export function trendText(kpi: Pick<Kpi, "key" | "trend">): string {
  const { key, trend } = kpi;
  if (trend.direction === "flat") return `${trendArrow(key, "flat")} estável no período`;
  return `${trendArrow(key, trend.direction)} ${trend.value.toFixed(0)}% vs. período anterior`;
}

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="kpi-strip" aria-label="Indicadores">
      {kpis.map((kpi) => {
        const meta = KPI_META[kpi.key];
        return (
          <article className="kpi-cell" key={kpi.key} aria-label={meta.label}>
            <span className="kpi-label">
              <span className="kpi-dot" style={{ background: meta.color }} aria-hidden />
              {meta.label}
            </span>
            <span className="kpi-value">{kpi.value.toLocaleString("pt-BR")}</span>
            <Sparkline series={kpi.series} color={meta.color} />
            <span className="kpi-trend" data-tone={TREND_TONE[kpi.trend.direction]}>
              {trendText(kpi)}
            </span>
          </article>
        );
      })}
    </section>
  );
}
