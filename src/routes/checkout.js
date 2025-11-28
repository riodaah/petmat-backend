import express from 'express';
import { createPreference } from '../services/mercadopago.js';
import { createOrder } from '../services/database.js';

const router = express.Router();

/**
 * POST /api/checkout
 * Crea una preferencia de pago en Mercado Pago y guarda la orden en la base de datos
 */
router.post('/checkout', async (req, res) => {
  try {
    const { cart, customer, shipping } = req.body;

    // Validar datos requeridos
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({
        error: 'El carrito está vacío o no es válido'
      });
    }

    if (!customer || !customer.name || !customer.email) {
      return res.status(400).json({
        error: 'Faltan datos del cliente (nombre y email son requeridos)'
      });
    }

    // Generar external_reference único
    const externalReference = `petmat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calcular totales
    const subtotal = cart.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    const shippingCost = shipping?.cost || 2990;
    const total = subtotal + shippingCost;

    console.log('📦 Nueva solicitud de checkout:', {
      externalReference,
      customer: customer.email,
      items: cart.length,
      total
    });

    // Crear preferencia en Mercado Pago
    const preference = await createPreference({
      cart,
      customer,
      shipping: {
        cost: shippingCost
      },
      externalReference
    });

    // Guardar orden en la base de datos
    const order = await createOrder({
      externalReference,
      preferenceId: preference.id,
      customer,
      items: cart,
      subtotal,
      shippingCost,
      total
    });

    // Responder con la preferencia y el ID de orden
    res.json({
      preferenceId: preference.id,
      initPoint: preference.init_point,
      orderId: order.id,
      externalReference: order.external_reference
    });

  } catch (error) {
    console.error('❌ Error en checkout:', error);
    res.status(500).json({
      error: 'Error al procesar el checkout',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/:id
 * Obtiene una orden por ID (para el admin o el cliente)
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // TODO: Agregar autenticación/autorización
    
    const order = await getOrderByReference(id);
    
    if (!order) {
      return res.status(404).json({
        error: 'Orden no encontrada'
      });
    }
    
    res.json(order);
  } catch (error) {
    console.error('❌ Error obteniendo orden:', error);
    res.status(500).json({
      error: 'Error al obtener la orden',
      message: error.message
    });
  }
});

export default router;


