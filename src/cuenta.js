// Cuentas de deelo (Firebase Auth + Firestore). Si algo de esto no carga, la página sigue funcionando sin cuenta.
const firebaseConfig = {
  apiKey: "AIzaSyBuHmOUYxZWDe9Qo7SDRX_xuPmllK6weLE",
  authDomain: "deelo-6e0e9.firebaseapp.com",
  projectId: "deelo-6e0e9",
  storageBucket: "deelo-6e0e9.firebasestorage.app",
  messagingSenderId: "670030404709",
  appId: "1:670030404709:web:068a90d261baf82669ba8c"
};
const V = '10.12.2';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';

const ERRORES = {
  'auth/invalid-email': 'El mail no es válido.',
  'auth/missing-password': 'Escribí una contraseña.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese mail. Probá ingresar.',
  'auth/invalid-credential': 'Mail o contraseña incorrectos.',
  'auth/wrong-password': 'Mail o contraseña incorrectos.',
  'auth/user-not-found': 'No hay ninguna cuenta con ese mail.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
  'auth/network-request-failed': 'No hay conexión. Revisá internet y probá de nuevo.',
  'auth/unauthorized-domain': 'Este dominio todavía no está habilitado para iniciar sesión.',
  'auth/requires-recent-login': 'Por seguridad, cerrá sesión, volvé a ingresar y repetí el pedido.',
};
const msg = e => ERRORES[e && e.code] || 'Algo salió mal. Probá de nuevo en un momento.';

