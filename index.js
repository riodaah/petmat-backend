/**
 * Backend para PetMAT - Integración con Mercado Pago
 * Arquitectura basada en Astrochoc (simple, sin base de datos)
 * 
 * Este servidor maneja:
 * - Creación de preferencias de pago (seguras, sin exponer Access Token)
 * - Webhooks de Mercado Pago (notificaciones de pago)
 * - Envío de emails automáticos vía Resend (confirmación al cliente y notificación al admin)
 */

import express from 'express';
import cors from 'cors';
import { calculateShippingCost } from './shipping.js';
import { rateLimit } from './rateLimit.js';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import dotenv from 'dotenv';
import { initFirebaseAdmin } from './firebaseAdmin.js';
import { getActiveProducts, getAllProducts, getProductById } from './productCatalogService.js';
import { upsertOrderFromPayment } from './orderStoreService.js';

dotenv.config();
initFirebaseAdmin();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_BASE_URL = process.env.FRONTEND_URL || 'https://petmat.cl';
const BACKEND_BASE_URL = process.env.BACKEND_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');

function formatPriceForGoogle(price, currency) {
  return `${Number(price).toFixed(2)} ${currency}`;
}

function buildProductUrls(product) {
  const primaryImage = product.images?.[0] || '/assets/products/placeholder.png';
  const extraImages = Array.isArray(product.images) ? product.images.slice(1) : [];
  return {
    link: `${FRONTEND_BASE_URL}/producto/${product.slug}`,
    image_link: `${FRONTEND_BASE_URL}${primaryImage}`,
    additional_image_link: extraImages.map((img) => `${FRONTEND_BASE_URL}${img}`)
  };
}

