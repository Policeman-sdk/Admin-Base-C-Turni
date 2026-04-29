import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.loadDashboard = async function() {
  try {
    const uSnap = await getDocs(collection(db, 'utenti'));
    const utenti = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    window.AdminState.utenti = utenti;
    // Ricava reparti dagli utenti
    const repIds = [...new Set(utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
    document.getElementById('stat-utenti').textContent = utenti.length;
    document.getElementById('stat-reparti').textContent = repIds.length;
    document.getElementById('stat-pending').textContent = utenti.filter(u => u.stato === 'pending').length;

    // turni totali e oggi
    let turniAll = [], oggi = new Date().toISOString().slice(0, 10);
    for (const rid of repIds) {
      try {
        const ts = await getDocs(collection(db, 'reparti', rid, 'turni'));
        ts.docs.forEach(d => turniAll.push({ ...d.data() }));
      } catch (e) { /* reparto senza turni */ }
    }
    document.getElementById('stat-turni').textContent = turniAll.length;
    document.getElementById('stat-oggi').textContent = turniAll.filter(t => t.data === oggi).length;

    // ultimi 5 utenti
    const sorted = [...utenti].sort((a, b) => {
      const ta = a.creatoIl?.toDate?.()?.getTime() || 0;
      const tb = b.creatoIl?.toDate?.()?.getTime() || 0;
      return tb - ta;
    }).slice(0, 5);
    document.getElementById('recent-users').innerHTML = sorted.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        ${window.avatarEl(u)}
        <div style="flex:1">
          <div style="font-weight:500;font-size:.9rem">${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}</div>
          <div class="text-muted">${u.email || ''}</div>
        </div>
        ${window.badgeStato(u.stato)}
      </div>`).join('');

    // grafico turni per tipo
    const tipiCount = {};
    turniAll.forEach(t => { tipiCount[t.tipo] = (tipiCount[t.tipo] || 0) + 1; });
    const maxV = Math.max(...Object.values(tipiCount), 1);
    document.getElementById('turni-chart').innerHTML = Object.entries(tipiCount).map(([tipo, cnt]) => `
      <div class="bar-item">
        <div class="bar-val">${cnt}</div>
        <div class="bar" style="height:${Math.round((cnt / maxV) * 100)}px;background:${window.turnoColor(tipo)}"></div>
        <div class="bar-label">${tipo}</div>
      </div>`).join('');
  } catch (e) { window.toast('Errore dashboard: ' + e.message, 'error'); }
};
