import { calculate, calculateSeries, calculateDiscount, numberFromInput, stockMatchesMaterial, UNITS } from './calculator.mjs';
import { loadState, saveState } from './storage.mjs';
import { toCsv, parseCsv, inventoryToCsv } from './csv.mjs';
import { mergeBackup } from './sync.mjs';
import { calculateDocumentTotals, cleanBusinessProfile, cleanDocument, createCancellationFromInvoice, createDeliveryNoteFromDocument, createDocument, createInvoiceFromOffer, issueDocument, parseDocumentExport, recordPayment, roundMoney, serializeDocumentExport } from './documents.mjs';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const quantityFormat = new Intl.NumberFormat('de-DE', { maximumSignificantDigits: 12 });
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const $ = id => document.getElementById(id);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const plain = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => euro.format(Number.isFinite(value) ? value : 0);
const numberText = value => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000).replace('.', ',') : '';
const fields = ['productName', 'batchSize', 'category', 'description', 'laborMinutes', 'hourlyRate', 'setupMinutes', 'setupCost', 'overheadPercent', 'salesChannel', 'feePercent', 'fixedFee', 'channelBatchFee', 'shippingCost', 'packagingCost', 'vatPercent', 'roundingMode'];
const woodFields = ['purchaseLength', 'purchaseDiameter', 'purchaseWidth', 'purchaseHeight', 'usedLength', 'usedDiameter', 'usedWidth', 'usedHeight'];
const validPhoto = value => typeof value === 'string' && value.length < 2_000_000 && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value);

function emptyProduct() {
  return { id: null, productName: '', category: '', description: '', photo: '', isTemplate: false, batchSize: '1', laborMinutes: '', hourlyRate: '20', setupMinutes: '0', setupCost: '0', overheadPercent: '10', salesChannel: 'direct', feePercent: '0', fixedFee: '0', channelBatchFee: '0', shippingCost: '0', packagingCost: '0', vatPercent: '0', roundingMode: 'cent', materials: [], extras: [] };
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

function cleanStock(item) {
  return { id: item.id, name: String(item.name ?? 'Lagerstück').slice(0, 100), unit: item.unit, quantity: Math.max(0, Number(item.quantity)), value: Math.max(0, Number(item.value)), minimum: Number.isFinite(Number(item.minimum)) ? Math.max(0, Number(item.minimum)) : 0, mode: ['quantity', 'roundwood', 'squaredwood'].includes(item.mode) ? item.mode : 'quantity', diameter: String(item.diameter ?? ''), width: String(item.width ?? ''), height: String(item.height ?? ''), at: typeof item.at === 'string' ? item.at : '' };
}

const stored = await loadState();
let draft = cleanProduct(stored?.draft);
let saved = Array.isArray(stored?.saved) ? stored.saved.filter(entry => entry && typeof entry.id === 'string' && entry.product).map(entry => ({ id: entry.id, updatedAt: entry.updatedAt, product: cleanProduct(entry.product) })) : [];
let inventory = Array.isArray(stored?.inventory) ? stored.inventory.filter(item => item && typeof item.id === 'string' && UNITS[item.unit] && Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.value))).map(cleanStock) : [];
let history = Array.isArray(stored?.history) ? stored.history.filter(item => item && typeof item.productId === 'string' && Number.isFinite(item.unitCost)) : [];
let deletedProducts = Array.isArray(stored?.deletedProducts) ? stored.deletedProducts.filter(id => typeof id === 'string') : [];
let deletedStock = Array.isArray(stored?.deletedStock) ? stored.deletedStock.filter(id => typeof id === 'string') : [];
let businessProfile = cleanBusinessProfile(stored?.businessProfile);
let documents = Array.isArray(stored?.documents) ? stored.documents.map(cleanDocument).filter(Boolean) : [];
let deletedDocuments = Array.isArray(stored?.deletedDocuments) ? stored.deletedDocuments.filter(id => typeof id === 'string') : [];
let editingDocument = null;
let paymentDocumentId = null;
let historyProductId = draft.id;
let saveTimer;
let storageOK = true;
let writeQueue = Promise.resolve();

