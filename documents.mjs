import { calculate, calculateSeries, numberFromInput } from './calculator.mjs';

export const DOCUMENT_TYPES = ['offer', 'invoice', 'delivery-note', 'cancellation'];
export const TAX_MODES = ['small-business', 'standard'];

export const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
const asText = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function cleanBusinessProfile(input) {
  const profile = input && typeof input === 'object' ? input : {};
  return {
    name: asText(profile.name, 160), street: asText(profile.street, 160), postalCode: asText(profile.postalCode, 20), city: asText(profile.city, 100),
    email: asText(profile.email, 160), phone: asText(profile.phone, 60), identifier: asText(profile.identifier, 80), paymentDetails: asText(profile.paymentDetails, 280),
    taxMode: TAX_MODES.includes(profile.taxMode) ? profile.taxMode : 'small-business',
    defaultVatRate: Number.isFinite(Number(profile.defaultVatRate)) && Number(profile.defaultVatRate) >= 0 && Number(profile.defaultVatRate) <= 100 ? Number(profile.defaultVatRate) : 19,
  };
}

export function createDocument({ type = 'offer', now = new Date(), id = newId(), seller = {}, customer = {}, items = [], taxMode = 'small-business', donationProject = '', notes = '', validUntil = '', dueDate = '', serviceDate = '', sourceDocumentId = null, sourceProductId = null } = {}) {
  if (!DOCUMENT_TYPES.includes(type)) throw new TypeError('Unbekannte Belegart.');
  const timestamp = now.toISOString();
  return {
    id, type, status: 'draft', paymentStatus: 'unpaid', paidAmount: 0, payments: [], number: '', createdAt: timestamp, updatedAt: timestamp, issuedAt: '',
    seller: structuredClone(seller), customer: structuredClone(customer), items: structuredClone(items),
    taxMode: TAX_MODES.includes(taxMode) ? taxMode : 'small-business', donationProject: asText(donationProject, 160),
    notes: asText(notes, 2000), validUntil: asText(validUntil, 10), dueDate: asText(dueDate, 10), serviceDate: asText(serviceDate, 10),
    sourceDocumentId: typeof sourceDocumentId === 'string' ? sourceDocumentId : null,
    sourceProductId: typeof sourceProductId === 'string' ? sourceProductId : null,
  };
}

export function cleanDocument(input) {
  if (!input || typeof input !== 'object' || !DOCUMENT_TYPES.includes(input.type) || typeof input.id !== 'string' || !input.id) return null;
  const type = input.type;
  const allowedStatuses = type === 'offer' ? ['draft', 'issued', 'accepted', 'converted', 'declined', 'cancelled'] : type === 'invoice' ? ['draft', 'issued', 'paid', 'cancelled'] : ['draft', 'issued', 'cancelled'];
  const status = allowedStatuses.includes(input.status) ? input.status : 'draft';
  const paymentStatus = ['unpaid', 'partial', 'paid'].includes(input.paymentStatus) ? input.paymentStatus : 'unpaid';
  const cleanParty = party => ({
    name: asText(party?.name, 160), street: asText(party?.street, 160), postalCode: asText(party?.postalCode, 20), city: asText(party?.city, 100),
    email: asText(party?.email, 160), phone: asText(party?.phone, 60), paymentDetails: asText(party?.paymentDetails, 280),
  });
  const createdTime = Date.parse(input.createdAt || '');
  const createdAt = Number.isFinite(createdTime) ? new Date(createdTime) : new Date(0);
  return {
    ...createDocument({ type, id: input.id, now: createdAt }),
    status, paymentStatus,
    paidAmount: Number.isFinite(Number(input.paidAmount)) && Number(input.paidAmount) >= 0 ? Number(input.paidAmount) : 0,
    payments: Array.isArray(input.payments) ? input.payments.slice(0, 1000).filter(payment => payment && Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0).map(payment => ({ amount: Number(payment.amount), at: asText(payment.at, 40) })) : [],
    number: asText(input.number, 40), createdAt: asText(input.createdAt, 40), updatedAt: asText(input.updatedAt, 40), issuedAt: asText(input.issuedAt, 40),
    seller: cleanParty(input.seller), customer: cleanParty(input.customer),
    items: Array.isArray(input.items) ? input.items.slice(0, 100).map(item => ({
      description: asText(item?.description, 240), quantity: Number(item?.quantity), unitPrice: Number(item?.unitPrice), vatRate: Number(item?.vatRate ?? 0),
    })) : [],
    taxMode: TAX_MODES.includes(input.taxMode) ? input.taxMode : 'small-business',
    donationProject: asText(input.donationProject, 160), notes: asText(input.notes, 2000),
    validUntil: asText(input.validUntil, 10), dueDate: asText(input.dueDate, 10), serviceDate: asText(input.serviceDate, 10),
    sourceDocumentId: typeof input.sourceDocumentId === 'string' ? input.sourceDocumentId : null,
    sourceProductId: typeof input.sourceProductId === 'string' ? input.sourceProductId : null,
  };
}

