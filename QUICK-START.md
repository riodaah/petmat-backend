# ⚡ Quick Start - PetMAT Backend en Railway

Esta es la guía más rápida para desplegar el backend. Para más detalles, ve a `RAILWAY-DEPLOY-GUIDE.md`.

---

## 🚀 **3 Pasos Simples**

### **1️⃣ Subir a GitHub (2 minutos)**

```bash
cd petmat-backend
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/riodaah/petmat-backend.git
git push -u origin main
```

---

### **2️⃣ Deploy en Railway (3 minutos)**

1. Ve a https://railway.app/
2. **"New Project"** → **"Deploy from GitHub"**
3. Selecciona `petmat-backend`
4. Agrega **PostgreSQL**: Click en **"+"** → **"Database"** → **"PostgreSQL"**
5. Agrega **variables** (en el servicio → **"Variables"** → **"Raw Editor"**):

```env
PORT=3000
MP_ACCESS_TOKEN=tu_access_token_aqui
FRONTEND_URL=https://petmat.cl
NODE_ENV=production
```

6. **"Settings"** → **"Networking"** → **"Generate Domain"**
7. Copia tu URL: `https://xxx.up.railway.app`

---

### **3️⃣ Configurar Frontend (2 minutos)**

1. Ve a https://console.aws.amazon.com/amplify/
2. Tu app → **"Environment variables"** → **"Manage"**
3. Agrega:
   ```
   VITE_BACKEND_URL = https://xxx.up.railway.app
   ```
4. **"Save"**
5. Haz commit del frontend:
   ```bash
   cd petmat-ecommerce
   git add .
   git commit -m "Connect to Railway backend"
   git push
   ```

---

## ✅ **Verificar**

1. **Backend:** https://xxx.up.railway.app/health  
   Debería responder: `{"status":"ok"}`

2. **Frontend:** https://petmat.cl  
   Prueba el checkout → Debería abrir Mercado Pago

3. **Base de datos:** Railway → PostgreSQL → Data  
   Verás la tabla `orders` con tus órdenes

---

## 🎉 **¡Listo!**

**Ahora tienes:**
- ✅ Backend seguro en Railway
- ✅ PostgreSQL con órdenes
- ✅ Access Token protegido
- ✅ Frontend conectado

---

## 🆘 **Problemas?**

- **Backend no responde:** Ve a Railway → Logs
- **CORS error:** Verifica `FRONTEND_URL=https://petmat.cl` (sin "/")
- **Checkout falla:** Verifica `VITE_BACKEND_URL` en Amplify

---

**Tiempo total: ~7 minutos** ⏱️