function persist() {
  clearTimeout(saveTimer);
  $('saveStatus').textContent = 'Speichert …';
  const snapshot = structuredClone({ version: 4, draft, saved, inventory, history, deletedProducts, deletedStock, businessProfile, documents, deletedDocuments });
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
  const stockWarnings = draft.materials.filter(item => item.stockId).map(item => {
    const stock = inventory.find(row => row.id === item.stockId);
    if (!stock) return `${item.name || 'Material'}: Lagerartikel nicht mehr vorhanden. Bitte Materialzeile prüfen.`;
    if (!stockMatchesMaterial(item, stock)) return `${item.name || 'Material'}: Lagerbestand geändert. Bitte Materialzeile entfernen und erneut aus dem Lager auswählen.`;
    return `${item.name || 'Material'}: Aus dem Lager übernommen, aber noch nicht abgebucht.`;
  });
  $('resultAlerts').innerHTML = [...result.errors.map(message => `<div class="alert error">${plain(message)}</div>`), ...result.warnings.concat(stockWarnings).map(message => `<div class="alert">${plain(message)}</div>`)].join('');
  $('suggestions').innerHTML = result.errors.length || result.batchCost === 0 ? '' : result.suggestions.map(suggestion => {
    const names = { minimum: 'Mindestpreis', recommended: 'Empfohlener Verkaufspreis', premium: 'Premiumpreis' };
    return `<div class="suggestion ${suggestion.kind === 'recommended' ? 'featured' : ''}"><div class="suggestion-head"><span>${names[suggestion.kind]}</span><strong>${money(suggestion.price)}</strong></div><div class="suggestion-details"><small>Nach angesetzten Kosten übrig: <b>${money(suggestion.profit)}</b></small><small>Kostenaufschlag ${percent.format(suggestion.markupPercent)} % · Gewinnmarge ${percent.format(suggestion.marginPercent)} %</small></div></div>`;
  }).join('');
  $('formulaNote').textContent = result.errors.length || result.batchCost === 0 ? '' : `Mindestpreis deckt deine angesetzten Kosten; Empfehlung und Premium nutzen 30 % bzw. 60 % Zielaufschlag auf die Herstellungskosten. Kostenaufschlag = Gewinn ÷ Herstellungskosten. Gewinnmarge = Gewinn ÷ Verkaufserlös ohne Umsatzsteuer. Der Gewinnbetrag berücksichtigt die eingetragenen Kosten, Gebühren und Umsatzsteuer. Preise werden nach deiner Rundungseinstellung aufgerundet.`;
  $('breakdownRows').innerHTML = [['Material', result.materials], ['Arbeitszeit', result.labor], ['Weitere Kosten', result.extras], ['Rüstzeit & Serienkosten', result.fixedSetup], ['Gemeinkosten', result.overhead]].map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
  $('channelCostRow').innerHTML = (result.channelBatchFee ? `<div class="breakdown-row channel-cost-row"><span>Zusätzlich: Kanalgebühr je Serie</span><strong>${money(result.channelBatchFee)}</strong></div>` : '') + (result.shippingCost || result.packagingCost ? `<div class="breakdown-row channel-cost-row"><span>Zusätzlich: Versand & Verpackung je Stück</span><strong>${money(result.shippingCost + result.packagingCost)}</strong></div>` : '');
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
  const optionIndex = Number($('seriesPriceOption').value);
  const optionNames = ['Mindestpreis', 'Empfohlener Preis', 'Premiumpreis'];
  $('seriesTable').innerHTML = rows.length && calculate(draft).batchCost > 0 ? `<table><thead><tr><th>Stück</th><th>Kosten je Stück</th><th>Kosten gesamt</th><th>${optionNames[optionIndex]} je Stück</th><th>Umsatz bei Verkauf</th><th>Gewinn bei Verkauf</th></tr></thead><tbody>${rows.map(row => `<tr><th>${row.quantity}</th><td>${money(row.unitCost)}</td><td>${money(row.batchCost)}</td><td>${money(row.suggestions[optionIndex].price)}</td><td>${money(row.suggestions[optionIndex].price * row.quantity)}</td><td>${money(row.suggestions[optionIndex].profit * row.quantity)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-list">Gib zuerst gültige Kosten ein, damit die Serienpreise erscheinen.</div>';
}

function renderDiscount() {
  const base = calculate(draft);
  const entered = $('discountBasePrice').value.trim();
  const price = entered || (base.errors.length || base.batchCost === 0 ? '' : String(base.suggestions[1].price));
  const check = calculateDiscount(draft, price, $('discountPercent').value);
  $('discountResult').innerHTML = check ? `<div class="discount-cards"><div><span>Preis nach Rabatt</span><strong>${money(check.salePrice)}</strong></div><div><span>Danach übrig</span><strong class="${check.safe ? '' : 'negative'}">${money(check.profit)}</strong></div><div><span>Maximal sicherer Rabatt</span><strong>${check.maxDiscountPercent === null ? 'Keiner' : `${percent.format(check.maxDiscountPercent)} %`}</strong></div></div><p class="${check.safe ? 'positive-note' : 'negative-note'}">${check.safe ? 'Der eingegebene Rabatt deckt die angesetzten Kosten.' : `Unter der Kostengrenze von ${money(check.minimumPrice)} je Stück.`}</p>` : '<div class="empty-list">Gib gültige Kosten und einen Rabatt zwischen 0 und 100 % ein.</div>';
}

function renderInventory() {
  $('inventoryList').innerHTML = inventory.length ? inventory.map(item => `<div class="stock-item" data-stock-id="${plain(item.id)}"><div><strong>${plain(item.name)}</strong><small>${quantityFormat.format(item.quantity)} ${plain(item.unit === 'st' ? 'Stück' : item.unit)} · Materialwert ${money(item.value)}${item.mode === 'roundwood' ? ` · Ø ${plain(item.diameter)} cm` : item.mode === 'squaredwood' ? ` · ${plain(item.width)} × ${plain(item.height)} cm` : ''}</small>${item.minimum > 0 ? `<small class="${item.quantity <= item.minimum ? 'stock-low' : ''}">Mindestbestand: ${quantityFormat.format(item.minimum)} ${plain(item.unit === 'st' ? 'Stück' : item.unit)}${item.quantity <= item.minimum ? ' · Nachbestellen' : ''}</small>` : ''}</div><div class="stock-actions"><button class="button small use-stock" type="button" ${item.quantity <= 0 ? 'disabled' : ''}>Ins Produkt übernehmen</button><button class="button small edit-stock" type="button">Bearbeiten</button><button class="button small restock-stock" type="button">Auffüllen</button><button class="button small danger delete-stock" type="button">Löschen</button></div></div>`).join('') : '<div class="empty-list">Noch kein Material im Lager.</div>';
  $('selectStock').innerHTML = '<option value="">Lagerartikel auswählen</option>' + inventory.filter(item => item.quantity > 0).map(item => `<option value="${plain(item.id)}">${plain(item.name)} · ${quantityFormat.format(item.quantity)} ${plain(item.unit === 'st' ? 'Stück' : item.unit)} · ${money(item.value)}</option>`).join('');
}

function renderHistory() {
  const entry = saved.find(item => item.id === historyProductId);
  const rows = history.filter(item => item.productId === historyProductId).reverse();
  $('historyContent').innerHTML = entry ? `<strong>${plain(entry.product.productName)}</strong><div class="table-scroll"><table><thead><tr><th>Gespeichert</th><th>Stück</th><th>Material</th><th>Kosten je Stück</th><th>Empfohlener Preis</th><th>Kanal</th></tr></thead><tbody>${rows.map(item => `<tr><td>${plain(new Date(item.at).toLocaleString('de-DE'))}</td><td>${item.quantity}</td><td>${money(item.materials)}</td><td>${money(item.unitCost)}</td><td>${money(item.recommendedPrice)}</td><td>${plain(item.channel)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-list">Öffne ein Produkt oder wähle „Verlauf“ in der Bibliothek.</div>';
}

function renderBusinessProfile() {
  const fields = { businessName: 'name', businessStreet: 'street', businessPostalCode: 'postalCode', businessCity: 'city', businessEmail: 'email', businessPhone: 'phone', businessIdentifier: 'identifier', businessPaymentDetails: 'paymentDetails', businessTaxMode: 'taxMode', businessVatRate: 'defaultVatRate' };
  for (const [id, key] of Object.entries(fields)) $(id).value = String(businessProfile[key] ?? '');
  $('businessVatRate').closest('.field').hidden = businessProfile.taxMode !== 'standard';
}

function renderDocuments() {
  const filter = $('documentFilter').value;
  const query = $('documentSearch').value.trim().toLocaleLowerCase('de');
  const shown = [...documents].filter(document => (filter === 'all' || document.type === filter)
    && (!query || `${document.number} ${document.customer.name}`.toLocaleLowerCase('de').includes(query)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  $('documentList').innerHTML = shown.length ? shown.map(document => {
    const typeLabel = { offer: 'Angebot', invoice: 'Rechnung', 'delivery-note': 'Lieferschein', cancellation: 'Storno' }[document.type] || 'Beleg';
    const statusLabel = document.status === 'cancelled' ? 'Storniert' : document.type === 'invoice' && document.paymentStatus === 'partial' ? 'Teilweise bezahlt' : { draft: 'Entwurf', issued: 'Ausgestellt', accepted: 'Angenommen', converted: 'In Rechnung umgewandelt', declined: 'Abgelehnt', cancelled: 'Storniert', paid: 'Bezahlt' }[document.status] || 'Entwurf';
    const totals = calculateDocumentTotals(document);
    const title = `${typeLabel}${document.number ? ` ${document.number}` : ''}`;
    const dateText = document.issuedAt ? new Date(document.issuedAt).toLocaleDateString('de-DE') : 'Noch nicht ausgestellt';
    const positionCount = totals.items.length;
    const balance = roundMoney(totals.gross - Number(document.paidAmount || 0));
    const amountSummary = document.type === 'invoice' && document.paidAmount > 0 ? `${money(document.paidAmount)} bezahlt · ${money(balance)} offen` : money(totals.gross);
    const summary = document.type === 'delivery-note' ? `${positionCount} ${positionCount === 1 ? 'Position' : 'Positionen'} · ${quantityFormat.format(totals.items.reduce((sum, item) => sum + item.quantity, 0))} Stück` : amountSummary;
    const canShip = ['issued', 'accepted', 'converted', 'paid'].includes(document.status) && ['offer', 'invoice'].includes(document.type);
    const canPay = document.type === 'invoice' && document.status === 'issued' && balance > 0;
    const canCancel = document.type === 'invoice' && ['issued', 'paid'].includes(document.status);
    const hasInvoice = document.type === 'offer' && documents.some(item => item.type === 'invoice' && item.sourceDocumentId === document.id);
    const canConvert = document.type === 'offer' && ['issued', 'accepted'].includes(document.status) && !hasInvoice;
    return `<article class="document-row" data-document-id="${plain(document.id)}"><div class="document-row-main"><span class="document-kind">${typeLabel} · ${statusLabel}</span><strong>${plain(title)}</strong><small>${plain(document.customer.name || 'Kein Kunde')} · ${dateText} · ${summary}</small>${document.donationProject ? `<small>Spendenprojekt: ${plain(document.donationProject)}</small>` : ''}</div><div class="document-row-actions"><button class="button small open-document" type="button">Öffnen</button><button class="button small print-document" type="button">PDF</button><button class="button small export-document" type="button">JSON</button>${document.type === 'offer' && document.status === 'issued' ? '<button class="button small accept-document" type="button">Annehmen</button>' : ''}${canConvert ? '<button class="button small invoice-from-offer" type="button">Rechnung erstellen</button>' : ''}${canShip ? '<button class="button small delivery-from-document" type="button">Lieferschein erstellen</button>' : ''}${canPay ? '<button class="button small record-payment" type="button">Zahlung erfassen</button>' : ''}${canCancel ? '<button class="button small danger create-cancellation" type="button">Storno erstellen</button>' : ''}${document.status === 'draft' ? '<button class="button small danger delete-document" type="button">Löschen</button>' : ''}</div></article>`;
  }).join('') : '<div class="empty-list">Noch keine Angebote oder Rechnungen gespeichert.</div>';
}

function refresh() { renderFields(); renderLists(); renderResult(); renderSaved(); renderInventory(); renderHistory(); renderBusinessProfile(); renderDocuments(); }
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
$('seriesPriceOption').addEventListener('change', renderSeries);
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
  if (!stockMatchesMaterial(item, stock)) { $('stockStatus').textContent = 'Der Lagerbestand wurde geändert. Bitte Materialzeile entfernen und erneut aus dem Lager auswählen.'; return; }
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
  const minimum = numberFromInput($('stockMinimum').value);
  if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(value) || value < 0 || !Number.isFinite(minimum) || minimum < 0) { $('stockStatus').textContent = 'Bitte Bezeichnung, Menge größer als 0 sowie gültigen Materialwert und Mindestbestand eingeben.'; return; }
  inventory.push({ id: uid(), name, quantity, unit: $('stockUnit').value, value, minimum, mode: 'quantity', at: new Date().toISOString() });
  $('stockName').value = ''; $('stockQuantity').value = ''; $('stockValue').value = ''; $('stockMinimum').value = '0';
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
let stockDialogId = null;
let stockDialogMode = '';
function openStockDialog(stock, mode) {
  stockDialogId = stock.id; stockDialogMode = mode;
  $('stockDialogTitle').textContent = mode === 'edit' ? 'Material bearbeiten' : 'Material auffüllen';
  $('stockDialogUnit').textContent = `${stock.name} · Einheit: ${stock.unit === 'st' ? 'Stück' : stock.unit}${stock.mode !== 'quantity' ? ' · gleicher Holzquerschnitt' : ''}`;
  $('stockEditFields').hidden = mode !== 'edit'; $('stockRestockFields').hidden = mode !== 'restock';
  $('editStockName').value = stock.name; $('editStockQuantity').value = String(stock.quantity); $('editStockValue').value = String(stock.value); $('editStockMinimum').value = String(stock.minimum || 0);
  $('restockQuantity').value = ''; $('restockValue').value = ''; $('stockDialogStatus').textContent = '';
  $('stockDialog').showModal();
}
$('cancelStockDialog').addEventListener('click', () => $('stockDialog').close());
$('stockForm').addEventListener('submit', event => {
  event.preventDefault();
  const stock = inventory.find(item => item.id === stockDialogId);
  if (!stock) { $('stockDialog').close(); return; }
  const editing = stockDialogMode === 'edit';
  const name = editing ? $('editStockName').value.trim() : stock.name;
  const quantity = numberFromInput($(editing ? 'editStockQuantity' : 'restockQuantity').value);
  const value = numberFromInput($(editing ? 'editStockValue' : 'restockValue').value);
  const minimum = editing ? numberFromInput($('editStockMinimum').value) : stock.minimum || 0;
  if (!name || !Number.isFinite(quantity) || quantity < 0 || (!editing && quantity === 0) || !Number.isFinite(value) || value < 0 || !Number.isFinite(minimum) || minimum < 0 || (editing && quantity === 0 && value !== 0)) { $('stockDialogStatus').textContent = 'Bitte gültige Werte eingeben. Ein leerer Bestand muss den Wert 0 haben.'; return; }
  const nextQuantity = editing ? quantity : stock.quantity + quantity;
  const nextValue = editing ? value : stock.value + value;
  if (!Number.isFinite(nextQuantity) || !Number.isFinite(nextValue)) { $('stockDialogStatus').textContent = 'Menge oder Wert sind zu groß.'; return; }
  stock.name = name; stock.quantity = nextQuantity; stock.value = nextValue; stock.minimum = minimum;
  $('stockDialog').close(); renderInventory(); renderResult(); persist(); $('stockStatus').textContent = editing ? 'Lagerbestand aktualisiert.' : 'Material aufgefüllt.';
});
$('inventoryList').addEventListener('click', event => {
  const card = event.target.closest('[data-stock-id]');
  if (!card) return;
  const stock = inventory.find(item => item.id === card.dataset.stockId);
  if (!stock) return;
  if (event.target.closest('.use-stock')) {
    useStock(stock);
    $('materialsSection').scrollIntoView({ behavior: 'smooth' });
  } else if (event.target.closest('.edit-stock')) {
    openStockDialog(stock, 'edit');
  } else if (event.target.closest('.restock-stock')) {
    openStockDialog(stock, 'restock');
  } else if (event.target.closest('.delete-stock')) {
    if (!confirm(`Lagerstück „${stock.name}“ dauerhaft löschen?`)) return;
    inventory = inventory.filter(item => item.id !== stock.id);
    if (!deletedStock.includes(stock.id)) deletedStock.push(stock.id);
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
  $('productName').focus();
});

$('savedList').addEventListener('click', event => {
  const card = event.target.closest('[data-saved-id]');
  if (!card) return;
  const entry = saved.find(item => item.id === card.dataset.savedId);
  if (!entry) return;
  if (event.target.closest('.load-saved')) {
    if (hasUnsavedChanges() && !confirm('Nicht gespeicherte Änderungen verwerfen und dieses Produkt öffnen?')) return;
    draft = cleanProduct(entry.product); draft.id = entry.id; historyProductId = entry.id; refresh(); persist();
    $('productEditor').scrollIntoView({ behavior: 'smooth' });
  } else if (event.target.closest('.copy-saved')) {
    if (hasUnsavedChanges() && !confirm('Nicht gespeicherte Änderungen verwerfen und eine neue Variante beginnen?')) return;
    draft = cleanProduct(entry.product); draft.id = null; draft.isTemplate = false; draft.productName = `${draft.productName || 'Produkt'} (Variante)`;
    for (const item of draft.materials) { item.stockId = null; item.stockBooked = false; item.restBookedId = null; }
    historyProductId = null; refresh(); persist();
    $('productEditor').scrollIntoView({ behavior: 'smooth' });
  } else if (event.target.closest('.show-history')) {
    historyProductId = entry.id; renderHistory(); document.querySelector('.history-panel').scrollIntoView({ behavior: 'smooth' });
  } else if (event.target.closest('.delete-saved')) {
    if (!confirm(`„${entry.product.productName || 'Unbenanntes Produkt'}“ dauerhaft aus der Liste löschen?`)) return;
    saved = saved.filter(item => item.id !== entry.id);
    if (!deletedProducts.includes(entry.id)) deletedProducts.push(entry.id);
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
  downloadBlob(JSON.stringify({ format: 'preisrechner', version: 4, exportedAt: new Date().toISOString(), draft, saved, inventory, history, deletedProducts, deletedStock, businessProfile, documents, deletedDocuments }, null, 2), 'application/json', `preisrechner-backup-${new Date().toISOString().slice(0, 10)}.json`);
});
$('importButton').addEventListener('click', () => $('importFile').click());
function resolveSyncConflict(conflict) {
  if (conflict.kind === 'draft') return confirm('Der importierte Entwurf unterscheidet sich vom aktuellen Entwurf.\n\nOK: importierten Entwurf übernehmen.\nAbbrechen: aktuellen Entwurf behalten.');
  if (conflict.kind === 'businessProfile') return confirm(`Die Absenderdaten unterscheiden sich zwischen den Instanzen.\n\nHier: ${conflict.local.name || 'Ohne Namen'}\nImport: ${conflict.incoming.name || 'Ohne Namen'}\n\nOK: importierte Absenderdaten übernehmen.\nAbbrechen: hiesige Daten behalten.`);
  const label = { stock: 'Lagerartikel', document: 'Beleg', product: 'Produkt' }[conflict.kind] || 'Eintrag';
  const describe = item => {
    if (!item) return 'gelöscht';
    if (conflict.kind === 'stock') return `${item.name}: ${item.quantity} ${item.unit}, ${money(item.value)}, Mindestbestand ${item.minimum || 0}`;
    if (conflict.kind === 'document') return `${item.type === 'offer' ? 'Angebot' : 'Rechnung'} ${item.number || '(Entwurf)'} · ${item.customer?.name || 'Kein Kunde'} · ${item.status}`;
    const result = calculate(item.product);
    return `${item.product.productName || 'Unbenannt'}${item.updatedAt ? ` (${item.updatedAt})` : ''}\n  ${item.product.category || 'Ohne Kategorie'} · ${item.product.materials.length} Materialien · ${result.errors.length ? 'Kalkulation unvollständig' : `Herstellung ${money(result.unitCost)} / Empfehlung ${money(result.suggestions[1]?.price)}`}`;
  };
  return confirm(`${label} unterscheidet sich zwischen den Instanzen.\n\nHier: ${describe(conflict.local)}\nImport: ${describe(conflict.incoming)}\n\nOK: Import übernehmen.\nAbbrechen: hiesigen Stand behalten.`);
}
$('importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 50_000_000) throw new Error('Die Datei ist zu groß.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'preisrechner' || ![1, 2, 3, 4].includes(data.version) || !Array.isArray(data.saved) || !data.draft || (data.inventory !== undefined && !Array.isArray(data.inventory)) || (data.documents !== undefined && !Array.isArray(data.documents))) throw new Error('Das ist kein gültiges Preisrechner-Backup.');
    const imported = data.saved.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || !item.product || typeof item.product !== 'object') throw new Error('Das Backup enthält ein ungültiges Produkt.');
      const product = cleanProduct(item.product); product.id = item.id;
      return { id: item.id, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '', product };
    });
    const importedStock = (data.inventory || []).map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || !UNITS[item.unit] || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 || !Number.isFinite(Number(item.value)) || Number(item.value) < 0) throw new Error('Das Backup enthält einen ungültigen Lagerartikel.');
      return cleanStock(item);
    });
    const readDeleted = value => {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id)) throw new Error('Das Backup enthält ungültige Löschmarkierungen.');
      return [...new Set(value)];
    };
    const incomingDeletedProducts = readDeleted(data.deletedProducts);
    const incomingDeletedStock = readDeleted(data.deletedStock);
    const incomingDocuments = (data.documents || []).map(item => {
      const document = cleanDocument(item);
      if (!document) throw new Error('Das Backup enthält einen ungültigen Beleg.');
      return document;
    });
    const incomingDeletedDocuments = readDeleted(data.deletedDocuments);
    if (new Set(imported.map(item => item.id)).size !== imported.length || new Set(importedStock.map(item => item.id)).size !== importedStock.length || new Set(incomingDocuments.map(item => item.id)).size !== incomingDocuments.length || imported.some(item => incomingDeletedProducts.includes(item.id)) || importedStock.some(item => incomingDeletedStock.includes(item.id)) || incomingDocuments.some(item => incomingDeletedDocuments.includes(item.id))) throw new Error('Das Backup enthält doppelte oder widersprüchliche Kennungen.');
    const local = { draft: cleanProduct(draft), saved: saved.map(entry => ({ ...entry, product: cleanProduct(entry.product) })), inventory: inventory.map(cleanStock), history, deletedProducts, deletedStock, businessProfile, documents, deletedDocuments };
    const incoming = { draft: cleanProduct(data.draft), saved: imported, inventory: importedStock, history: Array.isArray(data.history) ? data.history.filter(item => item && typeof item.productId === 'string' && Number.isFinite(item.unitCost)) : [], deletedProducts: incomingDeletedProducts, deletedStock: incomingDeletedStock, businessProfile: data.businessProfile ? cleanBusinessProfile(data.businessProfile) : null, documents: incomingDocuments, deletedDocuments: incomingDeletedDocuments };
    const merged = mergeBackup(local, incoming, resolveSyncConflict);
    const numberedDocuments = merged.documents.filter(item => item.number);
    const uniqueNumbers = new Set(numberedDocuments.map(item => item.number));
    if (uniqueNumbers.size !== numberedDocuments.length) throw new Error('Das Backup enthält Belege mit doppelten Nummern. Der Abgleich wurde nicht übernommen.');
    ({ draft, saved, inventory, history, deletedProducts, deletedStock, businessProfile, documents, deletedDocuments } = merged);
    if (draft.id && !saved.some(entry => entry.id === draft.id)) draft.id = null;
    historyProductId = draft.id;
    refresh(); await persist();
    if (storageOK) $('saveStatus').textContent = 'Backup abgeglichen';
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

function localDateValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function createDocumentDraft(type) {
  if (!draft.productName.trim()) { $('saveStatus').textContent = 'Bitte zuerst einen Produktnamen eintragen.'; return null; }
  const pricingDraft = structuredClone(draft);
  pricingDraft.vatPercent = businessProfile.taxMode === 'standard' ? String(businessProfile.defaultVatRate).replace('.', ',') : '0';
  const result = calculate(pricingDraft);
  if (result.errors.length || result.batchCost === 0) { $('saveStatus').textContent = 'Bitte zuerst eine gültige Produktkalkulation erstellen.'; return null; }
  const series = type === 'delivery-note' ? null : calculateSeries(pricingDraft, [result.batchSize])[0];
  if (type !== 'delivery-note' && !series?.suggestions[1]) { $('saveStatus').textContent = 'Für diese Kalkulation konnte kein Verkaufspreis ermittelt werden.'; return null; }
  return createDocument({
    type, seller: businessProfile, taxMode: businessProfile.taxMode, serviceDate: type === 'offer' ? '' : localDateValue(),
    items: [{ description: pricingDraft.productName, quantity: result.batchSize, unitPrice: series?.suggestions[1]?.price || 0, vatRate: type !== 'delivery-note' && businessProfile.taxMode === 'standard' ? businessProfile.defaultVatRate : 0 }],
  });
}

