(() => {
'use strict';

/* ---------- Outils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('fr-FR') + '\u00a0F\u00a0CFA';
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* rien */ } },
};
async function api(path, opts = {}) {
  try {
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    let data = null; try { data = await r.json(); } catch { /* pas de JSON */ }
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { error: 'Pas de connexion. Vérifie ton réseau puis réessaie.' } }; }
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- État ---------- */
let cfg = { whatsapp: '22870537502', cities: [], deliveryFees: {}, maxPerLine: 10 };
let products = [];
let cart = LS.get('mk_cart_v2', {});
const filter = { q: '', cat: 'all', sort: 'new' };
let pv = null;         // produit ouvert { id, qty }
let pollT = null;
const sheet = $('#sheet');

const imgOf = (p, i = 0) => (p.images && p.images[i]) || '/placeholder.svg';
const waLink = (text) => `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(text)}`;
const maxFor = (p) => Math.max(0, Math.min(p.stock, cfg.maxPerLine));
const saveCart = () => { LS.set('mk_cart_v2', cart); updateBadge(); };

function cartLines() {
  const out = [];
  for (const [id, q] of Object.entries(cart)) {
    const p = products.find((x) => x.id === id);
    if (p && p.stock > 0) out.push({ p, q: Math.min(q, maxFor(p)) });
  }
  return out;
}
const cartCount = () => cartLines().reduce((s, l) => s + l.q, 0);
const cartSubtotal = () => cartLines().reduce((s, l) => s + l.q * l.p.price, 0);
function updateBadge() {
  const b = $('#cart-count'), n = cartCount();
  b.textContent = n; b.hidden = !n;
}

