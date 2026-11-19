import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, numberFromInput } from '../calculator.mjs';

const base = () => ({ batchSize: '1', materials: [], extras: [], laborMinutes: '0', hourlyRate: '20', overheadPercent: '0', feePercent: '0', fixedFee: '0', vatPercent: '0' });

test('4 m wood is allocated by the 12 cm actually used, plus waste', () => {
  const product = base();
  product.materials = [{ id: 'wood', name: 'Buchenholz', purchaseAmount: '4', purchaseUnit: 'm', purchasePrice: '20', usedAmount: '12', usedUnit: 'cm', wastePercent: '10' }];
  const result = calculate(product);
  assert.equal(result.errors.length, 0);
  assert.ok(Math.abs(result.materials - 0.66) < 1e-9);
  assert.equal(result.suggestions[2].price, 0.86);
});

test('batch cost, labor, extras, overhead, fees and tax are included in the final price', () => {
  const product = base();
  product.batchSize = '2'; product.laborMinutes = '60'; product.extras = [{ name: 'Verpackung', amount: '2' }];
  product.overheadPercent = '10'; product.feePercent = '10'; product.fixedFee = '0,30'; product.vatPercent = '19';
  const result = calculate(product);
  assert.equal(result.errors.length, 0);
  assert.ok(Math.abs(result.batchCost - 24.2) < 1e-9);
  assert.ok(Math.abs(result.unitCost - 12.1) < 1e-9);
  const standard = result.suggestions[2];
  const revenueAfterTaxAndFee = standard.price / 1.19 - standard.price * 0.1 - 0.3;
  assert.ok(revenueAfterTaxAndFee >= 12.1 * 1.3 - 1e-9);
  assert.ok(revenueAfterTaxAndFee < 12.1 * 1.3 + 0.01);
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
