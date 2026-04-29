import {
  collection, doc, getDocs, query, where, deleteDoc, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

window.puliziaVecchiTurni = async function() {
  if (!await window.confirm2('Eliminare tutti i turni più vecchi di 6 mesi da tutti i reparti?', 'Pulizia turni', 'Elimina')) return;
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let count = 0;
  try {
    if (!window.AdminState.utenti.length) {
      const snap = await getDocs(collection(db, 'utenti'));
      window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const repIds = [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
    for (const rid of repIds) {
      try {
        const tSnap = await getDocs(collection(db, 'reparti', rid, 'turni'));
        const batch = writeBatch(db);
        let batchCount = 0;
        for (const t of tSnap.docs) {
          if (t.data().data && t.data().data < cutoffStr) { batch.delete(t.ref); count++; batchCount++; }
          if (batchCount === 499) { await batch.commit(); batchCount = 0; }
        }
        if (batchCount > 0) await batch.commit();
      } catch (e2) {}
    }
    window.toast(`Eliminati ${count} turni vecchi`, 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.puliziaNotifichePush = async function() {
  if (!await window.confirm2('Eliminare notifiche_push inviate più vecchie di 7 giorni?', 'Pulizia notifiche', 'Elimina')) return;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  let count = 0;
  try {
    const snap = await getDocs(query(collection(db, 'notifiche_push'), where('inviata', '==', true)));
    const batch = writeBatch(db);
    let bc = 0;
    for (const d of snap.docs) {
      const ts = d.data().creatoIl;
      if (ts && ts.toDate && ts.toDate() < cutoff) { batch.delete(d.ref); count++; bc++; }
      if (bc === 499) { await batch.commit(); bc = 0; }
    }
    if (bc > 0) await batch.commit();
    window.toast(`Eliminate ${count} notifiche push vecchie`, 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.exportUtentiCSV = async function() {
  const snap = await getDocs(collection(db, 'utenti'));
  const rows = [['UID', 'Nome', 'Cognome', 'Email', 'Grado', 'Ruolo', 'Stato', 'Reparto', 'FerieRes', 'FerieUsate', 'Recuperi']];
  snap.docs.forEach(d => {
    const u = d.data();
    rows.push([d.id, u.nome || '', u.cognome || '', u.email || '', u.grado || '', u.ruolo || '', u.stato || '', u.reparto || '', u.ferieRes || 0, u.ferieUsate || 0, u.recuperi || 0]);
  });
  window.downloadCSV('utenti_export.csv', rows);
};

window.exportTurniCSVAll = async function() {
  const mese = document.getElementById('maint-turni-mese').value;
  const rows = [['Reparto', 'Data', 'Nome', 'Tipo', 'Note', 'UID']];
  if (!window.AdminState.utenti.length) {
    const snap = await getDocs(collection(db, 'utenti'));
    window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const repIds = [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
  for (const rid of repIds) {
    try {
      const tSnap = await getDocs(collection(db, 'reparti', rid, 'turni'));
      tSnap.docs.map(d => d.data()).filter(t => !mese || t.data?.startsWith(mese))
        .forEach(t => rows.push([rid, t.data || '', t.nome || '', t.tipo || '', t.note || '', t.uid || '']));
    } catch (e) {}
  }
  window.downloadCSV(`turni_tutti_${mese || 'all'}.csv`, rows);
};

window.backupJSON = async function() {
  const uSnap = await getDocs(collection(db, 'utenti'));
  const utenti = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const repIds = [...new Set(utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
  const backup = {
    exportedAt: new Date().toISOString(),
    utenti,
    reparti: repIds.map(id => ({ id }))
  };
  window.downloadJSON(`backup_cturni_${new Date().toISOString().slice(0, 10)}.json`, backup);
};

window.reloadAll = async function() {
  window.AdminState.utenti = [];
  window.AdminState.reparti = [];
  const sec = document.querySelector('.section.active')?.id?.replace('sec-', '');
  if (sec) window.navigateTo(sec);
  window.toast('Dati ricaricati', 'success');
};

window.loadDBStats = async function() {
  const el = document.getElementById('db-stats');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const uSnap = await getDocs(collection(db, 'utenti'));
    if (!window.AdminState.utenti.length) window.AdminState.utenti = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const repIds = [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
    const pSnap = await getDocs(collection(db, 'notifiche_push'));
    let turniTot = 0, personeTot = 0;
    for (const rid of repIds) {
      try {
        const [ts, ps] = await Promise.all([
          getDocs(collection(db, 'reparti', rid, 'turni')),
          getDocs(collection(db, 'reparti', rid, 'persone'))
        ]);
        turniTot += ts.size; personeTot += ps.size;
      } catch (e) {}
    }
    const stats = [
      ['👥 Utenti', uSnap.size], ['🏛️ Reparti', repIds.length], ['📅 Turni totali', turniTot],
      ['🪖 Persone (ct_p)', personeTot], ['🔔 Notifiche push', pSnap.size]
    ];
    el.innerHTML = stats.map(([k, v]) => `<div class="stat-card" style="min-width:140px"><div class="stat-val">${v}</div><div class="stat-label">${k}</div></div>`).join('');
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">Errore: ${e.message}</p>`; }
};
