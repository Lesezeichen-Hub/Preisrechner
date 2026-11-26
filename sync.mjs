function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function mergeCollection(local, incoming, localDeleted, incomingDeleted, kind, resolve) {
  const result = new Map(local.map(item => [item.id, item]));
  const deleted = new Set(localDeleted);
  const incomingById = new Map(incoming.map(item => [item.id, item]));
  for (const id of new Set([...incomingById.keys(), ...incomingDeleted])) {
    const remote = incomingById.get(id);
    const current = result.get(id);
    const remoteDeleted = !remote && incomingDeleted.includes(id);
    const localIsDeleted = deleted.has(id) && !current;
    if (remoteDeleted) {
      if (!current || resolve({ kind, local: current, incoming: null })) { result.delete(id); deleted.add(id); }
    } else if (remote) {
      if (localIsDeleted) {
        if (resolve({ kind, local: null, incoming: remote })) { deleted.delete(id); result.set(id, remote); }
      } else if (!current) {
        result.set(id, remote);
      } else if (!same(kind === 'product' ? current.product : current, kind === 'product' ? remote.product : remote) && resolve({ kind, local: current, incoming: remote })) {
        result.set(id, remote);
      }
    }
  }
  return { entries: [...result.values()], deleted: [...deleted] };
}

export function mergeBackup(local, incoming, resolve) {
  const products = mergeCollection(local.saved, incoming.saved, local.deletedProducts, incoming.deletedProducts, 'product', resolve);
  const stock = mergeCollection(local.inventory, incoming.inventory, local.deletedStock, incoming.deletedStock, 'stock', resolve);
  const documents = mergeCollection(local.documents || [], incoming.documents || [], local.deletedDocuments || [], incoming.deletedDocuments || [], 'document', resolve);
  let businessProfile = local.businessProfile || incoming.businessProfile || {};
  if (local.businessProfile && incoming.businessProfile && !same(local.businessProfile, incoming.businessProfile) && resolve({ kind: 'businessProfile', local: local.businessProfile, incoming: incoming.businessProfile })) {
    businessProfile = incoming.businessProfile;
  }
  const productIds = new Set(products.entries.map(entry => entry.id));
  const seen = new Set();
  const history = [...local.history, ...incoming.history].filter(item => {
    const key = JSON.stringify(canonical(item));
    if (!productIds.has(item.productId) || seen.has(key)) return false;
    seen.add(key); return true;
  });
  const draft = same(local.draft, incoming.draft) || !resolve({ kind: 'draft', local: local.draft, incoming: incoming.draft }) ? local.draft : incoming.draft;
  return {
    draft, saved: products.entries, inventory: stock.entries, history,
    deletedProducts: products.deleted, deletedStock: stock.deleted,
    businessProfile, documents: documents.entries, deletedDocuments: documents.deleted,
  };
}