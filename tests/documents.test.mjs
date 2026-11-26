import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDocumentTotals, cleanDocument, createCancellationFromInvoice, createDeliveryNoteFromDocument, createDocument, createDocumentItemFromProduct, createInvoiceFromOffer, issueDocument, nextDocumentNumber, parseDocumentExport, recordPayment, serializeDocumentExport, validateDocumentForIssue } from '../documents.mjs';

const profile = { name: 'Werkstatt', street: 'Musterweg 1', postalCode: '12345', city: 'Musterstadt', identifier: '12/345/67890' };
const item = { description: 'Holzfigur', quantity: 2, unitPrice: 119, vatRate: 19 };

test('document totals split gross amounts into net and VAT for regular taxation', () => {
  const result = calculateDocumentTotals(createDocument({ type: 'invoice', taxMode: 'standard', items: [item] }));
  assert.deepEqual([result.net, result.tax, result.gross], [200, 38, 238]);
  assert.deepEqual(result.errors, []);
});

test('small-business documents do not calculate VAT even if a product carries a tax rate', () => {
  const result = calculateDocumentTotals(createDocument({ type: 'invoice', items: [item] }));
  assert.deepEqual([result.net, result.tax, result.gross], [238, 0, 238]);
});

test('invoice issue requires an identifier above 250 euros but permits a small invoice without one', () => {
  const large = createDocument({ type: 'invoice', customer: { name: 'Kunde' }, items: [{ ...item, quantity: 3 }], serviceDate: '2026-01-15' });
  assert.ok(validateDocumentForIssue(large, { ...profile, identifier: '' }).errors.some(error => error.includes('250')));
  assert.ok(validateDocumentForIssue(large, profile).errors.some(error => error.includes('Kundenanschrift')));
  const small = createDocument({ type: 'invoice', customer: { name: 'Kunde' }, items: [item], serviceDate: '2026-01-15' });
  assert.deepEqual(validateDocumentForIssue(small, { ...profile, identifier: '' }).errors, []);
});

test('issue freezes a seller snapshot and assigns the next yearly number', () => {
  const first = createDocument({ type: 'invoice', customer: { name: 'Kunde' }, items: [item], serviceDate: '2026-01-15' });
  const issued = issueDocument(first, profile, [], new Date('2026-05-01T10:00:00Z'));
  assert.equal(issued.document.number, 'R-2026-0001');
  assert.equal(issued.document.status, 'issued');
  assert.equal(first.number, '');
  assert.equal(nextDocumentNumber([issued.document], 'invoice', 2026), 'R-2026-0002');
});

test('optional payment instructions survive invoice snapshot cleaning', () => {
  const issued = issueDocument(createDocument({ type: 'invoice', customer: { name: 'Kunde' }, serviceDate: '2026-03-04', items: [{ description: 'Artikel', quantity: 1, unitPrice: 100, vatRate: 0 }] }), { ...profile, paymentDetails: 'IBAN DE02120300000000202051' }, [], new Date('2026-03-04T00:00:00Z')).document;
  assert.equal(cleanDocument(issued).seller.paymentDetails, 'IBAN DE02120300000000202051');
});
test('invoice cannot be issued without a delivery or service date', () => {
  const invoice = createDocument({ type: 'invoice', customer: { name: 'Kunde' }, items: [item] });
  assert.ok(validateDocumentForIssue(invoice, profile).errors.some(error => error.includes('Leistungsdatum')));
});

test('donation project is copied to an invoice without affecting totals', () => {
  const offer = createDocument({ type: 'offer', id: 'offer-1', now: new Date('2026-01-01T00:00:00Z'), customer: { name: 'Kunde' }, items: [item], donationProject: 'Kinderhospiz' });
  offer.status = 'accepted';
  const invoice = createInvoiceFromOffer(offer, new Date('2026-01-02T00:00:00Z'), 'invoice-1');
  assert.equal(invoice.donationProject, 'Kinderhospiz');
  assert.equal(invoice.sourceDocumentId, 'offer-1');
  assert.equal(calculateDocumentTotals(invoice).gross, 238);
});

test('individual document JSON roundtrip keeps the document and rejects unknown formats', () => {
  const document = createDocument({ type: 'offer', id: 'offer-json', now: new Date('2026-03-04T00:00:00Z'), donationProject: 'Kinderhospiz' });
  const imported = parseDocumentExport(JSON.parse(JSON.stringify(serializeDocumentExport(document))));
  assert.equal(imported.id, document.id);
  assert.equal(imported.donationProject, 'Kinderhospiz');
  assert.equal(parseDocumentExport({ format: 'other', version: 1, document }), null);
});

