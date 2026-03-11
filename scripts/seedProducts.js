import { initFirebaseAdmin } from '../firebaseAdmin.js';
import { seedProductsToFirestore } from '../productCatalogService.js';

async function run() {
  const ready = initFirebaseAdmin();
  if (!ready) {
    console.error('Firebase Admin no configurado. Define FIREBASE_SERVICE_ACCOUNT_JSON o credenciales separadas.');
    process.exit(1);
  }

  const count = await seedProductsToFirestore();
  console.log(`Seed completado: ${count} productos cargados en Firestore.`);
}

run().catch((error) => {
  console.error('Error ejecutando seed:', error);
  process.exit(1);
});
