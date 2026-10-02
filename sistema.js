import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, orderBy, limit, Timestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.loadSistemaInit = async function() {
  if (!window.AdminState.utenti.length) {
    const snap = await getDocs(collection(db, 'utenti'));
    window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  window.renderSuperadmin();
};

window.switchSistemaTab = function(tab, el) {
  document.querySelectorAll('#sec-sistema .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#sec-sistema .tab-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`sis-tab-${tab}`).classList.add('active');
  if (tab === 'superadmin') window.renderSuperadmin();
  else if (tab === 'log') window.renderLog();
  else if (tab === 'dino') window.renderDino();
  else if (tab === 'global') window.renderGlobalSettings();
};

// ── ELENCO SUPERADMIN ──
window.renderSuperadmin = function() {
  const el = document.getElementById('sis-tab-superadmin');
  const supers = (window.AdminState.utenti || []).filter(u => u.ruolo === 'superadmin');
  const others = (window.AdminState.utenti || []).filter(u => u.ruolo !== 'superadmin');
  const nome = u => `${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}`.trim() || u.email || u.id;
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:12px;font-size:1rem">🛡️ Superadmin attuali (${supers.length})</h3>
      ${supers.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>Email</th><th>Reparto</th><th>Azioni</th></tr></thead>
        <tbody>${supers.map(u => ` <tr>
          <td>${nome(u)}</td><td>${u.email || '—'}</td><td>${u.reparto || '—'}</td>
          <td><button class="btn btn-warn btn-xs" onclick="impostaSuperadmin('${u.id}')">⬇️ Rimuovi superadmin</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="text-muted">Nessun superadmin.</p>'}
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;font-size:1rem">Promuovi a superadmin</h3>
      <div class="flex-gap">
        <select id="super-promote-sel" style="flex:1;min-width:200px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm)">
          ${others.map(u => `<option value="${u.id}">${nome(u)} (${u.email || u.id})</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="promuoviSuperadmin()">⬆️ Promuovi</button>
      </div>
      <p class="text-muted" style="font-size:.8rem;margin-top:8px">Il <strong>primo</strong> superadmin va impostato manualmente in console Firebase (modificando <code>utenti/{uid}.ruolo</code>). Da qui se ne possono nominare/rimuovere altri.</p>
    </div>`;
};

window.promuoviSuperadmin = async function() {
  const uid = document.getElementById('super-promote-sel').value;
  if (!uid) { window.toast('Nessun utente selezionato', 'warn'); return; }
  if (!await window.confirm2('Promuovere questo utente a superadmin?')) return;
  try {
    await updateDoc(doc(db, 'utenti', uid), { ruolo: 'superadmin' });
    await window.logAzione('promozione_superadmin', uid);
    window.toast('Utente promosso a superadmin', 'success');
    window.AdminState.utenti = window.AdminState.utenti.map(u => u.id === uid ? { ...u, ruolo: 'superadmin' } : u);
    window.renderSuperadmin();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.impostaSuperadmin = async function(uid) {
  if (!await window.confirm2('Rimuovere il ruolo superadmin da questo utente?')) return;
  try {
    await updateDoc(doc(db, 'utenti', uid), { ruolo: 'addetto' });
    await window.logAzione('rimozione_superadmin', uid);
    window.toast('Ruolo superadmin rimosso', 'success');
    window.AdminState.utenti = window.AdminState.utenti.map(u => u.id === uid ? { ...u, ruolo: 'addetto' } : u);
    window.renderSuperadmin();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── AUDIT LOG ──
window.renderLog = async function() {
  const el = document.getElementById('sis-tab-log');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const snap = await getDocs(query(collection(db, 'log_comando'), orderBy('ts', 'desc'), limit(200)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = `<div class="card">
      <h3 style="margin-bottom:12px;font-size:1rem">📜 Ultime 200 azioni</h3>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Quando</th><th>Admin</th><th>Azione</th><th>Target</th><th>Dettaglio</th></tr></thead>
        <tbody>${list.map(l => `<tr>
          <td>${window.fmtTs(l.ts)}</td>
          <td>${l.adminEmail || l.adminUid || '—'}</td>
          <td>${l.azione || '—'}</td>
          <td>${l.target || '—'}</td>
          <td>${l.dettaglio || '—'}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="text-muted">Nessuna azione registrata.</p>'}
    </div>`;
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">Errore log: ${e.message}</p>`; }
};

// ── LEADERBOARD DINO ──
window.renderDino = async function() {
  const el = document.getElementById('sis-tab-dino');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const rows = [];
  for (const r of (window.AdminState.reparti || [])) {
    try {
      const s = await getDocs(collection(db, 'reparti', r.id, 'dino_scores'));
      s.docs.forEach(d => rows.push({ reparto: r.id, uid: d.id, ...d.data() }));
    } catch (e) { /* sottocollezione assente */ }
  }
  const scoreOf = r => r.score ?? r.punti ?? r.punteggio ?? r.points ?? 0;
  rows.sort((a, b) => scoreOf(b) - scoreOf(a));
  const nome = uid => { const x = (window.AdminState.utenti || []).find(z => z.id === uid); return x ? (`${x.grado || ''} ${x.nome || ''} ${x.cognome || ''}`.trim() || x.email) : uid; };
  el.innerHTML = `<div class="card">
    <h3 style="margin-bottom:12px;font-size:1rem">🏆 Leaderboard Dino</h3>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Utente</th><th>Reparto</th><th>Punteggio</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${nome(r.uid)}</td><td>${r.reparto}</td><td>${scoreOf(r)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="text-muted">Nessun punteggio in <code>dino_scores</code>.</p>'}
  </div>`;
};

// ── IMPOSTAZIONI GLOBALI (config/globale) ──
window.renderGlobalSettings = async function() {
  const el = document.getElementById('sis-tab-global');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let d = {};
  try { const s = await getDoc(doc(db, 'config', 'globale')); d = s.exists() ? s.data() : {}; } catch (e) {}
  el.innerHTML = `<div class="card" style="max-width:560px">
    <h3 style="margin-bottom:12px;font-size:1rem">⚙️ Parametri globali (config/globale)</h3>
    <div class="form-row">
      <div class="form-group"><label>Versione minima app</label><input type="text" id="glob-versione" value="${d.versioneMinima || ''}"></div>
      <div class="form-group"><label>Manutenzione</label>
        <select id="glob-manutenzione"><option value="false">Off</option><option value="true" ${d.manutenzione ? 'selected' : ''}>On</option></select>
      </div>
    </div>
    <div class="form-group"><label>Messaggio manutenzione</label><input type="text" id="glob-msg" value="${d.messaggioManutenzione || ''}"></div>
    <div class="form-group"><label>Flag funzioni (JSON)</label><textarea id="glob-flags" rows="3">${JSON.stringify(d.flags || {}, null, 2)}</textarea></div>
    <button class="btn btn-primary btn-sm mt-12" onclick="saveGlobalSettings()">💾 Salva</button>
  </div>`;
};

window.saveGlobalSettings = async function() {
  let flags;
  try { flags = JSON.parse(document.getElementById('glob-flags').value || '{}'); }
  catch (e) { window.toast('JSON flag non valido', 'error'); return; }
  const data = {
    versioneMinima: document.getElementById('glob-versione').value.trim(),
    manutenzione: document.getElementById('glob-manutenzione').value === 'true',
    messaggioManutenzione: document.getElementById('glob-msg').value.trim(),
    flags, aggiornatoIl: Timestamp.now()
  };
  try {
    await setDoc(doc(db, 'config', 'globale'), data, { merge: true });
    await window.logAzione('impostazioni_globali', 'config/globale');
    window.toast('Impostazioni globali salvate', 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};