function mapToGoogleProduct(product) {
  const { link, image_link, additional_image_link } = buildProductUrls(product);

  return {
    id: product.id,
    title: product.name,
    description: product.description,
    short_description: product.short,
    link,
    image_link,
    additional_image_link,
    availability: product.stock > 0 ? 'in stock' : 'out of stock',
    condition: 'new',
    brand: product.brand || 'PetMAT',
    price: {
      value: Number(product.finalPrice || product.price).toFixed(2),
      currency: product.currency
    },
    price_feed: formatPriceForGoogle(product.finalPrice || product.price, product.currency),
    base_price_feed: formatPriceForGoogle(product.price, product.currency),
    stock: product.stock,
    mpn: product.mpn,
    identifier_exists: true,
    google_product_category: product.category
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString('es-CL')}`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCustomerNameFromPayer(payer = {}) {
  const fullName = `${payer.first_name || ''} ${payer.last_name || ''}`.trim();
  return fullName || payer.name || '';
}

function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase();
}

// Cupones: variable de entorno COUPONS con el formato CODIGO:descuento,
// separados por coma. Ejemplo: COUPONS=VERANO:0.2,AMIGOS:0.1
// Los códigos viven solo en el servidor; no van en el código ni en el frontend.
function loadCoupons() {
  const coupons = new Map();
  for (const entry of String(process.env.COUPONS || '').split(',')) {
    const [rawCode, rawRate] = entry.split(':');
    const code = normalizeCouponCode(rawCode);
    const discountRate = Number(rawRate);
    if (!code) continue;
    if (!(discountRate > 0 && discountRate < 1)) {
      console.warn(`⚠️ Cupón ${code} ignorado: el descuento debe ser un número entre 0 y 1`);
      continue;
    }
    coupons.set(code, discountRate);
  }
  return coupons;
}

const COUPONS = loadCoupons();

function resolveCoupon(code) {
  const normalized = normalizeCouponCode(code);
  if (!normalized || !COUPONS.has(normalized)) return null;
  return { code: normalized, discountRate: COUPONS.get(normalized) };
}

function applyCouponToItems(items, coupon) {
  if (!coupon) {
    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    return {
      items,
      subtotal,
      discountAmount: 0,
      discountedSubtotal: subtotal
    };
  }

  const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const targetDiscount = Number((subtotal * coupon.discountRate).toFixed(2));
  let discountRemaining = targetDiscount;

  const discountedItems = items.map((item, index) => {
    const lineTotal = item.unit_price * item.quantity;
    const proportional = index === items.length - 1
      ? discountRemaining
      : Number((targetDiscount * (lineTotal / subtotal)).toFixed(2));
    discountRemaining = Number((discountRemaining - proportional).toFixed(2));
    const discountedLineTotal = Math.max(0, Number((lineTotal - proportional).toFixed(2)));
    const discountedUnitPrice = Number((discountedLineTotal / item.quantity).toFixed(2));
    return {
      ...item,
      unit_price: discountedUnitPrice
    };
  });

  const discountedSubtotal = discountedItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const discountAmount = Number((subtotal - discountedSubtotal).toFixed(2));

  return {
    items: discountedItems,
    subtotal,
    discountAmount,
    discountedSubtotal: Number(discountedSubtotal.toFixed(2))
  };
}

function getAdminRecipients() {
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const splitEmails = (value) => String(value || '')
    .split(/[,;\n]+/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  const fromAdminEmails = splitEmails(process.env.ADMIN_EMAILS);
  const fromAdminEmailFallback = splitEmails(process.env.ADMIN_EMAIL || 'da.morande@gmail.com');
  const rawList = [...fromAdminEmails, ...fromAdminEmailFallback];

  const validList = rawList.filter(isValidEmail);
  const invalidList = rawList.filter((email) => !isValidEmail(email));
  if (invalidList.length > 0) {
    console.warn('⚠️ ADMIN_EMAILS contiene correos inválidos, se omiten:', invalidList);
  }

  return [...new Set(validList)];
}

function buildItemsSummary(items = []) {
  if (!items.length) {
    return 'Sin productos';
  }

  return items
    .map((item) => `- ${item.title} x${item.quantity} (${formatCurrency(item.unit_price)})`)
    .join('\n');
}

// Remitente por defecto: onboarding@resend.dev funciona sin dominio verificado
// (pero solo permite enviar al dueño de la cuenta Resend). Una vez verificado
// petmat.cl en Resend, configurar RESEND_FROM_EMAIL="PetMAT <info@petmat.cl>".
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'PetMAT <onboarding@resend.dev>';

async function sendResendEmail({ to, subject, html, text, replyTo }, logLabel) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !to) {
    console.warn(`⚠️ Resend incompleto para ${logLabel}, envío omitido`);
    return null;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo || undefined
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Resend ${logLabel} falló (${response.status}): ${result?.message || 'error desconocido'}`);
  }

  console.log(`✅ Resend enviado (${logLabel}):`, result?.id || 'sin id');
  return result;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOrderEmailHtml({ heading, intro, orderData, itemsSummary }) {
  const itemsHtml = itemsSummary
    .split('\n')
    .map((line) => `<li>${escapeHtml(line.replace(/^- /, ''))}</li>`)
    .join('');
  const couponRow = orderData.couponCode
    ? `<tr><td style="padding: 4px 0;">Cupón ${escapeHtml(orderData.couponCode)}:</td><td style="text-align: right;">-${escapeHtml(formatCurrency(orderData.discountAmount || 0))}</td></tr>`
    : '';

  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
    <h2 style="color: #2A9DBF;">${escapeHtml(heading)}</h2>
    <p>${escapeHtml(intro)}</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 6px 0;"><strong>Orden:</strong></td><td>${escapeHtml(orderData.orderNumber)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Payment ID:</strong></td><td>${escapeHtml(orderData.paymentId)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Cliente:</strong></td><td>${escapeHtml(orderData.customerName)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Email:</strong></td><td>${escapeHtml(orderData.email)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Teléfono:</strong></td><td>${escapeHtml(orderData.phone || 'No informado')}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Dirección de envío:</strong></td><td>${escapeHtml(`${orderData.shippingAddress.street}, ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}`)}</td></tr>
    </table>
    <h3 style="color: #2A9DBF;">Productos</h3>
    <ul>${itemsHtml}</ul>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      ${couponRow}
      <tr><td style="padding: 4px 0;">Subtotal:</td><td style="text-align: right;">${escapeHtml(formatCurrency(orderData.subtotal))}</td></tr>
      <tr><td style="padding: 4px 0;">Envío:</td><td style="text-align: right;">${escapeHtml(formatCurrency(orderData.shippingCost))}</td></tr>
      <tr><td style="padding: 4px 0;"><strong>Total:</strong></td><td style="text-align: right;"><strong>${escapeHtml(formatCurrency(orderData.total))}</strong></td></tr>
    </table>
    <p style="color: #888; font-size: 12px;">PetMAT · https://petmat.cl</p>
  </div>`;
}

async function sendContactMessage(payload) {
  const toEmail = getAdminRecipients();
  const replyTo = normalizeEmail(payload.email);
  const subject = `Nuevo contacto web - ${payload.name}`;

  const text = [
    `Nombre: ${payload.name}`,
    `Email: ${payload.email}`,
    `Teléfono: ${payload.phone || 'No informado'}`,
    '',
    payload.message
  ].join('\n');

  await sendResendEmail(
    {
      to: toEmail,
      subject,
      text,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #2A9DBF;">Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(payload.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
        <p><strong>Teléfono:</strong> ${escapeHtml(payload.phone || 'No informado')}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHtml(payload.message).replace(/\n/g, '<br/>')}</p>
      </div>`,
      replyTo
    },
    'contacto'
  );
  return { provider: 'resend' };
}