function documentItemHTML(item, index, readonly) {
  const disabled = readonly ? 'disabled' : '';
  const isDeliveryNote = editingDocument.type === 'delivery-note';
  const taxDisabled = readonly || isDeliveryNote || editingDocument.taxMode !== 'standard' ? 'disabled' : '';
  return `<div class="document-item-editor ${isDeliveryNote ? 'delivery-note-item' : ''}" data-item-index="${index}"><label class="field">Bezeichnung<input data-item-field="description" value="${plain(item.description)}" maxlength="240" ${disabled}></label><label class="field">Menge<input data-item-field="quantity" inputmode="decimal" value="${plain(item.quantity)}" ${disabled}></label>${isDeliveryNote ? '' : `<label class="field">Preis je Stück <span class="unit-label">€</span><input data-item-field="unitPrice" inputmode="decimal" value="${plain(item.unitPrice)}" ${disabled}></label><label class="field">USt. <span class="unit-label">%</span><input data-item-field="vatRate" type="number" min="0" max="100" step="0.1" value="${plain(editingDocument.taxMode === 'standard' ? item.vatRate : 0)}" ${taxDisabled}></label>`}${readonly ? '' : `<button class="button small danger remove-document-item" type="button" aria-label="Position ${index + 1} entfernen">Entfernen</button>`}</div>`;
}

