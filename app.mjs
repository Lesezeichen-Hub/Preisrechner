import { calculate, calculateSeries, calculateDiscount, numberFromInput, UNITS } from './calculator.mjs';
import { loadState, saveState } from './storage.mjs';
import { toCsv, parseCsv, inventoryToCsv } from './csv.mjs';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const $ = id => document.getElementById(id);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const plain = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => euro.format(Number.isFinite(value) ? value : 0);
const numberText = value => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000).replace('.', ',') : '';
const fields = ['productName', 'batchSize', 'category', 'description', 'laborMinutes', 'hourlyRate', 'setupMinutes', 'setupCost', 'overheadPercent', 'salesChannel', 'feePercent', 'fixedFee', 'channelBatchFee', 'vatPercent', 'roundingMode'];
const woodFields = ['purchaseLength', 'purchaseDiameter', 'purchaseWidth', 'purchaseHeight', 'usedLength', 'usedDiameter', 'usedWidth', 'usedHeight'];
const validPhoto = value => typeof value === 'string' && value.length < 2_000_000 && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value);

function emptyProduct() {
  return { id: null, productName: '', category: '', description: '', photo: '', isTemplate: false, batchSize: '1', laborMinutes: '', hourlyRate: '20', setupMinutes: '0', setupCost: '0', overheadPercent: '10', salesChannel: 'direct', feePercent: '0', fixedFee: '0', channelBatchFee: '0', vatPercent: '0', roundingMode: 'cent', materials: [], extras: [] };
}

function cleanProduct(input) {
  const fresh = emptyProduct();
  if (!input || typeof input !== 'object') return fresh;
  for (const key of fields) fresh[key] = String(input[key] ?? fresh[key]).slice(0, key === 'description' ? 1500 : 100);
  fresh.id = typeof input.id === 'string' ? input.id : null;
  fresh.photo = validPhoto(input.photo) ? input.photo : '';
  fresh.isTemplate = input.isTemplate === true;
  if (!['direct', 'etsy', 'market', 'shop', 'custom'].includes(fresh.salesChannel)) fresh.salesChannel = 'custom';
  if (!['cent', 'ninety', 'euro'].includes(fresh.roundingMode)) fresh.roundingMode = 'cent';
  fresh.materials = Array.isArray(input.materials) ? input.materials.slice(0, 100).map(item => ({
    id: typeof item.id === 'string' ? item.id : uid(), name: String(item.name ?? '').slice(0, 100),
    purchaseAmount: String(item.purchaseAmount ?? '').slice(0, 40),
    purchaseUnit: UNITS[item.purchaseUnit] ? item.purchaseUnit : 'm',
    purchasePrice: String(item.purchasePrice ?? '').slice(0, 40),
    usedAmount: String(item.usedAmount ?? '').slice(0, 40),
    usedUnit: UNITS[item.usedUnit] ? item.usedUnit : 'cm',
    wastePercent: String(item.wastePercent ?? '0').slice(0, 40),
    mode: ['quantity', 'roundwood', 'squaredwood'].includes(item.mode) ? item.mode : 'quantity',
    ...Object.fromEntries(woodFields.map(key => [key, String(item[key] ?? '').slice(0, 40)])),
    stockId: typeof item.stockId === 'string' ? item.stockId : null,
    stockBooked: item.stockBooked === true,
    restBookedId: typeof item.restBookedId === 'string' ? item.restBookedId : null,
  })) : [];
  fresh.extras = Array.isArray(input.extras) ? input.extras.slice(0, 100).map(item => ({
    id: typeof item.id === 'string' ? item.id : uid(), name: String(item.name ?? '').slice(0, 100), amount: String(item.amount ?? '').slice(0, 40),
  })) : [];
  return fresh;
}

const stored = await loadState();
let draft = cleanProduct(stored?.draft);
let saved = Array.isArray(stored?.saved) ? stored.saved.filter(entry => entry && typeof entry.id === 'string' && entry.product).map(entry => ({ id: entry.id, updatedAt: entry.updatedAt, product: cleanProduct(entry.product) })) : [];
let inventory = Array.isArray(stored?.inventory) ? stored.inventory.filter(item => item && typeof item.id === 'string' && UNITS[item.unit]).map(item => ({ ...item, quantity: Number(item.quantity) || 0, value: Number(item.value) || 0 })) : [];
let history = Array.isArray(stored?.history) ? stored.history.filter(item => item && typeof item.productId === 'string' && Number.isFinite(item.unitCost)) : [];
let historyProductId = draft.id;
let saveTimer;
let storageOK = true;
let writeQueue = Promise.resolve();

function persist() {
  clearTimeout(saveTimer);
  $('saveStatus').textContent = 'Speichert …';
  const snapshot = structuredClone({ version: 2, draft, saved, inventory, history });
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
  return units.map(key => `<option value="${key}" ${key === selected ? 'selected' : ''}>${({ st: 'Stück', cm2: 'cm²', m2: 'm²', mm2: 'mm²', l: 'Liter' })[key] || key}</option>`).join('');
}

