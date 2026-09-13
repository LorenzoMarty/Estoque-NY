import { I18N_PTBR } from "./i18n.js";

const chartInstances = {
  flow: null,
  branch: null,
  topOutput: null,
  turnover: null,
  abc: null,
  divergence: null,
  marketingCampaignProducts: null,
  marketingPromotionSkus: null,
  marketingCampaigns: null,
  marketingLowTurnover: null,
  marketingTopSkus: null,
};

function formatInt(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(
    Number(value || 0)
  );
}

function commonTooltip() {
  return {
    backgroundColor: "rgba(17, 24, 39, 0.96)",
    borderColor: "rgba(37, 99, 235, 0.4)",
    borderWidth: 1,
    titleColor: "#f4f4f5",
    bodyColor: "#d4d4d8",
    cornerRadius: 10,
    padding: 10,
  };
}

function commonScales() {
  return {
    x: {
      grid: { color: "rgba(63, 63, 70, 0.24)" },
      ticks: { color: "#a1a1aa" },
    },
    y: {
      beginAtZero: true,
      grid: { color: "rgba(63, 63, 70, 0.24)" },
      ticks: { color: "#a1a1aa" },
    },
  };
}

export function destroyReportsCharts() {
  Object.values(chartInstances).forEach((chart) => {
    if (chart && typeof chart.destroy === "function") {
      chart.destroy();
    }
  });

  chartInstances.flow = null;
  chartInstances.branch = null;
  chartInstances.topOutput = null;
  chartInstances.turnover = null;
  chartInstances.abc = null;
  chartInstances.divergence = null;
  chartInstances.marketingCampaignProducts = null;
  chartInstances.marketingPromotionSkus = null;
  chartInstances.marketingCampaigns = null;
  chartInstances.marketingLowTurnover = null;
  chartInstances.marketingTopSkus = null;
}

function createFlowChart(data) {
  const target = document.getElementById("reportsFlowChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.flow = new window.Chart(target.getContext("2d"), {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports.chart.dataset_entries,
          data: data.entries,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.16)",
          tension: 0.3,
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: I18N_PTBR.reports.chart.dataset_exits,
          data: data.exits,
          borderColor: "#dc2626",
          backgroundColor: "rgba(220, 38, 38, 0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#d4d4d8", usePointStyle: true, boxWidth: 10 },
        },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatInt(context.parsed.y)}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

function createBranchDonutChart(data) {
  const target = document.getElementById("reportsBranchChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.branch = new window.Chart(target.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: data.labels,
      datasets: [
        {
          data: data.values,
          backgroundColor: ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#1d4ed8", "#64748b"],
          borderColor: "rgba(17, 24, 39, 0.95)",
          borderWidth: 1,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#d4d4d8", padding: 14, boxWidth: 10 },
        },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) => `${context.label}: ${formatInt(context.parsed)}`,
          },
        },
      },
      cutout: "62%",
    },
  });
}

function createTopOutputChart(data) {
  const target = document.getElementById("reportsTopOutputChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.topOutput = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports.chart.dataset_output,
          data: data.values,
          backgroundColor: "rgba(37, 99, 235, 0.75)",
          borderColor: "#1d4ed8",
          borderWidth: 1,
          borderRadius: 8,
          maxBarThickness: 34,
          hoverBackgroundColor: "rgba(37, 99, 235, 0.95)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports.chart.dataset_output}: ${formatInt(context.parsed.y)}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

function createTurnoverChart(data) {
  const target = document.getElementById("reportsTurnoverChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.turnover = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports.chart.dataset_turnover,
          data: data.values,
          backgroundColor: data.colors,
          borderColor: data.colors,
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports.chart.dataset_turnover}: ${Number(context.parsed.x || 0).toFixed(
                2
              )}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(63, 63, 70, 0.24)" },
          ticks: { color: "#a1a1aa" },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#a1a1aa" },
        },
      },
    },
  });
}

