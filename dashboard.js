import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.loadDashboard = async function() {
  try {
    const uSnap = await getDocs(collection(db, 'utenti'));
    const utenti = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    window.AdminState.utenti = utenti;
    // Reparti: dalla collezione reparti (fonte di verità) + eventuali id solo sugli utenti
    let repIds = [];
    try {
      const rSnap = await getDocs(collection(db, 'reparti'));
      repIds = rSnap.docs.map(d => d.id);
    } catch (e) { /* permessi: fallback utenti */ }
    const idsFromUsers = [...new Set(utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
    idsFromUsers.forEach(id => { if (!repIds.includes(id)) repIds.push(id); });
    document.getElementById('stat-utenti').textContent = utenti.length;
    document.getElementById('stat-reparti').textContent = repIds.length;
    document.getElementById('stat-pending').textContent = utenti.filter(u => u.stato === 'pending' || u.stato === 'in_attesa').length;

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
      const ta = window.getDataIscrizione(a)?.toDate?.()?.getTime() || 0;
      const tb = window.getDataIscrizione(b)?.toDate?.()?.getTime() || 0;
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

    // ripartizione membri per stato e ruolo
    const byStato = {}, byRuolo = {};
    utenti.forEach(u => {
      const s = u.stato || 'nd';
      byStato[s] = (byStato[s] || 0) + 1;
      const r = u.ruolo || 'addetto';
      byRuolo[r] = (byRuolo[r] || 0) + 1;
    });
    const sb = document.getElementById('stato-breakdown');
    if (sb) sb.innerHTML = `
      <div class="divider"></div>
      <div class="text-muted" style="margin-bottom:6px">Membri per stato</div>
      <div class="flex-gap">${Object.entries(byStato).map(([k, v]) => `<span class="badge badge-info">${k}: ${v}</span>`).join('')}</div>
      <div class="text-muted" style="margin:10px 0 6px">Membri per ruolo</div>
      <div class="flex-gap">${Object.entries(byRuolo).map(([k, v]) => `<span class="badge badge-info">${k}: ${v}</span>`).join('')}</div>`;

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