function renderDocumentEditor() {
  if (!editingDocument) return;
  const readonly = editingDocument.status !== 'draft';
  const typeLabel = { offer: 'Angebot', invoice: 'Rechnung', 'delivery-note': 'Lieferschein', cancellation: 'Storno' }[editingDocument.type];
  $('documentDialogTitle').textContent = `${typeLabel}${editingDocument.number ? ` ${editingDocument.number}` : ' · Entwurf'}`;
  document.querySelectorAll('[data-offer-only]').forEach(field => { field.hidden = editingDocument.type !== 'offer'; });
  document.querySelectorAll('[data-invoice-only]').forEach(field => { field.hidden = editingDocument.type !== 'invoice'; });
  document.querySelectorAll('[data-invoice-or-delivery]').forEach(field => { field.hidden = !['invoice', 'delivery-note', 'cancellation'].includes(editingDocument.type); });
  $('documentForm').querySelectorAll('[data-document-field]').forEach(field => {
    const path = field.dataset.documentField.split('.');
    field.value = path.length === 2 ? editingDocument[path[0]]?.[path[1]] ?? '' : editingDocument[path[0]] ?? '';
    field.disabled = readonly;
  });
  $('documentItems').innerHTML = editingDocument.items.map((item, index) => documentItemHTML(item, index, readonly)).join('');
  $('addDocumentItem').hidden = readonly;
  $('saveDocumentButton').hidden = readonly;
  $('issueDocumentButton').hidden = readonly;
  $('documentErrors').innerHTML = '';
  renderDocumentPreview();
}