function createAbcChart(data) {
  const target = document.getElementById("reportsAbcChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.abc = new window.Chart(target.getContext("2d"), {
    data: {
      labels: data.labels,
      datasets: [
        {
          type: "bar",
          label: I18N_PTBR.reports.chart.dataset_moved_value,
          data: data.values,
          backgroundColor: "rgba(37, 99, 235, 0.72)",
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          type: "line",
          label: I18N_PTBR.reports.chart.dataset_cumulative,
          data: data.cumulative,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.15)",
          yAxisID: "y1",
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: "#d4d4d8", usePointStyle: true } },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
              }
              return `${context.dataset.label}: ${Number(context.parsed.y || 0).toFixed(2)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(63, 63, 70, 0.2)" },
          ticks: { color: "#a1a1aa" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(63, 63, 70, 0.24)" },
          ticks: { color: "#a1a1aa", callback: (value) => formatInt(value) },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: "#86efac", callback: (value) => `${value}%` },
        },
      },
    },
  });
}

function createDivergenceChart(data) {
  const target = document.getElementById("reportsDivergenceChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.divergence = new window.Chart(target.getContext("2d"), {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports.chart.dataset_divergence,
          data: data.values,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.14)",
          fill: true,
          tension: 0.28,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports.chart.tooltip_adjustment_qty}: ${formatInt(context.parsed.y)}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

function createMarketingCampaignProductsChart(data) {
  const target = document.getElementById("reportsMarketingCampaignProductsChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.marketingCampaignProducts = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports_marketing.chart.dataset_on_hand,
          data: data.values,
          backgroundColor: "rgba(37, 99, 235, 0.75)",
          borderColor: "#1d4ed8",
          borderWidth: 1,
          borderRadius: 8,
          maxBarThickness: 34,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports_marketing.chart.dataset_on_hand}: ${formatInt(context.parsed.y)}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

function createMarketingPromotionSkusChart(data) {
  const target = document.getElementById("reportsMarketingPromotionSkusChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.marketingPromotionSkus = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports_marketing.chart.dataset_cost,
          data: data.cost,
          backgroundColor: "rgba(148, 163, 184, 0.75)",
          borderRadius: 6,
          maxBarThickness: 26,
        },
        {
          label: I18N_PTBR.reports_marketing.chart.dataset_price,
          data: data.price,
          backgroundColor: "rgba(34, 197, 94, 0.75)",
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: "#d4d4d8", usePointStyle: true } },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

function createMarketingCampaignsChart(data) {
  const target = document.getElementById("reportsMarketingCampaignsChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.marketingCampaigns = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports_marketing.chart.dataset_budget,
          data: data.values,
          backgroundColor: "rgba(245, 158, 11, 0.75)",
          borderColor: "#b45309",
          borderWidth: 1,
          borderRadius: 8,
          maxBarThickness: 34,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports_marketing.chart.dataset_budget}: ${formatCurrency(
                context.parsed.y
              )}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

function createMarketingLowTurnoverChart(data) {
  const target = document.getElementById("reportsMarketingLowTurnoverChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.marketingLowTurnover = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports_marketing.chart.dataset_turnover,
          data: data.values,
          backgroundColor: "rgba(239, 68, 68, 0.72)",
          borderColor: "#b91c1c",
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports_marketing.chart.dataset_turnover}: ${Number(
                context.parsed.x || 0
              ).toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(63, 63, 70, 0.24)" },
          ticks: { color: "#a1a1aa" },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#a1a1aa" },
        },
      },
    },
  });
}

function createMarketingTopSkusChart(data) {
  const target = document.getElementById("reportsMarketingTopSkusChart");
  if (!target || !window.Chart || !data?.labels?.length) return;

  chartInstances.marketingTopSkus = new window.Chart(target.getContext("2d"), {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: I18N_PTBR.reports_marketing.chart.dataset_movement_value,
          data: data.values,
          backgroundColor: "rgba(37, 99, 235, 0.72)",
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...commonTooltip(),
          callbacks: {
            label: (context) =>
              `${I18N_PTBR.reports_marketing.chart.dataset_movement_value}: ${formatCurrency(
                context.parsed.y
              )}`,
          },
        },
      },
      scales: commonScales(),
    },
  });
}

export function renderReportsCharts(view) {
  destroyReportsCharts();
  if (!view?.charts) return;

  createFlowChart(view.charts.flow);
  createBranchDonutChart(view.charts.branch);
  createTopOutputChart(view.charts.topOutput);
  createTurnoverChart(view.charts.turnover);
  createAbcChart(view.charts.abc);
  createDivergenceChart(view.charts.divergence);
}

function destroyMarketingReportsCharts() {
  [
    "marketingCampaignProducts",
    "marketingPromotionSkus",
    "marketingCampaigns",
    "marketingLowTurnover",
    "marketingTopSkus",
  ].forEach((key) => {
    if (chartInstances[key] && typeof chartInstances[key].destroy === "function") {
      chartInstances[key].destroy();
    }
    chartInstances[key] = null;
  });
}

export function renderMarketingReportsCharts(view) {
  destroyMarketingReportsCharts();
  if (!view?.charts) return;

  createMarketingCampaignProductsChart(view.charts.campaignProducts);
  createMarketingPromotionSkusChart(view.charts.promotionSkus);
  createMarketingCampaignsChart(view.charts.campaigns);
  createMarketingLowTurnoverChart(view.charts.lowTurnover);
  createMarketingTopSkusChart(view.charts.topSkus);
}
