import mercadopago from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

/**
 * Crea una preferencia de pago en Mercado Pago
 * @param {Object} data - Datos del checkout
 * @returns {Promise<Object>} - Preferencia creada
 */
export async function createPreference(data) {
  try {
    const { cart, customer, shipping, externalReference } = data;

    // Calcular totales
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + (shipping?.cost || 0);

    // Crear preferencia según mejores prácticas de Mercado Pago
    const preference = {
      items: cart.map((item, index) => ({
        id: item.id || `item_${index + 1}`,
        title: item.name,
        description: item.short || item.name,
        category_id: 'others',
        quantity: item.quantity,
        unit_price: item.price,
        currency_id: 'CLP'
      })),
      
      payer: {
        name: customer.name.split(' ')[0] || customer.name,
        surname: customer.name.split(' ').slice(1).join(' ') || '',
        email: customer.email,
        phone: {
          area_code: '56',
          number: customer.phone?.replace(/\D/g, '') || ''
        },
        address: {
          street_name: customer.address || '',
          city_name: customer.city || 'Santiago',
          state_name: customer.region || 'Región Metropolitana',
          zip_code: ''
        }
      },

      shipments: {
        cost: shipping?.cost || 2990,
        mode: 'not_specified',
        receiver_address: {
          street_name: customer.address || '',
          city_name: customer.city || 'Santiago',
          state_name: customer.region || 'Región Metropolitana'
        }
      },

      back_urls: {
        success: `${process.env.FRONTEND_URL}/success`,
        failure: `${process.env.FRONTEND_URL}/error`,
        pending: `${process.env.FRONTEND_URL}/success`
      },

      auto_return: 'approved',
      
      external_reference: externalReference,
      
      statement_descriptor: 'PetMAT',
      
      binary_mode: false,
      
      installments: 12,
      
      notification_url: `${process.env.BACKEND_URL || 'https://petmat-backend-production.up.railway.app'}/api/webhooks/mercadopago`,
      
      metadata: {
        customer_email: customer.email,
        customer_phone: customer.phone,
        items_count: cart.length,
        subtotal: subtotal,
        shipping_cost: shipping?.cost || 0,
        total: total
      }
    };

    console.log('📦 Creando preferencia de pago:', {
      external_reference: externalReference,
      total: total,
      items: cart.length
    });

    const response = await mercadopago.preferences.create(preference);

    console.log('✅ Preferencia creada:', {
      id: response.body.id,
      init_point: response.body.init_point
    });

    return {
      id: response.body.id,
      init_point: response.body.init_point,
      sandbox_init_point: response.body.sandbox_init_point
    };

  } catch (error) {
    console.error('❌ Error creando preferencia de Mercado Pago:', error);
    throw new Error(`Error al crear preferencia: ${error.message}`);
  }
}

/**
 * Obtiene información de un pago
 * @param {string} paymentId - ID del pago
 * @returns {Promise<Object>} - Información del pago
 */
export async function getPayment(paymentId) {
  try {
    const payment = await mercadopago.payment.get(paymentId);
    return payment.body;
  } catch (error) {
    console.error('❌ Error obteniendo pago:', error);
    throw new Error(`Error al obtener pago: ${error.message}`);
  }
}

/**
 * Verifica la firma de un webhook de Mercado Pago
 * @param {Object} headers - Headers de la request
 * @param {Object} body - Body de la request
 * @returns {boolean} - True si la firma es válida
 */
export function verifyWebhookSignature(headers, body) {
  // TODO: Implementar verificación de firma según documentación de MP
  // https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/webhooks/signature
  return true;
}


