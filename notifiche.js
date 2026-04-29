import {
  collection, doc, getDocs, query, orderBy, limit, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.loadNotificheInit = async function() {
  if (!window.AdminState.utenti.length) {
    const snap = await getDocs(collection(db, 'utenti'));
    window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const repIds = [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
  document.getElementById('push-reparto-sel').innerHTML = repIds.map(id => `<option value="${id}">${id}</option>`).join('');
  document.getElementById('push-utente-sel').innerHTML = window.AdminState.utenti.map(u => `<option value="${u.id}">${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}</option>`).join('');
  loadPushStorico();
};

window.onPushDestChange = function() {
  const v = document.getElementById('push-dest-type').value;
  document.getElementById('push-reparto-group').style.display = v === 'reparto' ? 'block' : 'none';
  document.getElementById('push-utente-group').style.display = v === 'utente' ? 'block' : 'none';
};

window.inviaPushNotifica = async function() {
  const tipo = document.getElementById('push-dest-type').value;
  const title = document.getElementById('push-title').value.trim();
  const body = document.getElementById('push-body').value.trim();
  if (!title || !body) { window.toast('Titolo e messaggio obbligatori', 'warn'); return; }
  const creatoIl = Timestamp.now();
  try {
    let targets = [];
    if (tipo === 'tutti') {
      targets = window.AdminState.utenti.filter(u => u.fcmToken);
    } else if (tipo === 'reparto') {
      const rid = document.getElementById('push-reparto-sel').value;
      targets = window.AdminState.utenti.filter(u => u.reparto === rid && u.fcmToken);
    } else {
      const uid = document.getElementById('push-utente-sel').value;
      const u = window.AdminState.utenti.find(x => x.id === uid);
      if (u && u.fcmToken) targets = [u];
    }
    if (!targets.length) { window.toast('Nessun utente con FCM token trovato', 'warn'); return; }
    const batch = writeBatch(db);
    targets.forEach(u => {
      const ref = doc(collection(db, 'notifiche_push'));
      batch.set(ref, { uid: u.id, title, body, creatoIl, inviata: false });
    });
    await batch.commit();
    window.toast(`Notifica inviata a ${targets.length} utenti`, 'success');
    document.getElementById('push-title').value = '';
    document.getElementById('push-body').value = '';
    loadPushStorico();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

async function loadPushStorico() {
  try {
    const snap = await getDocs(query(collection(db, 'notifiche_push'), orderBy('creatoIl', 'desc'), limit(20)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('push-storico-list').innerHTML = list.length ? list.map(n => `
      <div style="padding:10px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:8px;font-size:.85rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <strong>${n.title || '—'}</strong>
          <span class="badge ${n.inviata ? 'badge-approved' : 'badge-pending'}">${n.inviata ? 'Inviata' : 'In coda'}</span>
        </div>
        <div class="text-muted">${n.body || ''}</div>
        <div class="text-muted" style="font-size:.75rem;margin-top:4px">${window.fmtTs(n.creatoIl)} — uid: ${n.uid || '—'} ${n.errore ? '⚠️ ' + n.errore : ''}</div>
      </div>`).join('') : `<p class="text-muted">Nessuna notifica recente.</p>`;
  } catch (e) {
    document.getElementById('push-storico-list').innerHTML = `<p class="text-muted">Errore caricamento storico.</p>`;
  }
}
