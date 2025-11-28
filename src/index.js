/**
 * Backend para PetMAT - Integración con Mercado Pago
 * Modelo copiado de Astrochoc (probado y funcionando)
 * 
 * SEGURIDAD: El Access Token NUNCA se expone al frontend
 */

import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Configurar Resend para envío de emails
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware CORS - Solo permitir el frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://petmat.cl',
  credentials: true
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

    // Calcular total
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = shipments?.cost || 2990;

    // Crear preferencia de Mercado Pago
    const preferenceData = {
      items: items.map(item => ({
        id: item.id || 'petmat-product',
        title: item.title || item.name,
        description: item.description || 'Producto PetMAT para mascotas',
        picture_url: item.picture_url || `${process.env.FRONTEND_URL}/assets/logo-square.png`,
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
      shipments: {
        cost: shippingCost,
        mode: 'not_specified'
      },
      
      // Configuraciones adicionales
      statement_descriptor: 'PETMAT',
      external_reference: `petmat-${Date.now()}`,
      
      // Métodos de pago
      payment_methods: {
        excluded_payment_types: [],
        installments: 12,
        default_installments: 1
      },
      
      // Notificación webhook
      notification_url: `${process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN}/api/webhook`,
      
      // Metadata para el webhook
      metadata: {
        platform: 'petmat-web',
        items_count: items.reduce((sum, item) => sum + item.quantity, 0),
        customer_email: payer?.email || '',
        customer_name: payer?.name || '',
        customer_phone: payer?.phone?.number || '',
        shipping_address: payer?.address?.street_name || '',
        shipping_city: payer?.address?.city_name || '',
        shipping_region: payer?.address?.state_name || '',
        total: total + shippingCost
      }
    };

    console.log('📦 Creando preferencia de pago PetMAT...');

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Preferencia creada:', response.id);

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point
    });

  } catch (error) {
    console.error('❌ Error al crear preferencia:', error.message);
    res.status(500).json({
      error: 'Error al crear la preferencia de pago'
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

    // Responder rápidamente a Mercado Pago
    res.status(200).send('OK');

    // Procesar la notificación de forma asíncrona
    if (type === 'payment') {
      const paymentId = data.id;
      console.log('💳 Procesando pago:', paymentId);
      
      processPaymentNotification(paymentId).catch(err => {
        console.error('❌ Error al procesar pago:', err.message);
      });
    }

  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
    res.status(500).send('Error');
  }
});

/**
 * Procesar notificación de pago y enviar emails
 */
async function processPaymentNotification(paymentId) {
  try {
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: paymentId });

    if (paymentInfo.status === 'approved') {
      console.log('✅ Pago aprobado, preparando emails...');

      const metadata = paymentInfo.metadata || {};
      
      const orderData = {
        paymentId: paymentInfo.id,
        orderNumber: paymentInfo.external_reference || `MP-${paymentInfo.id}`,
        customerName: metadata.customer_name || 
          (paymentInfo.payer?.first_name 
            ? `${paymentInfo.payer.first_name} ${paymentInfo.payer.last_name || ''}`
            : 'Cliente'),
        email: metadata.customer_email || paymentInfo.payer?.email || '',
        phone: metadata.customer_phone || paymentInfo.payer?.phone?.number || '',
        items: paymentInfo.additional_info?.items || [],
        total: paymentInfo.transaction_amount,
        shippingAddress: {
          street: metadata.shipping_address || 'Dirección no especificada',
          city: metadata.shipping_city || '',
          region: metadata.shipping_region || '',
        },
      };

      // Validar email
      if (!orderData.email) {
        console.warn('⚠️ No se encontró email del cliente');
        return;
      }

      const adminEmail = process.env.ADMIN_EMAIL;

      // 1. Email al cliente
      if (process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: 'PetMAT <onboarding@resend.dev>',
            to: orderData.email,
            subject: `✅ ¡Gracias por tu compra en PetMAT! - Orden #${orderData.orderNumber}`,
            html: generateCustomerEmail(orderData),
          });
          console.log('✅ Email enviado al cliente:', orderData.email);
        } catch (emailError) {
          console.error('❌ Error enviando email al cliente:', emailError.message);
        }

        // 2. Email al administrador
        if (adminEmail) {
          try {
            await resend.emails.send({
              from: 'PetMAT Notificaciones <onboarding@resend.dev>',
              to: adminEmail,
              subject: `🛒 Nueva venta PetMAT - Orden #${orderData.orderNumber}`,
              html: generateAdminEmail(orderData),
            });
            console.log('✅ Email enviado al admin:', adminEmail);
          } catch (emailError) {
            console.error('❌ Error enviando email al admin:', emailError.message);
          }
        }
      } else {
        console.warn('⚠️ RESEND_API_KEY no configurado, emails deshabilitados');
      }

    } else {
      console.log(`⏳ Pago con estado: ${paymentInfo.status}`);
    }

  } catch (error) {
    console.error('❌ Error procesando notificación:', error.message);
    throw error;
  }
}

