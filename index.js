/**
 * Backend para PetMAT - Integración con Mercado Pago
 * Arquitectura basada en Astrochoc (simple, sin base de datos)
 * 
 * Este servidor maneja:
 * - Creación de preferencias de pago (seguras, sin exponer Access Token)
 * - Webhooks de Mercado Pago (notificaciones de pago)
 * - Envío de emails automáticos (confirmación al cliente y notificación al admin)
 */

import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import emailjs from '@emailjs/nodejs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_BASE_URL = process.env.FRONTEND_URL || 'https://petmat.cl';

// Catalogo base de productos para feed de Google
const PRODUCTS_CATALOG = [
  {
    id: 'p1',
    slug: 'alfombra-olfativa',
    name: 'Alfombra Olfativa PetMAT',
    short: 'Estimulación mental y diversión para tu perro.',
    description: 'Alfombra olfativa de alta calidad para esconder snacks y estimular el olfato de tu mascota. Material lavable, base antideslizante. Perfecta para reducir ansiedad y mantener a tu perro entretenido.',
    price: 26990,
    currency: 'CLP',
    stock: 12,
    category: 'Productos para mascotas > Enriquecimiento ambiental',
    mpn: 'PETMAT-AO-001',
    images: [
      '/assets/products/p1/foto-principal.png',
      '/assets/products/p1/sam-y-alfombra.png',
      '/assets/products/p1/sam-y-alfombra-2.png',
      '/assets/products/p1/conos.png',
      '/assets/products/p1/polar.png',
      '/assets/products/p1/escondite.png',
      '/assets/products/p1/reverso.png'
    ]
  },
  {
    id: 'p2',
    slug: 'alfombra-olfativa-circular',
    name: 'Alfombra Olfativa Circular PetMAT',
    short: 'Diseño circular único para mayor diversión.',
    description: 'Alfombra olfativa con diseño circular innovador. Ideal para perros de todos los tamaños. Material premium, fácil de limpiar y con múltiples áreas de búsqueda para estimular el instinto natural de tu mascota.',
    price: 19990,
    currency: 'CLP',
    stock: 10,
    category: 'Productos para mascotas > Enriquecimiento ambiental',
    mpn: 'PETMAT-AOC-001',
    images: [
      '/assets/products/p2/portada.png',
      '/assets/products/p2/portada-2.png',
      '/assets/products/p2/detalle.png',
      '/assets/products/p2/pata-de-sam.png'
    ]
  },
  {
    id: 'p3',
    slug: 'comedero-automatico',
    name: 'Comedero Automático WiFi PetMAT',
    short: 'Alimentación inteligente con cámara y WiFi.',
    description: 'Comedero automático de última generación con cámara HD integrada, conexión WiFi y control desde tu smartphone. Programa horarios de alimentación, controla porciones y vigila a tu mascota desde cualquier lugar. Perfecto para mantener la rutina de alimentación incluso cuando no estás en casa.',
    price: 44990,
    currency: 'CLP',
    stock: 7,
    category: 'Productos para mascotas > Alimentación',
    mpn: 'PETMAT-CAW-001',
    images: [
      '/assets/products/p3/portada-profesional.png',
      '/assets/products/p3/camara-wifi-hd-2.png',
      '/assets/products/p3/una-porción-hd.png',
      '/assets/products/p3/accesorios-hd.png',
      '/assets/products/p3/wifi-hd.png',
      '/assets/products/p3/medidas-hd-2.png'
    ]
  }
];

function formatPriceForGoogle(price, currency) {
  return `${Number(price).toFixed(2)} ${currency}`;
}

function buildProductUrls(product) {
  return {
    link: `${FRONTEND_BASE_URL}/producto/${product.slug}`,
    image_link: `${FRONTEND_BASE_URL}${product.images[0]}`,
    additional_image_link: product.images.slice(1).map((img) => `${FRONTEND_BASE_URL}${img}`)
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
    brand: 'PetMAT',
    price: {
      value: Number(product.price).toFixed(2),
      currency: product.currency
    },
    price_feed: formatPriceForGoogle(product.price, product.currency),
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

function buildItemsSummary(items = []) {
  if (!items.length) {
    return 'Sin productos';
  }

  return items
    .map((item) => `- ${item.title} x${item.quantity} (${formatCurrency(item.unit_price)})`)
    .join('\n');
}

async function sendEmailJsTemplate(templateId, templateParams, logLabel) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !publicKey || !privateKey || !templateId) {
    console.warn(`⚠️ EmailJS incompleto para ${logLabel}, envío omitido`);
    return;
  }

  await emailjs.send(serviceId, templateId, templateParams, {
    publicKey,
    privateKey
  });
}

