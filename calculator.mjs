export const UNITS = {
  cm: { family: 'length', factor: 1 },
  m: { family: 'length', factor: 100 },
  mm: { family: 'length', factor: 0.1 },
  g: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  st: { family: 'pieces', factor: 1 },
};

export function numberFromInput(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (raw === '') return 0;
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

function read(value, label, errors, { positive = false, max = Infinity } = {}) {
  const parsed = numberFromInput(value);
  if (!Number.isFinite(parsed) || (positive ? parsed <= 0 : parsed < 0) || parsed > max) {
    errors.push(`${label}: Bitte eine gültige ${positive ? 'Zahl größer als 0' : 'Zahl ab 0'} eingeben.`);
    return 0;
  }
  return parsed;
}

export function calculate(product) {
  const errors = [];
  const warnings = [];
  const batchSize = read(product.batchSize, 'Stückzahl', errors, { positive: true, max: 100000 });
  if (!Number.isInteger(batchSize)) errors.push('Stückzahl: Bitte eine ganze Zahl eingeben.');

  let materials = 0;
  const materialDetails = [];
  for (const [index, item] of (product.materials || []).entries()) {
    const active = [item.name, item.purchaseAmount, item.purchasePrice, item.usedAmount].some(value => String(value ?? '').trim());
    if (!active) continue;
    const label = item.name?.trim() || `Material ${index + 1}`;
    const purchaseUnit = UNITS[item.purchaseUnit];
    const usedUnit = UNITS[item.usedUnit];
    if (!purchaseUnit || !usedUnit || purchaseUnit.family !== usedUnit.family) {
      errors.push(`${label}: Einkaufs- und Verbrauchseinheit müssen zusammenpassen.`);
      continue;
    }
    const purchased = read(item.purchaseAmount, `${label}, Einkaufsmenge`, errors, { positive: true });
    const price = read(item.purchasePrice, `${label}, Einkaufspreis`, errors);
    const used = read(item.usedAmount, `${label}, Verbrauch`, errors);
    const waste = read(item.wastePercent, `${label}, Verschnitt`, errors, { max: 1000 });
    if (purchased <= 0) continue;
    const consumed = used * usedUnit.factor * (1 + waste / 100);
    const available = purchased * purchaseUnit.factor;
    const cost = price * consumed / available;
    if (!Number.isFinite(cost)) {
      errors.push(`${label}: Die Materialkosten konnten nicht berechnet werden.`);
      continue;
    }
    if (consumed > available + 1e-9) warnings.push(`${label}: Verbrauch und Verschnitt übersteigen die eingekaufte Menge.`);
    materials += cost;
    materialDetails.push({ id: item.id, name: label, cost });
  }

  const minutes = read(product.laborMinutes, 'Arbeitszeit in Minuten', errors);
  const hourlyRate = read(product.hourlyRate, 'Stundenlohn', errors);
  const labor = minutes / 60 * hourlyRate;
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
  const vatPercent = read(product.vatPercent, 'Umsatzsteuer', errors, { max: 100 });
  const overhead = (materials + labor + extras) * overheadPercent / 100;
  const batchCost = materials + labor + extras + overhead;
  const unitCost = batchSize > 0 ? batchCost / batchSize : 0;
  const denominator = 1 / (1 + vatPercent / 100) - feePercent / 100;
  if (denominator <= 0) errors.push('Steuer und Verkaufsgebühr sind zusammen zu hoch für eine Preisberechnung.');

  const suggestions = denominator > 0 && batchSize > 0
    ? [
      { kind: 'minimum', targetMarkup: 0 },
      { kind: 'recommended', targetMarkup: 30 },
      { kind: 'premium', targetMarkup: 60 },
    ].map(({ kind, targetMarkup }) => {
      const exactPrice = (unitCost * (1 + targetMarkup / 100) + fixedFee) / denominator;
      const price = Math.ceil((exactPrice - 1e-10) * 100) / 100;
      const netRevenue = price / (1 + vatPercent / 100);
      const salesFees = price * feePercent / 100 + fixedFee;
      const profit = Math.max(0, netRevenue - salesFees - unitCost);
      const markupPercent = unitCost > 0 ? profit / unitCost * 100 : 0;
      const marginPercent = netRevenue > 0 ? profit / netRevenue * 100 : 0;
      return { kind, targetMarkup, price, profit, netRevenue, salesFees, markupPercent, marginPercent };
    })
    : [];
  if (batchCost === 0 && errors.length === 0) warnings.push('Trage mindestens Material, Arbeitszeit oder Zusatzkosten ein.');
  return {
    errors, warnings, materialDetails, materials, labor, extras, overhead,
    batchCost, unitCost, batchSize, suggestions,
    feePercent, fixedFee, vatPercent,
  };
}
