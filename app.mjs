import { calculate, UNITS } from './calculator.mjs';
import { loadState, saveState } from './storage.mjs';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const $ = id => document.getElementById(id);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const plain = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => euro.format(Number.isFinite(value) ? value : 0);
const fields = ['productName', 'batchSize', 'category', 'description', 'laborMinutes', 'hourlyRate', 'overheadPercent', 'feePercent', 'fixedFee', 'vatPercent'];
const validPhoto = value => typeof value === 'string' && value.length < 2_000_000 && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value);

function emptyProduct() {
  return { id: null, productName: '', category: '', description: '', photo: '', isTemplate: false, batchSize: '1', laborMinutes: '', hourlyRate: '20', overheadPercent: '10', feePercent: '0', fixedFee: '0', vatPercent: '0', materials: [], extras: [] };
}

function cleanProduct(input) {
  const fresh = emptyProduct();
  if (!input || typeof input !== 'object') return fresh;
  for (const key of fields) fresh[key] = String(input[key] ?? fresh[key]).slice(0, key === 'description' ? 1500 : 100);
  fresh.id = typeof input.id === 'string' ? input.id : null;
  fresh.photo = validPhoto(input.photo) ? input.photo : '';
  fresh.isTemplate = input.isTemplate === true;
  fresh.materials = Array.isArray(input.materials) ? input.materials.slice(0, 100).map(item => ({
    id: typeof item.id === 'string' ? item.id : uid(), name: String(item.name ?? '').slice(0, 100),
    purchaseAmount: String(item.purchaseAmount ?? '').slice(0, 40),
    purchaseUnit: UNITS[item.purchaseUnit] ? item.purchaseUnit : 'm',
    purchasePrice: String(item.purchasePrice ?? '').slice(0, 40),
    usedAmount: String(item.usedAmount ?? '').slice(0, 40),
    usedUnit: UNITS[item.usedUnit] ? item.usedUnit : 'cm',
    wastePercent: String(item.wastePercent ?? '0').slice(0, 40),
  })) : [];
  fresh.extras = Array.isArray(input.extras) ? input.extras.slice(0, 100).map(item => ({
    id: typeof item.id === 'string' ? item.id : uid(), name: String(item.name ?? '').slice(0, 100), amount: String(item.amount ?? '').slice(0, 40),
  })) : [];
  return fresh;
}

const stored = await loadState();
let draft = cleanProduct(stored?.draft);
let saved = Array.isArray(stored?.saved) ? stored.saved.filter(entry => entry && typeof entry.id === 'string' && entry.product).map(entry => ({ id: entry.id, updatedAt: entry.updatedAt, product: cleanProduct(entry.product) })) : [];
let saveTimer;
let storageOK = true;
let writeQueue = Promise.resolve();

function persist() {
  clearTimeout(saveTimer);
  $('saveStatus').textContent = 'Speichert …';
  const snapshot = structuredClone({ version: 1, draft, saved });
  writeQueue = writeQueue.catch(() => {}).then(() => saveState(snapshot)).then(() => {
    storageOK = true;
    $('saveStatus').textContent = 'Lokal gespeichert';
  }).catch(() => {
    storageOK = false;
    $('saveStatus').textContent = 'Speichern im Browser nicht möglich. Bitte Backup exportieren.';
  });
  return writeQueue;
}
function schedulePersist() {
  $('saveStatus').textContent = 'Speichert …';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
}

function unitOptions(selected, family) {
  const units = Object.entries(UNITS).filter(([, value]) => !family || value.family === family).map(([key]) => key);
  return units.map(key => `<option value="${key}" ${key === selected ? 'selected' : ''}>${key === 'st' ? 'Stück' : key}</option>`).join('');
}

