import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Crear pool de conexiones
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Test de conexión
pool.on('connect', () => {
  console.log('🗄️  Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error en PostgreSQL:', err);
});

/**
 * Inicializa la base de datos creando las tablas necesarias
 */
export async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        external_reference VARCHAR(255) UNIQUE NOT NULL,
        preference_id VARCHAR(255),
        
        -- Datos del cliente
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        customer_address TEXT,
        customer_city VARCHAR(100),
        customer_region VARCHAR(100),
        
        -- Datos del pedido
        items JSONB NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        shipping_cost DECIMAL(10, 2) NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        
        -- Estado
        status VARCHAR(50) DEFAULT 'pending',
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_id VARCHAR(255),
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para mejorar performance
      CREATE INDEX IF NOT EXISTS idx_external_reference ON orders(external_reference);
      CREATE INDEX IF NOT EXISTS idx_preference_id ON orders(preference_id);
      CREATE INDEX IF NOT EXISTS idx_payment_status ON orders(payment_status);
      CREATE INDEX IF NOT EXISTS idx_created_at ON orders(created_at);
    `);

    console.log('✅ Base de datos inicializada');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Crea una nueva orden en la base de datos
 */
export async function createOrder(orderData) {
  const client = await pool.connect();
  
  try {
    const {
      externalReference,
      preferenceId,
      customer,
      items,
      subtotal,
      shippingCost,
      total
    } = orderData;

    const result = await client.query(`
      INSERT INTO orders (
        external_reference,
        preference_id,
        customer_name,
        customer_email,
        customer_phone,
        customer_address,
        customer_city,
        customer_region,
        items,
        subtotal,
        shipping_cost,
        total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      externalReference,
      preferenceId,
      customer.name,
      customer.email,
      customer.phone || '',
      customer.address || '',
      customer.city || '',
      customer.region || '',
      JSON.stringify(items),
      subtotal,
      shippingCost,
      total
    ]);

    console.log('✅ Orden creada en DB:', result.rows[0].id);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error creando orden:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Actualiza el estado de una orden
 */
export async function updateOrderStatus(externalReference, paymentStatus, paymentId = null) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      UPDATE orders
      SET 
        payment_status = $1,
        payment_id = $2,
        status = CASE 
          WHEN $1 = 'approved' THEN 'confirmed'
          WHEN $1 = 'rejected' THEN 'cancelled'
          ELSE 'pending'
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE external_reference = $3
      RETURNING *
    `, [paymentStatus, paymentId, externalReference]);

    if (result.rows.length === 0) {
      throw new Error(`Orden no encontrada: ${externalReference}`);
    }

    console.log('✅ Orden actualizada:', result.rows[0].id);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error actualizando orden:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Obtiene una orden por external_reference
 */
export async function getOrderByReference(externalReference) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM orders WHERE external_reference = $1',
      [externalReference]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error obteniendo orden:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Obtiene todas las órdenes (para admin)
 */
export async function getAllOrders(limit = 100, offset = 0) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  } catch (error) {
    console.error('❌ Error obteniendo órdenes:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Inicializar la base de datos al cargar el módulo
initializeDatabase().catch(console.error);

export default pool;


