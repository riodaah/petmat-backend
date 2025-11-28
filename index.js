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
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Configurar Resend para envío de emails
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
 * Endpoint para crear preferencia de pago
 * POST /api/checkout
 */
app.post('/api/checkout', async (req, res) => {
  try {
    const { cart, customer, shipping } = req.body;

    // Validar datos requeridos
    if (!cart || cart.length === 0) {
      return res.status(400).json({
        error: 'El carrito está vacío'
      });
    }

    if (!customer || !customer.name || !customer.email) {
      return res.status(400).json({
        error: 'Faltan datos del cliente'
      });
    }

    // Calcular totales
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = shipping?.cost || 2990;
    const total = subtotal + shippingCost;

    // Generar external_reference único
    const externalReference = `petmat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Crear preferencia de Mercado Pago
    const preferenceData = {
      items: cart.map((item, index) => ({
        id: item.id || `item_${index + 1}`,
        title: item.name,
        description: item.short || item.name,
        picture_url: item.images?.[0] ? `${process.env.FRONTEND_URL}${item.images[0]}` : undefined,
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
      payer: {
        name: customer.name.split(' ')[0] || customer.name,
        surname: customer.name.split(' ').slice(1).join(' ') || '',
        email: customer.email,
        phone: {
          area_code: '56',
          number: String(customer.phone).replace(/[^0-9]/g, '')
        },
        address: {
          street_name: customer.address || '',
          city_name: customer.city || 'Santiago',
          state_name: customer.region || 'Región Metropolitana',
          zip_code: ''
        }
      },
      
      // Datos de envío
      shipments: {
        cost: shippingCost,
        mode: 'not_specified',
        receiver_address: {
          street_name: customer.address || '',
          city_name: customer.city || 'Santiago',
          state_name: customer.region || 'Región Metropolitana'
        }
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
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: customer.address,
        shipping_city: customer.city,
        shipping_region: customer.region,
        items_count: cart.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: subtotal,
        shipping_cost: shippingCost,
        total: total
      }
    };

    console.log('📦 Creando preferencia de pago para:', customer.email);

    const response = await preference.create({ body: preferenceData });

    console.log('✅ Preferencia creada:', response.id);

    res.json({
      preferenceId: response.id,
      initPoint: response.init_point,
      externalReference: externalReference
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

      // 1. Enviar email al cliente
      if (process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: 'PetMAT <onboarding@resend.dev>',
            to: orderData.email,
            subject: `✅ Confirmación de compra #${orderData.orderNumber}`,
            html: generateCustomerEmail(orderData)
          });
          console.log('✅ Email enviado al cliente:', orderData.email);
        } catch (emailError) {
          console.error('❌ Error al enviar email al cliente:', emailError);
        }

        // 2. Enviar email al administrador
        try {
          await resend.emails.send({
            from: 'PetMAT Notificaciones <onboarding@resend.dev>',
            to: adminEmail,
            subject: `🔔 Nueva orden #${orderData.orderNumber}`,
            html: generateAdminEmail(orderData)
          });
          console.log('✅ Email enviado al admin:', adminEmail);
        } catch (emailError) {
          console.error('❌ Error al enviar email al admin:', emailError);
        }
      } else {
        console.warn('⚠️ RESEND_API_KEY no configurado, emails desactivados');
      }

    } else {
      console.log(`⏳ Pago con estado "${paymentInfo.status}"`);
    }

  } catch (error) {
    console.error('❌ Error al procesar notificación:', error);
    throw error;
  }
}

/**
 * Generar HTML del email al cliente
 */
function generateCustomerEmail(orderData) {
  const itemsList = orderData.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.unit_price?.toLocaleString('es-CL')}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #6CC5E9; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">¡Gracias por tu compra! 🐾</h1>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <p>Hola <strong>${orderData.customerName}</strong>,</p>
          
          <p>¡Tu pedido ha sido confirmado exitosamente!</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #6CC5E9; margin-top: 0;">Orden #${orderData.orderNumber}</h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 10px; text-align: left;">Producto</th>
                  <th style="padding: 10px; text-align: center;">Cantidad</th>
                  <th style="padding: 10px; text-align: right;">Precio</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList}
                <tr>
                  <td colspan="2" style="padding: 10px; text-align: right;"><strong>Subtotal:</strong></td>
                  <td style="padding: 10px; text-align: right;">$${orderData.subtotal?.toLocaleString('es-CL')}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding: 10px; text-align: right;"><strong>Envío:</strong></td>
                  <td style="padding: 10px; text-align: right;">$${orderData.shippingCost?.toLocaleString('es-CL')}</td>
                </tr>
                <tr style="background: #f5f5f5;">
                  <td colspan="2" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                  <td style="padding: 10px; text-align: right;"><strong>$${orderData.total?.toLocaleString('es-CL')}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #6CC5E9; margin-top: 0;">📦 Dirección de envío</h3>
            <p>
              ${orderData.shippingAddress.street}<br>
              ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Tu pedido será procesado en 2-5 días hábiles y te contactaremos para coordinar el despacho.
          </p>
          
          <p style="color: #666; font-size: 14px;">
            Si tienes alguna pregunta, contáctanos en <a href="mailto:info@petmat.cl" style="color: #6CC5E9;">info@petmat.cl</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generar HTML del email al administrador
 */
function generateAdminEmail(orderData) {
  const itemsList = orderData.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.unit_price?.toLocaleString('es-CL')}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #333; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">🔔 Nueva Orden - PetMAT</h1>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #6CC5E9;">Orden #${orderData.orderNumber}</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">👤 Cliente</h3>
            <p>
              <strong>Nombre:</strong> ${orderData.customerName}<br>
              <strong>Email:</strong> ${orderData.email}<br>
              <strong>Teléfono:</strong> ${orderData.phone}
            </p>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">📦 Productos</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 10px; text-align: left;">Producto</th>
                  <th style="padding: 10px; text-align: center;">Cantidad</th>
                  <th style="padding: 10px; text-align: right;">Precio</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList}
                <tr style="background: #f5f5f5;">
                  <td colspan="2" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                  <td style="padding: 10px; text-align: right;"><strong>$${orderData.total?.toLocaleString('es-CL')}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">🚚 Dirección de envío</h3>
            <p>
              ${orderData.shippingAddress.street}<br>
              ${orderData.shippingAddress.city}, ${orderData.shippingAddress.region}
            </p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
            <p style="margin: 0;"><strong>ID de Pago MP:</strong> ${orderData.paymentId}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
  🐾 PetMAT Backend Server v2.0
  🚀 Servidor corriendo en puerto ${PORT}
  🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}
  💳 Mercado Pago configurado: ${process.env.MP_ACCESS_TOKEN ? '✅' : '❌'}
  📧 Resend configurado: ${process.env.RESEND_API_KEY ? '✅' : '❌'}
  `);
});

export default app;
