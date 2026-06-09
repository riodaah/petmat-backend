import { getFirestore } from './firebaseAdmin.js';

const ORDERS_COLLECTION = 'orders';

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.id || '',
    title: item.title || 'Producto',
    description: item.description || '',
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0)
  }));
}

export async function upsertOrderFromPayment(paymentInfo) {
  const db = getFirestore();
  if (!db) {
    console.warn('⚠️ Firestore no configurado: orden no persistida');
    return null;
  }

  const metadata = paymentInfo.metadata || {};
  const paymentId = String(paymentInfo.id);
  const ref = db.collection(ORDERS_COLLECTION).doc(paymentId);
  const previousSnap = await ref.get();
  const previous = previousSnap.exists ? previousSnap.data() : null;

  const shippingAddress = {
    street: metadata.shipping_address || paymentInfo.payer?.address?.street_name || '',
    city: metadata.shipping_city || paymentInfo.payer?.address?.city_name || '',
    region: metadata.shipping_region || paymentInfo.payer?.address?.state_name || ''
  };

  const payload = {
    paymentId,
    externalReference: paymentInfo.external_reference || '',
    merchantOrderId: paymentInfo.order?.id || '',
    payerEmail: metadata.customer_email || paymentInfo.payer?.email || '',
    customerName: metadata.customer_name
      || `${paymentInfo.payer?.first_name || ''} ${paymentInfo.payer?.last_name || ''}`.trim()
      || 'Cliente',
    customerPhone: metadata.customer_phone || paymentInfo.payer?.phone?.number || '',
    currency: paymentInfo.currency_id || 'CLP',
    paymentStatus: paymentInfo.status || 'unknown',
    statusDetail: paymentInfo.status_detail || '',
    orderStatus: previous?.orderStatus || 'created',
    traceId: metadata.trace_id || '',
    platform: metadata.platform || 'petmat-web',
    items: normalizeItems(paymentInfo.additional_info?.items),
    subtotal: Number(metadata.subtotal || 0),
    shippingCost: Number(metadata.shipping_cost || 0),
    total: Number(paymentInfo.transaction_amount || metadata.total || 0),
    shippingAddress,
    createdAt: previous?.createdAt || toIsoDate(paymentInfo.date_created),
    paidAt: paymentInfo.status === 'approved' ? toIsoDate(paymentInfo.date_approved) : previous?.paidAt || null,
    updatedAt: new Date().toISOString()
  };

  await ref.set(payload, { merge: true });
  return payload;
}
