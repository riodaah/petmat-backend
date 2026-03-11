# ⚡ Quick Start - PetMAT Backend v2.0

## 🚀 **Deploy en 5 Pasos (7 minutos)**

---

### **1️⃣ Push a GitHub** (1 min)

```bash
cd C:\Users\damor\Desktop\petmat-backend
git add .
git commit -m "Backend v2.0 - Simplificado sin PostgreSQL"
git push origin main
```

---

### **2️⃣ Deploy en Railway** (2 min)

1. Ve a https://railway.app/
2. **"New Project"** → **"Deploy from GitHub"**
3. Selecciona: `riodaah/petmat-backend`
4. ✅ Listo, Railway lo despliega automáticamente

---

### **3️⃣ Configurar Variables** (2 min)

En Railway → Tu servicio → **"Variables"** → **"Raw Editor"**:

```env
MP_ACCESS_TOKEN=APP_USR-tu_access_token_completo
FRONTEND_URL=https://petmat.cl
ALLOWED_ORIGINS=https://petmat-8d651.web.app,https://petmat.cl,https://www.petmat.cl
FIREBASE_PROJECT_ID=petmat-8d651
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@petmat-8d651.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_TEMPLATE_ID_CUSTOMER=template_cliente_xxxxx
EMAILJS_TEMPLATE_ID_ADMIN=template_admin_xxxxx
EMAILJS_PUBLIC_KEY=tu_public_key
EMAILJS_PRIVATE_KEY=tu_private_key
EMAILJS_FROM_NAME=PetMAT
ADMIN_EMAIL=da.morande@gmail.com
```

**Click:** "Update Variables"

Luego corre seed inicial (una sola vez):

```bash
npm run seed:products
```

---

### **4️⃣ Generar Dominio** (1 min)

1. Railway → **"Settings"** → **"Networking"**
2. **"Generate Domain"**
3. Copia tu URL: `https://petmat-backend-xxx.up.railway.app`

---

### **5️⃣ Actualizar Amplify** (1 min)

1. AWS Amplify → **"Environment variables"**
2. Agrega:
   ```
   VITE_BACKEND_URL = https://petmat-backend-xxx.up.railway.app
   ```
3. **"Save"**

---

## ✅ **Verificar**

1. **Backend:** https://tu-url-railway.up.railway.app/health  
   Debe responder: `{"status":"ok"}`

2. **Frontend:** https://petmat.cl  
   Prueba el checkout → Debe abrir Mercado Pago

---

## 🎉 **¡Listo!**

**Tiempo total:** ~7 minutos  
**Costo:** $0 USD  
**Sin base de datos:** ✅  
**100% seguro:** ✅

---

## 📝 **Diferencias vs v1.0**

| Característica | v1.0 | v2.0 |
|----------------|------|------|
| PostgreSQL | ✅ | ❌ (Innecesario) |
| Complejidad | Alta | Baja |
| Líneas de código | ~800 | ~400 |
| Setup | 15 min | 7 min |

---

**¿Problemas?** Lee `README.md` o contacta a da.morande@gmail.com
