// Application bootstrap. Feature behavior lives in /modules/*.js and is
// loaded in dependency order by index.html.

function bindApplicationShell() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.onclick = () => {
      location.hash = button.dataset.view;
      setView(button.dataset.view);
    };
  });

  $('programme-context').onchange = event => {
    state.currentProgramme = event.target.value;
  };
  $('mobile-menu').onclick = () => $('sidebar').classList.toggle('open');
  $('login-form').onsubmit = login;
  $('logout').onclick = logout;
  window.addEventListener('hashchange', () => setView(location.hash.slice(1) || 'dashboard'));
}

async function restoreSession() {
  if (!token()) {
    showLogin();
    return;
  }

  try {
    const account = await api('/v1/identity/me', {}, false);
    showApp(account);
    await start();
  } catch (_) {
    clearTokens();
    showLogin();
  }
}

bindApplicationShell();
restoreSession();
