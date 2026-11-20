import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBackup } from '../sync.mjs';

const state = () => ({ draft: { productName: '' }, saved: [], inventory: [], history: [], deletedProducts: [], deletedStock: [] });
const chooseIncoming = () => true;

test('repeated imports preserve identities and do not duplicate stock, products or history', () => {
  const source = state();
  source.saved.push({ id: 'p', updatedAt: '2026-01-01', product: { id: 'p', materials: [{ stockId: 's' }] } });
  source.inventory.push({ id: 's', name: 'Holz', quantity: 5, value: 10 });
  source.history.push({ productId: 'p', at: '2026-01-01', unitCost: 2 });
  const first = mergeBackup(state(), source, chooseIncoming);
  const second = mergeBackup(first, source, () => { throw new Error('Unchanged data must not conflict'); });
  assert.deepEqual(second, first);
  assert.equal(second.saved[0].product.materials[0].stockId, 's');
});

test('conflicting edits and deletions require a choice and preserve the chosen side', () => {
  const local = state(); const remote = state();
  local.inventory.push({ id: 's', name: 'Holz', quantity: 3, value: 6 });
  remote.inventory.push({ id: 's', name: 'Holz', quantity: 4, value: 8 });
  let conflicts = [];
  const kept = mergeBackup(local, remote, conflict => { conflicts.push(conflict); return false; });
  assert.equal(conflicts.length, 1);
  assert.equal(kept.inventory[0].quantity, 3);
  assert.equal(mergeBackup(local, remote, chooseIncoming).inventory[0].quantity, 4);
  remote.inventory = []; remote.deletedStock = ['s'];
  conflicts = [];
  const deleted = mergeBackup(local, remote, conflict => { conflicts.push(conflict); return true; });
  assert.equal(conflicts[0].incoming, null);
  assert.deepEqual(deleted.deletedStock, ['s']);
  assert.equal(deleted.inventory.length, 0);
  assert.equal(mergeBackup(deleted, local, () => false).inventory.length, 0);
  assert.equal(mergeBackup(deleted, local, chooseIncoming).inventory[0].quantity, 3);
});

test('draft replacement is decided explicitly and deleted products lose their history', () => {
  const local = state(); const remote = state();
  local.draft.productName = 'Lokal'; remote.draft.productName = 'Import';
  local.saved.push({ id: 'p', product: { id: 'p' } });
  local.history.push({ productId: 'p', unitCost: 1 });
  remote.deletedProducts.push('p');
  const merged = mergeBackup(local, remote, conflict => conflict.kind === 'product');
  assert.equal(merged.draft.productName, 'Lokal');
  assert.deepEqual(merged.history, []);
  assert.deepEqual(merged.deletedProducts, ['p']);
});

test('independent additions merge without conflict and choosing local keeps both local changes', () => {
  const local = state(); const remote = state();
  local.saved.push({ id: 'a', product: { id: 'a', name: 'Lokal' } });
  remote.saved.push({ id: 'a', product: { id: 'a', name: 'Import' } }, { id: 'b', product: { id: 'b', name: 'Neu' } });
  local.inventory.push({ id: 's1', quantity: 0.05 });
  remote.inventory.push({ id: 's2', quantity: 2 });
  const conflicts = [];
  const merged = mergeBackup(local, remote, conflict => { conflicts.push(conflict); return false; });
  assert.equal(conflicts.length, 1);
  assert.deepEqual(merged.saved.map(item => item.product.name), ['Lokal', 'Neu']);
  assert.deepEqual(merged.inventory.map(item => item.id), ['s1', 's2']);
});