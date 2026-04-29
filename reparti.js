import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

// ── REPARTI ──
window.loadReparti = async function() {
  document.getElementById('reparti-loading').style.display = 'block';
  document.getElementById('reparti-list').innerHTML = '';
  try {
    if (!window.AdminState.utenti.length) {
      const snap = await getDocs(collection(db, 'utenti'));
      window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const repIds = [...new Set(window.AdminState.utenti.map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
    window.AdminState.reparti = repIds.map(id => ({ id, nome: id, tipo: '' }));
    renderReparti();
  } catch (e) { window.toast('Errore reparti: ' + e.message, 'error'); }
  document.getElementById('reparti-loading').style.display = 'none';
};

function renderReparti() {
  const container = document.getElementById('reparti-list');
  if (!window.AdminState.reparti.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏛️</div>Nessun reparto trovato. Assicurati che gli utenti abbiano il campo "reparto" compilato.</div>`;
    return;
  }
  const countByRep = {};
  window.AdminState.utenti.forEach(u => { if (u.reparto && !u.reparto.startsWith('privato_')) countByRep[u.reparto] = (countByRep[u.reparto] || 0) + 1; });
  container.innerHTML = window.AdminState.reparti.map(r => `
    <div class="accordion" id="acc-${r.id}">
      <div class="accordion-header" onclick="toggleAccordion('${r.id}')">
        <h3>🏛️ ${r.nome || r.id} <span class="text-muted" style="font-weight:400;font-size:.85rem">${r.tipo || ''} · ${countByRep[r.id] || 0} utenti</span></h3>
        <div class="flex-gap" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-xs" onclick="openRepartoModal('${r.id}')">✏️ Modifica</button>
          <button class="btn btn-warn btn-xs" onclick="resetComando('${r.id}')">🔄 Reset Comando</button>
          <button class="btn btn-danger btn-xs" onclick="eliminaReparto('${r.id}')">🗑️ Elimina</button>
          <span id="acc-arrow-${r.id}">▼</span>
        </div>
      </div>
      <div class="accordion-body" id="acc-body-${r.id}">
        <div class="accordion-tabs">
          <button class="acc-tab active" onclick="switchAccTab('${r.id}','utenti',this)">👥 Utenti</button>
          <button class="acc-tab" onclick="switchAccTab('${r.id}','turni',this)">📅 Turni</button>
          <button class="acc-tab" onclick="switchAccTab('${r.id}','personale',this)">🪖 Personale</button>
          <button class="acc-tab" onclick="switchAccTab('${r.id}','orari',this)">⏰ Orari</button>
          <button class="acc-tab" onclick="switchAccTab('${r.id}','todo',this)">✅ Todo</button>
          <button class="acc-tab" onclick="switchAccTab('${r.id}','agenda',this)">📋 Agenda</button>
        </div>
        <div id="acc-tab-${r.id}-utenti" class="acc-tab-pane"></div>
        <div id="acc-tab-${r.id}-turni" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-personale" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-orari" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-todo" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-agenda" class="acc-tab-pane" style="display:none"></div>
      </div>
    </div>`).join('');
}

window.toggleAccordion = async function(rid) {
  const body = document.getElementById(`acc-body-${rid}`);
  const arrow = document.getElementById(`acc-arrow-${rid}`);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open');
  arrow.textContent = isOpen ? '▼' : '▲';
  if (!isOpen) {
    await loadAccTab(rid, 'utenti');
  }
};

window.switchAccTab = function(rid, tab, el) {
  document.querySelectorAll(`#acc-${rid} .acc-tab`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#acc-${rid} .acc-tab-pane`).forEach(p => p.style.display = 'none');
  el.classList.add('active');
  document.getElementById(`acc-tab-${rid}-${tab}`).style.display = 'block';
  loadAccTab(rid, tab);
};

async function loadAccTab(rid, tab) {
  const el = document.getElementById(`acc-tab-${rid}-${tab}`);
  if (!el || el.dataset.loaded === '1') return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    if (tab === 'utenti') await renderAccUtenti(rid, el);
    else if (tab === 'turni') await renderAccTurni(rid, el);
    else if (tab === 'personale') await renderAccPersonale(rid, el);
    else if (tab === 'orari') await renderAccOrari(rid, el);
    else if (tab === 'todo') await renderAccTodo(rid, el);
    else if (tab === 'agenda') await renderAccAgenda(rid, el);
    el.dataset.loaded = '1';
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">Errore: ${e.message}</p>`; }
}

async function renderAccUtenti(rid, el) {
  let list = [];
  try {
    const snap = await getDocs(collection(db, 'reparti', rid, 'utenti'));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {}
  if (!list.length) {
    list = window.AdminState.utenti.filter(u => u.reparto === rid);
  }
  if (!list.length) { el.innerHTML = '<p class="text-muted">Nessun utente nel reparto.</p>'; return; }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Grado/Nome</th><th>Email</th><th>Stato</th></tr></thead>
    <tbody>${list.map(u => `<tr><td>${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}</td><td>${u.email || '—'}</td><td>${window.badgeStato(u.stato)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

async function renderAccTurni(rid, el) {
  const now = new Date();
  let calYear = window[`_calY_${rid}`] || now.getFullYear();
  let calMonth = window[`_calM_${rid}`] !== undefined ? window[`_calM_${rid}`] : now.getMonth();
  const snap = await getDocs(collection(db, 'reparti', rid, 'turni'));
  const turni = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const byDate = {};
  turni.forEach(t => { if (!byDate[t.data]) byDate[t.data] = []; byDate[t.data].push(t); });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  let rows = '', day = 1, startDay = (firstDay + 6) % 7;
  for (let w = 0; w < 6; w++) {
    rows += '<tr>';
    for (let d = 0; d < 7; d++) {
      if ((w === 0 && d < startDay) || day > daysInMonth) { rows += '<td></td>'; continue; }
      const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasTurni = byDate[ds]?.length > 0;
      const isToday = ds === todayStr;
      rows += `<td><div class="day${hasTurni ? ' has-turni' : ''}${isToday ? ' today' : ''}" title="${hasTurni ? byDate[ds].map(t => t.nome + ' ' + t.tipo).join(', ') : ''}">${day}</div></td>`;
      day++;
    }
    rows += '</tr>';
    if (day > daysInMonth) break;
  }
  el.innerHTML = `<div class="mini-cal">
    <div class="cal-nav">
      <button onclick="(function(){window._calY_${rid}=(window._calY_${rid}||${calYear});window._calM_${rid}=(window._calM_${rid}!==undefined?window._calM_${rid}:${calMonth});if(window._calM_${rid}===0){window._calM_${rid}=11;window._calY_${rid}--;}else{window._calM_${rid}--;}document.getElementById('acc-tab-${rid}-turni').dataset.loaded='';loadAccTab('${rid}','turni');})()">◀</button>
      <strong>${mesi[calMonth]} ${calYear}</strong>
      <button onclick="(function(){window._calY_${rid}=(window._calY_${rid}||${calYear});window._calM_${rid}=(window._calM_${rid}!==undefined?window._calM_${rid}:${calMonth});if(window._calM_${rid}===11){window._calM_${rid}=0;window._calY_${rid}++;}else{window._calM_${rid}++;}document.getElementById('acc-tab-${rid}-turni').dataset.loaded='';loadAccTab('${rid}','turni');})()">▶</button>
    </div>
    <table><thead><tr><th>Lu</th><th>Ma</th><th>Me</th><th>Gi</th><th>Ve</th><th>Sa</th><th>Do</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="mt-12">
    ${turni.slice(0, 10).map(t => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="background:${window.turnoColor(t.tipo)};color:#fff;padding:2px 8px;border-radius:12px;font-size:.75rem">${t.tipo}</span>
      <span style="font-size:.85rem">${t.data} — ${t.nome || t.uid || '—'}</span>
      ${t.note ? `<span class="text-muted" style="font-size:.8rem">${t.note}</span>` : ''}
    </div>`).join('')}
  </div>`;
}

// Espone loadAccTab su window per i bottoni inline del calendario
window.loadAccTab = loadAccTab;

async function renderAccPersonale(rid, el) {
  const snap = await getDocs(collection(db, 'reparti', rid, 'persone'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  el.innerHTML = `
    <div class="flex-gap" style="margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick="openPersonaModal('${rid}',null)">+ Aggiungi persona</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Grado</th><th>Nome</th><th>Ferie res.</th><th>Azioni</th></tr></thead>
      <tbody>${list.length ? list.map(p => `<tr>
        <td>${p.grado || '—'}</td>
        <td>${p.nome || '—'}</td>
        <td>${p.ferieRes ?? '—'}</td>
        <td class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="openPersonaModal('${rid}','${p.id}')">✏️</button>
          <button class="btn btn-danger btn-xs" onclick="deletePersona('${rid}','${p.id}')">🗑️</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="4" class="text-muted" style="text-align:center">Nessuna persona</td></tr>`}
      </tbody>
    </table></div>`;
}

async function renderAccOrari(rid, el) {
  const snap = await getDoc(doc(db, 'reparti', rid, 'config', 'orari'));
  const d = snap.exists() ? snap.data() : {};
  const turni = ['mattina', 'pomeriggio', 'notte'];
  el.innerHTML = `
    <h4 style="margin-bottom:12px;font-size:.95rem">Orari preset</h4>
    ${turni.map(t => `
      <div class="form-row" style="margin-bottom:8px;align-items:center">
        <label style="font-weight:500;text-transform:capitalize;min-width:100px">${t}</label>
        <div class="form-group" style="margin:0"><label style="font-size:.75rem">Inizio</label>
          <input type="time" id="orari-${rid}-${t}-inizio" value="${d[t]?.inizio || ''}">
        </div>
        <div class="form-group" style="margin:0"><label style="font-size:.75rem">Fine</label>
          <input type="time" id="orari-${rid}-${t}-fine" value="${d[t]?.fine || ''}">
        </div>
      </div>`).join('')}
    <button class="btn btn-primary btn-sm mt-12" onclick="saveOrariPreset('${rid}')">💾 Salva orari</button>`;
}

window.saveOrariPreset = async function(rid) {
  const turni = ['mattina', 'pomeriggio', 'notte'];
  const data = {};
  turni.forEach(t => {
    data[t] = {
      inizio: document.getElementById(`orari-${rid}-${t}-inizio`).value,
      fine: document.getElementById(`orari-${rid}-${t}-fine`).value
    };
  });
  try {
    await setDoc(doc(db, 'reparti', rid, 'config', 'orari'), data);
    window.toast('Orari salvati', 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

async function renderAccTodo(rid, el) {
  const snap = await getDocs(collection(db, 'reparti', rid, 'todo_condivisi'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  el.innerHTML = `
    <div class="flex-gap" style="margin-bottom:12px">
      <input type="text" id="todo-cond-testo-${rid}" placeholder="Nuovo todo..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
      <button class="btn btn-primary btn-sm" onclick="addTodoCondiviso('${rid}')">+ Aggiungi</button>
    </div>
    <div id="todo-cond-list-${rid}">
    ${list.length ? list.map(t => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        <input type="checkbox" ${t.fatto ? 'checked' : ''} onchange="toggleTodoCondiviso('${rid}','${t.id}',this.checked)">
        <span style="flex:1;${t.fatto ? 'text-decoration:line-through;color:var(--on-surface2)' : ''}">${t.testo || '—'}</span>
        <span class="text-muted" style="font-size:.75rem">${t.autore || ''} ${t.data || ''}</span>
        <button class="btn btn-danger btn-xs" onclick="deleteTodoCondiviso('${rid}','${t.id}')">🗑️</button>
      </div>`).join('') : '<p class="text-muted">Nessun todo condiviso.</p>'}
    </div>`;
}

window.addTodoCondiviso = async function(rid) {
  const testo = document.getElementById(`todo-cond-testo-${rid}`).value.trim();
  if (!testo) return;
  try {
    const ref = doc(collection(db, 'reparti', rid, 'todo_condivisi'));
    await setDoc(ref, { id: ref.id, testo, fatto: false, data: new Date().toISOString().slice(0, 10), autore: 'admin' });
    window.toast('Todo aggiunto', 'success');
    document.getElementById(`acc-tab-${rid}-todo`).dataset.loaded = '';
    await loadAccTab(rid, 'todo');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.toggleTodoCondiviso = async function(rid, tid, fatto) {
  try {
    await updateDoc(doc(db, 'reparti', rid, 'todo_condivisi', tid), { fatto });
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteTodoCondiviso = async function(rid, tid) {
  if (!await window.confirm2('Eliminare questo todo?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'todo_condivisi', tid));
    document.getElementById(`acc-tab-${rid}-todo`).dataset.loaded = '';
    await loadAccTab(rid, 'todo');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

async function renderAccAgenda(rid, el) {
  const snap = await getDocs(collection(db, 'reparti', rid, 'agenda_condivisa'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.data > b.data ? 1 : -1);
  el.innerHTML = `
    <div class="flex-gap" style="margin-bottom:12px;flex-wrap:wrap">
      <input type="text" id="ag-cond-titolo-${rid}" placeholder="Titolo..." style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
      <input type="date" id="ag-cond-data-${rid}" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
      <input type="time" id="ag-cond-ora-${rid}" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
      <button class="btn btn-primary btn-sm" onclick="addAgendaCondivisa('${rid}')">+ Aggiungi</button>
    </div>
    ${list.length ? list.map(a => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:1.1rem">📅</span>
        <div style="flex:1">
          <div style="font-weight:500;font-size:.9rem">${a.titolo || '—'}</div>
          <div class="text-muted" style="font-size:.8rem">${a.data || ''} ${a.ora || ''} ${a.autore ? '— ' + a.autore : ''}</div>
          ${a.note ? `<div class="text-muted" style="font-size:.8rem">${a.note}</div>` : ''}
        </div>
        <button class="btn btn-danger btn-xs" onclick="deleteAgendaCondivisa('${rid}','${a.id}')">🗑️</button>
      </div>`).join('') : '<p class="text-muted">Nessun evento in agenda.</p>'}`;
}

window.addAgendaCondivisa = async function(rid) {
  const titolo = document.getElementById(`ag-cond-titolo-${rid}`).value.trim();
  const data = document.getElementById(`ag-cond-data-${rid}`).value;
  const ora = document.getElementById(`ag-cond-ora-${rid}`).value;
  if (!titolo || !data) { window.toast('Titolo e data obbligatori', 'warn'); return; }
  try {
    const ref = doc(collection(db, 'reparti', rid, 'agenda_condivisa'));
    await setDoc(ref, { id: ref.id, titolo, data, ora, note: '', autore: 'admin' });
    window.toast('Evento aggiunto', 'success');
    document.getElementById(`acc-tab-${rid}-agenda`).dataset.loaded = '';
    await loadAccTab(rid, 'agenda');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteAgendaCondivisa = async function(rid, aid) {
  if (!await window.confirm2('Eliminare questo evento?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'agenda_condivisa', aid));
    document.getElementById(`acc-tab-${rid}-agenda`).dataset.loaded = '';
    await loadAccTab(rid, 'agenda');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── PERSONA MODAL ──
window.openPersonaModal = async function(rid, pid) {
  document.getElementById('persona-reparto-id').value = rid;
  document.getElementById('modal-persona-title').textContent = pid ? 'Modifica persona' : 'Aggiungi persona';
  if (pid) {
    const snap = await getDoc(doc(db, 'reparti', rid, 'persone', pid));
    const d = snap.data() || {};
    document.getElementById('persona-id').value = pid;
    document.getElementById('persona-nome').value = d.nome || '';
    document.getElementById('persona-grado').value = d.grado || '';
    document.getElementById('persona-ferieRes').value = d.ferieRes ?? 30;
  } else {
    document.getElementById('persona-id').value = '';
    document.getElementById('persona-nome').value = '';
    document.getElementById('persona-grado').value = '';
    document.getElementById('persona-ferieRes').value = 30;
  }
  window.openModal('modal-persona');
};

window.savePersona = async function() {
  const rid = document.getElementById('persona-reparto-id').value;
  const pid = document.getElementById('persona-id').value;
  const data = {
    nome: document.getElementById('persona-nome').value.trim(),
    grado: document.getElementById('persona-grado').value.trim(),
    ferieRes: Number(document.getElementById('persona-ferieRes').value) || 0,
    reparto: rid
  };
  if (!data.nome) { window.toast('Nome obbligatorio', 'warn'); return; }
  try {
    if (pid) {
      await updateDoc(doc(db, 'reparti', rid, 'persone', pid), data);
    } else {
      const ref = doc(collection(db, 'reparti', rid, 'persone'));
      await setDoc(ref, { id: ref.id, ...data });
    }
    window.toast('Persona salvata', 'success');
    window.closeModal('modal-persona');
    document.getElementById(`acc-tab-${rid}-personale`).dataset.loaded = '';
    await loadAccTab(rid, 'personale');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deletePersona = async function(rid, pid) {
  if (!await window.confirm2('Eliminare questa persona?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'persone', pid));
    document.getElementById(`acc-tab-${rid}-personale`).dataset.loaded = '';
    await loadAccTab(rid, 'personale');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── REPARTO MODAL ──
window.openRepartoModal = function(rid) {
  const r = window.AdminState.reparti.find(x => x.id === rid) || {};
  document.getElementById('rep-id').value = rid;
  document.getElementById('rep-nome').value = r.nome || '';
  document.getElementById('rep-tipo').value = r.tipo || 'stazione';
  window.openModal('modal-reparto');
};

window.saveRepartoInfo = async function() {
  const rid = document.getElementById('rep-id').value;
  const data = { nome: document.getElementById('rep-nome').value.trim(), tipo: document.getElementById('rep-tipo').value };
  try {
    await setDoc(doc(db, 'reparti', rid), data, { merge: true });
    window.toast('Reparto aggiornato', 'success');
    window.closeModal('modal-reparto');
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.resetComando = async function(rid) {
  if (!await window.confirm2('Resettare il comando di questo reparto? Rimuoverà il ruolo comandante dagli utenti.')) return;
  try {
    const snap = await getDocs(query(collection(db, 'utenti'), where('reparto', '==', rid), where('ruolo', '==', 'comandante')));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { ruolo: 'addetto' }));
    await batch.commit();
    window.toast('Comando resettato', 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.eliminaReparto = async function(rid) {
  if (!await window.confirm2('Eliminare questo reparto? Scollega anche tutti gli utenti. Azione irreversibile.', 'Elimina reparto', 'Elimina')) return;
  try {
    const batch = writeBatch(db);
    window.AdminState.utenti.filter(u => u.reparto === rid).forEach(u => batch.update(doc(db, 'utenti', u.id), { reparto: '' }));
    await batch.commit();
    try { await deleteDoc(doc(db, 'reparti', rid)); } catch (e2) {}
    window.toast('Reparto eliminato', 'success');
    window.AdminState.utenti = [];
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};
