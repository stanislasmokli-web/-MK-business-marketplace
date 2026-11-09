import { store, fail } from './_lib.mjs';
const OK = new Set(['image/jpeg', 'image/png', 'image/webp']);
export default async (req) => {
  const k = new URL(req.url).searchParams.get('k') || '';
  if (!/^img-[a-z0-9-]{8,80}$/.test(k)) return fail('Image introuvable', 404);
  let x = null;
  try { x = await store('images').getWithMetadata(k, { type: 'arrayBuffer' }); } catch { /* absent */ }
  if (!x) return fail('Image introuvable', 404);
  const type = OK.has(x.metadata?.contentType) ? x.metadata.contentType : 'image/jpeg';
  return new Response(x.data, { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' } });
};
export const config = { path: '/api/img' };
