import { json, CONFIG } from './_lib.mjs';
export default async () =>
  json({ brand: CONFIG.brand, whatsapp: CONFIG.whatsapp, cities: CONFIG.cities, deliveryFees: CONFIG.deliveryFees, maxPerLine: CONFIG.maxPerLine },
    200, { 'Cache-Control': 'public, max-age=300' });
export const config = { path: '/api/config' };