function readDocumentEditor() {
  if (!editingDocument || editingDocument.status !== 'draft') return;
  $('documentForm').querySelectorAll('[data-document-field]').forEach(field => {
    const [group, key] = field.dataset.documentField.split('.');
    if (key) editingDocument[group][key] = field.value;
    else editingDocument[group] = field.value;
  });
  const isDeliveryNote = editingDocument.type === 'delivery-note';
  editingDocument.items = [...$('documentItems').querySelectorAll('.document-item-editor')].map(row => ({
    description: row.querySelector('[data-item-field="description"]').value,
    quantity: numberFromInput(row.querySelector('[data-item-field="quantity"]').value),
    unitPrice: isDeliveryNote ? 0 : numberFromInput(row.querySelector('[data-item-field="unitPrice"]').value),
    vatRate: !isDeliveryNote && editingDocument.taxMode === 'standard' ? numberFromInput(row.querySelector('[data-item-field="vatRate"]').value) : 0,
  }));
}

function renderDocumentPreview() {
  if (!editingDocument) return;
  const totals = calculateDocumentTotals(editingDocument);
  $('documentPreview').textContent = totals.errors.length ? 'Bitte Positionen prüfen.' : editingDocument.type === 'delivery-note' ? `Lieferschein · ${totals.items.length} Positionen ohne Preisangaben` : `Zwischensumme ${money(totals.net)} · Umsatzsteuer ${money(totals.tax)} · Gesamt ${money(totals.gross)}`;
}

function showDocumentErrors(errors) {
  $('documentErrors').innerHTML = errors.map(message => `<div class="alert error">${plain(message)}</div>`).join('');
}

function saveDocumentDraft() {
  if (!editingDocument || editingDocument.status !== 'draft') return;
  readDocumentEditor();
  editingDocument.updatedAt = new Date().toISOString();
  const existing = documents.findIndex(document => document.id === editingDocument.id);
  if (existing < 0) documents.push(structuredClone(editingDocument));
  else documents[existing] = structuredClone(editingDocument);
  deletedDocuments = deletedDocuments.filter(id => id !== editingDocument.id);
  renderDocuments(); persist(); $('documentErrors').innerHTML = '<div class="positive-note">Entwurf gespeichert.</div>';
}