/* ---------- Catalogue ---------- */
function visibleProducts() {
  const q = filter.q.trim().toLowerCase();
  let list = products.filter((p) => (filter.cat === 'all' || p.cat === filter.cat) &&
    (!q || (p.name + ' ' + p.description).toLowerCase().includes(q)));
  if (filter.sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
  if (filter.sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
  return list;
}
function tileHtml(p) {
  const tag = p.stock <= 0 ? '<span class="tag">Épuisé</span>' : p.stock <= 3 ? `<span class="tag low">Plus que ${p.stock}</span>` : '';
  return `<button type="button" class="tile${p.stock <= 0 ? ' out' : ''}" data-act="open-product" data-id="${esc(p.id)}">
    <div class="tile-img"><img src="${esc(imgOf(p))}" alt="${esc(p.name)}" loading="lazy" width="300" height="400">${tag}</div>
    <h3>${esc(p.name)}</h3><span class="price">${money(p.price)}</span></button>`;
}
function renderGrid() {
  const list = visibleProducts();
  $('#grid').innerHTML = list.length ? list.map(tileHtml).join('')
    : `<p class="empty">${products.length ? 'Aucun jean ne correspond à ta recherche.' : 'Les jeans arrivent bientôt.'}</p>`;
}
function renderChips() {
  const cats = [...new Set(products.map((p) => p.cat))];
  const box = $('#chips');
  box.hidden = cats.length < 2;
  box.innerHTML = ['all', ...cats].map((c) =>
    `<button type="button" class="chip" data-act="cat" data-cat="${esc(c)}" aria-pressed="${filter.cat === c}">${c === 'all' ? 'Tout' : esc(c.charAt(0).toUpperCase() + c.slice(1))}</button>`).join('');
}

/* ---------- Feuille (dialog) ---------- */
const shell = (title, body, foot = '') =>
  `<div class="sh-head"><h2 id="sheet-title">${title}</h2><button class="x" type="button" data-act="close" aria-label="Fermer">×</button></div>
   <div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ''}`;
function openSheet(html) {
  sheet.innerHTML = html;
  if (!sheet.open) sheet.showModal();
  const b = $('.sh-body', sheet); if (b) b.scrollTop = 0;
}
function closeSheet() {
  stopPoll();
  if (sheet.open) sheet.close();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
sheet.addEventListener('close', stopPoll);
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

/* ---------- Fiche produit ---------- */
function viewProduct(id, qty = 1) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  pv = { id, qty: Math.min(qty, Math.max(1, maxFor(p))) };
  history.replaceState(null, '', `#p=${encodeURIComponent(id)}`);
  const imgs = p.images && p.images.length ? p.images : [''];
  const out = p.stock <= 0;
  const similar = products.filter((x) => x.id !== p.id && x.cat === p.cat && x.stock > 0).slice(0, 3);
  const body = `
    <div class="gal-main"><img id="gal" src="${esc(imgOf(p))}" alt="${esc(p.name)}"></div>
    ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<button type="button" data-act="thumb" data-i="${i}" aria-label="Photo ${i + 1}" ${i === 0 ? 'aria-current="true"' : ''}><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
    <h3 class="pname">${esc(p.name)}</h3>
    <div class="pprice">${money(p.price)}</div>
    <p class="pdesc">${esc(p.description)}</p>
    <p class="small ${out ? '' : 'muted'}" style="${out ? 'color:var(--bad);font-weight:700' : ''}">${out ? 'Épuisé pour le moment.' : p.stock <= 3 ? `Plus que ${p.stock} en stock.` : 'En stock.'}</p>
    ${out ? '' : `<div class="stepper" style="margin-top:8px"><button type="button" data-act="pq" data-d="-1" aria-label="Moins">−</button><output id="pq" aria-live="polite">${pv.qty}</output><button type="button" data-act="pq" data-d="1" aria-label="Plus">+</button></div>`}
    ${similar.length ? `<div class="similar"><h3>Dans la même catégorie</h3><div class="srow">${similar.map(tileHtml).join('')}</div></div>` : ''}`;
  const foot = out
    ? `<a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${esc(waLink('Bonjour MK_Business, le ' + p.name + ' est épuisé. Pouvez-vous m’en refaire un ?'))}">Demander sur WhatsApp</a>`
    : `<button class="btn btn-yellow btn-block" type="button" data-act="buy-now">Commander maintenant</button>
       <button class="btn btn-line btn-block" type="button" data-act="add-close">Ajouter au panier</button>`;
  openSheet(shell('Détails', body, foot));
}
function addToCart(id, q) {
  const p = products.find((x) => x.id === id); if (!p) return false;
  const cur = cart[id] || 0, cap = maxFor(p);
  if (cur >= cap) { toast(cap < cfg.maxPerLine ? 'Stock maximum atteint pour ce jean.' : `Maximum ${cfg.maxPerLine} par article.`); return false; }
  cart[id] = Math.min(cur + q, cap); saveCart(); return true;
}

/* ---------- Panier ---------- */
function pendingBanner() {
  const last = LS.get('mk_last', null);
  if (!last) return '';
  return `<div class="okbox" style="margin-bottom:14px">Paiement en cours pour la commande ${esc(last.id)}.
    <button class="link" type="button" data-act="check-pay">Vérifier mon paiement</button></div>`;
}
function viewCart() {
  pv = null;
  const lines = cartLines();
  if (!lines.length) {
    openSheet(shell('Mon panier', `${pendingBanner()}<p class="muted" style="text-align:center;padding:30px 0">Ton panier est vide.</p>`,
      '<button class="btn btn-dark btn-block" type="button" data-act="shop">Voir les jeans</button>'));
    return;
  }
  const rows = lines.map(({ p, q }) => `
    <div class="line">
      <img src="${esc(imgOf(p))}" alt="">
      <div><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div>
        <div class="stepper"><button type="button" data-act="c-dec" data-id="${esc(p.id)}" aria-label="Retirer un ${esc(p.name)}">−</button><output>${q}</output><button type="button" data-act="c-inc" data-id="${esc(p.id)}" aria-label="Ajouter un ${esc(p.name)}">+</button></div></div>
      <button class="rm" type="button" data-act="c-rm" data-id="${esc(p.id)}" aria-label="Supprimer ${esc(p.name)}">Retirer</button>
    </div>`).join('');
  openSheet(shell('Mon panier', pendingBanner() + rows,
    `<div class="row"><span>Sous-total</span><span class="total">${money(cartSubtotal())}</span></div>
     <p class="small muted" style="margin:0">La livraison est confirmée avec toi avant l’envoi.</p>
     <button class="btn btn-yellow btn-block" type="button" data-act="checkout">Commander</button>`));
}

/* ---------- Commande ---------- */
const feeFor = (city) => Number(cfg.deliveryFees[city] || 0);
function totalsHtml(city) {
  const sub = cartSubtotal(), fee = feeFor(city);
  return `<div class="row"><span>Sous-total</span><span>${money(sub)}</span></div>
    <div class="row"><span>Livraison</span><span>${fee ? money(fee) : 'confirmée par WhatsApp'}</span></div>
    <div class="row"><b>Total</b><span class="total">${money(sub + fee)}</span></div>`;
}
function viewCheckout(error = '') {
  pv = null;
  const lines = cartLines();
  if (!lines.length) return viewCart();
  const me = LS.get('mk_customer', {});
  const method = LS.get('mk_method', 'FLOOZ');
  const body = `
    ${error ? `<div class="err" role="alert" style="margin-bottom:14px">${esc(error)}</div>` : ''}
    <form id="co" class="f" novalidate>
      <label>Nom complet<input name="name" required autocomplete="name" value="${esc(me.name)}" placeholder="Ex. Koffi Mensah"></label>
      <label>Téléphone / WhatsApp<input name="phone" type="tel" inputmode="tel" required autocomplete="tel" value="${esc(me.phone)}" placeholder="90 12 34 56"></label>
      <div class="two">
        <label>Ville<select name="city" required><option value="">Choisis ta ville</option>${cfg.cities.map((c) => `<option ${me.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label>Quartier / adresse<input name="address" required autocomplete="street-address" value="${esc(me.address)}" placeholder="Ex. Bè Kpota, près de…"></label>
      </div>
      <label>Remarque <small>(facultatif)</small><textarea name="note" maxlength="300" placeholder="Taille, couleur, repère pour le livreur…"></textarea></label>
      <fieldset><legend>Mode de paiement</legend>
        <label class="opt"><input type="radio" name="method" value="FLOOZ" ${method === 'FLOOZ' ? 'checked' : ''}><span>Flooz<small>Tu valides sur ton téléphone</small></span></label>
        <label class="opt"><input type="radio" name="method" value="TMONEY" ${method === 'TMONEY' ? 'checked' : ''}><span>T-Money<small>Tu valides sur ton téléphone</small></span></label>
        <label class="opt"><input type="radio" name="method" value="COD" ${method === 'COD' ? 'checked' : ''}><span>Paiement à la livraison<small>Tu paies en espèces au livreur</small></span></label>
      </fieldset>
      <label id="paybox">Numéro Flooz / T-Money <small>(laisse vide si c’est le même numéro)</small><input name="pay_phone" type="tel" inputmode="tel" placeholder="Même numéro"></label>
      <div id="totals">${totalsHtml(me.city)}</div>
    </form>`;
  openSheet(shell('Finaliser la commande', body,
    '<button class="btn btn-yellow btn-block" type="submit" form="co" id="go"></button>'));
  syncCheckout();
}
function syncCheckout() {
  const f = $('#co'); if (!f) return;
  const v = Object.fromEntries(new FormData(f));
  $('#paybox').hidden = v.method === 'COD';
  const total = cartSubtotal() + feeFor(v.city);
  $('#go').textContent = v.method === 'COD' ? `Commander · ${money(total)}` : `Payer ${money(total)}`;
  $('#totals').innerHTML = totalsHtml(v.city);
}

async function submitOrder(form) {
  const fd = Object.fromEntries(new FormData(form));
  const btn = $('#go'); btn.disabled = true; btn.textContent = 'Un instant…';
  const items = cartLines().map(({ p, q }) => ({ id: p.id, quantity: q }));
  const customer = { name: fd.name, phone: fd.phone, city: fd.city, address: fd.address, note: fd.note };
  LS.set('mk_customer', { name: fd.name, phone: fd.phone, city: fd.city, address: fd.address });
  LS.set('mk_method', fd.method);
  const r = await api('/api/orders', { method: 'POST', body: JSON.stringify({ customer, items, method: fd.method, pay_phone: fd.pay_phone }) });
  if (!r.ok) {
    if (r.status === 409) await loadProducts();
    return viewCheckout(r.data?.error || 'Commande impossible. Réessaie.');
  }
  const o = r.data;
  LS.set('mk_last', { id: o.id, token: o.token, method: o.method, total: o.total });
  if (o.method === 'COD') return finishOrder(o.id, o.token);
  startPayment(o);
}

async function startPayment(o) {
  viewWait(o, 'Lancement du paiement…');
  const r = await api('/api/pay', { method: 'POST', body: JSON.stringify({ id: o.id, token: o.token }) });
  if (!r.ok && r.status !== 409) return viewPayError(r.data?.error || 'Le paiement n’a pas pu être lancé.');
  viewWait(o);
  pollStatus(o, 0);
}
function viewWait(o, text) {
  const net = o.method === 'TMONEY' ? 'T-Money' : 'Flooz';
  openSheet(shell('Paiement', `<div class="wait"><div class="spin" aria-hidden="true"></div>
    <h3>${esc(text || 'Valide sur ton téléphone')}</h3>
    ${text ? '' : `<p>Une demande de paiement ${esc(net)} de <b>${money(o.total)}</b> arrive sur ton téléphone. Entre ton code secret pour confirmer.</p>`}
    <div class="ordnum">${esc(o.id)}</div><p class="small muted">Garde ce numéro de commande. Ne ferme pas cette page.</p></div>`));
}
function viewPayError(msg) {
  const last = LS.get('mk_last', {});
  openSheet(shell('Paiement non terminé', `<div class="err" role="alert">${esc(msg)}</div>
    <p>Ta commande <b>${esc(last.id || '')}</b> est gardée. Tu peux réessayer, ou nous écrire sur WhatsApp pour payer autrement.</p>`,
    `<button class="btn btn-yellow btn-block" type="button" data-act="retry-pay">Réessayer le paiement</button>
     <a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${esc(waLink('Bonjour MK_Business, j’ai un souci de paiement pour la commande ' + (last.id || '') + '.'))}">Écrire sur WhatsApp</a>`));
}
function stopPoll() { clearTimeout(pollT); pollT = null; }
function pollStatus(o, n) {
  stopPoll();
  pollT = setTimeout(async () => {
    if (!sheet.open) return;
    const r = await api(`/api/order-status?id=${encodeURIComponent(o.id)}&token=${encodeURIComponent(o.token)}`);
    if (r.ok) {
      const s = r.data;
      if (s.status === 'paid' || s.status === 'delivered') return showDone(s);
      if (s.payment_state === 'expired') return viewPayError('La demande de paiement a expiré.');
      if (s.payment_state === 'cancelled') return viewPayError('Le paiement a été annulé.');
    }
    if (n >= 45) return viewTimeout(o);
    pollStatus(o, n + 1);
  }, n === 0 ? 2500 : 4000);
}
function viewTimeout(o) {
  openSheet(shell('Paiement en vérification', `<p>Nous n’avons pas encore reçu la confirmation. Si tu as validé sur ton téléphone, ta commande <b>${esc(o.id)}</b> sera confirmée dès que le paiement nous parvient.</p>`,
    `<button class="btn btn-yellow btn-block" type="button" data-act="check-pay">Vérifier à nouveau</button>
     <a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${esc(waLink('Bonjour MK_Business, j’ai payé la commande ' + o.id + '. Pouvez-vous vérifier ?'))}">Écrire sur WhatsApp</a>`));
}
async function finishOrder(id, token) {
  const r = await api(`/api/order-status?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
  if (r.ok) showDone(r.data); else viewPayError(r.data?.error || 'Commande introuvable.');
}
function showDone(s) {
  stopPoll();
  cart = {}; saveCart(); LS.del('mk_last');
  const paid = s.status === 'paid' || s.status === 'delivered';
  const msg = `Bonjour MK_Business, voici ma commande ${s.id} : ${s.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}. Total : ${money(s.total)}. ${paid ? 'Payée en ligne.' : 'Paiement à la livraison.'} Nom : ${s.name}, ${s.city}.`;
  openSheet(shell(paid ? 'Paiement reçu' : 'Commande enregistrée', `<div class="done">
    <h3>Merci ${esc(String(s.name).split(' ')[0])} !</h3>
    <p>${paid ? 'Ton paiement est confirmé.' : `Tu paieras <b>${money(s.total)}</b> en espèces à la livraison.`} On te contacte sur WhatsApp pour organiser la livraison.</p>
    <div class="ordnum">${esc(s.id)}</div>
    <div class="recap">${s.items.map((i) => `<div><span>${i.quantity} × ${esc(i.name)}</span><span>${money(i.price * i.quantity)}</span></div>`).join('')}
      <div><b>Total</b><b>${money(s.total)}</b></div></div></div>`,
    `<a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${esc(waLink(msg))}">Envoyer ma commande sur WhatsApp</a>
     <button class="btn btn-line btn-block" type="button" data-act="close">Continuer mes achats</button>`));
  loadProducts();
}

/* ---------- Événements ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'open-cart': viewCart(); break;
    case 'close': closeSheet(); break;
    case 'shop': closeSheet(); $('#catalogue').scrollIntoView(); break;
    case 'open-product': viewProduct(id); break;
    case 'cat': filter.cat = el.dataset.cat; renderChips(); renderGrid(); break;
    case 'thumb': {
      const p = products.find((x) => x.id === pv?.id); if (!p) break;
      $('#gal').src = imgOf(p, Number(el.dataset.i));
      sheet.querySelectorAll('.thumbs button').forEach((b) => b.removeAttribute('aria-current'));
      el.setAttribute('aria-current', 'true');
      break;
    }
    case 'pq': {
      const p = products.find((x) => x.id === pv?.id); if (!p) break;
      pv.qty = Math.max(1, Math.min(maxFor(p), pv.qty + Number(el.dataset.d)));
      $('#pq').textContent = pv.qty; break;
    }
    case 'add-close': if (addToCart(pv.id, pv.qty)) { closeSheet(); toast('Ajouté au panier'); } break;
    case 'buy-now': if (addToCart(pv.id, pv.qty) || (cart[pv.id] || 0) > 0) viewCheckout(); break;
    case 'c-inc': addToCart(id, 1); viewCart(); break;
    case 'c-dec': if ((cart[id] = (cart[id] || 1) - 1) <= 0) delete cart[id]; saveCart(); viewCart(); break;
    case 'c-rm': delete cart[id]; saveCart(); viewCart(); break;
    case 'checkout': viewCheckout(); break;
    case 'retry-pay': {
      const last = LS.get('mk_last', null); if (!last) { viewCart(); break; }
      startPayment(last); break;
    }
    case 'check-pay': {
      const last = LS.get('mk_last', null); if (!last) { viewCart(); break; }
      viewWait(last, 'Vérification du paiement…'); pollStatus(last, 0); break;
    }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { filter.q = e.target.value; renderGrid(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'sort') { filter.sort = e.target.value; renderGrid(); }
  if (e.target.closest('#co')) syncCheckout();
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'co') return;
  e.preventDefault();
  const f = e.target;
  const v = Object.fromEntries(new FormData(f));
  if (!String(v.name).trim() || !String(v.phone).trim() || !v.city || !String(v.address).trim()) {
    LS.set('mk_customer', { name: v.name, phone: v.phone, city: v.city, address: v.address });
    LS.set('mk_method', v.method);
    return viewCheckout('Remplis ton nom, ton téléphone, ta ville et ton quartier.');
  }
  submitOrder(f);
});
// Photo manquante : image de remplacement
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && !t.dataset.fb) { t.dataset.fb = '1'; t.src = '/placeholder.svg'; }
}, true);

/* ---------- Démarrage ---------- */
async function loadProducts() {
  const r = await api('/api/products');
  if (r.ok && Array.isArray(r.data)) {
    products = r.data;
    for (const id of Object.keys(cart)) { // nettoie le panier mémorisé
      const p = products.find((x) => x.id === id);
      if (!p || p.stock <= 0) delete cart[id]; else cart[id] = Math.min(cart[id], maxFor(p));
    }
    saveCart(); renderChips(); renderGrid();
  } else {
    $('#grid').innerHTML = '<p class="empty">Impossible de charger les jeans. Vérifie ta connexion et recharge la page.</p>';
  }
}
(async function init() {
  const c = await api('/api/config'); if (c.ok) cfg = { ...cfg, ...c.data };
  const hi = waLink('Bonjour MK_Business, j’ai une question.');
  $('#wa-hero').href = hi; $('#wa-custom').href = waLink('Bonjour MK_Business, j’ai une idée de dessin pour un jean : ');
  updateBadge();
  await loadProducts();
  const m = location.hash.match(/^#p=([\w-]+)$/);
  if (m) viewProduct(m[1]);
})();
})();
