function normalizeTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function asNumberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function diffSeverity(diffQty, systemQty = 0) {
  const diff = Math.abs(Number(diffQty || 0));
  if (diff === 0) return "equal";

  const baseline = Math.max(Math.abs(Number(systemQty || 0)), 1);
  const ratio = diff / baseline;

  if (diff >= 20 || ratio >= 0.35) return "critical";
  return "warning";
}

export function normalizeCounterLine(rawLine, itemById = new Map(), fallbackIndex = 0) {
  const skuId = Number(rawLine.sku_id || 0);
  const sourceItem = itemById.get(skuId);
  const systemQty = Number(rawLine.system_qty || 0);
  const countedQty = asNumberOrNull(rawLine.counted_qty);
  const diffQty = countedQty == null ? 0 : Number(systemQty || 0) - Number(countedQty);

  return {
    id: Number(rawLine.id || fallbackIndex + 1),
    count_id: Number(rawLine.count_id || 0),
    sku_id: skuId,
    system_qty: systemQty,
    counted_qty: countedQty,
    diff_qty: diffQty,
    posted: rawLine.posted === true,
    sku_code: rawLine.sku_code || sourceItem?.sku_code || `VAR-${String(skuId).padStart(5, "0")}`,
    sku_name: rawLine.sku_name || sourceItem?.name || `Variacao ${skuId}`,
    barcode: rawLine.barcode || sourceItem?.barcode || "",
    price: Number.isFinite(Number(rawLine.price))
      ? Number(rawLine.price)
      : Number.isFinite(Number(sourceItem?.price))
      ? Number(sourceItem.price)
      : null,
  };
}

export function buildCounterLines(count, itemById = new Map()) {
  const lines = Array.isArray(count?.lines) ? count.lines : [];
  return lines
    .map((line, index) => normalizeCounterLine(line, itemById, index))
    .sort((left, right) => String(left.sku_name || "").localeCompare(String(right.sku_name || ""), "pt-BR"));
}

export function computeCounterProgress(lines = []) {
  const total = lines.length;
  if (!total) {
    return {
      total,
      counted: 0,
      percent: 0,
    };
  }

  const counted = lines.filter((line) => Number.isFinite(Number(line.counted_qty))).length;
  const percent = Math.round((counted / total) * 100);
  return {
    total,
    counted,
    percent,
  };
}

export function computeCounterSummary(lines = []) {
  const totalItems = lines.length;
  const countedItems = lines.filter((line) => Number.isFinite(Number(line.counted_qty))).length;
  const divergentItems = lines.filter((line) => Number(line.diff_qty || 0) !== 0).length;
  const diffUnits = lines.reduce((acc, line) => acc + Number(line.diff_qty || 0), 0);
  const diffValue = lines.reduce((acc, line) => {
    const price = Number(line.price);
    if (!Number.isFinite(price)) return acc;
    return acc + Number(line.diff_qty || 0) * price;
  }, 0);

  return {
    totalItems,
    countedItems,
    divergentItems,
    diffUnits,
    diffValue,
  };
}

export function searchCounterLineIndex(lines = [], query = "") {
  const term = normalizeTerm(query);
  if (!term) return -1;

  const byBarcode = lines.findIndex((line) =>
    normalizeTerm(line.barcode).startsWith(term)
  );
  if (byBarcode >= 0) return byBarcode;

  return lines.findIndex((line) => {
    const text = normalizeTerm(`${line.sku_name || ""} ${line.sku_code || ""} ${line.barcode || ""}`);
    return text.includes(term);
  });
}

export function updateCounterLine(lines = [], skuId, countedQty) {
  const parsedQty = asNumberOrNull(countedQty);
  if (!Number.isFinite(Number(skuId))) {
    return lines;
  }

  return lines.map((line) => {
    if (Number(line.sku_id) !== Number(skuId)) {
      return line;
    }

    const nextCounted = parsedQty == null ? null : Math.max(0, Math.round(parsedQty));
    return {
      ...line,
      counted_qty: nextCounted,
      diff_qty:
        nextCounted == null
          ? 0
          : Number(line.system_qty || 0) - Number(nextCounted),
    };
  });
}

export function buildCounterPatchPayload(lines = []) {
  return lines
    .filter((line) => Number.isFinite(Number(line.counted_qty)))
    .map((line) => ({
      sku_id: Number(line.sku_id),
      counted_qty: Number(line.counted_qty),
    }));
}

export function isCounterEditable(status) {
  return String(status || "").toUpperCase() === "OPEN";
}
