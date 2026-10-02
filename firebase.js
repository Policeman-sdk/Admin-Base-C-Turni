import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCKwzJACHHoWqqsqA9s_fGsajIdVJgZ5n4",
  authDomain: "c-turni.firebaseapp.com",
  projectId: "c-turni",
  storageBucket: "c-turni.firebasestorage.app",
  messagingSenderId: "1085494457115",
  appId: "1:1085494457115:web:bff6e0174afa4d7c3d99be"
};

const fbApp = initializeApp(FIREBASE_CONFIG);
window._db = getFirestore(fbApp);
window._auth = getAuth(fbApp);

// ── STATO GLOBALE CONDIVISO ──
window.AdminState = {
  utenti: [],
  reparti: [],
};

// ── HELPERS CONDIVISI ──
window.toast = function(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
};

let _confirmResolveFunc = null;
window.confirm2 = function(msg, title = 'Conferma', okLabel = 'Conferma') {
  return new Promise(resolve => {
    _confirmResolveFunc = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-ok-btn').textContent = okLabel;
    document.getElementById('confirm-overlay').classList.add('open');
  });
};
window.confirmResolve = function(val) {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolveFunc) { _confirmResolveFunc(val); _confirmResolveFunc = null; }
};

window.openModal = function(id) { document.getElementById(id).classList.add('open'); };
window.closeModal = function(id) { document.getElementById(id).classList.remove('open'); };

window.toggleDropdown = function(id) {
  const m = document.getElementById(id);
  document.querySelectorAll('.dropdown-menu.open').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
  m.classList.toggle('open');
};
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown-menu.open').forEach(d => d.classList.remove('open'));
});

window.closeDrawer = function() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-overlay').style.display = 'none';
};

window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
};

window.fmtDate = function(d) {
  if (!d) return '—';
  if (d.toDate) d = d.toDate();
  if (typeof d === 'string') return d;
  return d.toLocaleDateString('it-IT');
};
window.fmtTs = function(ts) {
  if (!ts) return '—';
  if (ts.toDate) ts = ts.toDate();
  return ts.toLocaleString('it-IT');
};
window.badgeStato = function(stato) {
  // alias tolleranti: l'app militari può usare "approvato"/"in_attesa"/"rifiutato"
  const alias = { approvato: 'approved', in_attesa: 'pending', rifiutato: 'rejected' };
  stato = alias[stato] || stato;
  const map = { approved: 'badge-approved', pending: 'badge-pending', rejected: 'badge-rejected', sospeso: 'badge-sospeso' };
  const lbl = { approved: 'Approvato', pending: 'In attesa', rejected: 'Rifiutato', sospeso: 'Sospeso' };
  return `<span class="badge ${map[stato] || 'badge-info'}">${lbl[stato] || stato}</span>`;
};

// data iscrizione: la spec usa "registratoIl", versioni precedenti "creatoIl"
window.getDataIscrizione = function(u) {
  return (u && (u.registratoIl || u.creatoIl)) || null;
};
window.avatarEl = function(u) {
  if (u.foto || u.ava) return `<img src="${u.foto || u.ava}" class="avatar" onerror="this.outerHTML='<div class=avatar>${(u.nome || '?')[0]}</div>'">`;
  return `<div class="avatar">${(u.nome || '?')[0].toUpperCase()}</div>`;
};
// ── TIPI TURNO (allineati all'app militari) ──
window.TURNI_SERVIZIO = ['M', 'ML', 'P', 'PL', 'N', 'S'];
window.TURNI_PERSONALI = ['riposo', 'ferie', 'recupero', 'licenza', 'permesso', 'studio', '937', '104', 'ls', 'fest'];
window.turnoTipi = function() { return [...window.TURNI_SERVIZIO, ...window.TURNI_PERSONALI]; };
window.TURNO_COLORS = {
  M: '#f39c12', ML: '#e67e22', P: '#2980b9', PL: '#1f6fb2', N: '#8e44ad', S: '#16a085',
  riposo: '#27ae60', ferie: '#3498db', recupero: '#7f8c8d', licenza: '#d35400', permesso: '#9b59b6',
  studio: '#34495e', '937': '#e74c3c', '104': '#c0392b', ls: '#95a5a6', fest: '#f1c40f'
};
window.turnoColor = function(tipo) {
  if (!tipo) return '#555';
  return window.TURNO_COLORS[tipo] || window.TURNO_COLORS[String(tipo).toLowerCase()] || '#555';
};
window.downloadCSV = function(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = filename; a.click();
};
window.downloadJSON = function(filename, data) {
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  a.download = filename; a.click();
};
window.getRepIds = function() {
  return [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
};

// ── NORMALIZZAZIONE ID REPARTO ──
// La spec: id = tipoStruttura_specialita_sede, minuscolo, spazi/non-alfanumerici → "_"
window.normRepId = function(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};
window.buildRepId = function(tipoStruttura, specialita, sede) {
  return [tipoStruttura, specialita, sede].map(window.normRepId).filter(Boolean).join('_');
};
window.isRepartoPrivato = function(rid) {
  return !rid || String(rid).startsWith('privato_');
};

// ── AUDIT LOG (collezione globale log_comando) ──
window.logAzione = async function(azione, target, dettaglio) {
  try {
    await addDoc(collection(window._db, 'log_comando'), {
      ts: Timestamp.now(),
      adminUid: window.AdminState.currentUser?.uid || null,
      adminEmail: window.AdminState.currentUser?.email || null,
      azione: azione || '',
      target: target ? String(target) : '',
      dettaglio: dettaglio || ''
    });
  } catch (e) { /* il log non deve mai bloccare l'azione */ }
};

// ── NAVIGAZIONE ──
window.navigateTo = function(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('[data-section]').forEach(a => a.classList.remove('active'));
  document.getElementById(`sec-${section}`).classList.add('active');
  document.querySelectorAll(`[data-section="${section}"]`).forEach(a => a.classList.add('active'));
  const titles = { dashboard: 'Dashboard', utenti: 'Utenti', reparti: 'Reparti', turni: 'Turni', agenda: 'Agenda & Todo', notifiche: 'Notifiche Push', manutenzione: 'Manutenzione', sistema: 'Sistema' };
  document.getElementById('topbar-title').textContent = titles[section] || section;
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  if (section === 'dashboard') window.loadDashboard && window.loadDashboard();
  else if (section === 'utenti') window.loadUtenti && window.loadUtenti();
  else if (section === 'reparti') window.loadReparti && window.loadReparti();
  else if (section === 'turni') window.loadTurniInit && window.loadTurniInit();
  else if (section === 'agenda') window.loadAgendaInit && window.loadAgendaInit();
  else if (section === 'notifiche') window.loadNotificheInit && window.loadNotificheInit();
  else if (section === 'manutenzione') window.loadDBStats && window.loadDBStats();
  else if (section === 'sistema') window.loadSistemaInit && window.loadSistemaInit();
};

window.initApp = function() {
  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      window.navigateTo(el.dataset.section);
    });
  });
  window.navigateTo('dashboard');
  // init month selectors
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('turni-mese').value = ym;
  document.getElementById('agenda-mese-fil').value = ym;
  document.getElementById('maint-turni-mese').value = ym;
};