function materialHTML(item, index) {
  const family = UNITS[item.purchaseUnit]?.family || 'length';
  const used = UNITS[item.usedUnit]?.family === family ? item.usedUnit : item.purchaseUnit;
  return `<div class="item-card" data-kind="materials" data-id="${plain(item.id)}">
    <div class="item-top"><span class="item-title">Material ${index + 1}</span><button class="button small danger remove-item" type="button" aria-label="Material ${index + 1} entfernen">Entfernen</button></div>
    <div class="item-fields">
      <label class="field name-field">Bezeichnung<input data-field="name" value="${plain(item.name)}" placeholder="z. B. Buchenholz"></label>
      <label class="field">Eingekaufte Menge<div class="qty-wrap"><input data-field="purchaseAmount" inputmode="decimal" value="${plain(item.purchaseAmount)}" aria-label="Eingekaufte Menge ${index + 1}"><select data-field="purchaseUnit" aria-label="Einkaufseinheit ${index + 1}">${unitOptions(item.purchaseUnit)}</select></div></label>
      <label class="field">Preis dafür <span class="unit-label">€</span><input data-field="purchasePrice" inputmode="decimal" value="${plain(item.purchasePrice)}"></label>
      <label class="field">Davon verbraucht<div class="qty-wrap"><input data-field="usedAmount" inputmode="decimal" value="${plain(item.usedAmount)}" aria-label="Verbrauch ${index + 1}"><select data-field="usedUnit" aria-label="Verbrauchseinheit ${index + 1}">${unitOptions(used, family)}</select></div></label>
      <label class="field waste-field">Verschnitt / Verlust <span class="unit-label">% des Verbrauchs</span><input data-field="wastePercent" inputmode="decimal" value="${plain(item.wastePercent)}"><small>Optional: Bei 10 % werden 10 % mehr Material berechnet.</small></label>
    </div><p class="item-cost" data-cost="${plain(item.id)}"></p>
  </div>`;
}

function extraHTML(item, index) {
  return `<div class="item-card" data-kind="extras" data-id="${plain(item.id)}"><div class="item-top"><span class="item-title">Zusatzkosten ${index + 1}</span><button class="button small danger remove-item" type="button" aria-label="Zusatzkosten ${index + 1} entfernen">Entfernen</button></div><div class="field-grid two"><label class="field">Bezeichnung<input data-field="name" value="${plain(item.name)}" placeholder="z. B. Verpackung"></label><label class="field">Betrag für alle Stücke <span class="unit-label">€</span><input data-field="amount" inputmode="decimal" value="${plain(item.amount)}"></label></div></div>`;
}

function renderLists() {
  $('materialsList').innerHTML = draft.materials.length ? draft.materials.map(materialHTML).join('') : '<div class="empty-list">Noch kein Material erfasst. Füge Holz, Farbe oder andere Bestandteile hinzu.</div>';
  $('extrasList').innerHTML = draft.extras.length ? draft.extras.map(extraHTML).join('') : '<div class="empty-list">Keine weiteren Kosten erfasst.</div>';
}

function renderPhoto() {
  $('photoPreview').innerHTML = draft.photo ? `<img src="${draft.photo}" alt="Foto von ${plain(draft.productName || 'Produkt')}">` : '<span aria-hidden="true">◇</span><small>Noch kein Foto</small>';
  $('removePhotoButton').hidden = !draft.photo;
}

function renderFields() {
  for (const key of fields) $(key).value = draft[key];
  $('isTemplate').checked = draft.isTemplate;
  renderPhoto();
}

