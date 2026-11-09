(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('fr-FR') + '\u00a0F\u00a0CFA';
let toastT;
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };

async function api(path, method = 'GET', body) {
  try {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-MK': '1' }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await r.json(); } catch { /* vide */ }
    if (r.status === 401 && path !== '/api/auth') { showLogin(); }
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { error: 'Pas de connexion.' } }; }
}

let orders = [], products = [], ofilter = 'todo', editing = null, photos = [];
const STATUS = { pending: 'En attente de paiement', paid: 'Payée', cod: 'À payer à la livraison', delivered: 'Livrée', cancelled: 'Annulée' };
const METHOD = { FLOOZ: 'Flooz', TMONEY: 'T-Money', COD: 'Espèces à la livraison' };

/* ---------- Connexion ---------- */
function showLogin(msg) { $('#app').hidden = true; $('#login').hidden = false; if (msg) { const e = $('#lerr'); e.textContent = msg; e.hidden = false; } }
async function boot() {
  const r = await api('/api/auth');
  if (r.ok && r.data.authenticated) { $('#login').hidden = true; $('#app').hidden = false; await loadAll(); }
  else showLogin(r.ok && !r.data.configured ? 'Admin non configuré : ajoute MK_ADMIN_PASSWORD et MK_ADMIN_SECRET dans Netlify (voir LISEZ-MOI).' : '');
}
$('#lf').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('/api/auth', 'POST', { password: $('#pw').value });
  if (r.ok) { $('#pw').value = ''; $('#lerr').hidden = true; boot(); } else showLogin(r.data?.error || 'Erreur');
});

