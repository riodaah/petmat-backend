# 🚂 Guía de Despliegue en Railway - PetMAT Backend

## 📋 **Pre-requisitos**

- ✅ Cuenta en Railway (https://railway.app/)
- ✅ Cuenta en GitHub
- ✅ Credenciales de Mercado Pago (Access Token)

---

## 🚀 **Paso 1: Subir el Código a GitHub**

### **1.1. Inicializar Git (si no está inicializado)**

```bash
cd petmat-backend
git init
```

### **1.2. Crear repositorio en GitHub**

1. Ve a: https://github.com/new
2. **Nombre:** `petmat-backend`
3. **Visibilidad:** Private (recomendado)
4. **NO inicialices** con README, .gitignore, etc.
5. Click en **"Create repository"**

### **1.3. Conectar y subir el código**

```bash
# Agregar archivos
git add .

# Commit inicial
git commit -m "Initial backend setup for PetMAT"

# Conectar con GitHub (reemplaza 'riodaah' con tu usuario)
git remote add origin git@github.com:riodaah/petmat-backend.git

# O con HTTPS si tienes problemas con SSH:
git remote add origin https://github.com/riodaah/petmat-backend.git

# Subir código
git branch -M main
git push -u origin main
```

---

## 🚂 **Paso 2: Crear Proyecto en Railway**

### **2.1. Acceder a Railway**

1. Ve a: https://railway.app/
2. Click en **"Login"** o **"Start a New Project"**
3. Inicia sesión con GitHub

### **2.2. Crear Nuevo Proyecto**

1. Click en **"New Project"**
2. Selecciona **"Deploy from GitHub repo"**
3. Autoriza Railway para acceder a tu GitHub (si es la primera vez)
4. Busca y selecciona: **`petmat-backend`**
5. Click en **"Deploy Now"**

Railway comenzará a detectar automáticamente que es un proyecto Node.js.

---

## 🗄️ **Paso 3: Agregar PostgreSQL**

### **3.1. Crear base de datos**

1. En tu proyecto de Railway, click en **"New"** (botón +)
2. Selecciona **"Database"**
3. Selecciona **"Add PostgreSQL"**
4. Railway creará automáticamente la base de datos

### **3.2. Conectar la base de datos al servicio**

Railway automáticamente creará la variable `DATABASE_URL` que conecta tu servicio con PostgreSQL.

**Verifica:**
1. Click en tu servicio (el que tiene el código)
2. Ve a la pestaña **"Variables"**
3. Deberías ver `DATABASE_URL` ya configurada

---

## 🔐 **Paso 4: Configurar Variables de Entorno**

### **4.1. Agregar variables**

1. En Railway, click en tu servicio
2. Ve a la pestaña **"Variables"**
3. Click en **"Raw Editor"** (más fácil)
4. Agrega las siguientes variables:

```env
PORT=3000
MP_ACCESS_TOKEN=tu_access_token_de_mercado_pago_aqui
FRONTEND_URL=https://petmat.cl
NODE_ENV=production
BACKEND_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

### **4.2. Obtener tu Access Token de Mercado Pago**

1. Ve a: https://www.mercadopago.cl/developers/panel/app
2. Selecciona tu aplicación
3. Click en **"Credenciales"** (menú izquierdo)
4. **Para pruebas:** Copia el **Access Token de TEST**
5. **Para producción:** Copia el **Access Token de PRODUCCIÓN**

⚠️ **IMPORTANTE:** Usa el Access Token completo, NO la Public Key.

### **4.3. Guardar variables**

1. Click en **"Update Variables"**
2. Railway redesplegará automáticamente con las nuevas variables

---

## 🌐 **Paso 5: Obtener URL Pública**

### **5.1. Generar dominio**

1. En Railway, click en tu servicio
2. Ve a la pestaña **"Settings"**
3. Busca la sección **"Networking"** o **"Domains"**
4. Click en **"Generate Domain"**
5. Railway te dará una URL como:
   ```
   https://petmat-backend-production.up.railway.app
   ```

### **5.2. Copiar la URL**

Copia esta URL, la necesitarás para configurar el frontend.

---

## 🔧 **Paso 6: Configurar Frontend (AWS Amplify)**

### **6.1. Agregar variable de entorno en Amplify**

1. Ve a: https://console.aws.amazon.com/amplify/
2. Selecciona tu app (**petmat**)
3. Click en **"Environment variables"**
4. Click en **"Manage variables"**
5. Agrega una nueva variable:
   ```
   Key: VITE_BACKEND_URL
   Value: https://petmat-backend-production.up.railway.app
   ```
6. Click en **"Save"**

### **6.2. Actualizar código del frontend**

Ya está hecho en `CheckoutMPRailway.jsx`, pero verifica que use:

```javascript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
```

### **6.3. Hacer deploy**

```bash
cd petmat-ecommerce
git add .
git commit -m "Update checkout to use Railway backend"
git push origin main
```

AWS Amplify desplegará automáticamente los cambios.

---

## ✅ **Paso 7: Verificar que Funciona**

### **7.1. Health Check**

Abre tu navegador y ve a:

```
https://petmat-backend-production.up.railway.app/health
```

Deberías ver:

```json
{
  "status": "ok",
  "timestamp": "2025-01-20T...",
  "service": "petmat-backend",
  "version": "1.0.0"
}
```

### **7.2. Ver Logs**

1. En Railway, click en tu servicio
2. Ve a la pestaña **"Logs"**
3. Deberías ver:
   ```
   🚂 PetMAT Backend running on port 3000
   🌍 Environment: production
   🔒 CORS enabled for: https://petmat.cl
   🗄️  Conectado a PostgreSQL
   ✅ Base de datos inicializada
   ✅ Server ready!
   ```

### **7.3. Probar checkout en petmat.cl**

1. Ve a: https://petmat.cl
2. Agrega productos al carrito
3. Ve a checkout
4. Llena el formulario
5. Click en **"Pagar con Mercado Pago"**
6. Debería abrirse el checkout de Mercado Pago

---

## 🐛 **Troubleshooting**

### **Error: "Cannot connect to database"**

**Solución:**
1. Verifica que PostgreSQL esté agregado al proyecto
2. Verifica que `DATABASE_URL` esté en las variables de entorno
3. Reinicia el servicio (click en los 3 puntos → Restart)

### **Error: "CORS blocked"**

**Solución:**
1. Verifica que `FRONTEND_URL=https://petmat.cl` esté en las variables
2. NO incluyas "/" al final de la URL
3. Redespliega el servicio

### **Error: "Mercado Pago preference creation failed"**

**Solución:**
1. Verifica que `MP_ACCESS_TOKEN` sea válido
2. Asegúrate de usar el Access Token (no la Public Key)
3. Si estás en desarrollo, usa credenciales de TEST
4. Si estás en producción, usa credenciales de PRODUCCIÓN

### **Error: "Backend URL not found" (en el frontend)**

**Solución:**
1. Verifica que `VITE_BACKEND_URL` esté configurada en AWS Amplify
2. Fuerza un nuevo build en Amplify
3. Espera 3-5 minutos para que se propague

---

## 📊 **Monitoreo**

### **Ver Logs en Tiempo Real**

1. En Railway → Tu servicio → **"Logs"**
2. Los logs se actualizan en tiempo real
3. Busca errores con el filtro

### **Ver Métricas**

1. En Railway → Tu servicio → **"Metrics"**
2. Verás:
   - CPU usage
   - Memory usage
   - Network (requests)

### **Ver Base de Datos**

1. En Railway → PostgreSQL → **"Data"**
2. Puedes ver las tablas y los datos
3. O conecta con un cliente SQL usando `DATABASE_URL`

---

## 🔄 **Actualizar el Backend**

Cada vez que hagas cambios en el código:

```bash
cd petmat-backend
git add .
git commit -m "Update feature"
git push origin main
```

Railway desplegará automáticamente los cambios en ~2-3 minutos.

---

## 💰 **Costos**

### **Tier Gratuito de Railway**

- **$5 USD/mes de crédito gratis**
- **PostgreSQL incluido gratis**
- **Suficiente para ~500-1000 órdenes/mes**

### **Uso Estimado**

Para PetMAT con ~100 órdenes/mes:
- **Backend:** ~$1-2 USD
- **PostgreSQL:** Gratis (incluido)
- **Total:** $0 USD (dentro del tier gratuito)

---

## 🔒 **Seguridad**

### **Variables de entorno protegidas**

✅ El `MP_ACCESS_TOKEN` nunca se expone en el frontend  
✅ Solo el backend puede crear preferencias de pago  
✅ La base de datos solo es accesible desde Railway  
✅ CORS configurado solo para `petmat.cl`

### **Mejores prácticas implementadas**

✅ Validación de datos en el backend  
✅ Logs de todas las operaciones  
✅ Manejo de errores robusto  
✅ Webhooks para notificaciones de MP

---

## 📞 **Soporte**

- **Railway Docs:** https://docs.railway.app/
- **Railway Discord:** https://discord.gg/railway
- **Mercado Pago Docs:** https://www.mercadopago.com.ar/developers/
- **Proyecto:** da.morande@gmail.com

---

## ✨ **¡Listo!**

Tu backend está funcionando de forma segura en Railway. Ahora:

✅ El Access Token está protegido  
✅ Las órdenes se guardan en PostgreSQL  
✅ Los webhooks de Mercado Pago funcionan  
✅ Todo cumple con las políticas de MP

**¡Felicitaciones! 🎉**

---

**Última actualización:** Enero 2025  
**Proyecto:** PetMAT Ecommerce  
**Backend:** Railway + PostgreSQL