function renderSaved() {
  const categories = [...new Set(saved.map(entry => entry.product.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const categoryFilter = $('libraryCategory').value;
  $('libraryCategory').innerHTML = '<option value="">Alle Kategorien</option>' + categories.map(value => `<option value="${plain(value)}">${plain(value)}</option>`).join('');
  $('libraryCategory').value = categories.includes(categoryFilter) ? categoryFilter : '';
  $('categorySuggestions').innerHTML = categories.map(value => `<option value="${plain(value)}"></option>`).join('');
  const query = $('librarySearch').value.trim().toLocaleLowerCase('de');
  const kind = $('libraryKind').value;
  const shown = saved.filter(entry => {
    const product = entry.product;
    return (!query || [product.productName, product.category, product.description].some(value => value.toLocaleLowerCase('de').includes(query)))
      && (!$('libraryCategory').value || product.category.trim() === $('libraryCategory').value)
      && (kind === 'all' || (kind === 'templates') === product.isTemplate);
  });
  $('libraryCount').textContent = `${shown.length} von ${saved.length} ${saved.length === 1 ? 'Eintrag' : 'Einträgen'}`;
  $('savedList').innerHTML = shown.length ? [...shown].reverse().map(entry => {
    const product = entry.product;
    const result = calculate(product);
    const price = result.errors.length || result.batchCost === 0 ? 'Preis noch offen' : `Empfohlen: ${money(result.suggestions[1].price)}`;
    return `<article class="saved-item ${draft.id === entry.id ? 'active' : ''}" data-saved-id="${plain(entry.id)}">
      <div class="saved-item-main"><div class="saved-thumb">${product.photo ? `<img src="${product.photo}" alt="">` : '<span aria-hidden="true">◇</span>'}</div>
        <div class="saved-item-info"><span class="library-badge">${product.isTemplate ? 'Vorlage' : 'Produkt'}</span>${product.category ? `<span class="library-badge">${plain(product.category)}</span>` : ''}<strong>${plain(product.productName.trim() || 'Unbenanntes Produkt')}</strong><small>${plain(entry.updatedAt && !Number.isNaN(Date.parse(entry.updatedAt)) ? date.format(new Date(entry.updatedAt)) : '')}</small>${product.description ? `<p>${plain(product.description)}</p>` : ''}<div class="saved-price">${price}</div></div></div>
      <div class="saved-item-actions"><button class="button small load-saved" type="button">Öffnen</button><button class="button small copy-saved" type="button">${product.isTemplate ? 'Vorlage verwenden' : 'Duplizieren'}</button><button class="button small danger delete-saved" type="button">Löschen</button></div>
    </article>`;
  }).join('') : `<div class="empty-list">${saved.length ? 'Keine passenden Produkte gefunden.' : 'Noch keine Produkte oder Vorlagen gespeichert.'}</div>`;
}

function renderResult() {
  const result = calculate(draft);
  $('unitCost').textContent = result.errors.length ? '—' : money(result.unitCost);
  $('batchCount').textContent = String(result.batchSize || '–');
  $('batchCost').textContent = result.errors.length ? '—' : money(result.batchCost);
  $('resultAlerts').innerHTML = [...result.errors.map(message => `<div class="alert error">${plain(message)}</div>`), ...result.warnings.map(message => `<div class="alert">${plain(message)}</div>`)].join('');
  $('suggestions').innerHTML = result.errors.length || result.batchCost === 0 ? '' : result.suggestions.map(suggestion => {
    const names = { minimum: 'Mindestpreis', recommended: 'Empfohlener Verkaufspreis', premium: 'Premiumpreis' };
    return `<div class="suggestion ${suggestion.kind === 'recommended' ? 'featured' : ''}"><div class="suggestion-head"><span>${names[suggestion.kind]}</span><strong>${money(suggestion.price)}</strong></div><div class="suggestion-details"><small>Nach angesetzten Kosten übrig: <b>${money(suggestion.profit)}</b></small><small>Kostenaufschlag ${percent.format(suggestion.markupPercent)} % · Gewinnmarge ${percent.format(suggestion.marginPercent)} %</small></div></div>`;
  }).join('');
  $('formulaNote').textContent = result.errors.length || result.batchCost === 0 ? '' : `Mindestpreis deckt deine angesetzten Kosten; Empfehlung und Premium nutzen 30 % bzw. 60 % Zielaufschlag. Kostenaufschlag = Gewinn ÷ Herstellungskosten. Marge = Gewinn ÷ Verkaufserlös ohne Umsatzsteuer. Der Gewinnbetrag ist nach ${result.feePercent || result.fixedFee ? 'Verkaufsgebühren, ' : ''}${result.vatPercent ? 'Umsatzsteuer, ' : ''}Material, Zeit und weiteren Kosten berechnet. Preise sind auf volle Cent aufgerundet.`;
  $('breakdownRows').innerHTML = [['Material', result.materials], ['Arbeitszeit', result.labor], ['Weitere Kosten', result.extras], ['Gemeinkosten', result.overhead]].map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
  for (const item of draft.materials) {
    const el = document.querySelector(`[data-cost="${CSS.escape(item.id)}"]`);
    if (el) el.textContent = `Anteil: ${money(result.materialDetails.find(detail => detail.id === item.id)?.cost || 0)}`;
  }
}

function refresh() { renderFields(); renderLists(); renderResult(); renderSaved(); }
const hasDraftContent = () => Boolean(draft.productName || draft.category || draft.description || draft.photo || draft.materials.length || draft.extras.length);
function hasUnsavedChanges() {
  if (!hasDraftContent()) return false;
  const original = saved.find(entry => entry.id === draft.id);
  return !original || JSON.stringify(cleanProduct(draft)) !== JSON.stringify(cleanProduct(original.product));
}

for (const key of fields) $(key).addEventListener('input', event => { draft[key] = event.target.value; renderResult(); schedulePersist(); });
$('isTemplate').addEventListener('change', event => { draft.isTemplate = event.target.checked; schedulePersist(); });
for (const key of ['librarySearch', 'libraryCategory', 'libraryKind']) $(key).addEventListener(key === 'librarySearch' ? 'input' : 'change', renderSaved);

async function preparePhoto(file) {
  if (!file.type.startsWith('image/') || file.size > 15_000_000) throw new Error('Bitte ein Bild mit höchstens 15 MB auswählen.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Das Foto konnte nicht gelesen werden.')); });
    const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Das Foto konnte nicht verarbeitet werden.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .78);
    if (!validPhoto(data)) throw new Error('Das Foto ist zu groß. Bitte ein kleineres Bild wählen.');
    return data;
  } finally { URL.revokeObjectURL(url); }
}

