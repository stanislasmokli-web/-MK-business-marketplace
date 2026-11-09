import crypto from 'node:crypto';
import { json, fail, adminOk, store } from './_lib.mjs';

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
export default async (req) => {
  if (!adminOk(req)) return fail('Non autorisé', 401);
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return fail('Fichier vide');
  if (buf.length > 4 * 1024 * 1024) return fail('Photo trop lourde (4 Mo max après compression).', 413);
  const type = sniff(buf); // on vérifie le contenu réel, pas ce que dit le navigateur
  if (!type) return fail('Format non accepté (JPEG, PNG ou WebP).', 415);
  const key = `img-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
  await store('images').set(key, buf, { metadata: { contentType: type } });
  return json({ url: `/api/img?k=${key}` });
};
export const config = { path: '/api/admin/image' };
