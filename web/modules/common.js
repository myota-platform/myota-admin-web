const API_BASE = (window.MYOTA_API_BASE || 'http://localhost:8080').replace(/\/$/, '');
const state = { account: null, programmes: [], entityTypeCatalogue: [], currentView: 'dashboard', currentProgramme: '', refreshing: false, geoEntities: [], geoSelected: null, geoMapBounds: null, geoEditingGeometry: null, geoDrawingMode: 'POLYGON', geoDrawingClosed: false, contentItems: [], contentSelected: null, policyItems: [], policySelected: null, awardItems: [], awardSelected: null, awardAssets: [], awardTemplateElements: [], awardDrag: null };
const $ = (id) => document.getElementById(id) || document.querySelector(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token = () => localStorage.getItem('myota_admin_access') || '';
function notify(message, kind = 'info') { const el = $('toast'); el.textContent = message; el.className = `toast-${kind}`; setTimeout(() => { el.textContent = ''; el.className = ''; }, 4200); }
function setTokens(data) { localStorage.setItem('myota_admin_access', data.accessToken); if (data.refreshToken) localStorage.setItem('myota_admin_refresh', data.refreshToken); }
function clearTokens() { localStorage.removeItem('myota_admin_access'); localStorage.removeItem('myota_admin_refresh'); }
async function api(path, options = {}, retry = true) {
  const headers = {'Accept': 'application/json', ...(options.body ? {'Content-Type': 'application/json'} : {}), ...(options.headers || {})};
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API_BASE}${path}`, {...options, headers});
  if (response.status === 403 && retry && localStorage.getItem('myota_admin_refresh')) {
    const refresh = await fetch(`${API_BASE}/v1/identity/auth/refresh`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refreshToken: localStorage.getItem('myota_admin_refresh')})});
    if (refresh.ok) { setTokens(await refresh.json()); return api(path, options, false); }
    clearTokens(); showLogin();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.message || body.error || response.statusText);
  return body;
}
function showLogin() {
  $('app-view').hidden = true;
  $('app-view').setAttribute('aria-hidden', 'true');
  $('login-view').hidden = false;
  $('login-view').setAttribute('aria-hidden', 'false');
}
function showApp(account) {
  state.account = account;
  $('login-view').hidden = true;
  $('login-view').setAttribute('aria-hidden', 'true');
  $('app-view').hidden = false;
  $('app-view').setAttribute('aria-hidden', 'false');
  $('account-label').textContent = account.displayName || account.email;
  $('login-form')?.reset();
  $('login-error').hidden = true;
}
async function login(event) { event.preventDefault(); $('login-error').hidden = true; try { const data = await api('/v1/identity/auth/login', {method:'POST', body:JSON.stringify({email:$('login-email').value, password:$('login-password').value})}, false); setTokens(data); showApp(data.account); await start(); } catch (error) { $('login-error').textContent = error.message; $('login-error').hidden = false; } }
async function logout() { try { await api('/v1/identity/auth/logout', {method:'POST', body:JSON.stringify({refreshToken:localStorage.getItem('myota_admin_refresh')})}, false); } catch (_) {} clearTokens(); showLogin(); }
async function loadProgrammes() { const data = await api('/v1/programmes'); state.programmes = data.items || []; $('programme-context').innerHTML = '<option value="">All programmes</option>' + state.programmes.map(p => `<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join(''); }
function setView(name) { state.currentView = name; document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `${name}-view`); document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name)); $('breadcrumb').textContent = name === 'master-data' ? 'Master data' : name[0].toUpperCase() + name.slice(1); $('sidebar').classList.remove('open'); const fn = {dashboard:renderDashboard,programmes:renderProgrammes,'master-data':renderMasterData,geodata:renderGeoReview,policies:renderPolicies,awards:renderAwards,content:renderContent,identity:renderIdentity,activity:renderActivity}[name]; if (fn) fn(); }
async function start() { await loadProgrammes(); await checkHealth(); setView(location.hash.slice(1) || 'dashboard'); }
async function checkHealth() { try { const data = await api('/healthz', {}, false); $('api-status').textContent = data.status === 'ok' ? 'API connected' : 'API warning'; $('api-status').className = 'status-dot good'; } catch (_) { $('api-status').textContent = 'API unavailable'; $('api-status').className = 'status-dot bad'; } }
function card(label, value, detail, tone='teal') { return `<article class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`; }
function geoStatusClass(status) { return String(status || '').toLowerCase(); }
function cloneJson(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