const woodInput = (item, key, label) => `<label class="field">${label} <span class="unit-label">cm</span><input data-field="${key}" inputmode="decimal" value="${plain(item[key])}"></label>`;

function materialHTML(item, index) {
  const family = UNITS[item.purchaseUnit]?.family || 'length';
  const used = UNITS[item.usedUnit]?.family === family ? item.usedUnit : item.purchaseUnit;
  const mode = item.mode || 'quantity';
  const measurement = mode === 'quantity' ? `<div class="item-fields">
      <label class="field">Eingekaufte Menge<div class="qty-wrap"><input data-field="purchaseAmount" inputmode="decimal" value="${plain(item.purchaseAmount)}" aria-label="Eingekaufte Menge ${index + 1}"><select data-field="purchaseUnit" aria-label="Einkaufseinheit ${index + 1}">${unitOptions(item.purchaseUnit)}</select></div></label>
      <label class="field">Preis dafür <span class="unit-label">€</span><input data-field="purchasePrice" inputmode="decimal" value="${plain(item.purchasePrice)}"></label>
      <label class="field">Davon verbraucht<div class="qty-wrap"><input data-field="usedAmount" inputmode="decimal" value="${plain(item.usedAmount)}" aria-label="Verbrauch ${index + 1}"><select data-field="usedUnit" aria-label="Verbrauchseinheit ${index + 1}">${unitOptions(used, family)}</select></div></label>
      <label class="field waste-field">Verschnitt / Verlust <span class="unit-label">% des Verbrauchs</span><input data-field="wastePercent" inputmode="decimal" value="${plain(item.wastePercent)}"></label>
    </div>` : `<div class="wood-measurements"><div><strong>Eingekauftes Holz</strong><div class="wood-grid">${woodInput(item, 'purchaseLength', 'Länge')}${mode === 'roundwood' ? woodInput(item, 'purchaseDiameter', 'Durchmesser') : woodInput(item, 'purchaseWidth', 'Breite') + woodInput(item, 'purchaseHeight', 'Höhe')}</div></div><div><strong>Für dieses Produkt verbraucht</strong><div class="wood-grid">${woodInput(item, 'usedLength', 'Länge')}${mode === 'roundwood' ? woodInput(item, 'usedDiameter', 'Durchmesser') : woodInput(item, 'usedWidth', 'Breite') + woodInput(item, 'usedHeight', 'Höhe')}</div></div></div><div class="field-grid two padded-top"><label class="field">Preis für eingekauftes Holz <span class="unit-label">€</span><input data-field="purchasePrice" inputmode="decimal" value="${plain(item.purchasePrice)}"></label><label class="field">Verschnitt / Verlust <span class="unit-label">% des Verbrauchs</span><input data-field="wastePercent" inputmode="decimal" value="${plain(item.wastePercent)}"></label></div>`;
  return `<div class="item-card" data-kind="materials" data-id="${plain(item.id)}">
    <div class="item-top"><span class="item-title">Material ${index + 1}</span><button class="button small danger remove-item" type="button" aria-label="Material ${index + 1} entfernen">Entfernen</button></div>
    <div class="field-grid two material-head"><label class="field">Bezeichnung<input data-field="name" value="${plain(item.name)}" placeholder="z. B. Buchenholz"></label><label class="field">Berechnungsart<select data-field="mode"><option value="quantity" ${mode === 'quantity' ? 'selected' : ''}>Menge / Länge / Fläche</option><option value="roundwood" ${mode === 'roundwood' ? 'selected' : ''}>Rundholz nach Volumen</option><option value="squaredwood" ${mode === 'squaredwood' ? 'selected' : ''}>Kantel nach Volumen</option></select></label></div>
    ${measurement}<p class="item-cost" data-cost="${plain(item.id)}"></p>
    <div class="material-stock-actions"><button class="button small book-rest" type="button" hidden>Reststück ins Lager buchen</button><button class="button small debit-stock" type="button" ${item.stockId ? '' : 'hidden'}>Verbrauch aus Lager abbuchen</button><small class="stock-note">${item.restBookedId ? 'Reststück bereits gebucht.' : item.stockBooked ? 'Lagerverbrauch gebucht; Mengen sind gesperrt. Für neue Maße das Produkt duplizieren.' : item.stockId ? 'Aus dem Lager übernommen; Bestand noch nicht abgebucht.' : ''}</small></div>
  </div>`;
}

function extraHTML(item, index) {
  return `<div class="item-card" data-kind="extras" data-id="${plain(item.id)}"><div class="item-top"><span class="item-title">Zusatzkosten ${index + 1}</span><button class="button small danger remove-item" type="button" aria-label="Zusatzkosten ${index + 1} entfernen">Entfernen</button></div><div class="field-grid two"><label class="field">Bezeichnung<input data-field="name" value="${plain(item.name)}" placeholder="z. B. Verpackung"></label><label class="field">Betrag für alle Stücke <span class="unit-label">€</span><input data-field="amount" inputmode="decimal" value="${plain(item.amount)}"></label></div></div>`;
}

