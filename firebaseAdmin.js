import admin from 'firebase-admin';

let firebaseReady = false;

function parseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }

  return null;
}

export function initFirebaseAdmin() {
  if (firebaseReady || admin.apps.length > 0) {
    firebaseReady = true;
    return true;
  }

  try {
    const serviceAccount = parseServiceAccount();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || 'petmat-8d651'
      });
    }

    firebaseReady = true;
    return true;
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error.message);
    console.warn('⚠️ Firebase Admin no configurado, se usará fallback local');
    firebaseReady = false;
    return false;
  }
}

export function getFirestore() {
  if (!firebaseReady && !initFirebaseAdmin()) {
    return null;
  }

  return admin.firestore();
}
