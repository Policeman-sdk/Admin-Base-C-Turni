# Admin-Base-C-Turni

App Admin parallela per l'app **C-Turni** (militari). SPA statica in HTML + moduli ES,
senza build step: si apre `index.html` (serve un server statico, es. `npx serve`).
Legge/scrive su Firestore (progetto `c-turni`). Accesso riservato a `utenti/{uid}.ruolo === 'superadmin'`.

## Struttura file

| File | Ruolo |
|---|---|
| `index.html` | Layout, login, sezioni (Dashboard, Utenti, Reparti, Turni, Agenda&Todo, Notifiche, Manutenzione) + modali/drawer |
| `firebase.js` | Init Firebase, `window._db`/`window._auth`, `AdminState{utenti,reparti,currentUser}`, helper globali (`toast`, `confirm2`, `badgeStato`, `avatarEl`, `fmtTs`, `downloadCSV/JSON`, `normRepId`, `buildRepId`, `getDataIscrizione`, `navigateTo`, `initApp`) |
| `auth.js` | Login (solo utenti `superadmin`), logout, espone `AdminState.currentUser` |
| `dashboard.js` | Statistiche, ultimi utenti, grafico turni |
| `utenti.js` | Anagrafica globale: lista, modifica completa, approva/rifiuta, sospendi, trasferisci, scollega, elimina, approvazione massiva, drawer |
| `reparti.js` | Reparti (fonte di verità `reparti/{id}`): crea/rinomina/elimina (cascata), tab Utenti/Turni/Personale/Orari/Todo/Agenda/Bacheca/Richieste |
| `turni.js` | CRUD turni per reparto + export CSV |
| `agenda.js` | Agenda/Todo/Notifiche per-utente + agenda/todo condivisi di reparto |
| `notifiche.js` | Coda push `notifiche_push` (tutti/reparto/utente) + storico |
| `manutenzione.js` | Pulizie, export CSV, backup JSON completo, statistiche DB |

## Modello dati condiviso (fonte di verità)

```
utenti/{uid}                         profilo globale persona
notifiche_push/{id}                  coda push
reparti/{id}                         documento reparto (id normalizzato)
  ├─ utenti/{uid}                    profilo del membro nel reparto (ruolo, stato, grado…)
  ├─ persone/{id}                    anagrafica interna
  ├─ personale/{docId}               profilo personale completo (ct_me)
  ├─ turni/{id}                      turni del reparto
  ├─ richieste/{id}                  richieste cambio turno / ferie-permessi
  ├─ todo_condivisi/{id}             compiti del comando
  ├─ agenda_condivisa/{id}           appuntamenti di reparto
  ├─ bacheca/{id}                    avvisi / ordini di servizio
  ├─ config/{id}                     es. config/orari
  ├─ link_utenti/{uid}               collegamenti uid ↔ persona
  └─ dino_scores/{uid}               punteggi giochino (leaderboard)
```

ID reparto **normalizzato**: `tipoStruttura_specialita_sede` (es. `compagnia_ordinaria_monza`),
tutto minuscolo, spazi/non-alfanumerici → `_`. Funzioni: `window.buildRepId()`, `window.normRepId()`.

Ruoli: `superadmin`, `comandante`, `vice`, `addetto`. Stati: `approved`/`approvato`, `pending`, `rejected`, `sospeso`.

## Cosa è stato allineato con la specifica

- **Reparti come fonte di verità**: le sezioni Reparti/Dashboard/Manutenzione leggono la
  collezione `reparti` (non più solo il campo `utenti.reparto`). Mostra nome, tipo,
  n° membri, comandante/vice, approvazioni in attesa, data creazione.
- **Creazione reparto** con ID normalizzato e anteprima live; **eliminazione a cascata**
  di tutte le sottocollezioni note.
- **Trasferimento utente** tra reparti: rimozione dal vecchio reparto, ingresso nel nuovo
  come `pending` (o `approved` se l'admin è superadmin).
- **Approvazione/rifiuto singolo** per utente + **assegnazione comandante/vice/addetto**
  per membro del reparto (sincronizzata su `utenti` e `reparti/{id}/utenti`).
- **Scheda Utente ampliata**: email, tipo, tipoStruttura, modalita, tema, meteocitta,
  myPid, ava, privacy{condividiTurni,tosAccepted}, notif_pre/notif_prefs, licenzePool,
  permessiStudioMonte, straordinari, ct_recuperi, ct_fest_sopp (JSON validato).
- **Nuove sottocollezioni**: `bacheca` (avvisi/ordini di servizio) e `richieste`
  (cambio turno / ferie-permessi) con approva/rifiuta, nella scheda del reparto.
- **Tolleranza ai nomi campo**: lettura `registratoIl || creatoIl`, stato `approvato` come
  alias di `approved`, `ferieRes`/`ct_recuperi`/`ct_fest_sopp` ecc. gestiti senza perdita dati.
- **Login**: accetta qualsiasi utente con `ruolo === 'superadmin'` (rimosso l'hard-code email).
- **Backup JSON completo**: include sottocollezioni di reparto e `notifiche_push`.

## Ancora da completare (sottocollezioni non gestite a livello di UI)

- `link_utenti/{uid}` (collegamento uid ↔ persona) — oggi `link_utenti` è solo previsto in
  backup/cleanup, manca una UI dedicata.
- `personale/{docId}` (profilo completo `ct_me`) — l'admin usa `persone`; manca la vista `personale`.
- `dino_scores/{uid}` — manca la leaderboard.
- Marcatura `notifiche_push.inviata = true` (assumiamo la faccia una Cloud Function).

> Nota: `setDoc(..., { merge: true })` preserva i campi non gestiti dall'admin, ma i **map/array
> annidati** (es. `privacy`, `licenzePool`) vengono sostituiti per intero quando modificati. 