function renderLists() {
  $('materialsList').innerHTML = draft.materials.length ? draft.materials.map(materialHTML).join('') : '<div class="empty-list">Noch kein Material erfasst. Füge Holz, Farbe oder andere Bestandteile hinzu.</div>';
  $('extrasList').innerHTML = draft.extras.length ? draft.extras.map(extraHTML).join('') : '<div class="empty-list">Keine weiteren Kosten erfasst.</div>';
  for (const item of draft.materials.filter(row => row.stockId)) {
    const card = document.querySelector(`.item-card[data-id="${CSS.escape(item.id)}"]`);
    card?.querySelectorAll('[data-field="mode"],[data-field="purchaseAmount"],[data-field="purchaseUnit"],[data-field="purchasePrice"],[data-field="purchaseLength"],[data-field="purchaseDiameter"],[data-field="purchaseWidth"],[data-field="purchaseHeight"],[data-field="usedDiameter"],[data-field="usedWidth"],[data-field="usedHeight"]').forEach(field => { field.disabled = true; });
  }
  for (const item of draft.materials.filter(row => row.stockBooked)) {
    const card = document.querySelector(`.item-card[data-id="${CSS.escape(item.id)}"]`);
    card?.querySelectorAll('[data-field]:not([data-field="name"])').forEach(field => { field.disabled = true; });
  }
}

function renderPhoto() {
  $('photoPreview').innerHTML = draft.photo ? `<img src="${draft.photo}" alt="Foto von ${plain(draft.productName || 'Produkt')}">` : '<span aria-hidden="true">◇</span><small>Noch kein Foto</small>';
  $('removePhotoButton').hidden = !draft.photo;
}

function renderFields() {
  for (const key of fields) $(key).value = draft[key];
  $('isTemplate').checked = draft.isTemplate;
  renderChannelHint();
  renderPhoto();
}

