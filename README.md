# 🐾 PetMAT Backend - Railway

Backend API para PetMAT Ecommerce con integración segura de Mercado Pago.

**Modelo copiado de Astrochoc** (probado y funcionando en producción).

## 🔒 Seguridad

✅ **El Access Token NUNCA se expone al frontend**  
✅ Solo el backend tiene acceso a las credenciales de Mercado Pago  
✅ CORS configurado solo para petmat.cl  

## 🚀 Características

- ✅ **Sin base de datos** - Simple y eficiente
- ✅ **Mercado Pago** - Crear preferencias de pago
- ✅ **Webhooks** - Recibir notificaciones de pago
- ✅ **Emails automáticos** - Con Resend (opcional)
- ✅ **Deploy en Railway** - Gratis

## 📁 Estructura

```
petmat-backend/
├── src/
│   └── index.js          # Todo el servidor
├── package.json
└── README.md
```

## 🛠️ Instalación Local

```bash
# Instalar dependencias
npm install

# Crear archivo .env
# (ver sección Variables de Entorno)

# Iniciar servidor
npm run dev
```

## 🔑 Variables de Entorno

```env
# Puerto
PORT=3001

# Mercado Pago (OBLIGATORIO)
MP_ACCESS_TOKEN=APP_USR-tu_access_token_aqui

# Frontend URL (OBLIGATORIO)
FRONTEND_URL=https://petmat.cl

# Backend URL (para webhooks)
BACKEND_URL=https://tu-url-railway.up.railway.app

# Emails con Resend (OPCIONAL)
RESEND_API_KEY=re_tu_api_key
ADMIN_EMAIL=da.morande@gmail.com
```

## 🚂 Deploy en Railway

### Paso 1: Conectar GitHub

1. Ve a [Railway.app](https://railway.app/)
2. **New Project** → **Deploy from GitHub**
3. Selecciona: `riodaah/petmat-backend`

### Paso 2: Configurar Variables

En Railway → Variables, agrega:

```
PORT=3001
MP_ACCESS_TOKEN=tu_access_token
FRONTEND_URL=https://petmat.cl
```

### Paso 3: Generar Dominio

1. Settings → Networking → Generate Domain
2. Copia la URL (ej: `https://petmat-backend-xxx.up.railway.app`)

### Paso 4: Actualizar AWS Amplify

En Amplify → Variables de entorno:

```
VITE_BACKEND_URL=https://tu-url-railway.up.railway.app
```

## 📡 Endpoints

### `POST /api/create-preference`

Crea una preferencia de pago en Mercado Pago.

```json
{
  "items": [
    {
      "id": "p1",
      "title": "Alfombra Olfativa",
      "price": 26990,
      "quantity": 1
    }
  ],
  "payer": {
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "phone": { "number": "912345678" },
    "address": { "street_name": "Av. Principal 123" }
  },
  "shipments": {
    "cost": 2990
  }
}
```

**Response:**
```json
{
  "id": "123456789",
  "init_point": "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...",
  "sandbox_init_point": "https://sandbox.mercadopago.cl/..."
}
```

### `POST /api/webhook`

Recibe notificaciones de Mercado Pago cuando un pago es aprobado.

### `GET /health`

Health check del servidor.

## 💰 Costos

**Railway (Gratis):**
- ✅ 500 horas/mes gratis
- ✅ Más que suficiente para empezar
- ✅ Sin base de datos = Sin costo extra

## 🐛 Troubleshooting

### Error: "CORS blocked"
- Verifica `FRONTEND_URL=https://petmat.cl` (sin "/" al final)

### Error: "Unauthorized"
- Verifica que `MP_ACCESS_TOKEN` sea el Access Token (no la Public Key)

### Error: "Backend not found"
- Verifica que Railway esté corriendo
- Verifica `VITE_BACKEND_URL` en Amplify

## 📝 Diferencias con Astrochoc

| Característica | Astrochoc | PetMAT |
|----------------|-----------|--------|
| Producto | Chocolates + Tarot | Accesorios mascotas |
| Envío | Incluido | $2.990 - $3.990 |
| Emails | Resend | Resend (opcional) |
| Base de datos | ❌ No | ❌ No |

## 📞 Contacto

- **Email:** da.morande@gmail.com
- **Web:** petmat.cl

---

**Última actualización:** Noviembre 2025
