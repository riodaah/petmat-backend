import productsSeed from './data/products.seed.json' with { type: 'json' };
import { getFirestore } from './firebaseAdmin.js';

const PRODUCTS_COLLECTION = 'products';

function parseMoneyCLP(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;

  const raw = value.trim();
  if (!raw) return 0;

  // Acepta formatos como "16.990", "16,990", "$16.990", "16990"
  const cleaned = raw.replace(/[^\d.,-]/g, '');

  if (cleaned.includes('.') && !cleaned.includes(',')) {
    const parts = cleaned.split('.');
    // Si hay 3 dígitos en el último bloque, tratamos "." como separador de miles.
    if (parts[parts.length - 1].length === 3) {
      return Number(parts.join(''));
    }
  }

  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 3) {
      return Number(parts.join(''));
    }
  }

  // Fallback general
  return Number(cleaned.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || 0;
}

function normalizeProduct(raw) {
  const price = parseMoneyCLP(raw.price || 0);
  const hasOffer = Boolean(raw.hasOffer && raw.offerPrice);
  const offerPrice = raw.offerPrice ? parseMoneyCLP(raw.offerPrice) : null;
  const finalPrice = hasOffer && offerPrice > 0 && offerPrice < price ? offerPrice : price;

  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    short: raw.short || '',
    description: raw.description || '',
    brand: raw.brand || 'PetMAT',
    price,
    offerPrice,
    hasOffer: finalPrice < price,
    finalPrice,
    currency: raw.currency || 'CLP',
    stock: Number.isFinite(Number(raw.stock)) ? Number(raw.stock) : 0,
    active: raw.active !== false,
    category: raw.category || 'Productos para mascotas',
    mpn: raw.mpn || raw.id,
    features: Array.isArray(raw.features) ? raw.features : [],
    images: Array.isArray(raw.images) ? raw.images : []
  };
}

async function getProductsFromFirestore() {
  const db = getFirestore();
  if (!db) return null;

  const snapshot = await db.collection(PRODUCTS_COLLECTION).get();
  if (snapshot.empty) return [];

  return snapshot.docs.map((doc) => normalizeProduct({ id: doc.id, ...doc.data() }));
}

export async function getAllProducts() {
  try {
    const firestoreProducts = await getProductsFromFirestore();
    if (firestoreProducts && firestoreProducts.length > 0) {
      return firestoreProducts;
    }
  } catch (error) {
    console.error('❌ Error leyendo productos de Firestore:', error.message);
  }

  return productsSeed.map(normalizeProduct);
}

export async function getActiveProducts() {
  const products = await getAllProducts();
  return products.filter((product) => product.active);
}

export async function getProductById(id) {
  const products = await getAllProducts();
  return products.find((product) => product.id === id) || null;
}

export async function getProductBySlug(slug) {
  const products = await getAllProducts();
  return products.find((product) => product.slug === slug) || null;
}

export async function seedProductsToFirestore() {
  const db = getFirestore();
  if (!db) {
    throw new Error('Firebase Admin no está configurado');
  }

  const batch = db.batch();
  const now = new Date().toISOString();

  productsSeed.forEach((item) => {
    const ref = db.collection(PRODUCTS_COLLECTION).doc(item.id);
    batch.set(ref, {
      ...item,
      updatedAt: now
    });
  });

  await batch.commit();
  return productsSeed.length;
}