(async () => {
  let A, F;
  try {
    const [app, auth, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
    const fapp = app.initializeApp(firebaseConfig);
    A = { ...auth, a: auth.getAuth(fapp) };
    A.a.languageCode = 'es';
    F = { ...fs, db: fs.getFirestore(fapp) };
  } catch (e) { return; } // sin cuentas: deelo funciona igual con lo guardado en el navegador

  const btn = $('acctBtn'), dlg = $('authDlg'), body = $('authBody');
  let user = null, modo = 'ingresar', borrarPaso = 0;
  btn.hidden = false;
  // Acciones de ingreso que usa la pantalla de inicio (bienvenida) de la página.
  window.deeloAuth = {
    msg,
    async google(){
      const prov = new A.GoogleAuthProvider();
      try { await A.signInWithPopup(A.a, prov); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await A.signInWithRedirect(A.a, prov); return; }
        throw e;
      }
    },
    ingresar: (mail, pass) => A.signInWithEmailAndPassword(A.a, mail, pass),
    crear: (mail, pass) => A.createUserWithEmailAndPassword(A.a, mail, pass),
    reset: mail => A.sendPasswordResetEmail(A.a, mail),
  };
  window.dispatchEvent(new CustomEvent('deelo:auth-listo'));
  btn.addEventListener('click', () => { borrarPaso = 0; render(); dlg.showModal(); });

  const ref = u => F.doc(F.db, 'users', u.uid);
  let timer = null;
  function guardar(d) {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(() => F.setDoc(ref(user), { perfil: d.perfil, gasto: d.gasto, actualizado: F.serverTimestamp() }).catch(() => {}), 800);
  }

  function render(nota) {
    if (user) {
      const nombre = user.displayName || user.email;
      body.innerHTML = `<div class="auth">
        <h2 id="authTitle">Tu cuenta</h2>
        <p>Ingresaste como <b>${esc(nombre)}</b>${user.displayName && user.email ? `<br>${esc(user.email)}` : ''}.</p>
        <p>Tus bancos, tarjetas y monto de compra se guardan en tu cuenta y los ves igual en cualquier dispositivo.</p>
        ${nota ? `<p class="${nota.ok ? 'ok' : 'err'}">${esc(nota.t)}</p>` : ''}
        <button class="btn ghost" id="aOut">Cerrar sesión</button>
        <button class="btn danger" id="aDel">${borrarPaso ? 'Sí, borrar mi cuenta y mis datos' : 'Borrar mi cuenta'}</button>
        ${borrarPaso ? '<p class="err">Esto borra tu cuenta y lo que guardaste. No se puede deshacer.</p>' : ''}
      </div>`;
      $('aOut').onclick = async () => { await A.signOut(A.a); dlg.close(); };
      $('aDel').onclick = async () => {
        if (!borrarPaso) { borrarPaso = 1; render(); return; }
        try { await F.deleteDoc(ref(user)); await A.deleteUser(user); dlg.close(); }
        catch (e) { borrarPaso = 0; render({ t: msg(e) }); }
      };
      return;
    }
    const crear = modo === 'crear';
    body.innerHTML = `<div class="auth">
      <h2 id="authTitle">${crear ? 'Creá tu cuenta' : 'Ingresá a deelo'}</h2>
      <p>Guardá tus bancos y tarjetas para verlos en el celular y en la compu. Es gratis y opcional.</p>
      <button class="gbtn" id="aG">${G}Continuar con Google</button>
      <div class="or">o con tu mail</div>
      <form id="aForm" class="auth" style="gap:10px" novalidate>
        <label class="field">Mail<input id="aMail" type="email" autocomplete="email" required></label>
        <label class="field">Contraseña<input id="aPass" type="password" autocomplete="${crear ? 'new-password' : 'current-password'}" minlength="6" required></label>
        <p class="err" id="aErr">${nota && !nota.ok ? esc(nota.t) : ''}</p>
        ${nota && nota.ok ? `<p class="ok">${esc(nota.t)}</p>` : ''}
        <button class="btn green" type="submit">${crear ? 'Crear cuenta' : 'Ingresar'}</button>
      </form>
      <div class="row2">
        <button class="linkBtn" id="aMode">${crear ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button>
        ${crear ? '' : '<button class="linkBtn" id="aReset">Olvidé mi contraseña</button>'}
      </div>
      <p style="font-size:12px">Al continuar aceptás el <a href="/acerca.html">aviso legal y la política de privacidad</a>.</p>
    </div>`;
    $('aMode').onclick = () => { modo = crear ? 'ingresar' : 'crear'; render(); };
    $('aG').onclick = async () => {
      const prov = new A.GoogleAuthProvider();
      try { await A.signInWithPopup(A.a, prov); dlg.close(); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await A.signInWithRedirect(A.a, prov); return; }
        render({ t: msg(e) });
      }
    };
    $('aForm').onsubmit = async ev => {
      ev.preventDefault();
      const mail = $('aMail').value.trim(), pass = $('aPass').value;
      try {
        if (crear) await A.createUserWithEmailAndPassword(A.a, mail, pass);
        else await A.signInWithEmailAndPassword(A.a, mail, pass);
        dlg.close();
      } catch (e) { $('aErr').textContent = msg(e); }
    };
    const reset = $('aReset');
    if (reset) reset.onclick = async () => {
      const mail = $('aMail').value.trim();
      if (!mail) { $('aErr').textContent = 'Escribí tu mail arriba y tocá de nuevo "Olvidé mi contraseña".'; return; }
      try { await A.sendPasswordResetEmail(A.a, mail); render({ ok: true, t: 'Te mandamos un mail para elegir una contraseña nueva.' }); }
      catch (e) { $('aErr').textContent = msg(e); }
    };
  }

  A.getRedirectResult(A.a).catch(() => {});
  A.onAuthStateChanged(A.a, async u => {
    user = u;
    window.deeloSesion = !!u;
    window.dispatchEvent(new CustomEvent('deelo:sesion', { detail: { sesion: !!u } }));
    if (!u) {
      window.deeloCuenta = null;
      btn.classList.remove('in');
      btn.textContent = 'Ingresar';
      if (dlg.open) render();
      return;
    }
    btn.classList.add('in');
    const ini = (u.displayName || u.email || '?').trim().charAt(0).toUpperCase();
    btn.innerHTML = `<span class="av">${esc(ini)}</span><span class="lbl">Mi cuenta</span>`; btn.setAttribute("aria-label", "Mi cuenta");
    try {
      const snap = await F.getDoc(ref(u));
      if (snap.exists() && snap.data().perfil) window.deelo && window.deelo.aplicar(snap.data());
      else if (window.deelo) { const d = window.deelo.estado(); await F.setDoc(ref(u), { perfil: d.perfil, gasto: d.gasto, actualizado: F.serverTimestamp() }); }
    } catch (e) { /* sin conexión a la base: se sigue usando lo local */ }
    window.deeloCuenta = { guardar };
    if (dlg.open) render();
  });
})();
