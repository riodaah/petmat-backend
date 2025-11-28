# 🐾 PetMAT Backend v2.0

Backend simplificado para PetMAT - Integración segura con Mercado Pago.

**Arquitectura basada en Astrochoc:** Simple, sin base de datos, 100% seguro.

---

## ✨ Características

- ✅ **Sin base de datos** - Las órdenes se procesan via webhooks de Mercado Pago
- ✅ **Access Token protegido** - Nunca se expone en el frontend
- ✅ **Emails automáticos** - Con Resend (cliente + admin)
- ✅ **Webhooks de MP** - Notificaciones en tiempo real
- ✅ **Deploy en Railway** - Gratis y fácil

---

## 🚀 Diferencias vs v1.0

| Característica | v1.0 (Complejo) | v2.0 (Simple) |
|----------------|-----------------|---------------|
| Base de datos | PostgreSQL ❌ | Sin DB ✅ |
| Dependencias | 5 paquetes | 5 paquetes |
| Líneas de código | ~800 | ~400 |
| Emails | EmailJS (manual) | Resend (auto) |
| Complejidad | Alta | Baja |

---

## 📦 Instalación Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Iniciar servidor
npm run dev
```

---

## 🔐 Variables de Entorno

Crea un archivo `.env`:

```env
# Mercado Pago (OBLIGATORIO)
MP_ACCESS_TOKEN=APP_USR-tu_access_token_aqui

# Frontend URL (OBLIGATORIO)
FRONTEND_URL=https://petmat.cl

# Backend URL (OPCIONAL - Railway lo crea automáticamente)
BACKEND_URL=https://petmat-backend-production.up.railway.app

# Resend (OPCIONAL - para emails automáticos)
RESEND_API_KEY=re_tu_api_key_aqui

# Email del administrador (OPCIONAL)
ADMIN_EMAIL=da.morande@gmail.com

# Puerto (OPCIONAL - Railway lo asigna automáticamente)
PORT=3000
```

---

## 🚂 Deploy en Railway

### **Paso 1: Push a GitHub**

```bash
git add .
git commit -m "Backend v2.0 - Simplificado como Astrochoc"
git push origin main
```

### **Paso 2: Crear proyecto en Railway**

1. Ve a [Railway.app](https://railway.app/)
2. **"New Project"** → **"Deploy from GitHub"**
3. Selecciona: `riodaah/petmat-backend`
4. Railway detectará automáticamente el proyecto Node.js

### **Paso 3: Configurar Variables**

En Railway → **"Variables"** → **"Raw Editor"**:

```env
MP_ACCESS_TOKEN=APP_USR-tu_access_token_completo
FRONTEND_URL=https://petmat.cl
RESEND_API_KEY=re_tu_api_key
ADMIN_EMAIL=da.morande@gmail.com
```

### **Paso 4: Generar Dominio**

1. Railway → Tu servicio → **"Settings"**
2. **"Networking"** → **"Generate Domain"**
3. Copia la URL (ej: `https://petmat-backend-production.up.railway.app`)

### **Paso 5: Actualizar Frontend (AWS Amplify)**

1. AWS Amplify → **"Environment variables"**
2. Agrega/actualiza:
   ```
   VITE_BACKEND_URL = https://tu-url-de-railway.up.railway.app
   ```
3. Guarda y espera el redeploy

---

## 📡 Endpoints

### `GET /health`
Health check del servidor.

**Response:**
```json
{
  "status": "ok",
  "service": "petmat-backend",
  "version": "2.0.0",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

---

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
      "quantity": 1,
      "short": "Alfombra para estimular el olfato",
      "images": ["/assets/products/p1/foto-principal.png"]
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
  "initPoint": "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...",
  "externalReference": "petmat_1234567890_abc123"
}
```

---

### `POST /api/webhook`
Recibe notificaciones de Mercado Pago.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "type": "payment",
  "data": {
    "id": "1234567890"
  }
}
```

**Response:**
```
OK
```

---

## 🔒 Seguridad

### ✅ Lo que hacemos bien

1. **Access Token solo en backend** - Nunca se expone
2. **CORS configurado** - Solo petmat.cl puede llamar
3. **Webhooks seguros** - Procesamiento asíncrono
4. **Metadata completa** - Toda la info del cliente

### ⚠️ Lo que NO hacemos (por simplicidad)

1. **No validamos firma del webhook** - Para v2.0 es aceptable
2. **No persistimos órdenes** - Mercado Pago las guarda
3. **No tenemos autenticación** - No es necesario (solo webhook de MP)

---

## 📧 Emails Automáticos

Si configuras `RESEND_API_KEY`, el sistema enviará automáticamente:

### **Al Cliente:**
- ✅ Confirmación de compra
- 📦 Detalle de productos
- 🚚 Dirección de envío
- 💰 Total pagado

### **Al Admin:**
- 🔔 Notificación de nueva orden
- 👤 Datos del cliente
- 📦 Productos comprados
- 🚚 Dirección de envío

---

## 💰 Costos

| Servicio | Costo | Incluye |
|----------|-------|---------|
| **Railway** | $0/mes | 500 horas gratis |
| **Resend** | $0/mes | 3,000 emails/mes gratis |
| **Mercado Pago** | 3-5% por transacción | Procesamiento de pagos |
| **TOTAL** | ~$0/mes | Suficiente para 100-200 órdenes/mes |

---

## 🐛 Troubleshooting

### **Error: "MP_ACCESS_TOKEN not configured"**
- Verifica que la variable esté en Railway
- Asegúrate de usar el Access Token (no Public Key)

### **Error: "CORS blocked"**
- Verifica que `FRONTEND_URL` sea exactamente `https://petmat.cl`
- No incluyas "/" al final

### **Emails no llegan**
- Verifica que `RESEND_API_KEY` esté configurado
- Revisa los logs de Railway para errores
- Resend requiere dominio verificado para producción

---

## 📝 Notas

1. **Sin PostgreSQL:** Las órdenes no se guardan en una base de datos. Mercado Pago guarda toda la info y puedes consultarla en su panel.

2. **Resend (Opcional):** Si no configuras Resend, los emails no se enviarán, pero el checkout funcionará perfectamente.

3. **Admin Panel:** Para ver órdenes, usa el panel de Mercado Pago: https://www.mercadopago.cl/activities

---

## 🔄 Migración desde v1.0

Si tenías la v1.0 con PostgreSQL:

```bash
# Eliminar archivos viejos
rm -rf src/routes/ src/services/

# Pull nuevos cambios
git pull origin main

# Reinstalar dependencias
npm install

# Deploy en Railway
# Railway detectará automáticamente los cambios
```

---

## 📞 Soporte

- **Proyecto:** da.morande@gmail.com
- **Railway Docs:** https://docs.railway.app/
- **Mercado Pago Docs:** https://www.mercadopago.cl/developers/
- **Resend Docs:** https://resend.com/docs

---

**Última actualización:** Enero 2025  
**Versión:** 2.0.0  
**Arquitectura:** Frontend (Amplify) + Backend (Railway)  
**Inspirado en:** Astrochoc.cl