$('photoButton').addEventListener('click', () => $('photoFile').click());
$('photoFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  $('saveStatus').textContent = 'Foto wird vorbereitet …';
  try {
    draft.photo = await preparePhoto(file);
    renderPhoto(); persist();
  } catch (error) { $('saveStatus').textContent = error.message || 'Foto konnte nicht hinzugefügt werden.'; }
});
$('removePhotoButton').addEventListener('click', () => { draft.photo = ''; renderPhoto(); persist(); });

document.addEventListener('input', event => {
  const card = event.target.closest('.item-card');
  if (!card || !event.target.dataset.field) return;
  const item = draft[card.dataset.kind].find(row => row.id === card.dataset.id);
  if (!item) return;
  item[event.target.dataset.field] = event.target.value;
  renderResult(); schedulePersist();
});

document.addEventListener('change', event => {
  if (event.target.dataset.field !== 'purchaseUnit') return;
  const card = event.target.closest('.item-card');
  const item = draft.materials.find(row => row.id === card?.dataset.id);
  if (!item) return;
  item.purchaseUnit = event.target.value;
  item.usedUnit = { length: 'cm', weight: 'g', volume: 'ml', pieces: 'st' }[UNITS[item.purchaseUnit].family];
  renderLists(); renderResult(); schedulePersist();
});

document.addEventListener('click', event => {
  const button = event.target.closest('.remove-item');
  if (!button) return;
  const card = button.closest('.item-card');
  draft[card.dataset.kind] = draft[card.dataset.kind].filter(item => item.id !== card.dataset.id);
  renderLists(); renderResult(); schedulePersist();
});

