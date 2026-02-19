const { DateTime } = window.luxon;

function createSeededRandom(seed = 42) {
  let current = seed;
  return () => {
    current = (current * 1664525 + 1013904223) % 4294967296;
    return current / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function pickDifferentBranch(rng, branchId, branches) {
  const filtered = branches.filter((branch) => branch.id !== branchId);
  return pick(rng, filtered);
}

function buildVariations(rng, total = 60) {
  const nouns = [
    "Whisky",
    "Vodka",
    "Gin",
    "Rum",
    "Licor",
    "Perfume",
    "Chocolate",
    "Café",
    "Cigarro",
    "Bateria",
    "Fone",
    "Óculos",
  ];
  const descriptors = [
    "Premium",
    "Reserve",
    "Gold",
    "Classique",
    "Signature",
    "Urban",
    "Alpine",
    "Ocean",
    "Heritage",
    "Sunset",
    "Silver",
    "Night",
  ];
  const packs = ["500ml", "700ml", "1L", "2x250ml", "Unidade", "Kit", "75cl"];

  const items = [];
  for (let index = 1; index <= total; index += 1) {
    const noun = pick(rng, nouns);
    const descriptor = pick(rng, descriptors);
    const pack = pick(rng, packs);
    items.push({
      id: index,
      sku_code: `VAR-${String(index).padStart(4, "0")}`,
      name: `${noun} ${descriptor} ${pack}`,
      barcode: `7891${String(100000000 + index).padStart(9, "0")}`,
      active: index % 13 !== 0,
      reorder_point: randomInt(rng, 8, 28),
    });
  }

  return items;
}

function buildBranches() {
  return [
    { id: 1, name: "Filial Aeroporto Internacional" },
    { id: 2, name: "Filial Centro Turístico" },
    { id: 3, name: "Filial Fronteira Norte" },
    { id: 4, name: "Filial Porto Sul" },
    { id: 5, name: "Filial Terminal Executivo" },
  ];
}

function buildLocations(branches) {
  const locations = [];
  let locationId = 1;

  branches.forEach((branch, index) => {
    locations.push({
      id: locationId,
      branch_id: branch.id,
      name: `Loja ${branch.name.replace("Filial ", "")}`,
      type: "STORE",
    });
    locationId += 1;

    locations.push({
      id: locationId,
      branch_id: branch.id,
      name: `Estoque ${branch.name.replace("Filial ", "")}`,
      type: "STOCK",
    });
    locationId += 1;

    if (index % 2 === 0 || index === branches.length - 1) {
      locations.push({
        id: locationId,
        branch_id: branch.id,
        name: `Avariados ${branch.name.replace("Filial ", "")}`,
        type: "DAMAGED",
      });
      locationId += 1;
    }
  });

  return locations;
}

function makeMoveType(rng) {
  const roll = rng();
  if (roll < 0.39) return "RECEIPT";
  if (roll < 0.78) return "ISSUE";
  if (roll < 0.9) return "ADJUSTMENT";
  if (roll < 0.95) return "TRANSFER_SHIP";
  return "TRANSFER_RECEIVE";
}

function buildUsers() {
  return [
    "Larissa Rocha",
    "Marcos Almeida",
    "Bianca Souza",
    "Rafael Menezes",
    "Tiago Ramos",
    "Camila Borges",
  ];
}

function buildInitialStocks(rng, branches, items) {
  const stockMap = new Map();
  branches.forEach((branch) => {
    items.forEach((item) => {
      let qty = randomInt(rng, 16, 260);
      if (item.id % 17 === 0) {
        qty = randomInt(rng, 0, 8);
      }
      if (item.id % 31 === 0) {
        qty = 0;
      }
      stockMap.set(`${branch.id}-${item.id}`, qty);
    });
  });
  return stockMap;
}

function applyMoveAndGetQty({ currentQty, moveType, rawQty, rng }) {
  if (moveType === "RECEIPT" || moveType === "TRANSFER_RECEIVE") {
    return Math.max(1, rawQty);
  }

  if (moveType === "ISSUE" || moveType === "TRANSFER_SHIP") {
    const possible = Math.max(1, Math.min(Math.abs(currentQty) + randomInt(rng, 0, 4), rawQty));
    return -possible;
  }

  if (moveType === "ADJUSTMENT") {
    const sign = rng() > 0.45 ? 1 : -1;
    return sign * Math.max(1, Math.floor(rawQty / 2));
  }

  return rawQty;
}

function buildTransfers(rng, branches, items) {
  const transfers = [];
  const now = DateTime.now();

  for (let index = 1; index <= 22; index += 1) {
    const fromBranch = pick(rng, branches);
    const toBranch = pickDifferentBranch(rng, fromBranch.id, branches);
    const variation = pick(rng, items);

    const roll = rng();
    let status = "DRAFT";
    if (roll >= 0.32 && roll < 0.62) status = "SHIPPED";
    if (roll >= 0.62 && roll < 0.93) status = "RECEIVED";
    if (roll >= 0.93) status = "CANCELLED";

    transfers.push({
      id: index,
      from_branch_id: fromBranch.id,
      to_branch_id: toBranch.id,
      item_id: variation.id,
      qty: randomInt(rng, 4, 42),
      status,
      created_at: now.minus({ days: randomInt(rng, 1, 14), hours: randomInt(rng, 0, 20) }).toISO(),
      note: "Transferência entre filiais",
    });
  }

  return transfers;
}

function buildInventoryCounts(rng, branches, locations) {
  const counts = [];
  const now = DateTime.now();

  for (let index = 1; index <= 14; index += 1) {
    const branch = pick(rng, branches);
    const branchLocations = locations.filter((location) => location.branch_id === branch.id);
    const statusRoll = rng();

    let status = "OPEN";
    if (statusRoll >= 0.35 && statusRoll < 0.62) status = "CLOSED";
    if (statusRoll >= 0.62 && statusRoll < 0.9) status = "POSTED";
    if (statusRoll >= 0.9) status = "CANCELLED";

    counts.push({
      id: index,
      branch_id: branch.id,
      location_id: pick(rng, branchLocations).id,
      status,
      started_at: now.minus({ days: randomInt(rng, 1, 21), hours: randomInt(rng, 0, 23) }).toISO(),
      lines_count: randomInt(rng, 25, 120),
    });
  }

  return counts;
}

function deriveAlerts({ rng, balances, items, branches, transfers, counts }) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const alerts = [];
  let alertId = 1;

  balances.forEach((balance) => {
    const item = itemById.get(balance.sku_id);
    if (!item) return;

    if (balance.on_hand <= 0) {
      alerts.push({
        id: alertId,
        severity: "critical",
        type: "stockout",
        item_id: balance.sku_id,
        branch_id: balance.branch_id,
        note: "Sem saldo no local principal da filial.",
      });
      alertId += 1;
      return;
    }

    if (balance.on_hand <= item.reorder_point) {
      alerts.push({
        id: alertId,
        severity: "warning",
        type: "low_stock",
        item_id: balance.sku_id,
        branch_id: balance.branch_id,
        note: `Saldo próximo ao ponto de reposição (${item.reorder_point}).`,
      });
      alertId += 1;
    }
  });

  const now = DateTime.now();
  transfers
    .filter((transfer) => transfer.status === "SHIPPED")
    .forEach((transfer) => {
      const created = DateTime.fromISO(transfer.created_at);
      const delayDays = Math.floor(now.diff(created, "days").days);
      if (delayDays >= 2) {
        alerts.push({
          id: alertId,
          severity: delayDays >= 5 ? "critical" : "warning",
          type: "delayed_transfer",
          item_id: transfer.item_id,
          branch_id: transfer.to_branch_id,
          note: `Transferência em trânsito há ${delayDays} dias.`,
        });
        alertId += 1;
      }
    });

  const openCounts = counts.filter((count) => count.status === "OPEN").slice(0, 8);
  openCounts.forEach((count) => {
    const branchItems = balances.filter((balance) => balance.branch_id === count.branch_id);
    const randomBalance = pick(rng, branchItems);
    if (!randomBalance) return;

    alerts.push({
      id: alertId,
      severity: "normal",
      type: "divergence",
      item_id: randomBalance.sku_id,
      branch_id: count.branch_id,
      note: "Diferença identificada na última pré-contagem do setor.",
    });
    alertId += 1;
  });

  const severityOrder = { critical: 0, warning: 1, normal: 2 };
  alerts.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.id - b.id;
  });

  return alerts.slice(0, 36);
}

