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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase();
}

export async function upsertOrderFromPayment(paymentInfo) {
  const db = getFirestore();
  if (!db) {
    console.warn('⚠️ Firestore no configurado: orden no persistida');
    return null;
  }

  const metadata = paymentInfo.metadata || {};
  const fulfillmentType = metadata.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
  const paymentId = String(paymentInfo.id);
  const ref = db.collection(ORDERS_COLLECTION).doc(paymentId);
  const previousSnap = await ref.get();
  const previous = previousSnap.exists ? previousSnap.data() : null;

  const shippingAddress = {
    street: metadata.shipping_address || paymentInfo.additional_info?.payer?.address?.street_name || paymentInfo.payer?.address?.street_name || '',
    city: metadata.shipping_city || paymentInfo.payer?.address?.city_name || '',
    region: metadata.shipping_region || paymentInfo.payer?.address?.state_name || ''
  };

  const items = normalizeItems(paymentInfo.additional_info?.items);
  const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const couponCode = normalizeCouponCode(metadata.coupon_code || '');
  const couponDiscountAmount = toNumber(metadata.coupon_discount_amount, 0);
  const subtotalAfterDiscount = toNumber(metadata.subtotal_after_discount, subtotal);
  const shippingCost = toNumber(metadata.shipping_cost, toNumber(paymentInfo.shipping_amount));
  const totalPaid = toNumber(
    paymentInfo.transaction_details?.total_paid_amount,
    toNumber(metadata.total, toNumber(paymentInfo.transaction_amount))
  );

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
    fulfillmentType,
    paymentMethodId: paymentInfo.payment_method_id || '',
    paymentTypeId: paymentInfo.payment_type_id || '',
    installments: Number(paymentInfo.installments || 0),
    couponCode: couponCode || null,
    couponDiscountAmount,
    orderStatus: previous?.orderStatus || 'created',
    traceId: metadata.trace_id || '',
    platform: metadata.platform || 'petmat-web',
    items,
    subtotal: subtotalAfterDiscount,
    subtotalBeforeDiscount: toNumber(metadata.subtotal, subtotal),
    shippingCost: fulfillmentType === 'pickup' ? 0 : shippingCost,
    total: totalPaid,
    productTotal: toNumber(paymentInfo.transaction_amount, subtotal),
    shippingAddress,
    createdAt: previous?.createdAt || toIsoDate(paymentInfo.date_created),
    paidAt: paymentInfo.status === 'approved' ? toIsoDate(paymentInfo.date_approved) : previous?.paidAt || null,
    updatedAt: new Date().toISOString()
  };

  await ref.set(payload, { merge: true });
  return payload;
}