function renderChannelHint() {
  const notes = {
    direct: 'Direktverkauf: Standardmäßig ohne Plattformgebühr. Zahlungs- oder Standkosten kannst du trotzdem eintragen.',
    etsy: 'Richtwert für Etsy mit deutschem Bankkonto: 6,5 % Transaktion + 4 % Zahlungsabwicklung und 0,30 € je Einzelbestellung. Zusätzliche Einstell-, Werbe-, Versand- und Gebührensteuern bitte selbst ergänzen. <a href="https://www.etsy.com/de/legal/fees/" target="_blank" rel="noopener noreferrer">Etsy-Gebühren prüfen</a>.',
    market: 'Markt: Trage Standgebühren anteilig als Kanalgebühr je Serie ein; Kartengebühren bei Bedarf als Prozent oder festen Betrag.',
    shop: 'Onlineshop: Trage Zahlungs- und Shopgebühren entsprechend deinem Anbieter ein.',
    custom: 'Eigene Gebühren: Prozent vom Endpreis, feste Gebühr je Stück und/oder Gebühr je Serie.',
  };
  $('channelHint').innerHTML = notes[draft.salesChannel] || notes.custom;
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
      <div class="saved-item-actions"><button class="button small load-saved" type="button">Öffnen</button><button class="button small copy-saved" type="button">${product.isTemplate ? 'Vorlage verwenden' : 'Duplizieren'}</button><button class="button small show-history" type="button">Verlauf</button><button class="button small danger delete-saved" type="button">Löschen</button></div>
    </article>`;
  }).join('') : `<div class="empty-list">${saved.length ? 'Keine passenden Produkte gefunden.' : 'Noch keine Produkte oder Vorlagen gespeichert.'}</div>`;
}

function renderResult() {
  const result = calculate(draft);
  $('unitCost').textContent = result.errors.length ? '—' : money(result.unitCost);
  $('batchCount').textContent = String(result.batchSize || '–');
  $('batchCost').textContent = result.errors.length ? '—' : money(result.batchCost);
  const stockWarnings = draft.materials.filter(item => item.stockId).map(item => `${item.name || 'Material'}: Aus dem Lager übernommen, aber noch nicht abgebucht.`);
  $('resultAlerts').innerHTML = [...result.errors.map(message => `<div class="alert error">${plain(message)}</div>`), ...result.warnings.concat(stockWarnings).map(message => `<div class="alert">${plain(message)}</div>`)].join('');
  $('suggestions').innerHTML = result.errors.length || result.batchCost === 0 ? '' : result.suggestions.map(suggestion => {
    const names = { minimum: 'Mindestpreis', recommended: 'Empfohlener Verkaufspreis', premium: 'Premiumpreis' };
    return `<div class="suggestion ${suggestion.kind === 'recommended' ? 'featured' : ''}"><div class="suggestion-head"><span>${names[suggestion.kind]}</span><strong>${money(suggestion.price)}</strong></div><div class="suggestion-details"><small>Nach angesetzten Kosten übrig: <b>${money(suggestion.profit)}</b></small><small>Kostenaufschlag ${percent.format(suggestion.markupPercent)} % · Gewinnmarge ${percent.format(suggestion.marginPercent)} %</small></div></div>`;
  }).join('');
  $('formulaNote').textContent = result.errors.length || result.batchCost === 0 ? '' : `Mindestpreis deckt deine angesetzten Kosten; Empfehlung und Premium nutzen 30 % bzw. 60 % Zielaufschlag auf die Herstellungskosten. Kostenaufschlag = Gewinn ÷ Herstellungskosten. Gewinnmarge = Gewinn ÷ Verkaufserlös ohne Umsatzsteuer. Der Gewinnbetrag berücksichtigt die eingetragenen Kosten, Gebühren und Umsatzsteuer. Preise werden nach deiner Rundungseinstellung aufgerundet.`;
  $('breakdownRows').innerHTML = [['Material', result.materials], ['Arbeitszeit', result.labor], ['Weitere Kosten', result.extras], ['Rüstzeit & Serienkosten', result.fixedSetup], ['Gemeinkosten', result.overhead]].map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
  $('channelCostRow').innerHTML = result.channelBatchFee ? `<div class="breakdown-row channel-cost-row"><span>Zusätzlich: Kanalgebühr je Serie</span><strong>${money(result.channelBatchFee)}</strong></div>` : '';
  for (const item of draft.materials) {
    const el = document.querySelector(`[data-cost="${CSS.escape(item.id)}"]`);
    const detail = result.materialDetails.find(detail => detail.id === item.id);
    if (el) el.textContent = `Anteil: ${money(detail?.cost || 0)}`;
    const card = el?.closest('.item-card');
    const bookButton = card?.querySelector('.book-rest');
    if (bookButton) {
      bookButton.hidden = Boolean(item.restBookedId || item.stockId || item.stockBooked || !detail || detail.remainderLength === null || detail.remainderLength <= 1e-9 || result.errors.length);
      if (!bookButton.hidden) bookButton.textContent = `${percent.format(detail.remainderLength)} cm Rest für ${money(numberFromInput(item.purchasePrice) - detail.cost)} ins Lager buchen`;
    }
  }
  renderSeries(); renderDiscount();
}

function renderSeries() {
  const custom = numberFromInput($('customSeriesQuantity').value);
  const sizes = [...new Set([1, 5, 10, 50, ...(Number.isInteger(custom) && custom > 0 ? [custom] : [])])].sort((a, b) => a - b);
  const rows = calculateSeries(draft, sizes);
  $('seriesTable').innerHTML = rows.length && calculate(draft).batchCost > 0 ? `<table><thead><tr><th>Stück</th><th>Kosten je Stück</th><th>Kosten gesamt</th><th>Empfohlen je Stück</th><th>Umsatz bei Verkauf</th></tr></thead><tbody>${rows.map(row => `<tr><th>${row.quantity}</th><td>${money(row.unitCost)}</td><td>${money(row.batchCost)}</td><td>${money(row.suggestions[1].price)}</td><td>${money(row.suggestions[1].price * row.quantity)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-list">Gib zuerst gültige Kosten ein, damit die Serienpreise erscheinen.</div>';
}

function renderDiscount() {
  const base = calculate(draft);
  const entered = $('discountBasePrice').value.trim();
  const price = entered || (base.errors.length || base.batchCost === 0 ? '' : String(base.suggestions[1].price));
  const check = calculateDiscount(draft, price, $('discountPercent').value);
  $('discountResult').innerHTML = check ? `<div class="discount-cards"><div><span>Preis nach Rabatt</span><strong>${money(check.salePrice)}</strong></div><div><span>Danach übrig</span><strong class="${check.safe ? '' : 'negative'}">${money(check.profit)}</strong></div><div><span>Maximal sicherer Rabatt</span><strong>${check.maxDiscountPercent === null ? 'Keiner' : `${percent.format(check.maxDiscountPercent)} %`}</strong></div></div><p class="${check.safe ? 'positive-note' : 'negative-note'}">${check.safe ? 'Der eingegebene Rabatt deckt die angesetzten Kosten.' : `Unter der Kostengrenze von ${money(check.minimumPrice)} je Stück.`}</p>` : '<div class="empty-list">Gib gültige Kosten und einen Rabatt zwischen 0 und 100 % ein.</div>';
}

function renderInventory() {
  $('inventoryList').innerHTML = inventory.length ? inventory.map(item => `<div class="stock-item" data-stock-id="${plain(item.id)}"><div><strong>${plain(item.name)}</strong><small>${percent.format(item.quantity)} ${plain(item.unit === 'st' ? 'Stück' : item.unit)} · Materialwert ${money(item.value)}${item.mode === 'roundwood' ? ` · Ø ${plain(item.diameter)} cm` : item.mode === 'squaredwood' ? ` · ${plain(item.width)} × ${plain(item.height)} cm` : ''}</small></div><div class="stock-actions"><button class="button small use-stock" type="button" ${item.quantity <= 0 ? 'disabled' : ''}>Ins Produkt übernehmen</button><button class="button small danger delete-stock" type="button">Löschen</button></div></div>`).join('') : '<div class="empty-list">Noch kein Material im Lager.</div>';
  $('selectStock').innerHTML = '<option value="">Lagerartikel auswählen</option>' + inventory.filter(item => item.quantity > 0).map(item => `<option value="${plain(item.id)}">${plain(item.name)} · ${percent.format(item.quantity)} ${plain(item.unit === 'st' ? 'Stück' : item.unit)} · ${money(item.value)}</option>`).join('');
}

function renderHistory() {
  const entry = saved.find(item => item.id === historyProductId);
  const rows = history.filter(item => item.productId === historyProductId).reverse();
  $('historyContent').innerHTML = entry ? `<strong>${plain(entry.product.productName)}</strong><div class="table-scroll"><table><thead><tr><th>Gespeichert</th><th>Stück</th><th>Material</th><th>Kosten je Stück</th><th>Empfohlener Preis</th><th>Kanal</th></tr></thead><tbody>${rows.map(item => `<tr><td>${plain(new Date(item.at).toLocaleString('de-DE'))}</td><td>${item.quantity}</td><td>${money(item.materials)}</td><td>${money(item.unitCost)}</td><td>${money(item.recommendedPrice)}</td><td>${plain(item.channel)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-list">Öffne ein Produkt oder wähle „Verlauf“ in der Bibliothek.</div>';
}

function refresh() { renderFields(); renderLists(); renderResult(); renderSaved(); renderInventory(); renderHistory(); }
const hasDraftContent = () => Boolean(draft.productName || draft.category || draft.description || draft.photo || draft.materials.length || draft.extras.length);
function hasUnsavedChanges() {
  if (!hasDraftContent()) return false;
  const original = saved.find(entry => entry.id === draft.id);
  return !original || JSON.stringify(cleanProduct(draft)) !== JSON.stringify(cleanProduct(original.product));
}

for (const key of fields) $(key).addEventListener('input', event => { draft[key] = event.target.value; renderResult(); schedulePersist(); });
$('salesChannel').addEventListener('change', event => {
  const presets = { direct: ['0', '0', '0'], etsy: ['10,5', '0,30', '0'], market: ['0', '0', '0'], shop: ['0', '0', '0'], custom: ['0', '0', '0'] };
  [draft.feePercent, draft.fixedFee, draft.channelBatchFee] = presets[event.target.value] || presets.custom;
  for (const key of ['feePercent', 'fixedFee', 'channelBatchFee']) $(key).value = draft[key];
  renderChannelHint(); renderResult(); schedulePersist();
});
$('isTemplate').addEventListener('change', event => { draft.isTemplate = event.target.checked; schedulePersist(); });
for (const key of ['librarySearch', 'libraryCategory', 'libraryKind']) $(key).addEventListener(key === 'librarySearch' ? 'input' : 'change', renderSaved);
$('customSeriesQuantity').addEventListener('input', renderSeries);
for (const key of ['discountBasePrice', 'discountPercent']) $(key).addEventListener('input', renderDiscount);

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
  if (!['purchaseUnit', 'mode'].includes(event.target.dataset.field)) return;
  const card = event.target.closest('.item-card');
  const item = draft.materials.find(row => row.id === card?.dataset.id);
  if (!item) return;
  if (event.target.dataset.field === 'purchaseUnit') {
    item.purchaseUnit = event.target.value;
    item.usedUnit = { length: 'cm', weight: 'g', volume: 'ml', pieces: 'st', area: 'cm2' }[UNITS[item.purchaseUnit].family];
  } else item.mode = event.target.value;
  renderLists(); renderResult(); schedulePersist();
});

document.addEventListener('click', event => {
  const restButton = event.target.closest('.book-rest');
  if (restButton) { bookRest(restButton.closest('.item-card').dataset.id); return; }
  const debitButton = event.target.closest('.debit-stock');
  if (debitButton) { debitStock(debitButton.closest('.item-card').dataset.id); return; }
  const button = event.target.closest('.remove-item');
  if (!button) return;
  const card = button.closest('.item-card');
  draft[card.dataset.kind] = draft[card.dataset.kind].filter(item => item.id !== card.dataset.id);
  renderLists(); renderResult(); schedulePersist();
});

function bookRest(materialId) {
  const item = draft.materials.find(row => row.id === materialId);
  const result = calculate(draft);
  const detail = result.materialDetails.find(row => row.id === materialId);
  if (!item || item.restBookedId || item.stockId || item.stockBooked || result.errors.length || !detail || detail.remainderLength === null || detail.remainderLength <= 1e-9) return;
  const value = numberFromInput(item.purchasePrice) - detail.cost;
  if (!Number.isFinite(value) || value < -1e-9) return;
  const stock = { id: uid(), name: `${item.name || 'Holz'} – Reststück`, quantity: detail.remainderLength, unit: 'cm', value: Math.max(0, value), mode: item.mode || 'quantity', diameter: item.purchaseDiameter || '', width: item.purchaseWidth || '', height: item.purchaseHeight || '', at: new Date().toISOString() };
  inventory.push(stock); item.restBookedId = stock.id;
  renderLists(); renderResult(); renderInventory(); persist();
  $('stockStatus').textContent = `${percent.format(stock.quantity)} cm Reststück für ${money(stock.value)} gebucht.`;
}

function debitStock(materialId) {
  const item = draft.materials.find(row => row.id === materialId);
  const stock = inventory.find(row => row.id === item?.stockId);
  const result = calculate(draft);
  const detail = result.materialDetails.find(row => row.id === materialId);
  if (!item || !stock || !detail || result.errors.length) { $('stockStatus').textContent = 'Bitte zuerst gültige Verbrauchsmaße eingeben.'; return; }
  const used = item.mode === 'quantity' ? detail.consumedBase / UNITS[stock.unit].factor : numberFromInput(item.usedLength) * (1 + numberFromInput(item.wastePercent) / 100);
  if (!Number.isFinite(used) || used <= 0 || used > stock.quantity + 1e-9) { $('stockStatus').textContent = 'Verbrauch muss größer als 0 sein und darf den Lagerbestand nicht überschreiten.'; return; }
  if (item.mode === 'roundwood' && item.usedDiameter !== item.purchaseDiameter || item.mode === 'squaredwood' && (item.usedWidth !== item.purchaseWidth || item.usedHeight !== item.purchaseHeight)) { $('stockStatus').textContent = 'Beim Lagerverbrauch muss der Holzquerschnitt gleich bleiben. Für kleinere Querschnitte bitte eine eigene Materialzeile nutzen.'; return; }
  const before = stock.quantity;
  stock.quantity = Math.max(0, stock.quantity - used);
  stock.value = Math.max(0, stock.value * stock.quantity / before);
  item.stockId = null; item.stockBooked = true;
  renderLists(); renderResult(); renderInventory(); persist();
  $('stockStatus').textContent = `${percent.format(used)} ${stock.unit} aus dem Lager abgebucht.`;
}

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
$('addStockButton').addEventListener('click', () => {
  const name = $('stockName').value.trim();
  const quantity = numberFromInput($('stockQuantity').value);
  const value = numberFromInput($('stockValue').value);
  if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(value) || value < 0) { $('stockStatus').textContent = 'Bitte Bezeichnung, Menge größer als 0 und Materialwert ab 0 eingeben.'; return; }
  inventory.push({ id: uid(), name, quantity, unit: $('stockUnit').value, value, mode: 'quantity', at: new Date().toISOString() });
  $('stockName').value = ''; $('stockQuantity').value = ''; $('stockValue').value = '';
  renderInventory(); persist(); $('stockStatus').textContent = 'Lagerstück hinzugefügt.';
});
function useStock(stock) {
  if (!stock || stock.quantity <= 0) return;
  const item = { id: uid(), name: stock.name, mode: stock.mode, purchasePrice: String(stock.value), wastePercent: '0', stockId: stock.id, stockBooked: false, restBookedId: null };
  if (stock.mode === 'roundwood') Object.assign(item, { purchaseLength: String(stock.quantity), usedLength: '', purchaseDiameter: String(stock.diameter), usedDiameter: String(stock.diameter) });
  else if (stock.mode === 'squaredwood') Object.assign(item, { purchaseLength: String(stock.quantity), usedLength: '', purchaseWidth: String(stock.width), usedWidth: String(stock.width), purchaseHeight: String(stock.height), usedHeight: String(stock.height) });
  else Object.assign(item, { purchaseAmount: String(stock.quantity), purchaseUnit: stock.unit, usedAmount: '', usedUnit: stock.unit });
  draft.materials.push(item); renderLists(); renderResult(); schedulePersist();
  $('stockStatus').textContent = 'Lagerstück im Produkt übernommen. Verbrauch bitte nach Eingabe abbuchen.';
}
$('selectStock').addEventListener('change', event => {
  useStock(inventory.find(item => item.id === event.target.value));
  event.target.value = '';
});
$('inventoryList').addEventListener('click', event => {
  const card = event.target.closest('[data-stock-id]');
  if (!card) return;
  const stock = inventory.find(item => item.id === card.dataset.stockId);
  if (!stock) return;
  if (event.target.closest('.use-stock')) {
    useStock(stock);
    $('materialsSection').scrollIntoView({ behavior: 'smooth' });
  } else if (event.target.closest('.delete-stock')) {
    if (!confirm(`Lagerstück „${stock.name}“ dauerhaft löschen?`)) return;
    inventory = inventory.filter(item => item.id !== stock.id);
    for (const item of draft.materials) {
      if (item.stockId === stock.id) item.stockId = null;
      if (item.restBookedId === stock.id) item.restBookedId = null;
    }
    renderLists(); renderResult(); renderInventory(); persist();
  }
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
  if (!result.errors.length && result.batchCost > 0) {
    const snapshot = { productId: id, at: record.updatedAt, quantity: result.batchSize, materials: result.materials, unitCost: result.unitCost, recommendedPrice: result.suggestions[1].price, channel: draft.salesChannel };
    const last = [...history].reverse().find(item => item.productId === id);
    if (!last || [last.quantity, last.materials, last.unitCost, last.recommendedPrice, last.channel].some((value, index) => value !== [snapshot.quantity, snapshot.materials, snapshot.unitCost, snapshot.recommendedPrice, snapshot.channel][index])) history.push(snapshot);
  }
  historyProductId = id;
  renderSaved(); renderHistory();
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
    draft = cleanProduct(entry.product); draft.id = entry.id; historyProductId = entry.id; refresh(); persist();
  } else if (event.target.closest('.copy-saved')) {
    if (hasUnsavedChanges() && !confirm('Nicht gespeicherte Änderungen verwerfen und eine neue Variante beginnen?')) return;
    draft = cleanProduct(entry.product); draft.id = null; draft.isTemplate = false; draft.productName = `${draft.productName || 'Produkt'} (Variante)`;
    for (const item of draft.materials) { item.stockId = null; item.stockBooked = false; item.restBookedId = null; }
    historyProductId = null; refresh(); persist();
  } else if (event.target.closest('.show-history')) {
    historyProductId = entry.id; renderHistory(); document.querySelector('.history-panel').scrollIntoView({ behavior: 'smooth' });
  } else if (event.target.closest('.delete-saved')) {
    if (!confirm(`„${entry.product.productName || 'Unbenanntes Produkt'}“ dauerhaft aus der Liste löschen?`)) return;
    saved = saved.filter(item => item.id !== entry.id);
    history = history.filter(item => item.productId !== entry.id);
    if (draft.id === entry.id) draft.id = null;
    if (historyProductId === entry.id) historyProductId = null;
    renderSaved(); renderHistory(); persist();
  }
});

function downloadBlob(data, type, filename) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('exportButton').addEventListener('click', async () => {
  await persist();
  downloadBlob(JSON.stringify({ format: 'preisrechner', version: 2, exportedAt: new Date().toISOString(), draft, saved, inventory, history }, null, 2), 'application/json', `preisrechner-backup-${new Date().toISOString().slice(0, 10)}.json`);
});
$('importButton').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 50_000_000) throw new Error('Die Datei ist zu groß.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'preisrechner' || ![1, 2].includes(data.version) || !Array.isArray(data.saved) || !data.draft) throw new Error('Das ist kein gültiges Preisrechner-Backup.');
    const idMap = new Map();
    const imported = data.saved.slice(0, 500).filter(item => item && typeof item === 'object' && item.product).map(item => {
      const id = uid(); idMap.set(item.id, id);
      return { id, updatedAt: typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt)) ? item.updatedAt : new Date().toISOString(), product: cleanProduct(item.product) };
    });
    for (const entry of imported) entry.product.id = entry.id;
    const stockMap = new Map();
    const importedStock = Array.isArray(data.inventory) ? data.inventory.filter(item => item && UNITS[item.unit] && Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.value))).map(item => {
      const id = uid(); stockMap.set(item.id, id);
      return { id, name: String(item.name ?? 'Lagerstück').slice(0, 100), unit: item.unit, quantity: Math.max(0, Number(item.quantity)), value: Math.max(0, Number(item.value)), mode: ['quantity', 'roundwood', 'squaredwood'].includes(item.mode) ? item.mode : 'quantity', diameter: String(item.diameter ?? ''), width: String(item.width ?? ''), height: String(item.height ?? ''), at: item.at };
    }) : [];
    const importedHistory = Array.isArray(data.history) ? data.history.filter(item => idMap.has(item.productId) && Number.isFinite(item.unitCost)).map(item => ({ ...item, productId: idMap.get(item.productId) })) : [];
    saved.push(...imported); inventory.push(...importedStock); history.push(...importedHistory);
    draft = cleanProduct(data.draft); draft.id = null;
    for (const product of [draft, ...imported.map(entry => entry.product)]) {
      for (const item of product.materials) { item.stockId = stockMap.get(item.stockId) || null; item.restBookedId = stockMap.get(item.restBookedId) || null; }
    }
    historyProductId = null;
    refresh(); persist();
    $('saveStatus').textContent = `${imported.length} Kalkulationen importiert`;
  } catch (error) { alert(error.message || 'Das Backup konnte nicht gelesen werden.'); }
});

$('exportCsvButton').addEventListener('click', () => {
  const rows = [['Name', 'Kategorie', 'Beschreibung', 'Vorlage', 'Stückzahl', 'Materialkosten', 'Herstellungskosten je Stück', 'Empfohlener Preis', 'Produktdaten JSON']];
  for (const entry of saved) {
    const product = entry.product;
    const result = calculate(product);
    const copy = structuredClone(product); copy.photo = '';
    rows.push([product.productName, product.category, product.description, product.isTemplate ? 'Ja' : 'Nein', product.batchSize, numberText(result.materials), numberText(result.unitCost), result.suggestions[1] ? numberText(result.suggestions[1].price) : '', JSON.stringify(copy)]);
  }
  downloadBlob(toCsv(rows), 'text/csv;charset=utf-8', `preisrechner-produkte-${new Date().toISOString().slice(0, 10)}.csv`);
});
$('exportStockCsvButton').addEventListener('click', () => {
  downloadBlob(inventoryToCsv(inventory), 'text/csv;charset=utf-8', `preisrechner-lager-${new Date().toISOString().slice(0, 10)}.csv`);
});
$('importCsvButton').addEventListener('click', () => $('importCsvFile').click());
$('importCsvFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error('Die CSV-Datei ist zu groß.');
    const rows = parseCsv(await file.text());
    const headers = rows.shift()?.map(value => value.trim().toLocaleLowerCase('de')) || [];
    const get = (row, name) => row[headers.indexOf(name)] || '';
    if (!headers.includes('name')) throw new Error('Die CSV-Datei braucht eine Spalte „Name“.');
    let count = 0;
    for (const row of rows) {
      if (!get(row, 'name').trim()) continue;
      let product;
      try { product = get(row, 'produktdaten json') ? cleanProduct(JSON.parse(get(row, 'produktdaten json'))) : emptyProduct(); }
      catch { product = emptyProduct(); }
      product.id = null; product.photo = '';
      product.productName = get(row, 'name').slice(0, 100);
      product.category = get(row, 'kategorie').slice(0, 100);
      product.description = get(row, 'beschreibung').slice(0, 1500);
      product.isTemplate = get(row, 'vorlage').toLocaleLowerCase('de') === 'ja';
      if (!get(row, 'produktdaten json') && Number.isInteger(numberFromInput(get(row, 'stückzahl'))) && numberFromInput(get(row, 'stückzahl')) > 0) product.batchSize = get(row, 'stückzahl');
      for (const item of product.materials) { item.stockId = null; item.restBookedId = null; item.stockBooked = false; }
      const id = uid(); product.id = id;
      saved.push({ id, updatedAt: new Date().toISOString(), product }); count++;
    }
    renderSaved(); persist(); $('saveStatus').textContent = `${count} Produkte aus CSV importiert`;
  } catch (error) { alert(error.message || 'Die CSV-Datei konnte nicht gelesen werden.'); }
});

function renderOffer() {
  const quantity = numberFromInput($('offerQuantity').value);
  const result = calculateSeries(draft, [quantity])[0];
  if (!result || result.batchCost === 0) { $('offerPreview').textContent = 'Bitte eine gültige Stückzahl und Produktkalkulation eingeben.'; $('printOfferButton').disabled = true; return; }
  $('printOfferButton').disabled = false;
  const tier = result.suggestions.find(item => item.kind === $('offerTier').value) || result.suggestions[1];
  const total = tier.price * quantity;
  $('offerPreview').innerHTML = `<strong>${plain(draft.productName)}</strong><span>${quantity} × ${money(tier.price)} = ${money(total)}</span>`;
  $('offerSheet').innerHTML = `<div class="offer-sheet-head"><div><span>PREISANGEBOT</span><h1>${plain(draft.productName)}</h1></div><strong>${plain($('offerSeller').value || 'Handgemacht')}</strong></div><p>Datum: ${plain(new Date().toLocaleDateString('de-DE'))}</p>${$('offerCustomer').value.trim() ? `<p>Für: ${plain($('offerCustomer').value.trim())}</p>` : ''}<div class="offer-product">${draft.photo ? `<img src="${draft.photo}" alt="">` : ''}<div>${draft.category ? `<small>${plain(draft.category)}</small>` : ''}<h2>${plain(draft.productName)}</h2><p>${plain(draft.description)}</p></div></div><table><thead><tr><th>Produkt</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody><tr><td>${plain(draft.productName)}</td><td>${quantity}</td><td>${money(tier.price)}</td><td>${money(total)}</td></tr></tbody></table><div class="offer-total">Angebotspreis <strong>${money(total)}</strong></div>${$('offerNotes').value.trim() ? `<p class="offer-notes">${plain($('offerNotes').value.trim())}</p>` : ''}<p class="offer-foot">Preisangebot für das beschriebene Produkt. Enthaltene Umsatzsteuer richtet sich nach der Kalkulation.</p>`;
}

$('offerButton').addEventListener('click', () => {
  const result = calculate(draft);
  if (!draft.productName.trim() || result.errors.length || result.batchCost === 0) { $('saveStatus').textContent = 'Für ein Angebot bitte zuerst Name und gültige Kosten eingeben.'; return; }
  $('offerQuantity').value = draft.batchSize;
  renderOffer(); $('offerDialog').showModal();
});
for (const key of ['offerSeller', 'offerCustomer', 'offerTier', 'offerQuantity', 'offerNotes']) $(key).addEventListener('input', renderOffer);
$('printOfferButton').addEventListener('click', () => { renderOffer(); document.body.classList.add('print-offer'); window.print(); });
window.addEventListener('afterprint', () => document.body.classList.remove('print-offer'));
$('offerDialog').addEventListener('close', () => document.body.classList.remove('print-offer'));

refresh();
if (!storageOK) $('saveStatus').textContent = 'Speichern im Browser nicht möglich. Bitte Backup exportieren.';
