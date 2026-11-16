/**
 * Costo de envío. Se calcula SIEMPRE en el servidor: el monto que mande el
 * navegador se ignora. Si cambias estas tarifas, cambia también las de
 * petmat-ecommerce/src/lib/shipping.js (que solo se usan para mostrar el total).
 */
export const SHIPPING_COSTS = {
  rm: 2990,
  center: 5600,
  extreme: 9500
};

// Se cobra un envío por cada 3 unidades.
export const UNITS_PER_SHIPMENT = 3;

const CENTER_REGIONS = new Set([
  'region de atacama',
  'region de coquimbo',
  'region de valparaiso',
  "region de o'higgins",
  'region del maule',
  'region de nuble',
  'region del biobio',
  'region de la araucania',
  'region de los rios',
  'region de los lagos'
]);

function normalizeRegion(region) {
  return String(region || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function getShippingCostByRegion(region) {
  const normalized = normalizeRegion(region);
  if (normalized.includes('metropolitana')) return SHIPPING_COSTS.rm;
  if (CENTER_REGIONS.has(normalized)) return SHIPPING_COSTS.center;
  // Zonas extremas y cualquier región no reconocida pagan la tarifa más alta.
  return SHIPPING_COSTS.extreme;
}

export function calculateShippingCost({ region, totalUnits, fulfillmentType }) {
  if (fulfillmentType === 'pickup') return 0;
  const shipments = Math.max(1, Math.ceil(Number(totalUnits || 0) / UNITS_PER_SHIPMENT));
  return getShippingCostByRegion(region) * shipments;
}
