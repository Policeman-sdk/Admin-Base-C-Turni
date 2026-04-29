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
  const repIds = [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
  if (repIds.length) {
    sel.innerHTML = repIds.map(id => `<option value="${id}">${id}</option>`).join('');
  }
  window.loadTurni();
};

window.loadTurni = async function() {
  const rid = document.getElementById('turni-reparto-sel').value;
  const mese = document.getElementById('turni-mese').value;
  if (!rid || !mese) return;
  document.getElementById('turni-loading').style.display = 'block';
  document.getElementById('turni-tbody').innerHTML = '';
  try {
    const snap = await getDocs(collection(db, 'reparti', rid, 'turni'));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filtered = all.filter(t => t.data && t.data.startsWith(mese)).sort((a, b) => a.data > b.data ? 1 : -1);
    const tbody = document.getElementById('turni-tbody');
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📅</div>Nessun turno</div></td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(t => `<tr>
        <td>${t.data || '—'}</td>
        <td>${t.nome || t.uid || '—'}</td>
        <td><span style="background:${t.colore || window.turnoColor(t.tipo)};color:#fff;padding:3px 10px;border-radius:12px;font-size:.8rem">${t.tipo || '—'}</span></td>
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
  document.getElementById('turno-id').value = '';
  document.getElementById('turno-reparto-id').value = selRid;
  document.getElementById('modal-turno-title').textContent = 'Aggiungi turno';
  document.getElementById('turno-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('turno-tipo').value = 'mattina';
  document.getElementById('turno-uid').value = '';
  document.getElementById('turno-nome').value = '';
  document.getElementById('turno-note').value = '';
  document.getElementById('turno-colore').value = '#1a6b4a';
  window.openModal('modal-turno');
};

window.editTurno = async function(rid, tid) {
  const snap = await getDoc(doc(db, 'reparti', rid, 'turni', tid));
  if (!snap.exists()) return;
  const d = snap.data();
  document.getElementById('turno-id').value = tid;
  document.getElementById('turno-reparto-id').value = rid;
  document.getElementById('modal-turno-title').textContent = 'Modifica turno';
  document.getElementById('turno-data').value = d.data || '';
  document.getElementById('turno-tipo').value = d.tipo || 'mattina';
  document.getElementById('turno-uid').value = d.uid || '';
  document.getElementById('turno-nome').value = d.nome || '';
  document.getElementById('turno-note').value = d.note || '';
  document.getElementById('turno-colore').value = d.colore || '#1a6b4a';
  window.openModal('modal-turno');
};

window.saveTurno = async function() {
  const tid = document.getElementById('turno-id').value;
  const rid = document.getElementById('turno-reparto-id').value;
  const data = {
    data: document.getElementById('turno-data').value,
    tipo: document.getElementById('turno-tipo').value,
    uid: document.getElementById('turno-uid').value.trim(),
    nome: document.getElementById('turno-nome').value.trim(),
    note: document.getElementById('turno-note').value.trim(),
    colore: document.getElementById('turno-colore').value,
  };
  if (!data.data) { window.toast('Data obbligatoria', 'warn'); return; }
  try {
    if (tid) {
      await updateDoc(doc(db, 'reparti', rid, 'turni', tid), data);
    } else {
      const ref = doc(collection(db, 'reparti', rid, 'turni'));
      await setDoc(ref, { id: ref.id, ...data });
    }
    window.toast('Turno salvato', 'success');
    window.closeModal('modal-turno');
    window.loadTurni();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteTurno = async function(rid, tid) {
  if (!await window.confirm2('Eliminare questo turno?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'turni', tid));
    window.toast('Turno eliminato', 'success');
    window.loadTurni();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.exportTurniCSV = async function() {
  const rid = document.getElementById('turni-reparto-sel').value;
  const mese = document.getElementById('turni-mese').value;
  const snap = await getDocs(collection(db, 'reparti', rid, 'turni'));
  const rows = [['Data', 'Nome', 'Tipo', 'Note', 'UID']];
  snap.docs.map(d => d.data()).filter(t => t.data && t.data.startsWith(mese)).sort((a, b) => a.data > b.data ? 1 : -1)
    .forEach(t => rows.push([t.data, t.nome || '', t.tipo || '', t.note || '', t.uid || '']));
  window.downloadCSV(`turni_${rid}_${mese}.csv`, rows);
};
