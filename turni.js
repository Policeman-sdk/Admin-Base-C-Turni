import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.loadTurniInit = async function() {
  const sel = document.getElementById('turni-reparto-sel');
  if (!window.AdminState.utenti.length) {
    const snap = await getDocs(collection(db, 'utenti'));
    window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // reparti: dalla collezione + eventuali id presenti sugli utenti
  const ids = new Set();
  try { const r = await getDocs(collection(db, 'reparti')); r.docs.forEach(d => ids.add(d.id)); } catch (e) {}
  window.AdminState.utenti.forEach(u => { if (u.reparto && !u.reparto.startsWith('privato_')) ids.add(u.reparto); });
  const repIds = [...ids].sort();
  if (repIds.length) sel.innerHTML = repIds.map(id => `<option value="${id}">${id}</option>`).join('');
  // datalist dei tipi turno (servizio + personali)
  const dl = document.getElementById('turno-tipi-list');
  if (dl) dl.innerHTML = window.turnoTipi().map(t => `<option value="${t}"></option>`).join('');
  window.loadTurni();
};

window.onTurniPersonFilter = function() { window.loadTurni(); };

window.loadTurni = async function() {
  const rid = document.getElementById('turni-reparto-sel').value;
  const mese = document.getElementById('turni-mese').value;
  const q = (document.getElementById('turni-persona')?.value || '').toLowerCase().trim();
  if (!rid || !mese) return;
  document.getElementById('turni-loading').style.display = 'block';
  document.getElementById('turni-tbody').innerHTML = '';
  try {
    const snap = await getDocs(collection(db, 'reparti', rid, 'turni'));
    let all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.data && t.data.startsWith(mese));
    if (q) all = all.filter(t => `${t.pnome || t.nome || ''} ${t.pid || ''} ${t.uid || t.ownerUid || t.userId || ''}`.toLowerCase().includes(q));
    all.sort((a, b) => (a.data > b.data ? 1 : a.data < b.data ? -1 : String(a.tipo || '').localeCompare(String(b.tipo || ''))));
    const tbody = document.getElementById('turni-tbody');
    if (!all.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📅</div>Nessun turno</div></td></tr>`;
    } else {
      tbody.innerHTML = all.map(t => `<tr>
        <td>${t.data || '—'}</td>
        <td>${t.pnome || t.nome || '—'}${t.pid ? `<div class="text-muted" style="font-size:.7rem">pid: ${t.pid}</div>` : ''}</td>
        <td><span style="background:${t.colore || window.turnoColor(t.tipo)};color:#fff;padding:3px 10px;border-radius:12px;font-size:.8rem">${t.tipo || '—'}</span></td>
        <td>${t.orario || '—'}</td>
        <td>${t.codice || '—'}</td>
        <td>${t.categoria_evento || '—'}</td>
        <td>${t.note || '—'}</td>
        <td class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editTurno('${rid}','${t.id}')">✏️</button>
          <button class="btn btn-danger btn-xs" onclick="deleteTurno('${rid}','${t.id}')">🗑️</button>
        </td>
      </tr>`).join('');
    }
  } catch (e) { window.toast('Errore turni: ' + e.message, 'error'); }
  document.getElementById('turni-loading').style.display = 'none';
};

window.openTurnoModal = function(rid) {
  const selRid = rid || document.getElementById('turni-reparto-sel').value;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('turno-id', '');
  set('turno-reparto-id', selRid);
  document.getElementById('modal-turno-title').textContent = 'Aggiungi turno';
  set('turno-data', new Date().toISOString().slice(0, 10));
  set('turno-orario', '');
  set('turno-tipo', 'M');
  set('turno-codice', '');
  set('turno-categoria_evento', '');
  set('turno-pid', '');
  set('turno-pnome', '');
  set('turno-uid', '');
  set('turno-note', '');
  set('turno-colore', '#1a6b4a');
  window.openModal('modal-turno');
};

window.editTurno = async function(rid, tid) {
  const snap = await getDoc(doc(db, 'reparti', rid, 'turni', tid));
  if (!snap.exists()) return;
  const d = snap.data();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('turno-id', tid);
  set('turno-reparto-id', rid);
  document.getElementById('modal-turno-title').textContent = 'Modifica turno';
  set('turno-data', d.data || '');
  set('turno-orario', d.orario || '');
  set('turno-tipo', d.tipo || '');
  set('turno-codice', d.codice || '');
  set('turno-categoria_evento', d.categoria_evento || '');
  set('turno-pid', d.pid || '');
  set('turno-pnome', d.pnome || d.nome || '');
  set('turno-uid', d.uid || d.ownerUid || d.userId || '');
  set('turno-note', d.note || '');
  set('turno-colore', d.colore || '#1a6b4a');
  window.openModal('modal-turno');
};

window.saveTurno = async function() {
  const tid = document.getElementById('turno-id').value;
  const rid = document.getElementById('turno-reparto-id').value;
  const uid = document.getElementById('turno-uid').value.trim();
  const data = {
    data: document.getElementById('turno-data').value,
    tipo: document.getElementById('turno-tipo').value.trim(),
    orario: document.getElementById('turno-orario').value.trim(),
    codice: document.getElementById('turno-codice').value.trim(),
    categoria_evento: document.getElementById('turno-categoria_evento').value.trim(),
    pid: document.getElementById('turno-pid').value.trim(),
    pnome: document.getElementById('turno-pnome').value.trim(),
    note: document.getElementById('turno-note').value.trim(),
    colore: document.getElementById('turno-colore').value,
    // alias owner: l'app militari può usare uno qualsiasi di questi nomi
    uid, ownerUid: uid, userId: uid
  };
  if (!data.data) { window.toast('Data obbligatoria', 'warn'); return; }
  if (!data.tipo) { window.toast('Tipo obbligatorio', 'warn'); return; }
  try {
    if (tid) {
      await updateDoc(doc(db, 'reparti', rid, 'turni', tid), data);
    } else {
      const ref = doc(collection(db, 'reparti', rid, 'turni'));
      await setDoc(ref, { id: ref.id, ...data });
    }
    await window.logAzione(tid ? 'modifica_turno' : 'nuovo_turno', `${rid}/${data.data}`, data.tipo);
    window.toast('Turno salvato', 'success');
    window.closeModal('modal-turno');
    window.loadTurni();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteTurno = async function(rid, tid) {
  if (!await window.confirm2('Eliminare questo turno?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'turni', tid));
    await window.logAzione('eliminazione_turno', `${rid}/${tid}`);
    window.toast('Turno eliminato', 'success');
    window.loadTurni();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.exportTurniCSV = async function() {
  const rid = document.getElementById('turni-reparto-sel').value;
  const mese = document.getElementById('turni-mese').value;
  const snap = await getDocs(collection(db, 'reparti', rid, 'turni'));
  const rows = [['Data', 'Persona', 'PID', 'Tipo', 'Orario', 'Codice', 'Categoria', 'Note', 'UID']];
  snap.docs.map(d => d.data()).filter(t => t.data && t.data.startsWith(mese)).sort((a, b) => a.data > b.data ? 1 : -1)
    .forEach(t => rows.push([t.data, t.pnome || t.nome || '', t.pid || '', t.tipo || '', t.orario || '', t.codice || '', t.categoria_evento || '', t.note || '', t.uid || t.ownerUid || t.userId || '']));
  window.downloadCSV(`turni_${rid}_${mese}.csv`, rows);
};
