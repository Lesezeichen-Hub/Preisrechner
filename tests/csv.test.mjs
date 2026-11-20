import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, parseCsv, inventoryToCsv } from '../csv.mjs';

test('CSV roundtrip keeps semicolons, quotes, umlauts and newlines', () => {
  const rows = [['Name', 'Beschreibung'], ['Windberg-Wicht', 'Holz; mit "Mütze"\nrot'], ['Käfer', '']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('inventory CSV contains quantities, total values and wood dimensions', () => {
  const rows = parseCsv(inventoryToCsv([
    { name: 'Holz; Buche', quantity: 2.5, unit: 'st', value: 12.34567, mode: 'quantity', minimum: 1.5 },
    { name: 'Rundholz', quantity: 30, unit: 'cm', value: 3.5, mode: 'roundwood', diameter: '4,5' },
  ]));
  assert.deepEqual(rows[1], ['Holz; Buche', '2,5', 'st', '12,34567', 'quantity', '', '', '', '1,5']);
  assert.deepEqual(rows[2], ['Rundholz', '30', 'cm', '3,5', 'roundwood', '4,5', '', '', '0']);
});