// Middleware - CORS configurado para petmat.cl y variantes
const allowedOrigins = [
  'https://petmat.cl',
  'https://www.petmat.cl',
  'https://petmat-8d651.web.app',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    // Coincidencia exacta: "petmat.cl.otro-sitio.com" no debe pasar.
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100kb' }));

// Railway pone un proxy delante; así req.ip es la IP real del cliente.
app.set('trust proxy', 1);

const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const couponLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const diagnosticsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

/**
 * Valida un cupón sin revelar los códigos existentes.
 * POST /api/validate-coupon  { code }
 */
app.post('/api/validate-coupon', couponLimiter, (req, res) => {
  const coupon = resolveCoupon(req.body?.code);
  if (!coupon) return res.json({ valid: false });
  return res.json({ valid: true, code: coupon.code, discount_rate: coupon.discountRate });
});

app.post('/api/checkout-diagnostics', diagnosticsLimiter, (req, res) => {
  try {
    const payload = req.body || {};
    const traceId = payload.trace_id || `diag_${Date.now()}`;
    const stage = payload.stage || 'unknown_stage';

    console.log('🧭 Checkout diagnostics', JSON.stringify({
      trace_id: traceId,
      stage,
      source: payload.source || 'unknown_source',
      query: payload.query || {},
      checkout_snapshot: payload.checkout_snapshot || null,
      error_message: payload.error_message || null,
      checkout_context: payload.checkout_context || null,
      browser: payload.browser || null,
      timestamp: new Date().toISOString()
    }));

    return res.json({ ok: true, trace_id: traceId });
  } catch (error) {
    console.error('❌ Error registrando diagnóstico de checkout:', error);
    return res.status(500).json({ error: 'No se pudo registrar diagnóstico' });
  }
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, phone, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        error: 'Faltan campos obligatorios (name, email, message)'
      });
    }

    await sendContactMessage({ name, email, phone, message });
    return res.json({ ok: true });
  } catch (error) {
    console.error('❌ Error enviando contacto:', error);
    return res.status(500).json({
      error: 'No se pudo enviar el mensaje de contacto',
      details: error.message
    });
  }
});

// Configurar Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: {
    timeout: 5000,
  }
});

