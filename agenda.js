import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.loadAgendaInit = async function() {
  const snap = await getDocs(collection(db, 'utenti'));
  window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const opts = window.AdminState.utenti.map(u => `<option value="${u.id}">${u.grado || ''} ${u.nome || ''} ${u.cognome || ''} (${u.email || ''})</option>`).join('');
  document.getElementById('agenda-utente-sel').innerHTML = opts;
  if (window.AdminState.utenti.length) window.onAgendaUtenteChange();
};

window.onAgendaUtenteChange = function() {
  window.loadAgendaPersonale();
  window.loadTodoPersonali();
  window.loadNotificheUtente();
  const uid = document.getElementById('agenda-utente-sel').value;
  const u = window.AdminState.utenti.find(x => x.id === uid);
  const reparto = u?.reparto;
  if (reparto && !reparto.startsWith('privato_')) {
    loadAgendaCondivisaReparto(reparto);
    loadTodoCondivisiReparto(reparto);
  } else {
    document.getElementById('agenda-cond-container').innerHTML = '<div class="empty-state"><div class="empty-icon">🏛️</div>Utente senza reparto condiviso</div>';
    document.getElementById('todo-cond-container').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>Utente senza reparto condiviso</div>';
  }
};

window.switchAgendaTab = function(tab, el) {
  document.querySelectorAll('#sec-agenda .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#sec-agenda .tab-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  const uid = document.getElementById('agenda-utente-sel').value;
  const u = window.AdminState.utenti.find(x => x.id === uid);
  if (tab === 'agenda-pers') window.loadAgendaPersonale();
  else if (tab === 'todo-pers') window.loadTodoPersonali();
  else if (tab === 'notif-utente') window.loadNotificheUtente();
  else if (tab === 'agenda-cond' && u?.reparto && !u.reparto.startsWith('privato_')) loadAgendaCondivisaReparto(u.reparto);
  else if (tab === 'todo-cond' && u?.reparto && !u.reparto.startsWith('privato_')) loadTodoCondivisiReparto(u.reparto);
};

// ── AGENDA PERSONALE ──
window.loadAgendaPersonale = async function() {
  const uid = document.getElementById('agenda-utente-sel').value;
  const mese = document.getElementById('agenda-mese-fil').value;
  if (!uid) return;
  const snap = await getDocs(collection(db, 'utenti', uid, 'agenda'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => !mese || a.data?.startsWith(mese)).sort((a, b) => a.data > b.data ? 1 : -1);
  document.getElementById('agenda-list').innerHTML = list.length ? list.map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface);border-radius:var(--radius-sm);margin-bottom:8px;box-shadow:var(--shadow)">
      <span style="font-size:1.3rem">📅</span>
      <div style="flex:1">
        <div style="font-weight:500">${a.titolo || '—'}</div>
        <div class="text-muted" style="font-size:.8rem">${a.data || ''} ${a.ora || ''}</div>
        ${a.note ? `<div class="text-muted" style="font-size:.8rem">${a.note}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-xs" onclick="openAgendaModal('${uid}','${a.id}')">✏️</button>
      <button class="btn btn-danger btn-xs" onclick="deleteAgenda('${uid}','${a.id}')">🗑️</button>
    </div>`).join('') : `<div class="empty-state"><div class="empty-icon">📅</div>Nessun appuntamento</div>`;
};

window.openAgendaModal = function(uid, aid) {
  const selUid = uid || document.getElementById('agenda-utente-sel').value;
  document.getElementById('ag-uid').value = selUid;
  document.getElementById('ag-id').value = aid || '';
  document.getElementById('modal-agenda-title').textContent = aid ? 'Modifica appuntamento' : 'Nuovo appuntamento';
  if (!aid) {
    document.getElementById('ag-titolo').value = '';
    document.getElementById('ag-data').value = new Date().toISOString().slice(0, 10);
    document.getElementById('ag-ora').value = '';
    document.getElementById('ag-note').value = '';
    window.openModal('modal-agenda'); return;
  }
  getDoc(doc(db, 'utenti', selUid, 'agenda', aid)).then(snap => {
    const d = snap.data() || {};
    document.getElementById('ag-titolo').value = d.titolo || '';
    document.getElementById('ag-data').value = d.data || '';
    document.getElementById('ag-ora').value = d.ora || '';
    document.getElementById('ag-note').value = d.note || '';
    window.openModal('modal-agenda');
  });
};

window.saveAgenda = async function() {
  const uid = document.getElementById('ag-uid').value;
  const aid = document.getElementById('ag-id').value;
  const data = {
    titolo: document.getElementById('ag-titolo').value.trim(),
    data: document.getElementById('ag-data').value,
    ora: document.getElementById('ag-ora').value,
    note: document.getElementById('ag-note').value.trim()
  };
  if (!data.titolo || !data.data) { window.toast('Titolo e data obbligatori', 'warn'); return; }
  try {
    if (aid) await updateDoc(doc(db, 'utenti', uid, 'agenda', aid), data);
    else { const ref = doc(collection(db, 'utenti', uid, 'agenda')); await setDoc(ref, { id: ref.id, ...data }); }
    window.toast('Appuntamento salvato', 'success');
    window.closeModal('modal-agenda');
    window.loadAgendaPersonale();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteAgenda = async function(uid, aid) {
  if (!await window.confirm2('Eliminare questo appuntamento?')) return;
  try {
    await deleteDoc(doc(db, 'utenti', uid, 'agenda', aid));
    window.toast('Eliminato', 'success');
    window.loadAgendaPersonale();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── TODO PERSONALI ──
window.loadTodoPersonali = async function() {
  const uid = document.getElementById('agenda-utente-sel').value;
  if (!uid) return;
  const snap = await getDocs(collection(db, 'utenti', uid, 'todo'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.data > b.data ? 1 : -1);
  document.getElementById('todo-list').innerHTML = list.length ? list.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface);border-radius:var(--radius-sm);margin-bottom:8px;box-shadow:var(--shadow)">
      <input type="checkbox" ${t.fatto ? 'checked' : ''} onchange="updateTodoFatto('${uid}','${t.id}',this.checked)">
      <div style="flex:1;${t.fatto ? 'text-decoration:line-through;color:var(--on-surface2)' : ''}">
        <div style="font-weight:500">${t.testo || '—'}</div>
        <div class="text-muted" style="font-size:.8rem">${t.data || ''}</div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="openTodoModal('${uid}','${t.id}')">✏️</button>
      <button class="btn btn-danger btn-xs" onclick="deleteTodo('${uid}','${t.id}')">🗑️</button>
    </div>`).join('') : `<div class="empty-state"><div class="empty-icon">✅</div>Nessun todo</div>`;
};

window.updateTodoFatto = async function(uid, tid, fatto) {
  try { await updateDoc(doc(db, 'utenti', uid, 'todo', tid), { fatto }); }
  catch (e) { window.toast('Errore', 'error'); }
};

window.openTodoModal = function(uid, tid) {
  const selUid = uid || document.getElementById('agenda-utente-sel').value;
  document.getElementById('todo-uid').value = selUid;
  document.getElementById('todo-id').value = tid || '';
  document.getElementById('modal-todo-title').textContent = tid ? 'Modifica todo' : 'Nuovo todo';
  if (!tid) {
    document.getElementById('todo-testo').value = '';
    document.getElementById('todo-data').value = new Date().toISOString().slice(0, 10);
    document.getElementById('todo-fatto').value = 'false';
    window.openModal('modal-todo'); return;
  }
  getDoc(doc(db, 'utenti', selUid, 'todo', tid)).then(snap => {
    const d = snap.data() || {};
    document.getElementById('todo-testo').value = d.testo || '';
    document.getElementById('todo-data').value = d.data || '';
    document.getElementById('todo-fatto').value = String(d.fatto || false);
    window.openModal('modal-todo');
  });
};

window.saveTodo = async function() {
  const uid = document.getElementById('todo-uid').value;
  const tid = document.getElementById('todo-id').value;
  const data = {
    testo: document.getElementById('todo-testo').value.trim(),
    data: document.getElementById('todo-data').value,
    fatto: document.getElementById('todo-fatto').value === 'true'
  };
  if (!data.testo) { window.toast('Testo obbligatorio', 'warn'); return; }
  try {
    if (tid) await updateDoc(doc(db, 'utenti', uid, 'todo', tid), data);
    else { const ref = doc(collection(db, 'utenti', uid, 'todo')); await setDoc(ref, { id: ref.id, ...data }); }
    window.toast('Todo salvato', 'success');
    window.closeModal('modal-todo');
    window.loadTodoPersonali();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteTodo = async function(uid, tid) {
  if (!await window.confirm2('Eliminare questo todo?')) return;
  try {
    await deleteDoc(doc(db, 'utenti', uid, 'todo', tid));
    window.toast('Eliminato', 'success');
    window.loadTodoPersonali();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── NOTIFICHE UTENTE ──
window.loadNotificheUtente = async function() {
  const uid = document.getElementById('agenda-utente-sel').value;
  if (!uid) return;
  const snap = await getDocs(collection(db, 'utenti', uid, 'notifiche'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
    const ta = a.ts?.toDate?.()?.getTime() || 0, tb = b.ts?.toDate?.()?.getTime() || 0; return tb - ta;
  });
  document.getElementById('notif-utente-list').innerHTML = list.length ? list.map(n => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:${n.letta ? 'var(--surface)' : 'var(--surface3)'};border-radius:var(--radius-sm);margin-bottom:8px;box-shadow:var(--shadow)">
      <span style="font-size:1.2rem">${n.letta ? '📭' : '📬'}</span>
      <div style="flex:1">
        <div style="font-weight:500">${n.titolo || '—'}</div>
        <div class="text-muted" style="font-size:.85rem">${n.body || ''}</div>
        <div class="text-muted" style="font-size:.75rem">${window.fmtTs(n.ts)}</div>
      </div>
      <button class="btn btn-danger btn-xs" onclick="deleteNotifica('${uid}','${n.id}')">🗑️</button>
    </div>`).join('') : `<div class="empty-state"><div class="empty-icon">🔔</div>Nessuna notifica</div>`;
};

window.segnaNotificheLette = async function() {
  const uid = document.getElementById('agenda-utente-sel').value;
  if (!uid) return;
  const snap = await getDocs(collection(db, 'utenti', uid, 'notifiche'));
  const batch = writeBatch(db);
  snap.docs.filter(d => !d.data().letta).forEach(d => batch.update(d.ref, { letta: true }));
  await batch.commit();
  window.toast('Notifiche segnate come lette', 'success');
  window.loadNotificheUtente();
};

window.deleteNotifica = async function(uid, nid) {
  try {
    await deleteDoc(doc(db, 'utenti', uid, 'notifiche', nid));
    window.toast('Eliminata', 'success');
    window.loadNotificheUtente();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── AGENDA CONDIVISA REPARTO (tab agenda-cond) ──
async function loadAgendaCondivisaReparto(rid) {
  const el = document.getElementById('agenda-cond-container');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const snap = await getDocs(collection(db, 'reparti', rid, 'agenda_condivisa'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.data > b.data ? 1 : -1);
    el.innerHTML = `
      <div class="flex-gap" style="margin-bottom:12px;flex-wrap:wrap">
        <input type="text" id="ag-cond-titolo-main" placeholder="Titolo..." style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
        <input type="date" id="ag-cond-data-main" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
        <input type="time" id="ag-cond-ora-main" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
        <button class="btn btn-primary btn-sm" onclick="addAgendaCondivisaMain('${rid}')">+ Aggiungi</button>
      </div>
      ${list.length ? list.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:1.1rem">📅</span>
          <div style="flex:1">
            <div style="font-weight:500;font-size:.9rem">${a.titolo || '—'}</div>
            <div class="text-muted" style="font-size:.8rem">${a.data || ''} ${a.ora || ''} ${a.autore ? '— ' + a.autore : ''}</div>
          </div>
          <button class="btn btn-danger btn-xs" onclick="deleteAgendaCondivisaMain('${rid}','${a.id}')">🗑️</button>
        </div>`).join('') : '<p class="text-muted">Nessun evento in agenda condivisa.</p>'}`;
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">Errore: ${e.message}</p>`; }
}

window.addAgendaCondivisaMain = async function(rid) {
  const titolo = document.getElementById('ag-cond-titolo-main').value.trim();
  const data = document.getElementById('ag-cond-data-main').value;
  const ora = document.getElementById('ag-cond-ora-main').value;
  if (!titolo || !data) { window.toast('Titolo e data obbligatori', 'warn'); return; }
  try {
    const ref = doc(collection(db, 'reparti', rid, 'agenda_condivisa'));
    await setDoc(ref, { id: ref.id, titolo, data, ora, note: '', autore: 'admin' });
    window.toast('Evento aggiunto', 'success');
    loadAgendaCondivisaReparto(rid);
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteAgendaCondivisaMain = async function(rid, aid) {
  if (!await window.confirm2('Eliminare questo evento?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'agenda_condivisa', aid));
    window.toast('Eliminato', 'success');
    loadAgendaCondivisaReparto(rid);
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── TODO CONDIVISI REPARTO (tab todo-cond) ──
async function loadTodoCondivisiReparto(rid) {
  const el = document.getElementById('todo-cond-container');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const snap = await getDocs(collection(db, 'reparti', rid, 'todo_condivisi'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = `
      <div class="flex-gap" style="margin-bottom:12px">
        <input type="text" id="todo-cond-main-testo" placeholder="Nuovo todo..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
        <button class="btn btn-primary btn-sm" onclick="addTodoCondivisoMain('${rid}')">+ Aggiungi</button>
      </div>
      ${list.length ? list.map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <input type="checkbox" ${t.fatto ? 'checked' : ''} onchange="toggleTodoCondivisoMain('${rid}','${t.id}',this.checked)">
          <span style="flex:1;${t.fatto ? 'text-decoration:line-through;color:var(--on-surface2)' : ''}">${t.testo || '—'}</span>
          <span class="text-muted" style="font-size:.75rem">${t.autore || ''} ${t.data || ''}</span>
          <button class="btn btn-danger btn-xs" onclick="deleteTodoCondivisoMain('${rid}','${t.id}')">🗑️</button>
        </div>`).join('') : '<p class="text-muted">Nessun todo condiviso.</p>'}`;
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">Errore: ${e.message}</p>`; }
}

window.addTodoCondivisoMain = async function(rid) {
  const testo = document.getElementById('todo-cond-main-testo').value.trim();
  if (!testo) return;
  try {
    const ref = doc(collection(db, 'reparti', rid, 'todo_condivisi'));
    await setDoc(ref, { id: ref.id, testo, fatto: false, data: new Date().toISOString().slice(0, 10), autore: 'admin' });
    window.toast('Todo aggiunto', 'success');
    loadTodoCondivisiReparto(rid);
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.toggleTodoCondivisoMain = async function(rid, tid, fatto) {
  try { await updateDoc(doc(db, 'reparti', rid, 'todo_condivisi', tid), { fatto }); }
  catch (e) { window.toast('Errore', 'error'); }
};

window.deleteTodoCondivisoMain = async function(rid, tid) {
  if (!await window.confirm2('Eliminare questo todo?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'todo_condivisi', tid));
    const uid = document.getElementById('agenda-utente-sel').value;
    const u = window.AdminState.utenti.find(x => x.id === uid);
    if (u?.reparto) loadTodoCondivisiReparto(u.reparto);
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};