function renderDocumentSheet(document) {
  const totals = calculateDocumentTotals(document);
  const seller = document.seller?.name ? document.seller : businessProfile;
  const address = party => [party.street, [party.postalCode, party.city].filter(Boolean).join(' ')].filter(Boolean).map(plain).join('<br>');
  const isDeliveryNote = document.type === 'delivery-note';
  const typeLabel = { offer: 'Angebot', invoice: 'Rechnung', 'delivery-note': 'Lieferschein' }[document.type];
  const draftLabel = document.status === 'draft' ? '<span>ENTWURF</span>' : '';
  const rows = totals.items.map(item => isDeliveryNote ? `<tr><td>${plain(item.description)}</td><td>${quantityFormat.format(item.quantity)}</td></tr>` : `<tr><td>${plain(item.description)}</td><td>${quantityFormat.format(item.quantity)}</td><td class="document-amount">${money(document.type === 'cancellation' ? -item.unitPrice : item.unitPrice)}</td><td class="document-amount">${money(item.gross)}</td></tr>`).join('');
  const columns = isDeliveryNote ? '<tr><th>Gelieferter Artikel / Leistung</th><th>Menge</th></tr>' : '<tr><th>Leistung / Produkt</th><th>Menge</th><th class="document-amount">Einzelpreis</th><th class="document-amount">Gesamt</th></tr>';
  const taxGroups = [...new Map(totals.items.map(item => [item.vatRate, totals.items.filter(line => line.vatRate === item.vatRate).reduce((sum, line) => sum + line.tax, 0)])).entries()];
  const taxRows = !isDeliveryNote && document.taxMode === 'standard' ? taxGroups.map(([rate, amount]) => `<div><span>Umsatzsteuer ${percent.format(rate)} %</span><strong>${money(amount)}</strong></div>`).join('') : '';
  const donation = document.donationProject ? `<p class="document-sheet-donation">Spendenhinweis: Der Erlös aus diesem Verkauf ist für <strong>${plain(document.donationProject)}</strong> bestimmt. Dies ist keine steuerliche Zuwendungsbestätigung.</p>` : '';
  const taxNote = !isDeliveryNote && document.taxMode === 'small-business' && ['invoice', 'cancellation'].includes(document.type) ? '<p class="document-sheet-foot">Umsatzsteuer wird gemäß § 19 UStG nicht erhoben.</p>' : '';
  const totalLabel = document.type === 'offer' ? 'Angebotssumme' : document.type === 'cancellation' ? 'Stornobetrag' : 'Rechnungsbetrag';
  const totalsHTML = isDeliveryNote ? '' : `<div class="document-sheet-totals"><div><span>Netto</span><strong>${money(totals.net)}</strong></div>${taxRows}<div class="document-grand-total"><span>${totalLabel}</span><strong>${money(totals.gross)}</strong></div></div>`;
  const identifier = !isDeliveryNote && seller.identifier ? `Steuerkennung: ${plain(seller.identifier)} · ` : '';
  const paymentNote = document.type === 'invoice' && document.dueDate ? 'Bitte begleichen Sie den Rechnungsbetrag bis zum angegebenen Fälligkeitsdatum.' : '';
  const paymentDetails = document.type === 'invoice' && seller.paymentDetails ? `<p>Zahlung: ${plain(seller.paymentDetails)}</p>` : '';
  $('documentSheet').innerHTML = `<header class="document-sheet-head"><div>${draftLabel}<h1>${typeLabel}</h1><strong>${plain(document.number || 'Entwurf')}</strong></div><div><strong>${plain(seller.name)}</strong><p>${address(seller)}</p>${seller.email ? `<p>${plain(seller.email)}</p>` : ''}${seller.phone ? `<p>${plain(seller.phone)}</p>` : ''}</div></header><div class="document-sheet-meta"><div><strong>${plain(document.customer.name)}</strong><p>${address(document.customer)}</p>${document.customer.email ? `<p>${plain(document.customer.email)}</p>` : ''}</div><div><p>Datum: ${plain(new Date(document.issuedAt || document.createdAt).toLocaleDateString('de-DE'))}</p>${document.serviceDate ? `<p>Liefer-/Leistungsdatum: ${plain(new Date(`${document.serviceDate}T12:00:00`).toLocaleDateString('de-DE'))}</p>` : ''}${document.validUntil ? `<p>Gültig bis: ${plain(new Date(`${document.validUntil}T12:00:00`).toLocaleDateString('de-DE'))}</p>` : ''}${document.dueDate ? `<p>Fällig am: ${plain(new Date(`${document.dueDate}T12:00:00`).toLocaleDateString('de-DE'))}</p>` : ''}</div></div><table><thead>${columns}</thead><tbody>${rows}</tbody></table>${totalsHTML}${taxNote}${document.notes ? `<p class="document-sheet-notes">${plain(document.notes)}</p>` : ''}${donation}${isDeliveryNote ? '<p class="document-sheet-foot">Dieser Lieferschein bestätigt die Lieferung, nicht die Zahlung.</p>' : ''}<footer class="document-sheet-foot">${identifier}${paymentDetails}${paymentNote}</footer>`;
}

function printDocument(documentData) {
  renderDocumentSheet(documentData);
  document.body.classList.add('print-document');
  window.print();
}

function exportDocumentJSON(document) {
  const filename = String(document.number || document.id).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  downloadBlob(JSON.stringify(serializeDocumentExport(document), null, 2), 'application/json', `beleg-${filename}.json`);
}

function openDocument(document) {
  editingDocument = structuredClone(document);
  renderDocumentEditor();
  $('documentDialog').showModal();
}

function issueCurrentDocument() {
  readDocumentEditor();
  const result = issueDocument(editingDocument, businessProfile, documents);
  if (result.errors.length) { showDocumentErrors(result.errors); return; }
  editingDocument = result.document;
  const index = documents.findIndex(document => document.id === editingDocument.id);
  if (index < 0) documents.push(structuredClone(editingDocument)); else documents[index] = structuredClone(editingDocument);
  if (editingDocument.type === 'cancellation') {
    const original = documents.find(document => document.id === editingDocument.sourceDocumentId);
    if (original) { original.status = 'cancelled'; original.updatedAt = editingDocument.issuedAt; }
  }
  if (editingDocument.type === 'invoice' && editingDocument.sourceDocumentId) {
    const offer = documents.find(document => document.id === editingDocument.sourceDocumentId && document.type === 'offer');
    if (offer) { offer.status = 'converted'; offer.updatedAt = editingDocument.issuedAt; }
  }
  renderDocumentEditor(); renderDocuments(); persist();
}