function buildMovements({
  rng,
  branches,
  locations,
  items,
  users,
  stockMap,
  days,
  dailyMoveMin,
  dailyMoveMax,
}) {
  const moves = [];
  let moveId = 1;

  const spanDays = Math.max(1, Number(days || 30));
  const minPerDay = Math.max(1, Number(dailyMoveMin || 7));
  const maxPerDay = Math.max(minPerDay, Number(dailyMoveMax || 12));
  const start = DateTime.now().minus({ days: spanDays }).startOf("day");

  for (let day = 0; day < spanDays; day += 1) {
    const dayDate = start.plus({ days: day });

    branches.forEach((branch) => {
      const branchLocations = locations.filter((location) => location.branch_id === branch.id);
      const dailyMoves = randomInt(rng, minPerDay, maxPerDay);

      for (let count = 0; count < dailyMoves; count += 1) {
        const item = pick(rng, items);
        const moveType = makeMoveType(rng);
        const key = `${branch.id}-${item.id}`;
        const currentQty = stockMap.get(key) ?? 0;
        const rawQty = randomInt(rng, 2, 28);
        const qty = applyMoveAndGetQty({ currentQty, moveType, rawQty, rng });
        const nextQty = Math.min(420, Math.max(-18, currentQty + qty));

        stockMap.set(key, nextQty);

        const occurredAt = dayDate
          .plus({
            hours: randomInt(rng, 7, 22),
            minutes: randomInt(rng, 0, 59),
          })
          .toISO();

        moves.push({
          id: moveId,
          branch_id: branch.id,
          sku_id: item.id,
          location_id: pick(rng, branchLocations).id,
          move_type: moveType,
          qty,
          occurred_at: occurredAt,
          created_by: randomInt(rng, 100, 199),
          user_name: pick(rng, users),
          reason: "Operação diária",
          reference_id: `REF-${String(moveId).padStart(6, "0")}`,
        });

        moveId += 1;
      }
    });
  }

  moves.sort((a, b) => DateTime.fromISO(a.occurred_at).toMillis() - DateTime.fromISO(b.occurred_at).toMillis());

  return moves;
}