$('addMaterial').addEventListener('click', () => {
  draft.materials.push({ id: uid(), name: '', purchaseAmount: '', purchaseUnit: 'm', purchasePrice: '', usedAmount: '', usedUnit: 'cm', wastePercent: '0' });
  renderLists(); schedulePersist();
  $('materialsList').lastElementChild.querySelector('[data-field="name"]').focus();
});
$('addExtra').addEventListener('click', () => {
  draft.extras.push({ id: uid(), name: '', amount: '' });
  renderLists(); schedulePersist();
  $('extrasList').lastElementChild.querySelector('[data-field="name"]').focus();
});
$('exampleButton').addEventListener('click', () => {
  if (hasDraftContent()) {
    if (!confirm('Den aktuellen Entwurf durch das Wichtel-Beispiel ersetzen? Gespeicherte Kalkulationen bleiben erhalten.')) return;
  }
  draft = { ...emptyProduct(), productName: 'Gedrechselter Wichtel', category: 'Holzfiguren', description: 'Gedrechselter Wichtel aus Buchenholz mit kleinen Holzteilen.', laborMinutes: '45', materials: [
    { id: uid(), name: 'Buchenholz', purchaseAmount: '4', purchaseUnit: 'm', purchasePrice: '20', usedAmount: '12', usedUnit: 'cm', wastePercent: '10' },
    { id: uid(), name: 'Kleine Holzstücke', purchaseAmount: '10', purchaseUnit: 'st', purchasePrice: '5', usedAmount: '2', usedUnit: 'st', wastePercent: '0' },
  ], extras: [{ id: uid(), name: 'Farbe und Verpackung', amount: '1,50' }] };
  refresh(); persist();
});
$('printButton').addEventListener('click', () => window.print());
$('saveButton').addEventListener('click', async () => {
  if (!draft.productName.trim()) { $('saveStatus').textContent = 'Bitte gib zuerst einen Produktnamen ein.'; $('productName').focus(); return; }
  const result = calculate(draft);
  if (!draft.isTemplate && (result.errors.length || result.batchCost === 0)) { $('saveStatus').textContent = 'Bitte vervollständige die Kalkulation oder markiere sie als Vorlage.'; return; }
  const id = draft.id || uid();
  const record = { id, updatedAt: new Date().toISOString(), product: { ...structuredClone(draft), id } };
  const index = saved.findIndex(item => item.id === id);
  if (index >= 0) saved[index] = record; else saved.push(record);
  draft.id = id;
  renderSaved();
  await persist();
  if (storageOK) $('saveStatus').textContent = 'Produkt gespeichert';
});
$('newButton').addEventListener('click', () => {
  if (hasUnsavedChanges() && !confirm('Einen neuen Entwurf beginnen? Nicht in der Bibliothek gespeicherte Änderungen gehen verloren.')) return;
  draft = emptyProduct(); refresh(); persist();
});

$('savedList').addEventListener('click', event => {
  const card = event.target.closest('[data-saved-id]');
  if (!card) return;
  const entry = saved.find(item => item.id === card.dataset.savedId);
  if (!entry) return;
  if (event.target.closest('.load-saved')) {
    if (hasUnsavedChanges() && !confirm('Nicht gespeicherte Änderungen verwerfen und dieses Produkt öffnen?')) return;
    draft = cleanProduct(entry.product); draft.id = entry.id; refresh(); persist();
  } else if (event.target.closest('.copy-saved')) {
    if (hasUnsavedChanges() && !confirm('Nicht gespeicherte Änderungen verwerfen und eine neue Variante beginnen?')) return;
    draft = cleanProduct(entry.product); draft.id = null; draft.isTemplate = false; draft.productName = `${draft.productName || 'Produkt'} (Variante)`; refresh(); persist();
  } else if (event.target.closest('.delete-saved')) {
    if (!confirm(`„${entry.product.productName || 'Unbenanntes Produkt'}“ dauerhaft aus der Liste löschen?`)) return;
    saved = saved.filter(item => item.id !== entry.id);
    if (draft.id === entry.id) draft.id = null;
    renderSaved(); persist();
  }
});

$('exportButton').addEventListener('click', async () => {
  await persist();
  const blob = new Blob([JSON.stringify({ format: 'preisrechner', version: 1, exportedAt: new Date().toISOString(), draft, saved }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `preisrechner-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('importButton').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 50_000_000) throw new Error('Die Datei ist zu groß.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'preisrechner' || data.version !== 1 || !Array.isArray(data.saved) || !data.draft) throw new Error('Das ist kein gültiges Preisrechner-Backup.');
    const imported = data.saved.slice(0, 500).filter(item => item && typeof item === 'object' && item.product).map(item => ({ id: uid(), updatedAt: typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt)) ? item.updatedAt : new Date().toISOString(), product: cleanProduct(item.product) }));
    for (const entry of imported) entry.product.id = entry.id;
    saved.push(...imported); draft = cleanProduct(data.draft); draft.id = null;
    refresh(); persist();
    $('saveStatus').textContent = `${imported.length} Kalkulationen importiert`;
  } catch (error) { alert(error.message || 'Das Backup konnte nicht gelesen werden.'); }
});

refresh();
if (!storageOK) $('saveStatus').textContent = 'Speichern im Browser nicht möglich. Bitte Backup exportieren.';
