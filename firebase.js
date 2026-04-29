import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
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
  const map = { approved: 'badge-approved', pending: 'badge-pending', rejected: 'badge-rejected', sospeso: 'badge-sospeso' };
  const lbl = { approved: 'Approvato', pending: 'In attesa', rejected: 'Rifiutato', sospeso: 'Sospeso' };
  return `<span class="badge ${map[stato] || 'badge-info'}">${lbl[stato] || stato}</span>`;
};
window.avatarEl = function(u) {
  if (u.foto || u.ava) return `<img src="${u.foto || u.ava}" class="avatar" onerror="this.outerHTML='<div class=avatar>${(u.nome || '?')[0]}</div>'">`;
  return `<div class="avatar">${(u.nome || '?')[0].toUpperCase()}</div>`;
};
window.turnoColor = function(tipo) {
  const map = { mattina: '#f39c12', pomeriggio: '#2980b9', notte: '#8e44ad', riposo: '#27ae60', ferie: '#16a085', malattia: '#c0392b', licenza: '#d35400', recupero: '#7f8c8d' };
  return map[tipo] || '#555';
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

// ── NAVIGAZIONE ──
window.navigateTo = function(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('[data-section]').forEach(a => a.classList.remove('active'));
  document.getElementById(`sec-${section}`).classList.add('active');
  document.querySelectorAll(`[data-section="${section}"]`).forEach(a => a.classList.add('active'));
  const titles = { dashboard: 'Dashboard', utenti: 'Utenti', reparti: 'Reparti', turni: 'Turni', agenda: 'Agenda & Todo', notifiche: 'Notifiche Push', manutenzione: 'Manutenzione' };
  document.getElementById('topbar-title').textContent = titles[section] || section;
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  if (section === 'dashboard') window.loadDashboard && window.loadDashboard();
  else if (section === 'utenti') window.loadUtenti && window.loadUtenti();
  else if (section === 'reparti') window.loadReparti && window.loadReparti();
  else if (section === 'turni') window.loadTurniInit && window.loadTurniInit();
  else if (section === 'agenda') window.loadAgendaInit && window.loadAgendaInit();
  else if (section === 'notifiche') window.loadNotificheInit && window.loadNotificheInit();
  else if (section === 'manutenzione') window.loadDBStats && window.loadDBStats();
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