function buildBalances({ branches, items, locations, stockMap }) {
  const balances = [];
  let balanceId = 1;

  branches.forEach((branch) => {
    const stockLocation = locations.find(
      (location) => location.branch_id === branch.id && location.type === "STOCK"
    );
    const fallbackLocation = locations.find((location) => location.branch_id === branch.id);

    items.forEach((item) => {
      balances.push({
        id: balanceId,
        branch_id: branch.id,
        sku_id: item.id,
        location_id: (stockLocation || fallbackLocation).id,
        on_hand: stockMap.get(`${branch.id}-${item.id}`) ?? 0,
        updated_at: DateTime.now().minus({ minutes: balanceId % 50 }).toISO(),
      });
      balanceId += 1;
    });
  });

  return balances;
}

export function generateMockDataset(seed = 42, options = {}) {
  const rng = createSeededRandom(seed);
  const days = Number(options.days || 30);
  const dailyMoveMin = Number(options.dailyMoveMin || 7);
  const dailyMoveMax = Number(options.dailyMoveMax || 12);
  const itemTotal = Number(options.itemTotal || 62);
  const branches = buildBranches();
  const locations = buildLocations(branches);
  const users = buildUsers();
  const items = buildVariations(rng, itemTotal);
  const stockMap = buildInitialStocks(rng, branches, items);

  const moves = buildMovements({
    rng,
    branches,
    locations,
    items,
    users,
    stockMap,
    days,
    dailyMoveMin,
    dailyMoveMax,
  });
  const balances = buildBalances({ branches, items, locations, stockMap });
  const transfers = buildTransfers(rng, branches, items);
  const counts = buildInventoryCounts(rng, branches, locations);
  const alerts = deriveAlerts({
    rng,
    balances,
    items,
    branches,
    transfers,
    counts,
  });

  return {
    source: "demo",
    generated_at: DateTime.now().toISO(),
    branches,
    locations,
    items,
    balances,
    moves,
    alerts,
    transfers,
    counts,
    users,
  };
}