test('saved products create priced invoice items using the current tax profile', () => {
  const product = { productName: 'Gespeicherte Schale', batchSize: '1', materials: [], extras: [], laborMinutes: '60', hourlyRate: '20', setupMinutes: '0', setupCost: '0', overheadPercent: '0', feePercent: '0', fixedFee: '0', vatPercent: '0', shippingCost: '0', packagingCost: '0', roundingMode: 'cent' };
  const smallBusiness = createDocumentItemFromProduct(product, 'small-business', 19);
  const standard = createDocumentItemFromProduct(product, 'standard', 19);
  assert.equal(smallBusiness.item.vatRate, 0);
  assert.equal(standard.item.vatRate, 19);
  assert.ok(standard.item.unitPrice > smallBusiness.item.unitPrice);
});

test('saved products added to delivery notes carry quantity only, even without a price calculation', () => {
  const product = { productName: 'Vorlage', batchSize: '3' };
  const result = createDocumentItemFromProduct(product, 'standard', 19, 'delivery-note');
  assert.deepEqual(result.item, { description: 'Vorlage', quantity: 3, unitPrice: 0, vatRate: 0 });
  assert.equal(result.error, '');
});

test('source product identity is retained when a document is cloned from an offer', () => {
  const offer = createDocument({ type: 'offer', id: 'offer-source', sourceProductId: 'product-current' });
  offer.status = 'issued';
  const invoice = createInvoiceFromOffer(offer);
  assert.equal(invoice.sourceProductId, 'product-current');
});

test('delivery note carries donation project but has no prices or VAT and uses its own number series', () => {
  const offer = createDocument({ type: 'offer', id: 'offer-delivery', customer: { name: 'Kunde', street: 'Weg 1', postalCode: '12345', city: 'Ort' }, items: [item], donationProject: 'Kinderhospiz' });
  offer.status = 'issued';
  offer.seller = profile;
  offer.serviceDate = '2026-03-04';
  const deliveryNote = createDeliveryNoteFromDocument(offer, new Date('2026-03-04T00:00:00Z'), 'delivery-1');
  const totals = calculateDocumentTotals(deliveryNote);
  const issued = issueDocument(deliveryNote, profile, [], new Date('2026-03-04T00:00:00Z'));
  assert.equal(issued.document.number, 'L-2026-0001');
  assert.equal(deliveryNote.donationProject, 'Kinderhospiz');
  assert.deepEqual([totals.net, totals.tax, totals.gross], [0, 0, 0]);
  assert.deepEqual(issued.errors, []);
});

test('payments can be recorded partially and then settle the invoice without changing its totals', () => {
  const invoice = issueDocument(createDocument({ type: 'invoice', customer: { name: 'Kunde' }, serviceDate: '2026-03-04', items: [{ description: 'Artikel', quantity: 1, unitPrice: 100, vatRate: 0 }] }), profile, [], new Date('2026-03-04T00:00:00Z')).document;
  const partial = recordPayment(invoice, 40, new Date('2026-03-05T00:00:00Z')).document;
  const paid = recordPayment(partial, 60, new Date('2026-03-06T00:00:00Z')).document;
  assert.equal(partial.paymentStatus, 'partial');
  assert.equal(paid.paymentStatus, 'paid');
  assert.equal(paid.status, 'paid');
  assert.equal(calculateDocumentTotals(paid).gross, 100);
  assert.equal(recordPayment(paid, 1).document, null);
});

test('cancellation is a separate negative document linked to its issued invoice', () => {
  const invoice = issueDocument(createDocument({ type: 'invoice', id: 'invoice-cancel', customer: { name: 'Kunde' }, serviceDate: '2026-03-04', items: [{ description: 'Artikel', quantity: 1, unitPrice: 100, vatRate: 0 }] }), profile, [], new Date('2026-03-04T00:00:00Z')).document;
  const cancellation = createCancellationFromInvoice(invoice, new Date('2026-03-05T00:00:00Z'), 'cancel-1');
  const issued = issueDocument(cancellation, profile, [invoice], new Date('2026-03-05T00:00:00Z'));
  assert.equal(issued.document.number, 'S-2026-0001');
  assert.equal(issued.document.sourceDocumentId, invoice.id);
  assert.equal(issued.document.totals.gross, -100);
});