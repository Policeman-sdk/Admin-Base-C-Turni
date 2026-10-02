import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// usa window._auth e window._db impostati da firebase.js
const auth = window._auth;
const db = window._db;

function showLogin(err = '') {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  if (err) document.getElementById('login-err').textContent = err;
}

function showApp(user, data) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  // memorizza l'admin loggato (serve per regole di trasferimento ecc.)
  window.AdminState.currentUser = { uid: user.uid, email: user.email, ...data };
  document.getElementById('sidebar-user').textContent = `${data.grado || ''} ${data.nome || ''} ${data.cognome || ''}`.trim() || user.email;
  window.initApp && window.initApp();
}

onAuthStateChanged(auth, async user => {
  if (user) {
    const snap = await getDoc(doc(db, 'utenti', user.uid));
    if (snap.exists() && snap.data().ruolo === 'superadmin') {
      showApp(user, snap.data());
    } else {
      await signOut(auth);
      showLogin("Accesso negato: non sei superadmin.");
    }
  } else {
    showLogin();
  }
});

window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-err');
  errEl.textContent = '';
  if (!email) { errEl.textContent = 'Inserisci una email.'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    errEl.textContent = 'Credenziali errate: ' + e.message;
  }
};

window.doLogout = async function() {
  if (await window.confirm2('Vuoi davvero uscire?')) await signOut(auth);
};
