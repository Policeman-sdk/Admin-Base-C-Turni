import {
  collection, doc, getDocs, getDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

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

window.openEditUtente = function(uid) {
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (!u) return;
  document.getElementById('edit-uid').value = uid;
  document.getElementById('edit-nome').value = u.nome || '';
  document.getElementById('edit-cognome').value = u.cognome || '';
  document.getElementById('edit-grado').value = u.grado || '';
  document.getElementById('edit-reparto').value = u.reparto || '';
  document.getElementById('edit-ruolo').value = u.ruolo || 'addetto';
  document.getElementById('edit-stato').value = u.stato || 'pending';
  document.getElementById('edit-ferieRes').value = u.ferieRes || 0;
  document.getElementById('edit-ferieUsate').value = u.ferieUsate || 0;
  document.getElementById('edit-recuperi').value = u.recuperi || 0;
  window.openModal('modal-utente');
};

window.saveUtente = async function() {
  const uid = document.getElementById('edit-uid').value;
  const data = {
    nome: document.getElementById('edit-nome').value.trim(),
    cognome: document.getElementById('edit-cognome').value.trim(),
    grado: document.getElementById('edit-grado').value.trim(),
    reparto: document.getElementById('edit-reparto').value.trim(),
    ruolo: document.getElementById('edit-ruolo').value,
    stato: document.getElementById('edit-stato').value,
    ferieRes: Number(document.getElementById('edit-ferieRes').value) || 0,
    ferieUsate: Number(document.getElementById('edit-ferieUsate').value) || 0,
    recuperi: Number(document.getElementById('edit-recuperi').value) || 0,
  };
  try {
    await updateDoc(doc(db, 'utenti', uid), data);
    window.toast('Utente aggiornato', 'success');
    window.closeModal('modal-utente');
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
  try {
    await updateDoc(doc(db, 'utenti', uid), { reparto: '' });
    window.toast('Reparto scollegato', 'success');
    window.loadUtenti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.eliminaUtente = async function(uid) {
  if (!await window.confirm2('Eliminare definitivamente questo utente? Azione irreversibile.', 'Elimina utente', 'Elimina')) return;
  try {
    await deleteDoc(doc(db, 'utenti', uid));
    window.toast('Utente eliminato', 'success');
    window.loadUtenti();
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
    ['Ferie residue', d.ferieRes], ['Ferie usate', d.ferieUsate], ['Recuperi', d.recuperi],
    ['Creato il', window.fmtTs(d.creatoIl)], ['myPid', d.myPid], ['Tema', d.tema],
    ['Meteo città', d.meteoCitta], ['FCM Token', d.fcmToken ? d.fcmToken.slice(0, 40) + '…' : '—'],
    ['Licenze pool', JSON.stringify(d.licenzePool || [])],
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