/**
 * Generar email para el cliente
 */
function generateCustomerEmail(order) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #6CC5E9; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .order-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🐾 ¡Gracias por tu compra!</h1>
        </div>
        <div class="content">
          <p>Hola <strong>${order.customerName}</strong>,</p>
          <p>Tu pedido ha sido confirmado y lo estamos preparando con mucho cariño para tu mascota.</p>
          
          <div class="order-info">
            <h3>📦 Detalles del pedido</h3>
            <p><strong>Número de orden:</strong> ${order.orderNumber}</p>
            <p><strong>Total:</strong> $${order.total.toLocaleString('es-CL')}</p>
            <p><strong>Dirección de envío:</strong><br>
              ${order.shippingAddress.street}<br>
              ${order.shippingAddress.city}, ${order.shippingAddress.region}
            </p>
          </div>
          
          <p>Te enviaremos un email cuando tu pedido sea despachado.</p>
          <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
          
          <p>¡Gracias por confiar en PetMAT! 🐕</p>
        </div>
        <div class="footer">
          <p>PetMAT - Accesorios para mascotas felices</p>
          <p>info@petmat.cl | @petmatcl</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generar email para el administrador
 */
function generateAdminEmail(order) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .info-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛒 Nueva Venta PetMAT</h1>
        </div>
        <div class="content">
          <div class="info-box">
            <h3>📋 Información del pedido</h3>
            <p><strong>Orden:</strong> ${order.orderNumber}</p>
            <p><strong>ID Pago MP:</strong> ${order.paymentId}</p>
            <p><strong>Total:</strong> $${order.total.toLocaleString('es-CL')}</p>
          </div>
          
          <div class="info-box">
            <h3>👤 Cliente</h3>
            <p><strong>Nombre:</strong> ${order.customerName}</p>
            <p><strong>Email:</strong> ${order.email}</p>
            <p><strong>Teléfono:</strong> ${order.phone || 'No especificado'}</p>
          </div>
          
          <div class="info-box">
            <h3>📦 Envío</h3>
            <p>${order.shippingAddress.street}</p>
            <p>${order.shippingAddress.city}, ${order.shippingAddress.region}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'petmat-backend',
    timestamp: new Date().toISOString()
  });
});

// También responder en la raíz
app.get('/', (req, res) => {
  res.json({
    message: '🐾 PetMAT Backend API',
    status: 'running',
    endpoints: [
      'POST /api/create-preference',
      'POST /api/webhook',
      'GET /health'
    ]
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
  🐾 PetMAT Backend Server
  🚀 Puerto: ${PORT}
  🌐 Frontend: ${process.env.FRONTEND_URL || 'https://petmat.cl'}
  💳 Mercado Pago: ${process.env.MP_ACCESS_TOKEN ? '✅ Configurado' : '❌ Falta ACCESS_TOKEN'}
  📧 Resend: ${process.env.RESEND_API_KEY ? '✅ Configurado' : '⚠️ No configurado'}
  `);
});

export default app;