function buildCatalogCategories() {
  return [
    "Bebidas",
    "Perfumaria",
    "Cosméticos",
    "Eletrônicos",
    "Chocolates",
    "Acessórios",
    "Tabacaria",
    "Cuidados pessoais",
    "Presentes",
    "Viagem",
    "Infantil",
    "Gourmet",
  ].map((name, index) => ({
    id: index + 1,
    name,
    active: true,
  }));
}

function buildCatalogBrands() {
  return [
    "Aurora",
    "Global Duty",
    "North Line",
    "Blue Harbor",
    "Atlantic",
    "Prime Reserve",
    "Voyager",
    "Zenith",
    "Sierra",
    "Polar",
    "Nevada",
    "Mirage",
    "Crown",
    "Silver Sky",
  ].map((name, index) => ({
    id: index + 1,
    name,
    active: true,
  }));
}

function randomDateWithinDays(rng, daysBack) {
  const safeDays = Math.max(1, Number(daysBack || 120));
  return DateTime.now()
    .minus({
      days: randomInt(rng, 0, safeDays),
      hours: randomInt(rng, 0, 23),
      minutes: randomInt(rng, 0, 59),
    })
    .toISO();
}

function buildProductName(rng, index) {
  const families = [
    "Whisky",
    "Gin",
    "Vodka",
    "Rum",
    "Licor",
    "Perfume",
    "Creme",
    "Chocolate",
    "Fone",
    "Carregador",
    "Óculos",
    "Mochila",
  ];
  const lines = [
    "Premium",
    "Reserve",
    "Urban",
    "Heritage",
    "Classic",
    "Gold",
    "Silver",
    "Night",
    "Ocean",
    "Sunset",
    "Travel",
    "Edition",
  ];
  return `${pick(rng, families)} ${pick(rng, lines)} ${String(index).padStart(3, "0")}`;
}

function buildVariationLabel(rng) {
  return pick(rng, [
    "500ml",
    "700ml",
    "1L",
    "Unidade",
    "Kit",
    "2x250ml",
    "75cl",
    "100ml",
    "200ml",
    "Padrão",
    "Compacto",
    "Especial",
  ]);
}

function buildVariationAttributes(rng) {
  const attributes = {};

  if (rng() < 0.95) {
    attributes.Cor = pick(rng, [
      "Preto",
      "Branco",
      "Azul",
      "Dourado",
      "Prata",
      "Vermelho",
      "Verde",
      "Rose",
      "Marrom",
      "Transparente",
    ]);
  }

  if (rng() < 0.88) {
    attributes.Tamanho = pick(rng, [
      "PP",
      "P",
      "M",
      "G",
      "GG",
      "Unico",
      "35",
      "36",
      "37",
      "38",
      "39",
      "40",
      "41",
      "42",
      "43",
      "44",
    ]);
  }

  if (rng() < 0.78) {
    attributes.Volume = pick(rng, [
      "50ml",
      "100ml",
      "200ml",
      "375ml",
      "500ml",
      "700ml",
      "750ml",
      "1L",
      "1.5L",
      "2L",
    ]);
  }

  if (rng() < 0.42) {
    attributes.Sabor = pick(rng, [
      "Original",
      "Citrus",
      "Baunilha",
      "Caramelo",
      "Frutas vermelhas",
      "Sem sabor",
      "Classico",
      "Premium",
      "Mentolado",
    ]);
  }

  if (!Object.keys(attributes).length) {
    attributes.Modelo = pick(rng, ["Padrao", "Compacto", "Premium"]);
  }

  return attributes;
}