const preference = new Preference(client);

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'petmat-backend',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * Catalogo base de productos
 * GET /api/products
 */
app.get('/api/products', async (req, res) => {
  try {
    const products = (await getActiveProducts()).map((product) => ({
      ...product,
      product_slug: product.slug
    }));

    res.json({
      brand: 'PetMAT',
      total: products.length,
      generated_at: new Date().toISOString(),
      products
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({ error: 'No se pudo obtener el catálogo de productos' });
  }
});

/**
 * Feed de productos para Google (JSON)
 * GET /api/products/google-feed
 */
app.get('/api/products/google-feed', async (req, res) => {
  try {
    const items = (await getActiveProducts()).map(mapToGoogleProduct);

    res.json({
      feed_name: 'petmat_google_products',
      feed_type: 'google_merchant_json',
      generated_at: new Date().toISOString(),
      language: 'es',
      country: 'CL',
      currency: 'CLP',
      total_items: items.length,
      items
    });
  } catch (error) {
    console.error('❌ Error generando feed JSON:', error);
    res.status(500).json({ error: 'No se pudo generar feed de productos' });
  }
});

/**
 * Feed de productos para Google Merchant (RSS/XML)
 * GET /api/products/google-feed.xml
 */
app.get('/api/products/google-feed.xml', async (req, res) => {
  try {
    const productItems = (await getActiveProducts()).map((product) => {
      const googleProduct = mapToGoogleProduct(product);
      const additionalImagesXml = googleProduct.additional_image_link
        .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
        .join('');

      return `
        <item>
          <g:id>${escapeXml(googleProduct.id)}</g:id>
          <g:title>${escapeXml(googleProduct.title)}</g:title>
          <g:description>${escapeXml(googleProduct.description)}</g:description>
          <g:link>${escapeXml(googleProduct.link)}</g:link>
          <g:image_link>${escapeXml(googleProduct.image_link)}</g:image_link>
          ${additionalImagesXml}
          <g:availability>${escapeXml(googleProduct.availability)}</g:availability>
          <g:condition>${escapeXml(googleProduct.condition)}</g:condition>
          <g:price>${escapeXml(googleProduct.price_feed)}</g:price>
          <g:brand>${escapeXml(googleProduct.brand)}</g:brand>
          <g:mpn>${escapeXml(googleProduct.mpn)}</g:mpn>
          <g:identifier_exists>yes</g:identifier_exists>
          <g:google_product_category>${escapeXml(googleProduct.google_product_category)}</g:google_product_category>
        </item>
      `;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>PetMAT Product Feed</title>
    <link>${escapeXml(FRONTEND_BASE_URL)}</link>
    <description>Feed de productos PetMAT para Google Merchant Center</description>
    ${productItems}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (error) {
    console.error('❌ Error generando feed XML:', error);
    return res.status(500).send('No se pudo generar feed XML');
  }
});

/**
 * Producto individual por ID
 * GET /api/products/:id
 */
app.get('/api/products/:id', async (req, res) => {
  const product = await getProductById(req.params.id);

  if (!product) {
    return res.status(404).json({
      error: 'Producto no encontrado'
    });
  }

  return res.json(product);
});

/**
 * Endpoint para crear preferencia de pago
 * POST /api/create-preference
 */
app.post('/api/create-preference', checkoutLimiter, async (req, res) => {
  try {
    const { items, payer, trace_id: traceId, fulfillment_type: fulfillmentTypeRaw, coupon_code: couponCodeRaw } = req.body;

    // Validar items
    if (!items || items.length === 0) {
      return res.status(400).json({
        error: 'No se proporcionaron items para el pago'
      });
    }

    const catalogProducts = await getActiveProducts();
    const catalogById = new Map(catalogProducts.map((p) => [p.id, p]));
    const invalidItems = [];

    const normalizedItems = items.map((item) => {
      const product = catalogById.get(item.id);
      const quantity = Number(item.quantity || 1);

      if (!product) {
        invalidItems.push({ id: item.id, reason: 'Producto no existe o está inactivo' });
        return null;
      }

      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10) {
        invalidItems.push({ id: item.id, reason: 'Cantidad inválida' });
        return null;
      }

      if (product.stock < quantity) {
        invalidItems.push({ id: item.id, reason: `Stock insuficiente (disponible: ${product.stock})` });
        return null;
      }

      return {
        id: product.id,
        title: product.name,
        description: product.description || 'Producto PetMAT para mascotas',
        picture_url: product.images?.[0] ? `${FRONTEND_BASE_URL}${product.images[0]}` : `${FRONTEND_BASE_URL}/assets/products/placeholder.png`,
        category_id: 'others',
        quantity,
        currency_id: product.currency || 'CLP',
        unit_price: parseFloat(product.finalPrice)
      };
    }).filter(Boolean);

    if (invalidItems.length > 0) {
      return res.status(400).json({
        error: 'Carrito inválido',
        details: invalidItems
      });
    }

    // Calcular totales desde catálogo servidor (no confiar en frontend)
    const coupon = resolveCoupon(couponCodeRaw);
    const {
      items: pricedItems,
      subtotal,
      discountAmount,
      discountedSubtotal
    } = applyCouponToItems(normalizedItems, coupon);
    const fulfillmentType = fulfillmentTypeRaw === 'pickup' ? 'pickup' : 'delivery';
    // El envío se calcula aquí; el monto que mande el navegador no se usa.
    const totalUnits = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
    const effectiveShippingCost = calculateShippingCost({
      region: payer?.address?.state_name,
      totalUnits,
      fulfillmentType
    });
    const total = discountedSubtotal + effectiveShippingCost;
    const customerName = buildCustomerNameFromPayer(payer);

    // Generar external_reference único
    const externalReference = `petmat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!BACKEND_BASE_URL) {
      console.warn('⚠️ BACKEND_URL no configurado; webhook de Mercado Pago quedará deshabilitado');
    }

    // Crear preferencia de Mercado Pago
    const preferenceData = {
      items: pricedItems,
      
      // URLs de retorno
      back_urls: {
        success: `${FRONTEND_BASE_URL}/success`,
        failure: `${FRONTEND_BASE_URL}/error`,
        pending: `${FRONTEND_BASE_URL}/pending`
      },
      
      auto_return: 'approved',
      
      // Información del pagador
      payer: payer || undefined,
      
      // Datos de envío
      shipments: {
        cost: effectiveShippingCost,
        mode: 'not_specified'
      },
      
      // Configuraciones adicionales
      statement_descriptor: 'PetMAT',
      external_reference: externalReference,
      binary_mode: false,
      
      // Métodos de pago
      payment_methods: {
        installments: 12,
        default_installments: 1
      },
      
      // Webhook URL
      notification_url: BACKEND_BASE_URL ? `${BACKEND_BASE_URL}/api/webhook` : undefined,
      
      // Metadata (para recuperar en el webhook)
      metadata: {
        trace_id: traceId || '',
        platform: 'petmat-web',
        items_count: items.reduce((sum, item) => sum + item.quantity, 0),
        customer_email: payer?.email || '',
        customer_name: customerName,
        customer_phone: payer?.phone?.number || '',
        shipping_address: payer?.address?.street_name || '',
        shipping_city: payer?.address?.city_name || '',
        shipping_region: payer?.address?.state_name || '',
        fulfillment_type: fulfillmentType,
        coupon_code: coupon?.code || '',
        coupon_discount_rate: coupon?.discountRate || 0,
        coupon_discount_amount: discountAmount,
        subtotal: subtotal,
        subtotal_after_discount: discountedSubtotal,
        shipping_cost: effectiveShippingCost,
        total: total
      }
    };

    console.log('📦 Creando preferencia de pago', {
      trace_id: traceId || null,
      payer_email: payer?.email || 'sin email',
      items_count: items?.length || 0,
      coupon_code: coupon?.code || null,
      external_reference: externalReference
    });

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Preferencia creada', {
      trace_id: traceId || null,
      preference_id: response.id,
      external_reference: externalReference
    });

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      external_reference: externalReference,
      coupon_code: coupon?.code || null,
      discount_amount: discountAmount,
      shipping_cost: effectiveShippingCost,
      total,
      trace_id: traceId || null
    });

  } catch (error) {
    console.error('❌ Error al crear preferencia:', {
      message: error?.message,
      cause: error?.cause || null,
      stack: error?.stack || null
    });
    res.status(500).json({
      error: 'Error al crear la preferencia de pago',
      message: error.message
    });
  }
});

/**
 * Webhook para recibir notificaciones de Mercado Pago
 * POST /api/webhook
 */
app.post('/api/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    console.log('🔔 Webhook recibido:', type);

    // Responder rápidamente a Mercado Pago (importante)
    res.status(200).send('OK');

    // Procesar la notificación de forma asíncrona
    if (type === 'payment') {
      const paymentId = data.id;
      console.log('💳 Procesando pago:', paymentId);
      
      processPaymentNotification(paymentId).catch(err => {
        console.error('❌ Error al procesar pago:', err);
      });
    }

  } catch (error) {
    console.error('❌ Error en webhook:', error);
    res.status(500).send('Error');
  }
});

/**
 * Procesar notificación de pago y enviar emails
 */
async function processPaymentNotification(paymentId) {
  try {
    // Consultar información del pago en Mercado Pago
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: paymentId });

    console.log('📋 Estado del pago:', paymentInfo.status);

    // Solo enviar emails si el pago fue aprobado
    if (paymentInfo.status === 'approved') {
      console.log('✅ Pago aprobado, enviando emails...');

      // Extraer información del metadata
      const metadata = paymentInfo.metadata || {};
      await upsertOrderFromPayment(paymentInfo);
      const fallbackCustomerName = `${paymentInfo.payer?.first_name || ''} ${paymentInfo.payer?.last_name || ''}`.trim() || 'Cliente';
      const paidTotal = toNumber(paymentInfo.transaction_details?.total_paid_amount, 0);
      const shippingPaid = toNumber(paymentInfo.shipping_amount, 0);
      const fulfillmentType = metadata.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
      const couponCode = normalizeCouponCode(metadata.coupon_code || '');
      const discountAmount = toNumber(metadata.coupon_discount_amount, 0);
      const shippingAddress = {
        street: metadata.shipping_address || paymentInfo.additional_info?.payer?.address?.street_name || paymentInfo.payer?.address?.street_name || '',
        city: metadata.shipping_city || paymentInfo.payer?.address?.city_name || '',
        region: metadata.shipping_region || paymentInfo.payer?.address?.state_name || ''
      };
      const calculatedSubtotal = (paymentInfo.additional_info?.items || []).reduce(
        (sum, item) => sum + (toNumber(item.unit_price) * toNumber(item.quantity)),
        0
      );
      
      const orderData = {
        paymentId: paymentInfo.id,
        orderNumber: paymentInfo.external_reference || `MP-${paymentInfo.id}`,
        customerName: metadata.customer_name || fallbackCustomerName,
        email: normalizeEmail(metadata.customer_email || paymentInfo.payer?.email || ''),
        phone: metadata.customer_phone || paymentInfo.additional_info?.payer?.phone?.number || paymentInfo.payer?.phone?.number || '',
        items: paymentInfo.additional_info?.items || [],
        subtotal: toNumber(metadata.subtotal_after_discount, toNumber(metadata.subtotal, calculatedSubtotal)),
        shippingCost: fulfillmentType === 'pickup' ? 0 : toNumber(metadata.shipping_cost, shippingPaid),
        total: paidTotal || toNumber(metadata.total, paymentInfo.transaction_amount),
        shippingAddress,
        fulfillmentType,
        couponCode: couponCode || null,
        discountAmount
      };

      // Validar email del cliente
      if (!orderData.email) {
        console.warn('⚠️ No se encontró email del cliente');
        return;
      }

      // Email del administrador
      const adminRecipients = getAdminRecipients();
      const itemsSummary = buildItemsSummary(orderData.items);

      if (adminRecipients.length === 0) {
        console.error('❌ No hay destinatarios admin válidos (ADMIN_EMAILS / ADMIN_EMAIL).');
      } else {
        try {
          await sendResendEmail(
            {
              to: adminRecipients,
              subject: `🛒 Nueva venta ${orderData.orderNumber} - ${formatCurrency(orderData.total)}`,
              text: [
                `Nueva venta en petmat.cl`,
                `Orden: ${orderData.orderNumber}`,
                `Payment ID: ${orderData.paymentId}`,
                `Cliente: ${orderData.customerName} (${orderData.email})`,
                `Teléfono: ${orderData.phone || 'No informado'}`,
                `Dirección: ${orderData.shippingAddress.street}, ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}`,
                '',
                'Productos:',
                itemsSummary,
                '',
                ...(orderData.couponCode ? [`Cupón aplicado: ${orderData.couponCode} (-${formatCurrency(orderData.discountAmount)})`, ''] : []),
                `Subtotal: ${formatCurrency(orderData.subtotal)}`,
                `Envío: ${formatCurrency(orderData.shippingCost)}`,
                `Total: ${formatCurrency(orderData.total)}`
              ].join('\n'),
              html: buildOrderEmailHtml({
                heading: 'Nueva venta en petmat.cl',
                intro: 'Se registró una nueva compra pagada. Detalle para despacho:',
                orderData,
                itemsSummary
              }),
              replyTo: orderData.email
            },
            'admin'
          );
        } catch (emailError) {
          console.error('❌ Error Resend admin:', emailError.message);
        }
      }

      try {
        await sendResendEmail(
          {
            to: orderData.email,
            subject: `Confirmación de tu compra en PetMAT (${orderData.orderNumber})`,
            text: [
              `Hola ${orderData.customerName},`,
              '',
              'Recibimos tu compra y ya la estamos preparando.',
              '',
              'Productos:',
              itemsSummary,
              '',
              ...(orderData.couponCode ? [`Cupón aplicado: ${orderData.couponCode} (-${formatCurrency(orderData.discountAmount)})`, ''] : []),
              `Subtotal: ${formatCurrency(orderData.subtotal)}`,
              `Envío: ${formatCurrency(orderData.shippingCost)}`,
              `Total: ${formatCurrency(orderData.total)}`,
              '',
              `Dirección de envío: ${orderData.shippingAddress.street}, ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}`,
              '',
              'Gracias por preferir PetMAT.'
            ].join('\n'),
            html: buildOrderEmailHtml({
              heading: '¡Gracias por tu compra!',
              intro: 'Recibimos tu pedido y ya lo estamos preparando. Este es el detalle:',
              orderData,
              itemsSummary
            }),
            replyTo: adminRecipients[0]
          },
          'cliente'
        );
      } catch (emailError) {
        console.error('❌ Error Resend cliente:', emailError.message);
      }

    } else {
      console.log(`⏳ Pago con estado "${paymentInfo.status}"`);
    }

  } catch (error) {
    console.error('❌ Error al procesar notificación:', error);
    throw error;
  }
}

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
  🐾 PetMAT Backend Server v2.0
  🚀 Servidor corriendo en puerto ${PORT}
  🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}
  💳 Mercado Pago configurado: ${process.env.MP_ACCESS_TOKEN ? '✅' : '❌'}
  📧 Resend configurado: ${process.env.RESEND_API_KEY ? '✅' : '❌'} (from: ${RESEND_FROM})
  `);
});

export default app;