export function serializeDocumentExport(document, exportedAt = new Date().toISOString()) {
  return { format: 'preisrechner-document', version: 1, exportedAt, document: structuredClone(document) };
}

export function parseDocumentExport(input) {
  if (!input || input.format !== 'preisrechner-document' || input.version !== 1) return null;
  return cleanDocument(input.document);
}

export function createDocumentItemFromProduct(product, taxMode, defaultVatRate, type = 'invoice') {
  const description = asText(product?.productName, 240);
  const quantity = numberFromInput(product?.batchSize);
  if (!description || !Number.isInteger(quantity) || quantity <= 0) return { item: null, error: 'Das gespeicherte Produkt braucht einen Namen und eine gültige Stückzahl.' };
  if (type === 'delivery-note') return { item: { description, quantity, unitPrice: 0, vatRate: 0 }, error: '' };

  const pricingProduct = structuredClone(product);
  pricingProduct.vatPercent = taxMode === 'standard' ? String(defaultVatRate).replace('.', ',') : '0';
  const result = calculate(pricingProduct);
  const series = result.errors.length || result.batchCost === 0 ? null : calculateSeries(pricingProduct, [quantity])[0];
  const recommended = series?.suggestions.find(suggestion => suggestion.kind === 'recommended');
  if (!recommended) return { item: null, error: 'Für das gespeicherte Produkt ist kein Verkaufspreis verfügbar.' };
  return {
    item: { description, quantity, unitPrice: recommended.price, vatRate: taxMode === 'standard' ? Number(defaultVatRate) : 0 },
    error: '',
  };
}

