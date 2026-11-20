export const UNITS = {
  cm: { family: 'length', factor: 1 },
  m: { family: 'length', factor: 100 },
  mm: { family: 'length', factor: 0.1 },
  g: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  st: { family: 'pieces', factor: 1 },
  cm2: { family: 'area', factor: 1 },
  m2: { family: 'area', factor: 10000 },
  mm2: { family: 'area', factor: 0.01 },
};

export const ROUNDING_MODES = ['cent', 'ninety', 'euro'];

export function roundUpPrice(value, mode = 'cent') {
  if (!Number.isFinite(value) || value < 0) return NaN;
  if (mode === 'euro') return Math.ceil(value - 1e-10);
  if (mode === 'ninety') return Math.ceil(value - 0.9 - 1e-10) + 0.9;
  return Math.ceil((value - 1e-10) * 100) / 100;
}

export function numberFromInput(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (raw === '') return 0;
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

export function stockMatchesMaterial(item, stock) {
  if (!stock || (item.mode || 'quantity') !== (stock.mode || 'quantity')) return false;
  if (numberFromInput(item.purchasePrice) !== stock.value) return false;
  if ((item.mode || 'quantity') === 'quantity') return item.purchaseUnit === stock.unit && numberFromInput(item.purchaseAmount) === stock.quantity;
  if (stock.unit !== 'cm' || numberFromInput(item.purchaseLength) !== stock.quantity) return false;
  if (item.mode === 'roundwood') return numberFromInput(item.purchaseDiameter) === numberFromInput(stock.diameter);
  return numberFromInput(item.purchaseWidth) === numberFromInput(stock.width) && numberFromInput(item.purchaseHeight) === numberFromInput(stock.height);
}

function read(value, label, errors, { positive = false, max = Infinity } = {}) {
  const parsed = numberFromInput(value);
  if (!Number.isFinite(parsed) || (positive ? parsed <= 0 : parsed < 0) || parsed > max) {
    errors.push(`${label}: Bitte eine gültige ${positive ? 'Zahl größer als 0' : 'Zahl ab 0'} eingeben.`);
    return 0;
  }
  return parsed;
}

function priceSuggestions(unitCost, channelCostPerUnit, feePercent, fixedFee, vatPercent, roundingMode) {
  const denominator = 1 / (1 + vatPercent / 100) - feePercent / 100;
  if (denominator <= 0 || unitCost < 0) return [];
  return [
    { kind: 'minimum', targetMarkup: 0 },
    { kind: 'recommended', targetMarkup: 30 },
    { kind: 'premium', targetMarkup: 60 },
  ].map(({ kind, targetMarkup }) => {
    const exactPrice = (unitCost * (1 + targetMarkup / 100) + channelCostPerUnit + fixedFee) / denominator;
    const price = roundUpPrice(exactPrice, roundingMode);
    const netRevenue = price / (1 + vatPercent / 100);
    const salesFees = price * feePercent / 100 + fixedFee;
    const profit = Math.max(0, netRevenue - salesFees - channelCostPerUnit - unitCost);
    return {
      kind, targetMarkup, exactPrice, price, profit, netRevenue, salesFees,
      markupPercent: unitCost > 0 ? profit / unitCost * 100 : 0,
      marginPercent: netRevenue > 0 ? profit / netRevenue * 100 : 0,
    };
  });
}

function materialCost(item, label, errors, warnings) {
  const price = read(item.purchasePrice, `${label}, Einkaufspreis`, errors);
  const waste = read(item.wastePercent, `${label}, Verschnitt`, errors, { max: 1000 });
  const mode = item.mode || 'quantity';
  let purchasedBase;
  let consumedBase;
  let family;
  let remainderLength = null;
  if (mode === 'roundwood' || mode === 'squaredwood') {
    family = 'wood-volume';
    const purchaseLength = read(item.purchaseLength, `${label}, Einkaufslänge`, errors, { positive: true });
    const usedLength = read(item.usedLength, `${label}, Verbrauchslänge`, errors, { positive: true });
    let purchaseArea;
    let usedArea;
    if (mode === 'roundwood') {
      const purchaseDiameter = read(item.purchaseDiameter, `${label}, Einkaufsdurchmesser`, errors, { positive: true });
      const usedDiameter = read(item.usedDiameter, `${label}, Verbrauchsdurchmesser`, errors, { positive: true });
      purchaseArea = Math.PI * (purchaseDiameter / 2) ** 2;
      usedArea = Math.PI * (usedDiameter / 2) ** 2;
      if (Math.abs(purchaseDiameter - usedDiameter) < 1e-9) remainderLength = purchaseLength - usedLength * (1 + waste / 100);
    } else {
      const purchaseWidth = read(item.purchaseWidth, `${label}, Einkaufsbreite`, errors, { positive: true });
      const purchaseHeight = read(item.purchaseHeight, `${label}, Einkaufshöhe`, errors, { positive: true });
      const usedWidth = read(item.usedWidth, `${label}, Verbrauchsbreite`, errors, { positive: true });
      const usedHeight = read(item.usedHeight, `${label}, Verbrauchshöhe`, errors, { positive: true });
      purchaseArea = purchaseWidth * purchaseHeight;
      usedArea = usedWidth * usedHeight;
      if (Math.abs(purchaseWidth - usedWidth) < 1e-9 && Math.abs(purchaseHeight - usedHeight) < 1e-9) remainderLength = purchaseLength - usedLength * (1 + waste / 100);
    }
    purchasedBase = purchaseLength * purchaseArea;
    consumedBase = usedLength * usedArea * (1 + waste / 100);
  } else {
    const purchaseUnit = UNITS[item.purchaseUnit];
    const usedUnit = UNITS[item.usedUnit];
    if (!purchaseUnit || !usedUnit || purchaseUnit.family !== usedUnit.family) {
      errors.push(`${label}: Einkaufs- und Verbrauchseinheit müssen zusammenpassen.`);
      return null;
    }
    family = purchaseUnit.family;
    const purchased = read(item.purchaseAmount, `${label}, Einkaufsmenge`, errors, { positive: true });
    const used = read(item.usedAmount, `${label}, Verbrauch`, errors);
    purchasedBase = purchased * purchaseUnit.factor;
    consumedBase = used * usedUnit.factor * (1 + waste / 100);
    if (family === 'length') remainderLength = (purchasedBase - consumedBase);
  }
  if (!purchasedBase || !Number.isFinite(purchasedBase) || !Number.isFinite(consumedBase)) return null;
  const cost = price * consumedBase / purchasedBase;
  if (!Number.isFinite(cost)) { errors.push(`${label}: Die Materialkosten konnten nicht berechnet werden.`); return null; }
  if (consumedBase > purchasedBase + 1e-9) warnings.push(`${label}: Verbrauch und Verschnitt übersteigen die eingekaufte Menge.`);
  return { id: item.id, name: label, mode, family, cost, purchasedBase, consumedBase, remainderBase: purchasedBase - consumedBase, remainderLength };
}

export function calculate(product) {
  const errors = [];
  const warnings = [];
  const batchSize = read(product.batchSize, 'Stückzahl', errors, { positive: true, max: 100000 });
  if (!Number.isInteger(batchSize)) errors.push('Stückzahl: Bitte eine ganze Zahl eingeben.');

  let materials = 0;
  const materialDetails = [];
  for (const [index, item] of (product.materials || []).entries()) {
    const active = [item.name, item.purchaseAmount, item.purchasePrice, item.usedAmount, item.purchaseLength, item.usedLength].some(value => String(value ?? '').trim());
    if (!active) continue;
    const label = item.name?.trim() || `Material ${index + 1}`;
    const detail = materialCost(item, label, errors, warnings);
    if (!detail) continue;
    materials += detail.cost;
    materialDetails.push(detail);
  }

  const minutes = read(product.laborMinutes, 'Arbeitszeit in Minuten', errors);
  const hourlyRate = read(product.hourlyRate, 'Stundenlohn', errors);
  const labor = minutes / 60 * hourlyRate;
  const setupMinutes = read(product.setupMinutes, 'Einmalige Rüstzeit', errors);
  const setupCost = read(product.setupCost, 'Einmalige Serienkosten', errors);
  const channelBatchFee = read(product.channelBatchFee, 'Kanalgebühr je Serie', errors);
  const fixedSetup = setupMinutes / 60 * hourlyRate + setupCost;
  if (minutes > 0 && hourlyRate === 0) warnings.push('Deine Arbeitszeit ist noch mit 0 € bewertet.');

  let extras = 0;
  for (const [index, item] of (product.extras || []).entries()) {
    const active = [item.name, item.amount].some(value => String(value ?? '').trim());
    if (!active) continue;
    extras += read(item.amount, `${item.name?.trim() || `Zusatzkosten ${index + 1}`}`, errors);
  }

  const overheadPercent = read(product.overheadPercent, 'Gemeinkosten', errors, { max: 1000 });
  const feePercent = read(product.feePercent, 'Verkaufsgebühr', errors, { max: 99 });
  const fixedFee = read(product.fixedFee, 'Feste Gebühr je Stück', errors);
  const shippingCost = read(product.shippingCost, 'Versandkosten je Stück', errors);
  const packagingCost = read(product.packagingCost, 'Verpackungskosten je Stück', errors);
  const vatPercent = read(product.vatPercent, 'Umsatzsteuer', errors, { max: 100 });
  const variableBatchCost = materials + labor + extras;
  const overhead = (variableBatchCost + fixedSetup) * overheadPercent / 100;
  const batchCost = variableBatchCost + fixedSetup + overhead;
  if (!Number.isFinite(batchCost)) errors.push('Die Gesamtkosten sind zu groß für eine verlässliche Berechnung.');
  const unitCost = batchSize > 0 ? batchCost / batchSize : 0;
  const channelCostPerUnit = batchSize > 0 ? channelBatchFee / batchSize + shippingCost + packagingCost : 0;
  const denominator = 1 / (1 + vatPercent / 100) - feePercent / 100;
  if (denominator <= 0) errors.push('Steuer und Verkaufsgebühr sind zusammen zu hoch für eine Preisberechnung.');

  const roundingMode = ROUNDING_MODES.includes(product.roundingMode) ? product.roundingMode : 'cent';
  const suggestions = denominator > 0 && batchSize > 0 ? priceSuggestions(unitCost, channelCostPerUnit, feePercent, fixedFee, vatPercent, roundingMode) : [];
  if (batchCost === 0 && errors.length === 0) warnings.push('Trage mindestens Material, Arbeitszeit oder Zusatzkosten ein.');
  return {
    errors, warnings, materialDetails, materials, labor, extras, fixedSetup, variableBatchCost, overhead,
    batchCost, unitCost, channelBatchFee, channelCostPerUnit, batchSize, suggestions, hourlyRate, overheadPercent, roundingMode,
    feePercent, fixedFee, vatPercent, shippingCost, packagingCost,
  };
}

export function calculateSeries(product, quantities = [1, 5, 10, 50]) {
  const base = calculate(product);
  if (base.errors.length || !base.batchSize) return [];
  return quantities.map(quantity => {
    const count = Number(quantity);
    if (!Number.isInteger(count) || count <= 0 || count > 100000) return null;
    const variable = base.variableBatchCost * count / base.batchSize;
    const batchCost = (variable + base.fixedSetup) * (1 + base.overheadPercent / 100);
    const unitCost = batchCost / count;
    return { quantity: count, batchCost, unitCost, suggestions: priceSuggestions(unitCost, base.channelBatchFee / count + base.shippingCost + base.packagingCost, base.feePercent, base.fixedFee, base.vatPercent, base.roundingMode) };
  }).filter(Boolean);
}

export function calculateDiscount(product, offerPrice, discountPercent) {
  const base = calculate(product);
  if (base.errors.length || base.batchCost === 0) return null;
  const offered = numberFromInput(offerPrice);
  const discount = numberFromInput(discountPercent);
  if (!Number.isFinite(offered) || offered <= 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) return null;
  const salePrice = Math.round(offered * (1 - discount / 100) * 100) / 100;
  const netRevenue = salePrice / (1 + base.vatPercent / 100);
  const profit = netRevenue - salePrice * base.feePercent / 100 - base.fixedFee - base.channelCostPerUnit - base.unitCost;
  const minimumPrice = roundUpPrice(base.suggestions[0].exactPrice, 'cent');
  const maxDiscountPercent = offered < minimumPrice ? null : Math.max(0, Math.floor((1 - minimumPrice / offered) * 1000 + 1e-9) / 10);
  return { salePrice, profit, minimumPrice, maxDiscountPercent, safe: profit >= -1e-9 };
}