for (const [id, type] of [['createOfferButton', 'offer'], ['createInvoiceButton', 'invoice'], ['createDeliveryNoteButton', 'delivery-note']]) $(id).addEventListener('click', () => {
  const document = createDocumentDraft(type);
  if (!document) return;
  editingDocument = document; renderDocumentEditor(); $('documentDialog').showModal();
});
$('openDocumentsButton').addEventListener('click', () => $('documentsSection').scrollIntoView({ behavior: 'smooth' }));
$('saveBusinessProfile').addEventListener('click', () => {
  businessProfile = cleanBusinessProfile({ name: $('businessName').value, street: $('businessStreet').value, postalCode: $('businessPostalCode').value, city: $('businessCity').value, email: $('businessEmail').value, phone: $('businessPhone').value, identifier: $('businessIdentifier').value, paymentDetails: $('businessPaymentDetails').value, taxMode: $('businessTaxMode').value, defaultVatRate: numberFromInput($('businessVatRate').value) });
  persist(); renderBusinessProfile(); $('businessProfileStatus').textContent = 'Absenderdaten gespeichert.';
});
$('businessTaxMode').addEventListener('change', event => { $('businessVatRate').closest('.field').hidden = event.target.value !== 'standard'; });
for (const id of ['documentFilter', 'documentSearch']) $(id).addEventListener(id === 'documentSearch' ? 'input' : 'change', renderDocuments);
$('documentForm').addEventListener('input', event => { if (!editingDocument || editingDocument.status !== 'draft') return; readDocumentEditor(); renderDocumentPreview(); });
$('documentForm').addEventListener('change', event => { if (!editingDocument || editingDocument.status !== 'draft') return; readDocumentEditor(); renderDocumentPreview(); });
$('addDocumentItem').addEventListener('click', () => { if (!editingDocument || editingDocument.status !== 'draft') return; readDocumentEditor(); editingDocument.items.push({ description: '', quantity: 1, unitPrice: 0, vatRate: businessProfile.taxMode === 'standard' ? businessProfile.defaultVatRate : 0 }); renderDocumentEditor(); });
$('documentItems').addEventListener('click', event => {
  const button = event.target.closest('.remove-document-item');
  if (!button || !editingDocument || editingDocument.status !== 'draft') return;
  readDocumentEditor(); editingDocument.items.splice(Number(button.closest('[data-item-index]').dataset.itemIndex), 1); renderDocumentEditor();
});
$('saveDocumentButton').addEventListener('click', saveDocumentDraft);
$('issueDocumentButton').addEventListener('click', issueCurrentDocument);
$('printDocumentButton').addEventListener('click', () => { readDocumentEditor(); printDocument(editingDocument); });
$('exportDocumentButton').addEventListener('click', () => { readDocumentEditor(); exportDocumentJSON(editingDocument); });
window.addEventListener('afterprint', () => document.body.classList.remove('print-document'));
$('documentDialog').addEventListener('close', () => document.body.classList.remove('print-document'));
$('documentList').addEventListener('click', event => {
  const row = event.target.closest('[data-document-id]');
  if (!row) return;
  const document = documents.find(item => item.id === row.dataset.documentId);
  if (!document) return;
  if (event.target.closest('.open-document')) openDocument(document);
  else if (event.target.closest('.print-document')) printDocument(document);
  else if (event.target.closest('.export-document')) exportDocumentJSON(document);
  else if (event.target.closest('.accept-document')) { document.status = 'accepted'; document.updatedAt = new Date().toISOString(); renderDocuments(); persist(); }
  else if (event.target.closest('.invoice-from-offer')) {
    const invoice = createInvoiceFromOffer(document);
    documents.push(invoice); renderDocuments(); persist(); openDocument(invoice);
  } else if (event.target.closest('.delivery-from-document')) {
    const deliveryNote = createDeliveryNoteFromDocument(document);
    documents.push(deliveryNote); renderDocuments(); persist(); openDocument(deliveryNote);
  } else if (event.target.closest('.record-payment')) {
    const total = calculateDocumentTotals(document).gross;
    const outstanding = roundMoney(total - Number(document.paidAmount || 0));
    paymentDocumentId = document.id;
    $('paymentOutstanding').textContent = `Noch offen: ${money(outstanding)}`;
    $('paymentAmount').value = numberText(outstanding);
    $('paymentError').innerHTML = '';
    $('paymentDialog').showModal();
  } else if (event.target.closest('.create-cancellation')) {
    const cancellation = createCancellationFromInvoice(document);
    documents.push(cancellation); renderDocuments(); persist(); openDocument(cancellation);
  } else if (event.target.closest('.delete-document') && document.status === 'draft' && confirm('Diesen Belegentwurf löschen?')) {
    documents = documents.filter(item => item.id !== document.id);
    if (!deletedDocuments.includes(document.id)) deletedDocuments.push(document.id);
    renderDocuments(); persist();
  }
});
$('savePaymentButton').addEventListener('click', () => {
  const document = documents.find(item => item.id === paymentDocumentId);
  if (!document) { $('paymentDialog').close(); return; }
  const payment = recordPayment(document, numberFromInput($('paymentAmount').value));
  if (payment.error) { $('paymentError').innerHTML = `<div class="alert error">${plain(payment.error)}</div>`; return; }
  documents = documents.map(item => item.id === document.id ? payment.document : item);
  renderDocuments(); persist(); paymentDocumentId = null; $('paymentDialog').close();
});
$('importDocumentButton').addEventListener('click', () => $('importDocumentFile').click());
$('importDocumentFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('Die Belegdatei ist zu groß.');
    const data = JSON.parse(await file.text());
    const imported = parseDocumentExport(data);
    if (!imported) throw new Error('Die Datei enthält keinen gültigen Preisrechner-Beleg.');
    if (documents.some(item => item.id !== imported.id && item.number && item.number === imported.number)) throw new Error('Diese Belegnummer ist bereits vergeben. Der Beleg wurde nicht importiert.');
    const index = documents.findIndex(item => item.id === imported.id);
    if (index >= 0) {
      if (JSON.stringify(documents[index]) !== JSON.stringify(imported) && !confirm('Dieser Beleg ist bereits vorhanden und unterscheidet sich. Importierten Stand übernehmen?')) return;
      documents[index] = imported;
    } else documents.push(imported);
    deletedDocuments = deletedDocuments.filter(id => id !== imported.id);
    renderDocuments(); await persist(); $('saveStatus').textContent = 'Beleg importiert';
  } catch (error) { alert(error.message || 'Der Beleg konnte nicht importiert werden.'); }
});

refresh();
if (!storageOK) $('saveStatus').textContent = 'Speichern im Browser nicht möglich. Bitte Backup exportieren.';