// Middleware - CORS configurado para petmat.cl y variantes
const allowedOrigins = [
  'https://petmat.cl',
  'https://www.petmat.cl',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.includes(allowed.replace(/^https?:\/\//, '')))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

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
app.get('/api/products', (req, res) => {
  const products = PRODUCTS_CATALOG.map((product) => ({
    ...mapToGoogleProduct(product),
    product_slug: product.slug
  }));

  res.json({
    brand: 'PetMAT',
    total: products.length,
    generated_at: new Date().toISOString(),
    products
  });
});

/**
 * Feed de productos para Google (JSON)
 * GET /api/products/google-feed
 */
app.get('/api/products/google-feed', (req, res) => {
  const items = PRODUCTS_CATALOG.map(mapToGoogleProduct);

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
});

/**
 * Feed de productos para Google Merchant (RSS/XML)
 * GET /api/products/google-feed.xml
 */
app.get('/api/products/google-feed.xml', (req, res) => {
  const productItems = PRODUCTS_CATALOG.map((product) => {
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
});

/**
 * Producto individual por ID
 * GET /api/products/:id
 */
app.get('/api/products/:id', (req, res) => {
  const product = PRODUCTS_CATALOG.find((item) => item.id === req.params.id);

  if (!product) {
    return res.status(404).json({
      error: 'Producto no encontrado'
    });
  }

  return res.json(mapToGoogleProduct(product));
});

/**
 * Endpoint para crear preferencia de pago
 * POST /api/create-preference
 */
app.post('/api/create-preference', async (req, res) => {
  try {
    const { items, payer, shipments } = req.body;

    // Validar items
    if (!items || items.length === 0) {
      return res.status(400).json({
        error: 'No se proporcionaron items para el pago'
      });
    }

    // Calcular totales
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = shipments?.cost || 2990;
    const total = subtotal + shippingCost;

    // Generar external_reference único
    const externalReference = `petmat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Crear preferencia de Mercado Pago
    const preferenceData = {
      items: items.map((item, index) => ({
        id: item.id || `item_${index + 1}`,
        title: item.title || item.name,
        description: item.description || 'Producto PetMAT para mascotas',
        picture_url: item.picture_url || `${process.env.FRONTEND_URL}/assets/products/placeholder.png`,
        category_id: 'others',
        quantity: item.quantity,
        currency_id: 'CLP',
        unit_price: parseFloat(item.price)
      })),
      
      // URLs de retorno
      back_urls: {
        success: `${process.env.FRONTEND_URL}/success`,
        failure: `${process.env.FRONTEND_URL}/error`,
        pending: `${process.env.FRONTEND_URL}/success`
      },
      
      auto_return: 'approved',
      
      // Información del pagador
      payer: payer || undefined,
      
      // Datos de envío
      shipments: shipments || {
        cost: shippingCost,
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
      notification_url: `${process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN}/api/webhook`,
      
      // Metadata (para recuperar en el webhook)
      metadata: {
        platform: 'petmat-web',
        items_count: items.reduce((sum, item) => sum + item.quantity, 0),
        customer_email: payer?.email || '',
        customer_name: payer?.name || '',
        customer_phone: payer?.phone?.number || '',
        shipping_address: payer?.address?.street_name || '',
        subtotal: subtotal,
        shipping_cost: shippingCost,
        total: total
      }
    };

    console.log('📦 Creando preferencia de pago para:', payer?.email || 'sin email');

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Preferencia creada:', response.id);

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      external_reference: externalReference
    });

  } catch (error) {
    console.error('❌ Error al crear preferencia:', error);
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
      
      const orderData = {
        paymentId: paymentInfo.id,
        orderNumber: paymentInfo.external_reference || `MP-${paymentInfo.id}`,
        customerName: metadata.customer_name || 'Cliente',
        email: metadata.customer_email || paymentInfo.payer?.email || '',
        phone: metadata.customer_phone || '',
        items: paymentInfo.additional_info?.items || [],
        subtotal: metadata.subtotal || 0,
        shippingCost: metadata.shipping_cost || 0,
        total: paymentInfo.transaction_amount,
        shippingAddress: {
          street: metadata.shipping_address || '',
          city: metadata.shipping_city || '',
          region: metadata.shipping_region || ''
        }
      };

      // Validar email del cliente
      if (!orderData.email) {
        console.warn('⚠️ No se encontró email del cliente');
        return;
      }

      // Email del administrador
      const adminEmail = process.env.ADMIN_EMAIL || 'da.morande@gmail.com';
      const customerTemplateId = process.env.EMAILJS_TEMPLATE_ID_CUSTOMER;
      const adminTemplateId = process.env.EMAILJS_TEMPLATE_ID_ADMIN;
      const fromName = process.env.EMAILJS_FROM_NAME || 'PetMAT';
      const itemsSummary = buildItemsSummary(orderData.items);

      const customerParams = {
        to_email: orderData.email,
        to_name: orderData.customerName,
        from_name: fromName,
        order_number: orderData.orderNumber,
        payment_id: orderData.paymentId,
        customer_name: orderData.customerName,
        customer_email: orderData.email,
        customer_phone: orderData.phone,
        shipping_address: `${orderData.shippingAddress.street}, ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}`,
        items_summary: itemsSummary,
        subtotal: formatCurrency(orderData.subtotal),
        shipping_cost: formatCurrency(orderData.shippingCost),
        total: formatCurrency(orderData.total)
      };

      const adminParams = {
        to_email: adminEmail,
        to_name: 'Admin PetMAT',
        from_name: fromName,
        order_number: orderData.orderNumber,
        payment_id: orderData.paymentId,
        customer_name: orderData.customerName,
        customer_email: orderData.email,
        customer_phone: orderData.phone,
        shipping_address: `${orderData.shippingAddress.street}, ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}`,
        items_summary: itemsSummary,
        subtotal: formatCurrency(orderData.subtotal),
        shipping_cost: formatCurrency(orderData.shippingCost),
        total: formatCurrency(orderData.total)
      };

      try {
        await sendEmailJsTemplate(customerTemplateId, customerParams, 'cliente');
        console.log('✅ EmailJS enviado al cliente:', orderData.email);
      } catch (emailError) {
        console.error('❌ Error EmailJS cliente:', emailError);
      }

      try {
        await sendEmailJsTemplate(adminTemplateId, adminParams, 'admin');
        console.log('✅ EmailJS enviado al admin:', adminEmail);
      } catch (emailError) {
        console.error('❌ Error EmailJS admin:', emailError);
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
  📧 EmailJS configurado: ${process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY ? '✅' : '❌'}
  `);
});

export default app;