/* ---------- Chargement ---------- */
async function loadAll() {
  const [o, p] = await Promise.all([api('/api/admin/orders'), api('/api/admin/products')]);
  if (o.ok) orders = o.data; if (p.ok) products = p.data;
  renderStats(); renderOrders(); renderProducts();
}
function renderStats() {
  const todo = orders.filter((o) => o.status === 'paid' || o.status === 'cod').length;
  const pending = orders.filter((o) => o.status === 'pending').length;
  const revenue = orders.filter((o) => o.status === 'paid' || o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const out = products.filter((p) => p.active && p.stock <= 0).length;
  $('#stats').innerHTML = [[todo, 'À préparer'], [pending, 'Paiements en attente'], [money(revenue), 'Encaissé en ligne'], [out, 'Jeans épuisés']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}

/* ---------- Commandes ---------- */
const FILTERS = [['todo', 'À traiter'], ['pending', 'En attente de paiement'], ['delivered', 'Livrées'], ['cancelled', 'Annulées'], ['all', 'Toutes']];
const matches = (o) => ofilter === 'all' || (ofilter === 'todo' ? (o.status === 'paid' || o.status === 'cod') : o.status === ofilter);
function waClient(o) {
  const ph = o.customer.phone.length === 8 ? '228' + o.customer.phone : o.customer.phone;
  const t = `Bonjour ${o.customer.name}, ici MK_Business au sujet de ta commande ${o.id}.`;
  return `https://wa.me/${ph}?text=${encodeURIComponent(t)}`;
}
function renderOrders() {
  const list = orders.filter(matches);
  $('#orders-pane').innerHTML = `
    <div class="fl" role="group" aria-label="Filtrer les commandes">${FILTERS.map(([k, l]) => `<button class="chip" type="button" data-a="ofilter" data-k="${k}" aria-pressed="${ofilter === k}">${l}</button>`).join('')}</div>
    ${list.length ? list.map(orderHtml).join('') : '<p class="muted" style="text-align:center;padding:30px 0">Aucune commande ici.</p>'}`;
}
function orderHtml(o) {
  const d = new Date(o.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const acts = [];
  acts.push(`<a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waClient(o))}">WhatsApp client</a>`);
  if (o.status === 'pending') acts.push(`<button class="btn btn-line" type="button" data-a="ord" data-act="paid" data-id="${o.id}">Marquer payée</button>`);
  if (o.status === 'paid' || o.status === 'cod') acts.push(`<button class="btn btn-yellow" type="button" data-a="ord" data-act="delivered" data-id="${o.id}">Marquer livrée</button>`);
  if (o.status !== 'cancelled' && o.status !== 'delivered') acts.push(`<button class="btn btn-line" type="button" data-a="ord" data-act="cancel" data-id="${o.id}">Annuler</button>`);
  return `<article class="ord">
    <div class="row"><h3>${esc(o.id)}</h3><span class="badge b-${o.status}">${STATUS[o.status] || o.status}</span></div>
    <div class="muted small">${d} · ${METHOD[o.method] || o.method}</div>
    ${o.stock_issue ? '<div class="warn">Stock insuffisant au moment du paiement : vérifie la disponibilité avec le client.</div>' : ''}
    <div><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}<br>${esc(o.customer.city)}, ${esc(o.customer.address)}${o.customer.note ? `<br><i>« ${esc(o.customer.note)} »</i>` : ''}</div>
    <ul>${o.items.map((i) => `<li>${i.quantity} × ${esc(i.name)}</li>`).join('')}</ul>
    <div class="row"><span class="muted">${o.delivery ? `dont livraison ${money(o.delivery)}` : ''}</span><b class="total">${money(o.total)}</b></div>
    <div class="acts">${acts.join('')}</div>
    <details><summary>Historique</summary>${(o.history || []).map((h) => `<div class="small">${new Date(h.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} — ${esc(h.text)}</div>`).join('')}</details>
  </article>`;
}
async function orderAction(id, action) {
  const msg = { paid: 'Marquer cette commande comme payée (tu as reçu l’argent) ?', delivered: 'Marquer comme livrée ?', cancel: 'Annuler cette commande ? Le stock sera remis.' }[action];
  if (!confirm(msg)) return;
  const r = await api('/api/admin/orders', 'POST', { id, action });
  if (!r.ok) return toast(r.data?.error || 'Action impossible');
  toast('Fait'); loadAll();
}

/* ---------- Produits ---------- */
function renderProducts() {
  $('#products-pane').innerHTML = `<button class="btn btn-yellow btn-block" type="button" data-a="new" style="margin-bottom:14px">Ajouter un jean</button>` +
    products.map((p) => `<div class="prow${p.active ? '' : ' off'}"><img src="${esc(p.images?.[0] || '/placeholder.svg')}" alt="">
      <div><h3>${esc(p.name)}</h3><div>${money(p.price)} · stock <b>${p.stock}</b>${p.active ? '' : ' · <b>masqué</b>'}</div></div>
      <button class="btn btn-line" type="button" data-a="edit" data-id="${esc(p.id)}">Modifier</button></div>`).join('');
}
function openForm(p) {
  editing = p ? p.id : null; photos = p ? [...(p.images || [])] : [];
  const v = p || { name: '', price: 3500, stock: 10, cat: 'jeans', description: '', active: true };
  $('#pform').innerHTML = `
    <div class="sh-head"><h2 id="pf-title">${p ? 'Modifier le jean' : 'Nouveau jean'}</h2><button class="x" type="button" data-a="pclose" aria-label="Fermer">×</button></div>
    <div class="sh-body"><form id="pf" class="f" novalidate>
      <div id="perr" class="err" role="alert" hidden></div>
      <label>Nom<input name="name" required maxlength="80" value="${esc(v.name)}"></label>
      <div class="two"><label>Prix (F CFA)<input name="price" type="number" inputmode="numeric" min="100" step="50" required value="${esc(v.price)}"></label>
      <label>Stock<input name="stock" type="number" inputmode="numeric" min="0" step="1" required value="${esc(v.stock)}"></label></div>
      <label>Catégorie<input name="cat" maxlength="30" value="${esc(v.cat)}"></label>
      <label>Description<textarea name="description" maxlength="400">${esc(v.description)}</textarea></label>
      <div><b>Photos</b> <span class="muted small">(4 max, la première est la photo principale)</span>
        <div class="ph" id="ph" style="margin:8px 0"></div>
        <input id="file" type="file" accept="image/*" multiple>
        <div class="muted small" id="up"></div></div>
      <label class="chk"><input name="active" type="checkbox" ${v.active ? 'checked' : ''}> Visible dans la boutique</label>
    </form></div>
    <div class="sh-foot"><button class="btn btn-yellow btn-block" type="submit" form="pf">Enregistrer</button>
      ${p ? '<button class="btn btn-line btn-block" type="button" data-a="pdel">Supprimer ce jean</button>' : ''}</div>`;
  renderPhotos(); $('#pform').showModal();
}
function renderPhotos() {
  $('#ph').innerHTML = photos.map((u, i) => `<figure><img src="${esc(u)}" alt="Photo ${i + 1}"><button type="button" data-a="prm" data-i="${i}" aria-label="Retirer la photo ${i + 1}">×</button>${i ? `<button type="button" data-a="pfirst" data-i="${i}" style="top:auto;bottom:22px;right:2px;width:auto;padding:0 8px;border-radius:6px;font-size:.7rem;height:22px">1re</button>` : ''}${i === 0 ? '<em>principale</em>' : ''}</figure>`).join('') || '<span class="muted small">Aucune photo pour l’instant.</span>';
}
// Réduit la photo du téléphone (≈ 1400 px, JPEG) avant l'envoi : rapide et sous la limite du serveur.
async function compress(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('Image illisible');
  const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Compression impossible'))), 'image/jpeg', 0.82));
}
async function uploadFiles(files) {
  const up = $('#up');
  for (const f of files) {
    if (photos.length >= 4) { up.textContent = '4 photos maximum.'; break; }
    try {
      up.textContent = 'Envoi de la photo…';
      const blob = await compress(f);
      const r = await fetch('/api/admin/image', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-MK': '1' }, body: blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Envoi impossible');
      photos.push(d.url); renderPhotos(); up.textContent = '';
    } catch (e) { up.textContent = e.message; }
  }
  $('#file').value = '';
}
async function saveProduct(form) {
  const v = Object.fromEntries(new FormData(form));
  const body = { action: 'save', id: editing || undefined, name: v.name, price: Number(v.price), stock: Number(v.stock), cat: v.cat, description: v.description, active: !!v.active, images: photos };
  const r = await api('/api/admin/products', 'POST', body);
  if (!r.ok) { const e = $('#perr'); e.textContent = r.data?.error || 'Erreur'; e.hidden = false; return; }
  $('#pform').close(); toast('Enregistré'); loadAll();
}

/* ---------- Événements ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  switch (el.dataset.a) {
    case 'logout': await api('/api/auth', 'DELETE'); showLogin(); break;
    case 'tab': {
      const t = el.dataset.t;
      $('#orders-pane').hidden = t !== 'orders'; $('#products-pane').hidden = t !== 'products';
      $('#tab-orders').setAttribute('aria-selected', t === 'orders'); $('#tab-products').setAttribute('aria-selected', t === 'products'); break;
    }
    case 'ofilter': ofilter = el.dataset.k; renderOrders(); break;
    case 'ord': orderAction(el.dataset.id, el.dataset.act); break;
    case 'new': openForm(null); break;
    case 'edit': openForm(products.find((p) => p.id === el.dataset.id)); break;
    case 'pclose': $('#pform').close(); break;
    case 'prm': photos.splice(Number(el.dataset.i), 1); renderPhotos(); break;
    case 'pfirst': { const [x] = photos.splice(Number(el.dataset.i), 1); photos.unshift(x); renderPhotos(); break; }
    case 'pdel':
      if (confirm('Supprimer définitivement ce jean ?')) {
        const r = await api('/api/admin/products', 'POST', { action: 'delete', id: editing });
        if (r.ok) { $('#pform').close(); toast('Supprimé'); loadAll(); } else toast(r.data?.error || 'Erreur');
      } break;
  }
});
document.addEventListener('change', (e) => { if (e.target.id === 'file') uploadFiles([...e.target.files]); });
document.addEventListener('submit', (e) => { if (e.target.id === 'pf') { e.preventDefault(); saveProduct(e.target); } });
$('#pform').addEventListener('click', (e) => { if (e.target === $('#pform')) $('#pform').close(); });
document.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG' && !t.dataset.fb) { t.dataset.fb = '1'; t.src = '/placeholder.svg'; } }, true);

boot();
})();
