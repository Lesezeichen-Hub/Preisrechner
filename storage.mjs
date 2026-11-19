const LEGACY_KEY = 'lesezeichen-hub-preisrechner-v1';
const DATABASE_NAME = 'lesezeichen-hub-preisrechner';
const STORE_NAME = 'state';
let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (!databasePromise) databasePromise = new Promise(resolve => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

export async function loadState() {
  const database = await openDatabase();
  if (database) {
    try {
      const stored = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (stored) return stored;
    } catch { /* Read the older browser copy below. */ }
  }
  try { return JSON.parse(localStorage.getItem(LEGACY_KEY)); }
  catch { return null; }
}

export async function saveState(state) {
  const database = await openDatabase();
  if (database) {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(state, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return;
  }
  localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
}
