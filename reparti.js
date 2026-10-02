import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const db = window._db;

// ── REPARTI ──
// Sottocollezioni note di un reparto (usate per pulizia a cascata / richieste)
const REP_SUBCOLLECTIONS = [
  'utenti', 'persone', 'personale', 'turni', 'richieste',
  'todo_condivisi', 'agenda_condivisa', 'bacheca', 'config', 'link_utenti', 'dino_scores'
];

window.loadReparti = async function() {
  document.getElementById('reparti-loading').style.display = 'block';
  document.getElementById('reparti-list').innerHTML = '';
  try {
    if (!window.AdminState.utenti.length) {
      const snap = await getDocs(collection(db, 'utenti'));
      window.AdminState.utenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // 1. FONTE DI VERITÀ: collezione reparti
    let repDocs = [];
    try {
      const rSnap = await getDocs(collection(db, 'reparti'));
      repDocs = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* permessi: uso solo il fallback utenti */ }

    // 2. reparti derivati dagli utenti ma senza documento (retrocompatibilità)
    const idsFromUsers = [...new Set(window.AdminState.utenti
      .map(u => u.reparto).filter(r => r && !r.startsWith('privato_')))];
    const known = new Set(repDocs.map(r => r.id));
    const merged = [...repDocs];
    idsFromUsers.forEach(id => { if (!known.has(id)) merged.push({ id, nome: id, tipo: '' }); });

    // 3. arricchisci con membri / comando / approvazioni
    const nomeOf = m => (`${m.grado || ''} ${m.nome || ''} ${m.cognome || ''}`.trim() || m.email || m.id);
    for (const r of merged) {
      let members = [];
      try {
        const ms = await getDocs(collection(db, 'reparti', r.id, 'utenti'));
        members = ms.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { /* sottocollezione assente */ }
      if (!members.length) members = window.AdminState.utenti.filter(u => u.reparto === r.id);
      r._membri = members.length;
      r._pending = members.filter(m => m.stato === 'pending' || m.stato === 'in_attesa').length;
      const com = members.find(m => m.ruolo === 'comandante');
      const vice = members.find(m => m.ruolo === 'vice');
      r._comandante = com ? nomeOf(com) : '';
      r._vice = vice ? nomeOf(vice) : '';
      r._created = window.fmtTs(window.getDataIscrizione(r));
    }
    merged.sort((a, b) => (a.nome || a.id).localeCompare(b.nome || b.id));
    window.AdminState.reparti = merged;
    renderReparti();
  } catch (e) { window.toast('Errore reparti: ' + e.message, 'error'); }
  document.getElementById('reparti-loading').style.display = 'none';
};

function renderReparti() {
  const container = document.getElementById('reparti-list');
  if (!window.AdminState.reparti.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏛️</div>Nessun reparto trovato. Creane uno con "+ Nuovo reparto".</div>`;
    return;
  }
  container.innerHTML = window.AdminState.reparti.map(r => {
    const meta = [
      r.tipo || r.tipoStruttura || '',
      `${r._membri || 0} membri`,
      r._pending ? `${r._pending} in attesa` : '',
      r._comandante ? `Comandante: ${r._comandante}` : '',
      r._vice ? `Vice: ${r._vice}` : '',
      (r._created && r._created !== '—') ? `Creato: ${r._created}` : ''
    ].filter(Boolean).join(' · ');
    return `
    <div class="accordion" id="acc-${r.id}">
      <div class="accordion-header" onclick="toggleAccordion('${r.id}')">
        <h3>🏛️ ${r.nome || r.id} <span class="text-muted" style="font-weight:400;font-size:.85rem">${meta}</span></h3>
        <div class="flex-gap" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-xs" onclick="openRepartoModal('${r.id}')">✏️ Modifica</button>
          <button class="btn btn-ghost btn-xs" onclick="ricalcolaPioniere('${r.id}')">🌱 Pioniere</button>
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
          <button class="acc-tab" onclick="switchAccTab('${r.id}','bacheca',this)">📢 Bacheca</button>
          <button class="acc-tab" onclick="switchAccTab('${r.id}','richieste',this)">📨 Richieste</button>
        </div>
        <div id="acc-tab-${r.id}-utenti" class="acc-tab-pane"></div>
        <div id="acc-tab-${r.id}-turni" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-personale" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-orari" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-todo" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-agenda" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-bacheca" class="acc-tab-pane" style="display:none"></div>
        <div id="acc-tab-${r.id}-richieste" class="acc-tab-pane" style="display:none"></div>
      </div>
    </div>`;
  }).join('');
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
    else if (tab === 'bacheca') await renderAccBacheca(rid, el);
    else if (tab === 'richieste') await renderAccRichieste(rid, el);
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
    <thead><tr><th>Grado/Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Azioni</th></tr></thead>
    <tbody>${list.map(u => {
      const uid = u.uid || u.id;
      const ruolo = u.ruolo || 'addetto';
      return `<tr>
      <td>${u.grado || ''} ${u.nome || ''} ${u.cognome || ''}</td>
      <td>${u.email || '—'}</td>
      <td>${ruolo}</td>
      <td>${window.badgeStato(u.stato)}</td>
      <td class="flex-gap">
        ${ruolo !== 'comandante' ? `<button class="btn btn-ghost btn-xs" onclick="setRuoloMembro('${rid}','${uid}','comandante')">👑 Comandante</button>` : ''}
        ${ruolo !== 'vice' ? `<button class="btn btn-ghost btn-xs" onclick="setRuoloMembro('${rid}','${uid}','vice')">🎖️ Vice</button>` : ''}
        ${ruolo !== 'addetto' ? `<button class="btn btn-ghost btn-xs" onclick="setRuoloMembro('${rid}','${uid}','addetto')">👤 Addetto</button>` : ''}
      </td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// Assegna/rimuovi comandante/vice/addetto a un membro del reparto
window.setRuoloMembro = async function(rid, uid, ruolo) {
  if (!await window.confirm2(`Impostare il ruolo "${ruolo}" per questo membro?`)) return;
  try {
    await updateDoc(doc(db, 'utenti', uid), { ruolo });
    try { await setDoc(doc(db, 'reparti', rid, 'utenti', uid), { ruolo }, { merge: true }); } catch (e) { /* non presente */ }
    await window.logAzione('ruolo_membro', `${rid}/${uid}`, ruolo);
    window.toast('Ruolo aggiornato', 'success');
    document.getElementById(`acc-tab-${rid}-utenti`).dataset.loaded = '';
    await loadAccTab(rid, 'utenti');
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

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
      <button class="btn btn-ghost btn-sm" onclick="openImportPersone('${rid}')">📥 Importa da Excel/CSV</button>
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
    </table></div>
    <div class="divider"></div>
    <h4 style="margin-bottom:8px;font-size:.95rem">🔗 Collegamenti uid ↔ persona (link_utenti)</h4>
    <div id="link-utenti-${rid}"><div class="loading"><div class="spinner"></div></div></div>`;
  await loadLinkUtenti(rid);
}

const ORARI_TIPI = ['mattina', 'pomeriggio', 'sera', 'notte', 'ml', 'pl'];

async function renderAccOrari(rid, el) {
  const snap = await getDoc(doc(db, 'reparti', rid, 'config', 'orari'));
  const d = snap.exists() ? snap.data() : {};
  const cop = await getDoc(doc(db, 'reparti', rid, 'config', 'copertura'));
  const c = cop.exists() ? cop.data() : {};
  el.innerHTML = `
    <h4 style="margin-bottom:12px;font-size:.95rem">⏰ Orari preset turni</h4>
    ${ORARI_TIPI.map(t => `
      <div class="form-row" style="margin-bottom:8px;align-items:center">
        <label style="font-weight:500;text-transform:capitalize;min-width:110px">${t}</label>
        <div class="form-group" style="margin:0"><label style="font-size:.75rem">Inizio</label>
          <input type="time" id="orari-${rid}-${t}-inizio" value="${d[t]?.inizio || (typeof d[t] === 'string' ? d[t] : '') || ''}">
        </div>
        <div class="form-group" style="margin:0"><label style="font-size:.75rem">Fine</label>
          <input type="time" id="orari-${rid}-${t}-fine" value="${d[t]?.fine || ''}">
        </div>
      </div>`).join('')}
    <button class="btn btn-primary btn-sm mt-12" onclick="saveOrariPreset('${rid}')">💾 Salva orari</button>
    <div class="divider"></div>
    <h4 style="margin-bottom:8px;font-size:.95rem">➕ Turni personalizzati</h4>
    <div class="flex-gap" style="margin-bottom:8px">
      <input type="text" id="cop-nuovo-tipo-${rid}" placeholder="es. B (brevi servizio)" style="flex:1;min-width:140px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
      <button class="btn btn-ghost btn-sm" onclick="addTipoPersonalizzato('${rid}')">+ Aggiungi</button>
    </div>
    <div class="flex-gap" style="margin-bottom:12px">${(c.tipiPersonalizzati || []).map(t => `<span class="badge badge-info">${t} <a href="#" onclick="removeTipoPersonalizzato('${rid}','${t}');return false" style="color:#fff;font-weight:700">✕</a></span>`).join('') || '<span class="text-muted">Nessun tipo personalizzato</span>'}</div>
    <h4 style="margin-bottom:8px;font-size:.95rem">📊 Fabbisogno di copertura (per tipo/giorno)</h4>
    <div class="form-group"><textarea id="cop-fabbisogno-${rid}" rows="4" placeholder='{"M":3,"P":2,"N":1}'>${JSON.stringify(c.fabbisogno || {}, null, 2)}</textarea></div>
    <button class="btn btn-primary btn-sm" onclick="saveCoperturaConfig('${rid}')">💾 Salva copertura</button>`;
}

window.saveOrariPreset = async function(rid) {
  const data = {};
  ORARI_TIPI.forEach(t => {
    const ini = document.getElementById(`orari-${rid}-${t}-inizio`)?.value || '';
    const fin = document.getElementById(`orari-${rid}-${t}-fine`)?.value || '';
    if (ini || fin) data[t] = { inizio: ini, fine: fin };
  });
  try {
    await setDoc(doc(db, 'reparti', rid, 'config', 'orari'), data, { merge: true });
    await window.logAzione('salva_orari', rid);
    window.toast('Orari salvati', 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.addTipoPersonalizzato = async function(rid) {
  const v = document.getElementById(`cop-nuovo-tipo-${rid}`).value.trim();
  if (!v) return;
  try {
    const ref = doc(db, 'reparti', rid, 'config', 'copertura');
    const s = await getDoc(ref);
    const c = s.exists() ? s.data() : {};
    const arr = new Set(c.tipiPersonalizzati || []);
    arr.add(v);
    await setDoc(ref, { tipiPersonalizzati: [...arr] }, { merge: true });
    window.toast('Tipo aggiunto', 'success');
    document.getElementById(`acc-tab-${rid}-orari`).dataset.loaded = '';
    await loadAccTab(rid, 'orari');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.removeTipoPersonalizzato = async function(rid, tipo) {
  try {
    const ref = doc(db, 'reparti', rid, 'config', 'copertura');
    const s = await getDoc(ref);
    const c = s.exists() ? s.data() : {};
    const arr = (c.tipiPersonalizzati || []).filter(x => x !== tipo);
    await setDoc(ref, { tipiPersonalizzati: arr }, { merge: true });
    document.getElementById(`acc-tab-${rid}-orari`).dataset.loaded = '';
    await loadAccTab(rid, 'orari');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.saveCoperturaConfig = async function(rid) {
  let fab;
  try { fab = JSON.parse(document.getElementById(`cop-fabbisogno-${rid}`).value || '{}'); }
  catch (e) { window.toast('JSON fabbisogno non valido', 'error'); return; }
  try {
    await setDoc(doc(db, 'reparti', rid, 'config', 'copertura'), { fabbisogno: fab }, { merge: true });
    await window.logAzione('salva_copertura', rid);
    window.toast('Copertura salvata', 'success');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── PIONIERE: assegna il primo iscritto come comandante se manca ──
window.ricalcolaPioniere = async function(rid) {
  if (!await window.confirm2("Il \"Pioniere\" è il primo iscritto del reparto: se non c'è un comandante, assegnarlo automaticamente al membro più anziano?")) return;
  try {
    let members = [];
    try { const s = await getDocs(collection(db, 'reparti', rid, 'utenti')); members = s.docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) {}
    if (!members.length) members = window.AdminState.utenti.filter(u => u.reparto === rid).map(u => ({ id: u.id, uid: u.id, ...u }));
    if (!members.length) { window.toast('Nessun membro nel reparto', 'warn'); return; }
    if (members.some(m => m.ruolo === 'comandante')) { window.toast('Un comandante è già presente', 'info'); return; }
    const t = m => window.getDataIscrizione(m)?.toDate?.()?.getTime?.() || m.creatoIl?.toDate?.()?.getTime?.() || 0;
    const first = members.slice().sort((a, b) => t(a) - t(b))[0];
    const uid = first.uid || first.id;
    await updateDoc(doc(db, 'utenti', uid), { ruolo: 'comandante' });
    try { await setDoc(doc(db, 'reparti', rid, 'utenti', uid), { ruolo: 'comandante' }, { merge: true }); } catch (e) {}
    await window.logAzione('pioniere_comandante', rid, uid);
    window.toast('Pioniere impostato come comandante', 'success');
    window.loadReparti();
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

// ── BACHECA REPARTO (avvisi / ordini di servizio) ──
async function renderAccBacheca(rid, el) {
  const snap = await getDocs(collection(db, 'reparti', rid, 'bacheca'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.data || '') > String(a.data || '') ? 1 : -1);
  el.innerHTML = `
    <div class="flex-gap" style="margin-bottom:12px;flex-wrap:wrap">
      <input type="text" id="bac-titolo-${rid}" placeholder="Titolo avviso..." style="flex:1;min-width:140px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem">
      <label style="display:flex;align-items:center;gap:6px;font-size:.85rem"><input type="checkbox" id="bac-imp-${rid}"> Importante</label>
      <button class="btn btn-primary btn-sm" onclick="addBacheca('${rid}')">+ Pubblica</button>
    </div>
    <textarea id="bac-testo-${rid}" rows="2" placeholder="Testo dell'avviso / ordine di servizio..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;margin-bottom:12px"></textarea>
    ${list.length ? list.map(b => `
      <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;${b.importante ? 'border-color:var(--warn);background:#fff8ee' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${b.importante ? '📌 ' : '📢 '}${b.titolo || '—'}</strong>
          <button class="btn btn-danger btn-xs" onclick="deleteBacheca('${rid}','${b.id}')">🗑️</button>
        </div>
        <div style="font-size:.85rem;margin-top:4px;white-space:pre-wrap">${b.testo || ''}</div>
        <div class="text-muted" style="font-size:.75rem;margin-top:4px">${b.autore || ''} ${b.data || ''}</div>
      </div>`).join('') : '<p class="text-muted">Nessun avviso in bacheca.</p>'}`;
}

window.addBacheca = async function(rid) {
  const titolo = document.getElementById(`bac-titolo-${rid}`).value.trim();
  const testo = document.getElementById(`bac-testo-${rid}`).value.trim();
  const importante = document.getElementById(`bac-imp-${rid}`).checked;
  if (!titolo) { window.toast('Titolo obbligatorio', 'warn'); return; }
  try {
    const ref = doc(collection(db, 'reparti', rid, 'bacheca'));
    await setDoc(ref, { id: ref.id, titolo, testo, importante, autore: 'admin', data: new Date().toISOString().slice(0, 10) });
    window.toast('Avviso pubblicato', 'success');
    document.getElementById(`acc-tab-${rid}-bacheca`).dataset.loaded = '';
    await loadAccTab(rid, 'bacheca');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteBacheca = async function(rid, bid) {
  if (!await window.confirm2('Eliminare questo avviso?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'bacheca', bid));
    document.getElementById(`acc-tab-${rid}-bacheca`).dataset.loaded = '';
    await loadAccTab(rid, 'bacheca');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── RICHIESTE REPARTO (cambio turno / ferie-permessi) ──
// Flusso: attesa_collega → attesa_comando → approvata / rifiutata / annullata / scaduta
const RICHIESTA_TIPI = { cambio_turno: '🔄 Cambio turno', ferie: '🏖️ Ferie', permesso: '📝 Permesso', permessi: '📝 Permesso', malattia: '🤒 Malattia', altro: '❓ Altro' };
function badgeRichiesta(s) {
  const m = {
    attesa_collega: ['badge-pending', 'Attesa collega'],
    attesa_comando: ['badge-pending', 'Attesa comando'],
    approvata: ['badge-approved', 'Approvata'],
    rifiutata: ['badge-rejected', 'Rifiutata'],
    annullata: ['badge-info', 'Annullata'],
    scaduta: ['badge-sospeso', 'Scaduta'],
    approved: ['badge-approved', 'Approvata'],
    pending: ['badge-pending', 'In attesa'],
    rejected: ['badge-rejected', 'Rifiutata']
  };
  const v = m[s] || ['badge-info', s || '—'];
  return `<span class="badge ${v[0]}">${v[1]}</span>`;
}
const RICHIESTA_FINALI = ['approvata', 'rifiutata', 'annullata', 'scaduta', 'approved', 'rejected'];

async function renderAccRichieste(rid, el) {
  const snap = await getDocs(collection(db, 'reparti', rid, 'richieste'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.creatoIl?.toDate?.() || b.dataRichiesta || b.data || '') > String(a.creatoIl?.toDate?.() || a.dataRichiesta || a.data || '') ? 1 : -1);
  el.innerHTML = list.length ? list.map(r => {
    const fin = RICHIESTA_FINALI.includes(r.stato);
    const azioni = [];
    if (r.stato === 'attesa_collega') azioni.push(`<button class="btn btn-ghost btn-xs" onclick="setStatoRichiesta('${rid}','${r.id}','attesa_comando')">➡️ Passa al comando</button>`);
    if (r.stato === 'attesa_comando') {
      azioni.push(`<button class="btn btn-primary btn-xs" onclick="setStatoRichiesta('${rid}','${r.id}','approvata')">✅ Approva</button>`);
      azioni.push(`<button class="btn btn-danger btn-xs" onclick="setStatoRichiesta('${rid}','${r.id}','rifiutata')">⛔ Rifiuta</button>`);
    }
    if (!fin) azioni.push(`<button class="btn btn-warn btn-xs" onclick="setStatoRichiesta('${rid}','${r.id}','annullata')">🚫 Annulla</button>`);
    azioni.push(`<button class="btn btn-danger btn-xs" onclick="deleteRichiesta('${rid}','${r.id}')">🗑️</button>`);
    return `
    <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <strong>${RICHIESTA_TIPI[r.tipo] || r.tipo || 'Richiesta'}</strong>
        ${badgeRichiesta(r.stato)}
      </div>
      <div style="font-size:.85rem;margin-top:4px">${r.nome || r.uid || '—'}${r.dettagli ? ' — ' + r.dettagli : ''}</div>
      <div class="text-muted" style="font-size:.75rem;margin-top:4px">${r.dataRichiesta || r.data || ''}${r.turnoCoinvolto ? ' — turno: ' + r.turnoCoinvolto : ''}${r.risposta ? ' — ' + r.risposta : ''}</div>
      <div class="flex-gap" style="margin-top:8px">${azioni.join('')}</div>
    </div>`;
  }).join('') : '<p class="text-muted">Nessuna richiesta per questo reparto.</p>';
}

window.setStatoRichiesta = async function(rid, reqId, stato) {
  const labels = { attesa_comando: 'Passare la richiesta al comando?', approvata: 'Approvare questa richiesta?', rifiutata: 'Rifiutare questa richiesta?', annullata: 'Annullare questa richiesta?' };
  if (!await window.confirm2(labels[stato] || 'Aggiornare la richiesta?')) return;
  try {
    await updateDoc(doc(db, 'reparti', rid, 'richieste', reqId), {
      stato, risposta: stato, rispostoIl: Timestamp.now(),
      rispostoDa: window.AdminState.currentUser?.uid || 'admin'
    });
    await window.logAzione('stato_richiesta', `${rid}/${reqId}`, stato);
    window.toast('Richiesta aggiornata', 'success');
    document.getElementById(`acc-tab-${rid}-richieste`).dataset.loaded = '';
    await loadAccTab(rid, 'richieste');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteRichiesta = async function(rid, reqId) {
  if (!await window.confirm2('Eliminare questa richiesta?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'richieste', reqId));
    document.getElementById(`acc-tab-${rid}-richieste`).dataset.loaded = '';
    await loadAccTab(rid, 'richieste');
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

// ── LINK UTENTI (uid ↔ persona/pid) ──
async function loadLinkUtenti(rid) {
  const el = document.getElementById(`link-utenti-${rid}`);
  if (!el) return;
  try {
    const snap = await getDocs(collection(db, 'reparti', rid, 'link_utenti'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el.innerHTML = `
      <div class="flex-gap" style="margin-bottom:10px;flex-wrap:wrap">
        <input type="text" id="link-uid-${rid}" placeholder="UID" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.85rem">
        <input type="text" id="link-pid-${rid}" placeholder="PID (persona)" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.85rem">
        <button class="btn btn-primary btn-sm" onclick="addLinkUtente('${rid}')">+ Collega</button>
      </div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>UID</th><th>PID</th><th>Azioni</th></tr></thead>
      <tbody>${list.map(l => `<tr><td>${l.uid || l.id}</td><td>${l.pid || l.personaId || '—'}</td>
        <td><button class="btn btn-danger btn-xs" onclick="deleteLinkUtente('${rid}','${l.id}')">🗑️</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="text-muted">Nessun collegamento.</p>'}`;
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">Errore: ${e.message}</p>`; }
}

window.addLinkUtente = async function(rid) {
  const uid = document.getElementById(`link-uid-${rid}`).value.trim();
  const pid = document.getElementById(`link-pid-${rid}`).value.trim();
  if (!uid) { window.toast('UID obbligatorio', 'warn'); return; }
  try {
    await setDoc(doc(db, 'reparti', rid, 'link_utenti', uid), { uid, pid }, { merge: true });
    await window.logAzione('link_utente', `${rid}: ${uid} → ${pid}`);
    window.toast('Collegamento salvato', 'success');
    await loadLinkUtenti(rid);
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.deleteLinkUtente = async function(rid, id) {
  if (!await window.confirm2('Eliminare questo collegamento?')) return;
  try {
    await deleteDoc(doc(db, 'reparti', rid, 'link_utenti', id));
    await loadLinkUtenti(rid);
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── IMPORT PERSONE DA EXCEL/CSV ──
window.openImportPersone = function(rid) {
  document.getElementById('import-reparto-id').value = rid;
  document.getElementById('import-testo').value = '';
  const f = document.getElementById('import-file'); if (f) f.value = '';
  window.openModal('modal-import-persone');
};

window.leggiFilePersone = function(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { document.getElementById('import-testo').value = String(e.target.result || ''); };
  reader.readAsText(file);
};

window.importaPersone = async function() {
  const rid = document.getElementById('import-reparto-id').value;
  const salta = document.getElementById('import-saltaDuplicati').checked;
  const txt = document.getElementById('import-testo').value || '';
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { window.toast('Nessuna riga da importare', 'warn'); return; }
  try {
    const existing = new Set();
    if (salta) {
      const s = await getDocs(collection(db, 'reparti', rid, 'persone'));
      s.docs.forEach(d => existing.add(String(d.data().nome || '').toLowerCase()));
    }
    const docs = [];
    let skip = 0;
    for (const line of lines) {
      const parts = line.split(/\t|;|,/).map(p => p.trim());
      const nome = parts[0] || '';
      if (!nome) continue;
      if (salta && existing.has(nome.toLowerCase())) { skip++; continue; }
      docs.push({ nome, grado: parts[1] || '', ferieRes: Number(parts[2]) || 0, reparto: rid, importato: true });
    }
    // commit in blocchi da 400 (limite batch Firestore = 500)
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach(dd => {
        const ref = doc(collection(db, 'reparti', rid, 'persone'));
        batch.set(ref, { id: ref.id, ...dd });
      });
      await batch.commit();
    }
    await window.logAzione('import_persone', rid, `${docs.length} importate, ${skip} saltate`);
    window.toast(`Importate ${docs.length} persone${skip ? `, ${skip} saltate` : ''}`, 'success');
    window.closeModal('modal-import-persone');
    document.getElementById(`acc-tab-${rid}-personale`).dataset.loaded = '';
    await loadAccTab(rid, 'personale');
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── REPARTO MODAL (modifica / rinomina) ──
window.openRepartoModal = function(rid) {
  const r = window.AdminState.reparti.find(x => x.id === rid) || {};
  document.getElementById('rep-id').value = rid;
  document.getElementById('rep-id-display').textContent = rid;
  document.getElementById('rep-nome').value = r.nome || '';
  document.getElementById('rep-tipoStruttura').value = r.tipoStruttura || r.tipo || 'compagnia';
  document.getElementById('rep-specialita').value = r.specialita || '';
  document.getElementById('rep-sede').value = r.sede || '';
  window.openModal('modal-reparto');
};

window.saveRepartoInfo = async function() {
  const rid = document.getElementById('rep-id').value;
  const tipoStruttura = document.getElementById('rep-tipoStruttura').value;
  const data = {
    nome: document.getElementById('rep-nome').value.trim() || rid,
    tipo: tipoStruttura, tipoStruttura,
    specialita: document.getElementById('rep-specialita').value.trim(),
    sede: document.getElementById('rep-sede').value.trim()
  };
  try {
    await setDoc(doc(db, 'reparti', rid), data, { merge: true });
    await window.logAzione('modifica_reparto', rid, data.nome);
    window.toast('Reparto aggiornato', 'success');
    window.closeModal('modal-reparto');
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// ── NUOVO REPARTO ──
window.openNewRepartoModal = function() {
  document.getElementById('new-rep-nome').value = '';
  document.getElementById('new-rep-tipoStruttura').value = 'compagnia';
  document.getElementById('new-rep-specialita').value = '';
  document.getElementById('new-rep-sede').value = '';
  window.updateRepIdPreview();
  window.openModal('modal-new-reparto');
};

window.updateRepIdPreview = function() {
  const id = window.buildRepId(
    document.getElementById('new-rep-tipoStruttura').value,
    document.getElementById('new-rep-specialita').value,
    document.getElementById('new-rep-sede').value
  );
  const el = document.getElementById('new-rep-preview');
  if (!el) return;
  if (!id) { el.textContent = '—'; el.style.color = 'var(--on-surface2)'; return; }
  const exists = (window.AdminState.reparti || []).some(r => r.id === id);
  el.textContent = id + (exists ? '  (esiste già!)' : '');
  el.style.color = exists ? 'var(--danger)' : 'var(--primary)';
};

window.saveNewReparto = async function() {
  const tipoStruttura = document.getElementById('new-rep-tipoStruttura').value;
  const specialita = document.getElementById('new-rep-specialita').value.trim();
  const sede = document.getElementById('new-rep-sede').value.trim();
  const nome = document.getElementById('new-rep-nome').value.trim();
  const id = window.buildRepId(tipoStruttura, specialita, sede);
  if (!id) { window.toast('Compila almeno tipo struttura e sede', 'warn'); return; }
  if ((window.AdminState.reparti || []).some(r => r.id === id)) { window.toast('Esiste già un reparto con questo ID', 'error'); return; }
  try {
    await setDoc(doc(db, 'reparti', id), {
      id, nome: nome || id, tipo: tipoStruttura, tipoStruttura, specialita, sede,
      creatoIl: Timestamp.now(), creatoDa: window.AdminState.currentUser?.uid || 'admin'
    });
    await window.logAzione('crea_reparto', id, nome || id);
    window.toast('Reparto creato: ' + id, 'success');
    window.closeModal('modal-new-reparto');
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

window.resetComando = async function(rid) {
  if (!await window.confirm2('Resettare il comando di questo reparto? Comandante e vice diventeranno addetti.')) return;
  try {
    const snap = await getDocs(query(collection(db, 'utenti'), where('reparto', '==', rid), where('ruolo', 'in', ['comandante', 'vice'])));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { ruolo: 'addetto' }));
    await batch.commit();
    // sincronizza anche la sottocollezione del reparto
    for (const d of snap.docs) {
      try { await setDoc(doc(db, 'reparti', rid, 'utenti', d.id), { ruolo: 'addetto' }, { merge: true }); } catch (e) { /* non presente */ }
    }
    window.toast('Comando resettato', 'success');
    await window.logAzione('reset_comando', rid);
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};

// Cancella tutte le sottocollezioni note di un reparto (Firestore non fa cascade)
async function deleteRepartoSubcollections(rid) {
  for (const sub of REP_SUBCOLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'reparti', rid, sub));
      let batch = writeBatch(db), n = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref); n++;
        if (n === 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
      }
      if (n > 0) await batch.commit();
    } catch (e) { /* sottocollezione assente o senza permessi */ }
  }
}

window.eliminaReparto = async function(rid) {
  if (!await window.confirm2('Eliminare questo reparto? Verranno cancellate TUTTE le sottocollezioni (turni, richieste, bacheca, agenda...) e gli utenti verranno scollegati. Azione irreversibile.', 'Elimina reparto', 'Elimina')) return;
  try {
    const batch = writeBatch(db);
    window.AdminState.utenti.filter(u => u.reparto === rid).forEach(u => batch.update(doc(db, 'utenti', u.id), { reparto: '' }));
    await batch.commit();
    await deleteRepartoSubcollections(rid);
    try { await deleteDoc(doc(db, 'reparti', rid)); } catch (e2) {}
    await window.logAzione('elimina_reparto', rid);
    window.toast('Reparto eliminato', 'success');
    window.AdminState.utenti = [];
    window.loadReparti();
  } catch (e) { window.toast('Errore: ' + e.message, 'error'); }
};
