import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, parseCsv } from '../csv.mjs';

test('CSV roundtrip keeps semicolons, quotes, umlauts and newlines', () => {
  const rows = [['Name', 'Beschreibung'], ['Windberg-Wicht', 'Holz; mit "Mütze"\nrot'], ['Käfer', '']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});
