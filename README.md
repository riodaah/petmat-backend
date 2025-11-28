# 🚂 PetMAT Backend - Railway

Backend API para PetMAT Ecommerce con integración segura de Mercado Pago.

## 🚀 Características

- ✅ **API RESTful** para checkout
- ✅ **Integración con Mercado Pago** (creación de preferencias)
- ✅ **Base de datos PostgreSQL** (órdenes persistentes)
- ✅ **Webhooks** de Mercado Pago
- ✅ **CORS** configurado para petmat.cl
- ✅ **Variables de entorno seguras**

## 📁 Estructura

```
petmat-backend/
├── src/
│   ├── index.js              # Servidor principal
│   ├── routes/
│   │   ├── checkout.js       # Endpoint de checkout
│   │   └── webhooks.js       # Webhooks de Mercado Pago
│   ├── services/
│   │   ├── mercadopago.js    # Servicio de MP
│   │   └── database.js       # Servicio de base de datos
│   └── config/
│       └── database.sql      # Schema de la base de datos
├── package.json
├── .env.example
└── README.md
```

## 🛠️ Instalación Local

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales
# Especialmente: MP_ACCESS_TOKEN y DATABASE_URL

# Iniciar servidor en modo desarrollo
npm run dev
```

## 🚂 Deploy en Railway

### Paso 1: Subir a GitHub

```bash
# Inicializar Git
git init

# Agregar archivos
git add .

# Commit inicial
git commit -m "Initial backend setup"

# Crear repo en GitHub y conectar
git remote add origin git@github.com:riodaah/petmat-backend.git
git branch -M main
git push -u origin main
```

### Paso 2: Configurar en Railway

1. Ve a: https://railway.app/
2. Click en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Selecciona el repositorio: **riodaah/petmat-backend**
5. Railway detectará automáticamente que es Node.js

### Paso 3: Agregar PostgreSQL

1. En tu proyecto de Railway, click en **"New"**
2. Selecciona **"Database"** → **"PostgreSQL"**
3. Railway creará automáticamente una base de datos
4. Copia la variable `DATABASE_URL` que Railway genera

### Paso 4: Configurar Variables de Entorno

En Railway, ve a tu servicio → **"Variables"** y agrega:

```
PORT=3000
MP_ACCESS_TOKEN=tu_access_token_de_mercado_pago
FRONTEND_URL=https://petmat.cl
NODE_ENV=production
DATABASE_URL=(se genera automáticamente)
```

### Paso 5: Deploy

Railway hará deploy automáticamente. Obtendrás una URL como:

```
https://petmat-backend-production.up.railway.app
```

## 📡 Endpoints

### `POST /api/checkout`

Crea una preferencia de pago en Mercado Pago.

**Request:**
```json
{
  "cart": [
    {
      "id": "p1",
      "name": "Alfombra Olfativa",
      "price": 26990,
      "quantity": 1
    }
  ],
  "customer": {
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "phone": "+56912345678",
    "address": "Av. Principal 123",
    "city": "Santiago",
    "region": "Región Metropolitana"
  },
  "shipping": {
    "cost": 2990,
    "region": "RM"
  }
}
```

**Response:**
```json
{
  "preferenceId": "123456789-abc-def",
  "orderId": 42
}
```

### `POST /api/webhooks/mercadopago`

Recibe notificaciones de Mercado Pago.

**Headers:**
```
x-signature: firma_de_mercadopago
x-request-id: id_de_request
```

### `GET /health`

Health check del servidor.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

## 🗄️ Base de Datos

### Schema

```sql
CREATE TABLE orders (
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
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_external_reference ON orders(external_reference);
CREATE INDEX idx_preference_id ON orders(preference_id);
CREATE INDEX idx_payment_status ON orders(payment_status);
CREATE INDEX idx_created_at ON orders(created_at);
```

## 🔒 Seguridad

- ✅ **Access Token** nunca se expone al frontend
- ✅ **CORS** configurado solo para petmat.cl
- ✅ **Variables de entorno** en Railway (no en código)
- ✅ **Validación** de datos en todos los endpoints
- ✅ **Verificación de firma** en webhooks de MP

## 📊 Monitoreo

En Railway puedes ver:
- **Logs en tiempo real** (pestaña "Logs")
- **Métricas de uso** (CPU, RAM, requests)
- **Health checks** automáticos

## 🐛 Debugging

```bash
# Ver logs en Railway
# Ve a tu proyecto → Servicio → Logs

# Ver logs localmente
npm run dev
```

## 📝 Notas

- **Puerto:** Railway asigna automáticamente el puerto (variable `PORT`)
- **Base de datos:** Railway crea automáticamente `DATABASE_URL`
- **SSL:** Railway incluye SSL automáticamente
- **Auto-deploy:** Cada push a `main` despliega automáticamente

## 🆘 Troubleshooting

### Error: "Cannot connect to database"
- Verifica que `DATABASE_URL` esté configurada en Railway
- Asegúrate de que PostgreSQL esté corriendo

### Error: "Mercado Pago preference creation failed"
- Verifica que `MP_ACCESS_TOKEN` sea válido
- Asegúrate de usar credenciales de PRODUCCIÓN (no TEST)

### Error: "CORS blocked"
- Verifica que `FRONTEND_URL` sea exactamente `https://petmat.cl`
- No incluyas "/" al final

## 🔄 Actualizar

```bash
# Hacer cambios en el código
git add .
git commit -m "Update feature"
git push origin main

# Railway desplegará automáticamente
```

## 💰 Costos

Con el tier gratuito de Railway:
- **$5 USD/mes de crédito gratis**
- **PostgreSQL incluido gratis**
- **Suficiente para ~500-1000 órdenes/mes**

## 📞 Soporte

- **Railway Docs:** https://docs.railway.app/
- **Mercado Pago Docs:** https://www.mercadopago.com.ar/developers/
- **Proyecto:** da.morande@gmail.com

---

**Última actualización:** Enero 2025  
**Proyecto:** PetMAT Ecommerce  
**Backend:** Railway


