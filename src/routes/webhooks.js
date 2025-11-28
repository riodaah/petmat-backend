import express from 'express';
import { getPayment, verifyWebhookSignature } from '../services/mercadopago.js';
import { updateOrderStatus, getOrderByReference } from '../services/database.js';

const router = express.Router();

/**
 * POST /api/webhooks/mercadopago
 * Recibe notificaciones de Mercado Pago sobre cambios en los pagos
 */
router.post('/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    console.log('🔔 Webhook recibido de Mercado Pago:', {
      type,
      id: data?.id,
      timestamp: new Date().toISOString()
    });

    // Verificar firma del webhook (mejores prácticas de seguridad)
    const isValid = verifyWebhookSignature(req.headers, req.body);
    
    if (!isValid) {
      console.warn('⚠️  Firma de webhook inválida');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Responder rápidamente (Mercado Pago espera respuesta en <5 segundos)
    res.status(200).send('OK');

    // Procesar el webhook de forma asíncrona
    processWebhook(type, data).catch(err => {
      console.error('❌ Error procesando webhook:', err);
    });

  } catch (error) {
    console.error('❌ Error en webhook:', error);
    res.status(500).json({
      error: 'Error procesando webhook'
    });
  }
});

/**
 * Procesa el webhook de forma asíncrona
 */
async function processWebhook(type, data) {
  try {
    // Solo procesar notificaciones de pagos
    if (type !== 'payment') {
      console.log('ℹ️  Webhook ignorado (tipo no es payment):', type);
      return;
    }

    const paymentId = data.id;
    
    if (!paymentId) {
      console.warn('⚠️  Webhook sin payment ID');
      return;
    }

    // Obtener información del pago desde Mercado Pago
    const payment = await getPayment(paymentId);

    console.log('💳 Información del pago:', {
      id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference
    });

    // Actualizar orden en la base de datos
    if (payment.external_reference) {
      const order = await updateOrderStatus(
        payment.external_reference,
        payment.status,
        payment.id
      );

      console.log('✅ Orden actualizada por webhook:', {
        orderId: order.id,
        paymentStatus: payment.status
      });

      // TODO: Enviar email de confirmación al cliente si el pago fue aprobado
      if (payment.status === 'approved') {
        console.log('📧 TODO: Enviar email de confirmación a', order.customer_email);
        // Aquí puedes integrar EmailJS o similar
      }
    }

  } catch (error) {
    console.error('❌ Error en processWebhook:', error);
    throw error;
  }
}

/**
 * GET /api/webhooks/test
 * Endpoint de prueba para verificar que los webhooks funcionan
 */
router.get('/webhooks/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString()
  });
});

export default router;


