import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

const db = window._db;
let utentiFilter = "tutti";

window.loadUtenti = async function() {
  document.getElementById('utenti-loading').style.display = 'block';
  document.getElementById('utenti-tbody').innerHTML = '';
  try {
    const snap = await getDocs(collection(db, 'utenti'));
    window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUtenti();
  } catch (e) { window.toast('Errore caricamento utenti: ' + e.message, 'error'); }
  document.getElementById('utenti-loading').style.display = 'none';
};

window.setUtentiFilter = function(f, el) {
  utentiFilter = f;
  document.querySelectorAll('#utenti-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderUtenti();
};

window.filterUtenti = function() { renderUtenti(); };

function renderUtenti() {
  const q = document.getElementById('utenti-search').value.toLowerCase();
  let list = window.AdminState.utenti;
  if (utentiFilter !== 'tutti') list = list.filter(u => u.stato === utentiFilter);
  if (q) list = list.filter(u => (u.nome + ' ' + u.cognome + ' ' + u.email).toLowerCase().includes(q));
  const tbody = document.getElementById('utenti-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div>Nessun utente trovato</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(u => `
    <tr>
      <td>${window.avatarEl(u)}</td>
      <td><div style="font-weight:500">${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}</div></td>
      <td>${u.email || '—'}</td>
      <td>${u.reparto || '—'}</td>
      <td>${window.badgeStato(u.stato)}</td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="openDrawerDettaglio('${u.id}')">👁 Dettaglio</button>
          <div class="dropdown">
            <button class="btn btn-ghost btn-xs" onclick="toggleDropdown('dd-${u.id}')">⋮ Azioni</button>
            <div class="dropdown-menu" id="dd-${u.id}">
              <button onclick="openEditUtente('${u.id}');toggleDropdown('dd-${u.id}')">✏️ Modifica</button>
              <button onclick="setUtenteStato('${u.id}','approved');toggleDropdown('dd-${u.id}')">✅ Approva</button>
              <button onclick="setUtenteStato('${u.id}','rejected');toggleDropdown('dd-${u.id}')">⛔ Rifiuta</button>
              <button onclick="openTransferModal('${u.id}');toggleDropdown('dd-${u.id}')">🔀 Trasferisci reparto</button>
              <button onclick="resetPasswordUtente('${u.id}');toggleDropdown('dd-${u.id}')">🔑 Reset password</button>
              <button onclick="toggleSospendi('${u.id}','${u.stato}');toggleDropdown('dd-${u.id}')">${u.stato === 'sospeso' ? '✅ Riabilita' : '🚫 Sospendi'}</button>
              <button onclick="scollegaReparto('${u.id}');toggleDropdown('dd-${u.id}')">🔗 Scollega reparto</button>
              <div class="sep"></div>
              <button onclick="eliminaUtente('${u.id}');toggleDropdown('dd-${u.id}')" style="color:var(--danger)">🗑️ Elimina</button>
            </div>
          </div>
        </div>
      </td>
    </tr>`).join('');
}

// helper di popolamento modal
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function setSel(id, v) { const el = document.getElementById(id); if (el) el.value = (v === undefined || v === null) ? '' : String(v); }
function setJSON(id, v, def) { const el = document.getElementById(id); if (el) el.value = (v === undefined || v === null) ? def : JSON.stringify(v, null, 2); }
function parseJSONOr(id, fallback) {
  const raw = document.getElementById(id).value.trim();
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('JSON non valido nel campo "' + id.replace('edit-', '') + '"'); }
}

window.openEditUtente = function(uid) {
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (!u) return;
  document.getElementById('edit-uid').value = uid;
  setVal('edit-nome', u.nome); setVal('edit-cognome', u.cognome);
  setVal('edit-grado', u.grado); setVal('edit-reparto', u.reparto);
  setVal('edit-email', u.email); setVal('edit-tipo', u.tipo);
  setVal('edit-tipoStruttura', u.tipoStruttura); setVal('edit-modalita', u.modalita);
  setVal('edit-tema', u.tema); setVal('edit-meteoCitta', u.meteoCitta);
  setVal('edit-myPid', u.myPid); setVal('edit-ava', u.ava || u.foto || u.fotoURL);
  document.getElementById('edit-ruolo').value = u.ruolo || 'addetto';
  document.getElementById('edit-stato').value = (u.stato === 'approvato' ? 'approved' : u.stato) || 'pending';
  setVal('edit-ferieRes', u.ferieRes || 0);
  setVal('edit-ferieUsate', u.ferieUsate || 0);
  setVal('edit-recuperi', u.recuperi || 0);
  setSel('edit-priv-condividi', u.privacy?.condividiTurni);
  setSel('edit-priv-tos', u.privacy?.tosAccepted);
  setVal('edit-notifPre', u.notif_pre);
  document.getElementById('edit-notifPreSwitch').checked = !!u.notif_pre;
  setJSON('edit-licenzePool', u.licenzePool, '[]');
  setJSON('edit-permessiStudioMonte', u.permessiStudioMonte, '{}');
  setJSON('edit-straordinari', u.straordinari, '[]');
  setJSON('edit-ctRecuperi', u.ct_recuperi, '[]');
  setJSON('edit-ctFestSopp', u.ct_fest_sopp, '[]');
  setJSON('edit-notifPrefs', u.notif_prefs, '{}');
  window.openModal('modal-utente');
};

window.saveUtente = async function() {
  const uid = document.getElementById('edit-uid').value;
  let data;
  try {
    const condividi = document.getElementById('edit-priv-condividi').value;
    const tos = document.getElementById('edit-priv-tos').value;
    const privacy = {};
    if (condividi !== '') privacy.condividiTurni = condividi === 'true';
    if (tos !== '') privacy.tosAccepted = tos === 'true';
    data = {
      nome: document.getElementById('edit-nome').value.trim(),
      cognome: document.getElementById('edit-cognome').value.trim(),
      grado: document.getElementById('edit-grado').value.trim(),
      reparto: document.getElementById('edit-reparto').value.trim(),
      email: document.getElementById('edit-email').value.trim(),
      tipo: document.getElementById('edit-tipo').value.trim(),
      tipoStruttura: document.getElementById('edit-tipoStruttura').value.trim(),
      modalita: document.getElementById('edit-modalita').value.trim(),
      tema: document.getElementById('edit-tema').value.trim(),
      meteoCitta: document.getElementById('edit-meteoCitta').value.trim(),
      myPid: document.getElementById('edit-myPid').value.trim(),
      ava: document.getElementById('edit-ava').value.trim(),
      ruolo: document.getElementById('edit-ruolo').value,
      stato: document.getElementById('edit-stato').value,
      ferieRes: Number(document.getElementById('edit-ferieRes').value) || 0,
      ferieUsate: Number(document.getElementById('edit-ferieUsate').value) || 0,
      recuperi: Number(document.getElementById('edit-recuperi').value) || 0,
      notif_pre: document.getElementById('edit-notifPreSwitch').checked,
      licenzePool: parseJSONOr('edit-licenzePool', []),
      permessiStudioMonte: parseJSONOr('edit-permessiStudioMonte', {}),
      straordinari: parseJSONOr('edit-straordinari', []),
      ct_recuperi: parseJSONOr('edit-ctRecuperi', []),
      ct_fest_sopp: parseJSONOr('edit-ctFestSopp', []),
      notif_prefs: parseJSONOr('edit-notifPrefs', {})
    };
    if (Object.keys(privacy).length) data.privacy = privacy;
  } catch (e) { window.toast(e.message, 'error'); return; }
  try {
    await updateDoc(doc(db, 'utenti', uid), data);
    await window.logAzione('modifica_utente', uid);
    window.toast('Utente aggiornato', 'success');
    window.closeModal('modal-utente');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── APPROVA / RIFIUTA SINGOLO ──
window.setUtenteStato = async function(uid, stato) {
  const labels = { approved: 'Approvare', rejected: 'Rifiutare', pending: 'Rimettere in attesa' };
  if (!await window.confirm2(`${labels[stato] || 'Aggiornare'} questo utente?`)) return;
  const data = { stato };
  if (stato === 'approved') data.approvatoIl = Timestamp.now();
  try {
    await updateDoc(doc(db, 'utenti', uid), data);
    await window.logAzione('stato_utente', uid, stato);
    window.toast('Stato aggiornato', 'success');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── TRASFERIMENTO TRA REPARTI ──
window.openTransferModal = function(uid) {
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (!u) return;
  document.getElementById('tr-uid').value = uid;
  document.getElementById('tr-utente-display').value = `${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}`.trim() || u.email || uid;
  document.getElementById('tr-old-display').value = u.reparto || '(nessuno)';
  const sel = document.getElementById('tr-new-rep');
  const reps = (window.AdminState.reparti && window.AdminState.reparti.length)
    ? window.AdminState.reparti.map(r => r.id)
    : window.getRepIds();
  const opts = reps.filter(id => id && id !== u.reparto);
  sel.innerHTML = opts.length ? opts.map(id => `<option value="${id}">${id}</option>`).join('') : '<option value="">(nessun altro reparto)</option>';
  window.openModal('modal-trasferisci');
};

window.saveTrasferimento = async function() {
  const uid = document.getElementById('tr-uid').value;
  const newRep = document.getElementById('tr-new-rep').value;
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (!u || !newRep) { window.toast('Seleziona un reparto valido', 'warn'); return; }
  const oldRep = u.reparto;
  if (oldRep === newRep) { window.toast('È già in questo reparto', 'warn'); return; }
  const isSuper = window.AdminState.currentUser?.ruolo === 'superadmin';
  const newStato = isSuper ? 'approved' : 'pending';
  try {
    // 1. aggiorna il profilo globale
    await updateDoc(doc(db, 'utenti', uid), { reparto: newRep, stato: newStato });
    // 2. rimuovi dal vecchio reparto
    if (oldRep && !oldRep.startsWith('privato_')) {
      try { await deleteDoc(doc(db, 'reparti', oldRep, 'utenti', uid)); } catch (e) { /* non presente */ }
    }
    // 3. inserisci nel nuovo reparto
    await setDoc(doc(db, 'reparti', newRep, 'utenti', uid), {
      uid, nome: u.nome || '', cognome: u.cognome || '', grado: u.grado || '',
      email: u.email || '', ruolo: u.ruolo || 'addetto', stato: newStato, reparto: newRep
    }, { merge: true });
    await window.logAzione('trasferimento_utente', uid, `${oldRep || '(nessuno)'} → ${newRep} (${newStato})`);
    window.toast('Utente trasferito in ' + newRep, 'success');
    window.closeModal('modal-trasferisci');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.toggleSospendi = async function(uid, stato) {
  const newStato = stato === 'sospeso' ? 'approved' : 'sospeso';
  const msg = stato === 'sospeso' ? 'Riabilitare questo utente?' : 'Sospendere questo utente?';
  if (!await window.confirm2(msg)) return;
  try {
    await updateDoc(doc(db, 'utenti', uid), { stato: newStato });
    window.toast('Stato aggiornato', 'success');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.scollegaReparto = async function(uid) {
  if (!await window.confirm2('Scollegare questo utente dal reparto?')) return;
  const u = window.AdminState.utenti.find(x => x.id === uid);
  const oldRep = u?.reparto;
  try {
    await updateDoc(doc(db, 'utenti', uid), { reparto: '' });
    // rimuovi anche l'appartenenza nella sottocollezione del reparto
    if (oldRep && !oldRep.startsWith('privato_')) {
      try { await deleteDoc(doc(db, 'reparti', oldRep, 'utenti', uid)); } catch (e) { /* non presente */ }
    }
    window.toast('Reparto scollegato', 'success');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── CANCELLAZIONE COMPLETA UTENTE ──
// Elimina in blocchi da 400 (limite batch Firestore = 500)
async function batchDeleteRefs(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach(r => batch.delete(r));
    await batch.commit();
  }
}

window.eliminaUtente = async function(uid) {
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (!await window.confirm2('Eliminare DEFINITIVAMENTE questo utente? Verranno rimossi profilo, sottocollezioni (agenda/todo/notifiche), appartenenza di reparto, suoi turni, personale, link_utenti, dino_scores e notifiche_push. Azione irreversibile.', 'Elimina utente', 'Elimina')) return;
  try {
    const refs = [];
    // 1. sottocollezioni globali
    for (const sub of ['agenda', 'todo', 'notifiche']) {
      try { const s = await getDocs(collection(db, 'utenti', uid, sub)); s.docs.forEach(d => refs.push(d.ref)); } catch (e) {}
    }
    // 2. coda push dell'utente
    try { const s = await getDocs(query(collection(db, 'notifiche_push'), where('uid', '==', uid))); s.docs.forEach(d => refs.push(d.ref)); } catch (e) {}
    // 3. reparti coinvolti
    const reps = new Set((window.AdminState.reparti || []).map(r => r.id));
    if (u?.reparto) reps.add(u.reparto);
    for (const rid of reps) {
      if (!rid || rid.startsWith('privato_')) continue;
      try { refs.push(doc(db, 'reparti', rid, 'utenti', uid)); } catch (e) {}
      try { refs.push(doc(db, 'reparti', rid, 'personale', uid)); } catch (e) {}
      try { refs.push(doc(db, 'reparti', rid, 'link_utenti', uid)); } catch (e) {}
      try { refs.push(doc(db, 'reparti', rid, 'dino_scores', uid)); } catch (e) {}
      try {
        const t = await getDocs(collection(db, 'reparti', rid, 'turni'));
        t.docs.forEach(d => { const x = d.data(); if (x.uid === uid || x.ownerUid === uid || x.userId === uid) refs.push(d.ref); });
      } catch (e) {}
      try {
        const rq = await getDocs(collection(db, 'reparti', rid, 'richieste'));
        rq.docs.forEach(d => { const x = d.data(); if (x.uid === uid || x.userId === uid || x.ownerUid === uid) refs.push(d.ref); });
      } catch (e) {}
    }
    await batchDeleteRefs(refs);
    // 4. profilo globale
    await deleteDoc(doc(db, 'utenti', uid));
    await window.logAzione('eliminazione_utente', uid, `${refs.length} documenti collegati rimossi`);
    window.toast(`Utente eliminato (${refs.length} documenti collegati)`, 'success');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── RESET PASSWORD (email) ──
window.resetPasswordUtente = async function(uid) {
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (!u?.email) { window.toast('Questo utente non ha una email', 'warn'); return; }
  if (!await window.confirm2(`Inviare l'email di reset password a ${u.email}?`)) return;
  try {
    await sendPasswordResetEmail(window._auth, u.email);
    await window.logAzione('reset_password', uid, u.email);
    window.toast('Email di reset password inviata a ' + u.email, 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.bulkApprovePending = async function() {
  const pending = window.AdminState.utenti.filter(u => u.stato === 'pending');
  if (!pending.length) { window.toast('Nessun utente in attesa', 'info'); return; }
  if (!await window.confirm2(`Approvare ${pending.length} utenti in attesa?`)) return;
  try {
    const batch = writeBatch(db);
    pending.forEach(u => batch.update(doc(db, 'utenti', u.id), { stato: 'approved' }));
    await batch.commit();
    window.toast(`${pending.length} utenti approvati`, 'success');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.openDrawerDettaglio = async function(uid) {
  const snap = await getDoc(doc(db, 'utenti', uid));
  if (!snap.exists()) { window.toast('Utente non trovato', 'error'); return; }
  const d = snap.data();
  const fields = [
    ['UID', uid], ['Nome', d.nome], ['Cognome', d.cognome], ['Email', d.email],
    ['Grado', d.grado], ['Ruolo', d.ruolo], ['Stato', d.stato], ['Reparto', d.reparto],
    ['Tipo', d.tipo], ['Tipo struttura', d.tipoStruttura], ['Modalità', d.modalita],
    ['Ferie residue', d.ferieRes], ['Ferie usate', d.ferieUsate], ['Recuperi', d.recuperi],
    ['Iscritto il', window.fmtTs(window.getDataIscrizione(d))],
    ['myPid', d.myPid], ['Tema', d.tema], ['Avatar (ava)', d.ava || d.foto || d.fotoURL],
    ['Meteo città', d.meteoCitta], ['FCM Token', d.fcmToken ? d.fcmToken.slice(0, 40) + '…' : '—'],
    ['Licenze pool', JSON.stringify(d.licenzePool || [])],
    ['Permessi studio monte', JSON.stringify(d.permessiStudioMonte || {})],
    ['Straordinari', JSON.stringify(d.straordinari || [])],
    ['Recuperi (ct_recuperi)', JSON.stringify(d.ct_recuperi || [])],
    ['Feste soppresse (ct_fest_sopp)', JSON.stringify(d.ct_fest_sopp || [])],
    ['notif_prefs', JSON.stringify(d.notif_prefs || {})],
    ['notif_pre', d.notif_pre],
    ['Privacy condividiTurni', d.privacy?.condividiTurni],
    ['Privacy tosAccepted', d.privacy?.tosAccepted],
  ];
  document.getElementById('drawer-body').innerHTML = fields.map(([k, v]) => `
    <div class="drawer-field">
      <div class="df-label">${k}</div>
      <div class="df-val">${v === undefined || v === null ? '—' : String(v)}</div>
    </div>`).join('');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-overlay').style.display = 'block';
};
