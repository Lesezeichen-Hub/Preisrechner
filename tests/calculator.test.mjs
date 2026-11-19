import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, calculateSeries, calculateDiscount, numberFromInput, roundUpPrice } from '../calculator.mjs';

const base = () => ({ batchSize: '1', materials: [], extras: [], laborMinutes: '0', hourlyRate: '20', overheadPercent: '0', feePercent: '0', fixedFee: '0', vatPercent: '0' });

test('4 m wood is allocated by the 12 cm actually used, plus waste', () => {
  const product = base();
  product.materials = [{ id: 'wood', name: 'Buchenholz', purchaseAmount: '4', purchaseUnit: 'm', purchasePrice: '20', usedAmount: '12', usedUnit: 'cm', wastePercent: '10' }];
  const result = calculate(product);
  assert.equal(result.errors.length, 0);
  assert.ok(Math.abs(result.materials - 0.66) < 1e-9);
  assert.equal(result.suggestions.length, 3);
  assert.equal(result.suggestions[1].price, 0.86);
});

test('batch cost, labor, extras, overhead, fees and tax are included in the final price', () => {
  const product = base();
  product.batchSize = '2'; product.laborMinutes = '60'; product.extras = [{ name: 'Verpackung', amount: '2' }];
  product.overheadPercent = '10'; product.feePercent = '10'; product.fixedFee = '0,30'; product.vatPercent = '19';
  const result = calculate(product);
  assert.equal(result.errors.length, 0);
  assert.ok(Math.abs(result.batchCost - 24.2) < 1e-9);
  assert.ok(Math.abs(result.unitCost - 12.1) < 1e-9);
  const standard = result.suggestions[1];
  const revenueAfterTaxAndFee = standard.price / 1.19 - standard.price * 0.1 - 0.3;
  assert.ok(revenueAfterTaxAndFee >= 12.1 * 1.3 - 1e-9);
  assert.ok(revenueAfterTaxAndFee < 12.1 * 1.3 + 0.01);
  assert.ok(Math.abs(standard.profit - (revenueAfterTaxAndFee - result.unitCost)) < 1e-9);
  assert.ok(Math.abs(standard.markupPercent - standard.profit / result.unitCost * 100) < 1e-9);
  assert.ok(Math.abs(standard.marginPercent - standard.profit / standard.netRevenue * 100) < 1e-9);
  assert.ok(standard.marginPercent < standard.markupPercent);
  assert.deepEqual(result.suggestions.map(item => item.kind), ['minimum', 'recommended', 'premium']);
  for (const suggestion of result.suggestions) {
    assert.ok(suggestion.profit >= 0);
    assert.ok(Math.abs(suggestion.netRevenue - suggestion.salesFees - result.unitCost - suggestion.profit) < 1e-9);
    assert.ok(suggestion.markupPercent >= suggestion.marginPercent);
  }
});

test('invalid and incompatible inputs prevent price suggestions', () => {
  const product = base();
  product.batchSize = '0';
  product.materials = [{ name: 'Holz', purchaseAmount: '1', purchaseUnit: 'kg', purchasePrice: '5', usedAmount: '3', usedUnit: 'cm' }];
  const result = calculate(product);
  assert.ok(result.errors.length >= 2);
  assert.equal(result.suggestions.length, 0);
});

test('German decimal input works and malformed input is rejected', () => {
  assert.equal(numberFromInput('1.234,50'), 1234.5);
  assert.equal(numberFromInput('1,5'), 1.5);
  assert.ok(Number.isNaN(numberFromInput('1,2,3')));
  assert.ok(Number.isNaN(numberFromInput('-2')));
});

test('area and wood volume allocate purchase cost by the consumed measurements', () => {
  const product = base();
  product.materials = [
    { id: 'felt', name: 'Filz', purchaseAmount: '1', purchaseUnit: 'm2', purchasePrice: '10', usedAmount: '500', usedUnit: 'cm2', wastePercent: '0' },
    { id: 'log', name: 'Rundholz', mode: 'roundwood', purchaseLength: '100', purchaseDiameter: '10', usedLength: '20', usedDiameter: '5', purchasePrice: '40', wastePercent: '0' },
    { id: 'beam', name: 'Kantel', mode: 'squaredwood', purchaseLength: '100', purchaseWidth: '10', purchaseHeight: '10', usedLength: '10', usedWidth: '10', usedHeight: '10', purchasePrice: '20', wastePercent: '0' },
  ];
  const result = calculate(product);
  assert.equal(result.errors.length, 0);
  assert.ok(Math.abs(result.materials - 4.5) < 1e-9);
  assert.equal(result.materialDetails.find(item => item.id === 'beam').remainderLength, 90);
  assert.equal(result.materialDetails.find(item => item.id === 'log').remainderLength, null);
});

test('fixed setup cost is shared across a series and fee-aware discounts respect the minimum', () => {
  const product = base();
  product.laborMinutes = '30'; product.setupMinutes = '30'; product.feePercent = '10'; product.fixedFee = '0,30';
  const [one, five] = calculateSeries(product, [1, 5]);
  assert.equal(one.unitCost, 20);
  assert.equal(five.unitCost, 12);
  assert.ok(five.suggestions[1].price < one.suggestions[1].price);
  const check = calculateDiscount(product, one.suggestions[1].price, '10');
  assert.equal(check.safe, true);
  assert.ok(check.maxDiscountPercent >= 0);
  assert.equal(calculateDiscount(product, one.suggestions[0].price, '10').safe, false);
  assert.equal(calculateDiscount(product, '1', '0').maxDiscountPercent, null);
});

test('selling price rounding always moves upward', () => {
  assert.equal(roundUpPrice(19.73, 'cent'), 19.73);
  assert.equal(roundUpPrice(19.73, 'ninety'), 19.9);
  assert.equal(roundUpPrice(19.73, 'euro'), 20);
  assert.equal(roundUpPrice(19.95, 'ninety'), 20.9);
});

test('market stand fee changes sale prices without changing manufacturing cost', () => {
  const product = base();
  product.laborMinutes = '60';
  product.channelBatchFee = '10';
  const result = calculate(product);
  assert.equal(result.unitCost, 20);
  assert.equal(result.batchCost, 20);
  assert.equal(result.suggestions[0].price, 30);
  assert.equal(result.suggestions[1].price, 36);
  assert.equal(result.suggestions[1].profit, 6);
  assert.equal(result.suggestions[1].markupPercent, 30);
});