export function calculateDocumentTotals(document) {
  if (document.type === 'delivery-note') {
    const errors = [];
    const items = (document.items || []).map((item, index) => {
      const quantity = Number(item.quantity);
      if (!item.description?.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Position ${index + 1}: Bitte Bezeichnung und Menge prüfen.`);
        return null;
      }
      return { description: item.description, quantity, unitPrice: 0, vatRate: 0, net: 0, tax: 0, gross: 0 };
    }).filter(Boolean);
    return { errors, items, net: 0, tax: 0, gross: 0 };
  }
  const errors = [];
  const sign = document.type === 'cancellation' ? -1 : 1;
  const items = (document.items || []).map((item, index) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const vatRate = document.taxMode === 'standard' ? Number(item.vatRate) : 0;
    if (!item.description?.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      errors.push(`Position ${index + 1}: Bitte Bezeichnung, Menge, Preis und Steuersatz prüfen.`);
      return null;
    }
    const gross = roundMoney(sign * quantity * unitPrice);
    const net = roundMoney(gross / (1 + vatRate / 100));
    return { description: item.description, quantity, unitPrice, vatRate, net, tax: roundMoney(gross - net), gross };
  });
  const validItems = items.filter(Boolean);
  return {
    errors,
    items: validItems,
    net: roundMoney(validItems.reduce((sum, item) => sum + item.net, 0)),
    tax: roundMoney(validItems.reduce((sum, item) => sum + item.tax, 0)),
    gross: roundMoney(validItems.reduce((sum, item) => sum + item.gross, 0)),
  };
}

export function validateDocumentForIssue(document, profile) {
  const errors = [];
  if (!DOCUMENT_TYPES.includes(document?.type)) errors.push('Belegart ist ungültig.');
  if (document?.status !== 'draft') errors.push('Nur Entwürfe können ausgestellt werden.');
  if (!profile?.name?.trim()) errors.push('Bitte den Namen des Unternehmens eintragen.');
  if (!profile?.street?.trim() || !profile?.postalCode?.trim() || !profile?.city?.trim()) errors.push('Bitte die vollständige Absenderadresse eintragen.');
  if (!document?.customer?.name?.trim()) errors.push('Bitte den Namen des Kunden eintragen.');
  if (['invoice', 'delivery-note', 'cancellation'].includes(document?.type) && !/^\d{4}-\d{2}-\d{2}$/.test(document.serviceDate || '')) errors.push('Bitte das Liefer- oder Leistungsdatum eintragen.');
  const totals = calculateDocumentTotals(document || {});
  errors.push(...totals.errors);
  if (!totals.items.length) errors.push('Mindestens eine gültige Position ist erforderlich.');
  if (document?.type === 'delivery-note' && (!document.customer?.street?.trim() || !document.customer?.postalCode?.trim() || !document.customer?.city?.trim())) errors.push('Für den Lieferschein ist die vollständige Empfängeranschrift erforderlich.');
  if (['invoice', 'cancellation'].includes(document?.type) && Math.abs(totals.gross) > 250) {
    if (!document.customer?.street?.trim() || !document.customer?.postalCode?.trim() || !document.customer?.city?.trim()) errors.push('Für Rechnungen über 250 € ist die vollständige Kundenanschrift erforderlich.');
    if (!profile?.identifier?.trim()) errors.push('Für Rechnungen über 250 € ist eine zulässige Steuerkennung erforderlich.');
  }
  if (document?.type === 'cancellation' && !document.sourceDocumentId) errors.push('Die zu stornierende Rechnung fehlt.');
  return { errors, totals };
}

export function nextDocumentNumber(documents, type, year = new Date().getFullYear()) {
  if (!DOCUMENT_TYPES.includes(type)) throw new TypeError('Unbekannte Belegart.');
  const prefix = { offer: 'A', invoice: 'R', 'delivery-note': 'L', cancellation: 'S' }[type];
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const highest = (documents || []).reduce((value, document) => {
    const match = pattern.exec(document.number || '');
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `${prefix}-${year}-${String(highest + 1).padStart(4, '0')}`;
}

export function issueDocument(document, profile, documents = [], now = new Date()) {
  const validation = validateDocumentForIssue(document, profile);
  if (validation.errors.length) return { document: null, ...validation };
  const issued = structuredClone(document);
  issued.status = 'issued';
  issued.number = nextDocumentNumber(documents, document.type, now.getFullYear());
  issued.issuedAt = now.toISOString();
  issued.updatedAt = issued.issuedAt;
  issued.seller = structuredClone(profile);
  issued.totals = validation.totals;
  return { document: issued, ...validation };
}

export function createInvoiceFromOffer(offer, now = new Date(), id = newId()) {
  if (offer?.type !== 'offer' || !['issued', 'accepted'].includes(offer.status)) throw new TypeError('Nur ein ausgestelltes oder angenommenes Angebot kann übernommen werden.');
  return createDocument({
    type: 'invoice', id, now, seller: offer.seller, customer: offer.customer, items: offer.items, taxMode: offer.taxMode,
    donationProject: offer.donationProject, notes: offer.notes, serviceDate: offer.serviceDate, sourceDocumentId: offer.id, sourceProductId: offer.sourceProductId,
  });
}

export function createDeliveryNoteFromDocument(source, now = new Date(), id = newId()) {
  if (!['offer', 'invoice'].includes(source?.type) || !['issued', 'accepted', 'paid'].includes(source.status)) throw new TypeError('Nur aus einem ausgestellten Beleg kann ein Lieferschein erstellt werden.');
  return createDocument({
    type: 'delivery-note', id, now, seller: source.seller, customer: source.customer,
    items: source.items.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: 0, vatRate: 0 })),
    donationProject: source.donationProject, notes: source.notes, serviceDate: source.serviceDate || now.toISOString().slice(0, 10), sourceDocumentId: source.id, sourceProductId: source.sourceProductId,
  });
}

export function createCancellationFromInvoice(invoice, now = new Date(), id = newId()) {
  if (invoice?.type !== 'invoice' || !['issued', 'paid'].includes(invoice.status)) throw new TypeError('Nur eine ausgestellte Rechnung kann storniert werden.');
  return createDocument({
    type: 'cancellation', id, now, seller: invoice.seller, customer: invoice.customer, items: invoice.items,
    taxMode: invoice.taxMode, notes: `Stornierung zu Rechnung ${invoice.number}`, serviceDate: invoice.serviceDate, sourceDocumentId: invoice.id, sourceProductId: invoice.sourceProductId,
  });
}

export function recordPayment(invoice, amount, now = new Date()) {
  if (invoice?.type !== 'invoice' || !['issued', 'paid'].includes(invoice.status)) return { document: null, error: 'Zahlungen können nur bei ausgestellten Rechnungen erfasst werden.' };
  const value = Number(amount);
  const outstanding = roundMoney(calculateDocumentTotals(invoice).gross - Number(invoice.paidAmount || 0));
  if (!Number.isFinite(value) || value <= 0 || value > outstanding + 1e-9) return { document: null, error: `Bitte einen Betrag zwischen 0,01 € und ${outstanding.toFixed(2)} € eingeben.` };
  const updated = structuredClone(invoice);
  updated.paidAmount = roundMoney(Number(updated.paidAmount || 0) + value);
  updated.payments = [...(updated.payments || []), { amount: value, at: now.toISOString() }];
  updated.paymentStatus = updated.paidAmount >= calculateDocumentTotals(invoice).gross - 1e-9 ? 'paid' : 'partial';
  updated.status = updated.paymentStatus === 'paid' ? 'paid' : 'issued';
  updated.updatedAt = now.toISOString();
  return { document: updated, error: '' };
}