function buildProductsCatalog(seed = 123, options = {}) {
  const rng = createSeededRandom(seed);
  const branches = buildBranches();
  const categories = buildCatalogCategories();
  const brands = buildCatalogBrands();

  const productTotal = Math.max(200, Number(options.productTotal || 240));
  const maxVariationsPerProduct = Math.max(1, Number(options.maxVariationsPerProduct || 30));
  const products = [];
  const skus = [];
  let skuId = 1;

  for (let productIndex = 1; productIndex <= productTotal; productIndex += 1) {
    const withoutCategory = productIndex % 11 === 0;
    const category = withoutCategory ? null : pick(rng, categories);
    const brand = pick(rng, brands);
    const variationCount = randomInt(rng, 0, maxVariationsPerProduct);
    const createdAt = randomDateWithinDays(rng, 220);
    const updatedAt = DateTime.fromISO(createdAt)
      .plus({ days: randomInt(rng, 0, 45), hours: randomInt(rng, 0, 20) })
      .toISO();
    const active = productIndex % 9 !== 0;
    const name = buildProductName(rng, productIndex);
    const description =
      productIndex % 4 === 0
        ? `Produto de alto giro para operação diária em freeshop (${name}).`
        : `Cadastro principal para o catálogo da linha ${name}.`;

    const branchStock = {};
    branches.forEach((branch) => {
      if (rng() < 0.72) {
        branchStock[branch.id] = randomInt(rng, 8, 420);
      }
    });

    products.push({
      id: productIndex,
      name,
      description,
      category_id: category?.id ?? null,
      brand_id: brand?.id ?? null,
      brand: brand?.name ?? null,
      active,
      created_at: createdAt,
      updated_at: updatedAt,
      branch_stock: branchStock,
      branch_ids: Object.keys(branchStock).map((id) => Number(id)),
    });

    for (let variationIndex = 0; variationIndex < variationCount; variationIndex += 1) {
      const sizeLabel = buildVariationLabel(rng);
      const cost = Number((randomInt(rng, 8, 240) + rng()).toFixed(2));
      const margin = Number((randomInt(rng, 15, 90) / 100).toFixed(2));
      const price = Number((cost * (1 + margin)).toFixed(2));
      const skuName = `${name} ${sizeLabel}`;
      const createdAt = randomDateWithinDays(rng, 180);
      const barcode =
        variationIndex % 9 === 0
          ? ""
          : `789${String(1000000000 + skuId).padStart(10, "0")}`;

      skus.push({
        id: skuId,
        product_id: productIndex,
        sku_code: `VAR-${String(skuId).padStart(5, "0")}`,
        name: skuName,
        barcode,
        cost,
        price,
        active: active && variationIndex % 7 !== 0,
        attributes: buildVariationAttributes(rng),
        created_at: createdAt,
        updated_at: DateTime.fromISO(createdAt)
          .plus({ days: randomInt(rng, 0, 45), hours: randomInt(rng, 0, 20) })
          .toISO(),
      });
      skuId += 1;
    }
  }

  return {
    source: "demo",
    generated_at: DateTime.now().toISO(),
    branches,
    categories,
    brands,
    products,
    skus,
  };
}

export function generateMockProductsDataset(seed = 123, options = {}) {
  return buildProductsCatalog(seed, options);
}
