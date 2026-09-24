const API_BASE = (window.MYOTA_API_BASE || 'http://localhost:8080').replace(/\/$/, '');
const state = { account: null, programmes: [], currentView: 'dashboard', currentProgramme: '', refreshing: false, geoEntities: [], geoSelected: null, geoMapBounds: null, geoEditingGeometry: null, contentItems: [], contentSelected: null, policyItems: [], policySelected: null };
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
function showLogin() { $('app-view').hidden = true; $('login-view').hidden = false; }
function showApp(account) { state.account = account; $('login-view').hidden = true; $('app-view').hidden = false; $('account-label').textContent = account.displayName || account.email; }
async function login(event) { event.preventDefault(); $('login-error').hidden = true; try { const data = await api('/v1/identity/auth/login', {method:'POST', body:JSON.stringify({email:$('login-email').value, password:$('login-password').value})}, false); setTokens(data); showApp(data.account); await start(); } catch (error) { $('login-error').textContent = error.message; $('login-error').hidden = false; } }
async function logout() { try { await api('/v1/identity/auth/logout', {method:'POST', body:JSON.stringify({refreshToken:localStorage.getItem('myota_admin_refresh')})}, false); } catch (_) {} clearTokens(); showLogin(); }
async function loadProgrammes() { const data = await api('/v1/programmes'); state.programmes = data.items || []; $('programme-context').innerHTML = '<option value="">All programmes</option>' + state.programmes.map(p => `<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join(''); }
function setView(name) { state.currentView = name; document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `${name}-view`); document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name)); $('breadcrumb').textContent = name[0].toUpperCase() + name.slice(1); $('sidebar').classList.remove('open'); const fn = {dashboard:renderDashboard,programmes:renderProgrammes,geodata:renderGeoReview,policies:renderPolicies,content:renderContent,identity:renderIdentity,activity:renderActivity}[name]; if (fn) fn(); }
async function start() { await loadProgrammes(); await checkHealth(); setView(location.hash.slice(1) || 'dashboard'); }
async function checkHealth() { try { const data = await api('/healthz', {}, false); $('api-status').textContent = data.status === 'ok' ? 'API connected' : 'API warning'; $('api-status').className = 'status-dot good'; } catch (_) { $('api-status').textContent = 'API unavailable'; $('api-status').className = 'status-dot bad'; } }
function card(label, value, detail, tone='teal') { return `<article class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`; }
async function renderDashboard() { const view = $('dashboard-view'); view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">OVERVIEW</p><h1>Good to see you, ${esc(state.account?.displayName || 'administrator')}</h1><p class="muted">A live view of the platform’s programmes, reviews, activity and security signals.</p></div><button class="primary" id="dashboard-refresh">Refresh data</button></div><div id="metrics" class="metrics"><div class="loading-card">Loading dashboard…</div></div><div class="dashboard-grid"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">REVIEW QUEUE</p><h2>Geodata needing attention</h2></div><button class="link-button" data-go="geodata">Open queue →</button></div><div id="review-list" class="compact-list"></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">SECURITY CONTEXT</p><h2>Recent identity events</h2></div><button class="link-button" data-go="identity">Identity →</button></div><div id="security-list" class="compact-list"></div></article></div>`; $('dashboard-refresh').onclick = renderDashboard; document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => setView(b.dataset.go)); try { const [geo, accounts, events, activations] = await Promise.all([api('/v1/geodata/entities?status=PROPOSED&pageSize=5'), api('/v1/identity/admin/accounts?pageSize=1'), api('/v1/identity/admin/security-events?pageSize=5'), api('/v1/activations?pageSize=1')]); $('metrics').innerHTML = card('Programmes', state.programmes.length, 'configured initiatives') + card('Review queue', geo.total || 0, 'proposals awaiting decision', 'amber') + card('Accounts', accounts.total || 0, 'identity records') + card('Activations', activations.total || 0, 'recorded activity', 'blue'); $('review-list').innerHTML = (geo.items || []).map(e => `<div class="list-row"><span class="status-pill proposed">PROPOSED</span><div><strong>${esc(e.name)}</strong><small>${esc(e.programmeSlug)} · ${esc(e.entityType)}</small></div><button class="link-button" data-review="${esc(e.id)}">Review</button></div>`).join('') || '<p class="muted empty">The review queue is clear.</p>'; $('security-list').innerHTML = (events.items || []).slice(0,5).map(e => `<div class="list-row"><span class="event-icon">↗</span><div><strong>${esc(e.eventType)}</strong><small>${esc(e.occurredAt)}</small></div></div>`).join('') || '<p class="muted empty">No security events yet.</p>'; document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => { state.currentProgramme=''; setView('geodata'); }); } catch (error) { $('metrics').innerHTML = `<div class="error-card">${esc(error.message)}</div>`; } }
function programmeForm(p = {}) {
  const rules = p.rules || {};
  const minimumQsos = rules.minimumQsos || {};
  const validityIsUnlimited = rules.activationValidityDays === null || rules.activationValidityDays === undefined;
  const entityTypes = p.entityTypes || [{code:'LOCAL_ENTITY',label:'Local entity',geometry:'MULTIPOLYGON'}];
  return `<form id="programme-form" class="form-grid">
    <input type="hidden" id="programme-original" value="${esc(p.slug || '')}">
    <input type="hidden" id="programme-rules-source" value="${esc(JSON.stringify(rules))}">
    <label>Programme identifier
      <input id="programme-slug" value="${esc(p.slug || '')}" required ${p.slug ? 'readonly' : ''}>
      <small class="field-help">A short, permanent identifier used in links and imports. Use lowercase letters, numbers, and hyphens.</small>
    </label>
    <label>Programme name
      <input id="programme-name" value="${esc(p.name || '')}" required>
      <small class="field-help">The name participants and administrators will see.</small>
    </label>
    <label class="wide">Description
      <textarea id="programme-description">${esc(p.description || '')}</textarea>
      <small class="field-help">A short explanation of the programme. This does not define the legal charter or detailed rules.</small>
    </label>

    <section class="form-section wide" aria-labelledby="rules-heading">
      <div class="section-heading"><div><p class="eyebrow">PROGRAMME POLICY</p><h3 id="rules-heading">Common programme rules</h3></div><span class="help-badge">Programme-owned</span></div>
      <p class="field-help section-intro">These settings describe the basic policy used by the platform. Each programme chooses its own values; MyOTA does not supply or copy rules from another programme.</p>
      <div class="form-grid nested-grid">
        <label>Minimum QSOs for an activation
          <input id="rule-activation-qsos" type="number" min="0" step="1" value="${esc(minimumQsos.activation ?? 0)}" required>
          <small class="field-help">How many valid contacts an operator must record before an activation can qualify.</small>
        </label>
        <label>Minimum QSOs for a hunter
          <input id="rule-hunter-qsos" type="number" min="0" step="1" value="${esc(minimumQsos.hunter ?? 0)}" required>
          <small class="field-help">How many valid contacts a participant needs to receive credit as a hunter.</small>
        </label>
        <label>Activation validity
          <select id="rule-validity-mode">
            <option value="finite" ${validityIsUnlimited ? '' : 'selected'}>Limited number of days</option>
            <option value="unlimited" ${validityIsUnlimited ? 'selected' : ''}>Unlimited</option>
          </select>
          <small class="field-help">Choose whether an activation expires after a fixed period or remains valid indefinitely.</small>
        </label>
        <label id="rule-validity-days-label">Validity period in days
          <input id="rule-validity-days" type="number" min="1" step="1" value="${esc(validityIsUnlimited ? '' : rules.activationValidityDays)}" ${validityIsUnlimited ? 'disabled' : 'required'}>
          <small class="field-help">For example, 365 means the activation is valid for one year.</small>
        </label>
        <label class="check-field wide"><input id="rule-public-access" type="checkbox" ${rules.publicAccessRequired ? 'checked' : ''}> <span><strong>Require public access</strong><small class="field-help">Only allow entities that the public can access, according to this programme’s policy.</small></span></label>
        <label class="check-field wide"><input id="rule-exclude-overlaps" type="checkbox" ${rules.excludeOverlappingProgrammes ? 'checked' : ''}> <span><strong>Exclude overlapping programmes</strong><small class="field-help">Prevent an entity from being shared with another programme when the programme policy treats overlap as ineligible.</small></span></label>
      </div>
    </section>

    <section class="form-section wide" aria-labelledby="entity-types-heading">
      <div class="section-heading"><div><p class="eyebrow">ENTITY CATALOGUE</p><h3 id="entity-types-heading">Entity types (JSON)</h3></div><span class="help-badge neutral">Advanced format</span></div>
      <p class="field-help section-intro">Entity types describe the kinds of places this programme recognizes, such as a municipal park or nature reserve. This field remains JSON for now so programme owners can define their own catalogue without a platform-wide fixed list.</p>
      <details class="help-box"><summary>How should this JSON work?</summary><p>Use an array of objects. Each object needs a stable <code>code</code>, a human-readable <code>label</code>, and a PostGIS <code>geometry</code> type. The code is used by imports and historical records, so do not rename it after publication.</p><pre>${esc(JSON.stringify([{code:'MUNICIPAL_PARK',label:'Municipal park',geometry:'MULTIPOLYGON'}], null, 2))}</pre><p>You may add programme-specific metadata later, but keep the required fields consistent. Entity-type meaning and eligibility belong to the programme.</p></details>
      <textarea id="programme-entities" required aria-label="Entity types JSON">${esc(JSON.stringify(entityTypes, null, 2))}</textarea>
    </section>

    <section class="form-section wide" aria-labelledby="theme-heading">
      <div class="section-heading"><div><p class="eyebrow">PRESENTATION</p><h3 id="theme-heading">Programme appearance</h3></div></div>
      <p class="field-help section-intro">These colors personalize the public and administration surfaces without changing programme rules.</p>
      <div class="form-grid nested-grid"><label>Primary colour<input id="programme-primary" type="color" value="${esc(p.theme?.primary || '#0f766e')}"><small class="field-help">Main buttons, links, and programme accents.</small></label><label>Accent colour<input id="programme-accent" type="color" value="${esc(p.theme?.accent || '#f59e0b')}"><small class="field-help">Highlights, notices, and secondary emphasis.</small></label></div>
    </section>
    <div class="form-actions wide"><button class="primary" type="submit">${p.slug ? 'Save programme' : 'Create programme'}</button>${p.slug ? '<button type="button" class="danger-outline" id="archive-programme">Archive programme</button>' : ''}</div>
  </form>`;
}
async function renderProgrammes() { const view = $('programmes-view'); view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">CONFIGURATION</p><h1>Programmes</h1><p class="muted">Each programme owns its own rules, entity types, themes and policy versions.</p></div><button class="primary" id="new-programme">New programme</button></div><div class="split-layout"><article class="panel"><div class="panel-heading"><h2>Configured programmes</h2></div><div id="programme-list" class="table-list"></div></article><article class="panel" id="programme-editor"><div class="panel-heading"><h2>Select a programme</h2></div><p class="muted empty">Choose a programme to edit its configuration, or create a new one.</p></article></div>`; $('new-programme').onclick = () => { $('programme-editor').innerHTML = `<div class="panel-heading"><h2>New programme</h2></div>${programmeForm()}`; bindProgrammeForm(); }; $('programme-list').innerHTML = state.programmes.map(p => `<button class="table-row" data-programme="${esc(p.slug)}"><span><strong>${esc(p.name)}</strong><small>${esc(p.slug)} · policy v${esc(p.policyVersion || 1)}</small></span><span class="status-pill ${p.status === 'ACTIVE' ? 'approved' : 'muted-pill'}">${esc(p.status)}</span></button>`).join(''); document.querySelectorAll('[data-programme]').forEach(b => b.onclick = () => editProgramme(b.dataset.programme)); }
async function editProgramme(slug) { const p = state.programmes.find(x => x.slug === slug) || await api(`/v1/programmes/${encodeURIComponent(slug)}`); $('programme-editor').innerHTML = `<div class="panel-heading"><div><p class="eyebrow">PROGRAMME EDITOR</p><h2>${esc(p.name)}</h2></div><span class="status-pill approved">POLICY V${esc(p.policyVersion || 1)}</span></div>${programmeForm(p)}`; bindProgrammeForm(); }
function bindProgrammeForm() {
  const validityMode = $('rule-validity-mode');
  const validityDays = $('rule-validity-days');
  const validityLabel = $('rule-validity-days-label');
  const syncValidityFields = () => {
    const unlimited = validityMode.value === 'unlimited';
    validityDays.disabled = unlimited;
    validityDays.required = !unlimited;
    validityDays.value = unlimited ? '' : validityDays.value;
    validityLabel.hidden = unlimited;
  };
  validityMode.onchange = syncValidityFields;
  syncValidityFields();
  $('programme-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const activationQsos = Number($('rule-activation-qsos').value);
      const hunterQsos = Number($('rule-hunter-qsos').value);
      const validity = validityMode.value === 'unlimited' ? null : Number(validityDays.value);
      if (![activationQsos, hunterQsos].every(Number.isInteger) || activationQsos < 0 || hunterQsos < 0) throw new Error('Minimum QSO values must be whole numbers of zero or more.');
      if (validity !== null && (!Number.isInteger(validity) || validity < 1)) throw new Error('Validity must be a whole number of days, or Unlimited.');
      const rules = JSON.parse($('programme-rules-source').value || '{}');
      rules.minimumQsos = {activation: activationQsos, hunter: hunterQsos};
      rules.activationValidityDays = validity;
      rules.publicAccessRequired = $('rule-public-access').checked;
      rules.excludeOverlappingProgrammes = $('rule-exclude-overlaps').checked;
      const payload = {slug:$('programme-slug').value.trim().toLowerCase(), name:$('programme-name').value.trim(), description:$('programme-description').value, entityTypes:JSON.parse($('programme-entities').value), rules, theme:{primary:$('programme-primary').value,accent:$('programme-accent').value}};
      const original=$('programme-original').value;
      await api(original ? `/v1/programmes/${encodeURIComponent(original)}/update` : '/v1/programmes', {method:'POST', body:JSON.stringify(payload), headers:{'Idempotency-Key':crypto.randomUUID()}});
      notify('Programme saved','success'); await loadProgrammes(); renderProgrammes();
    } catch(error) { notify(error.message,'error'); }
  };
  if ($('archive-programme')) $('archive-programme').onclick = async () => { const slug=$('programme-original').value; if (!confirm(`Archive ${slug}?`)) return; try { await api(`/v1/programmes/${encodeURIComponent(slug)}/archive`, {method:'POST',body:'{}',headers:{'Idempotency-Key':crypto.randomUUID()}}); notify('Programme archived','success'); await loadProgrammes(); renderProgrammes(); } catch(error) { notify(error.message,'error'); } };
}
async function renderGeodata() { const view=$('geodata-view'); view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">POSTGIS WORKFLOW</p><h1>Geodata review</h1><p class="muted">Candidates stay distinct from approved references until a scoped approver decides.</p></div></div><div class="toolbar"><select id="geo-programme"><option value="">All programmes</option>${state.programmes.map(p=>`<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select><select id="geo-status"><option value="">All statuses</option><option value="CANDIDATE">Candidate</option><option value="PROPOSED">Proposed</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><button class="secondary" id="geo-refresh">Refresh</button><button class="primary" id="geo-import-toggle">Import GeoJSON</button></div><div id="geo-import" class="panel" hidden><div class="panel-heading"><h2>Manual import</h2><span class="muted">Imported features enter as candidates.</span></div><form id="geo-import-form" class="form-grid"><label>Programme<select id="import-programme">${state.programmes.map(p=>`<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select></label><label>Source name<input id="import-source" value="Manual administration import" required></label><label class="wide">GeoJSON feature collection<textarea id="import-features" required>{"type":"FeatureCollection","features":[]}</textarea></label><div class="form-actions wide"><button class="primary">Queue import</button></div></form></div><article class="panel"><div class="panel-heading"><h2>Entity queue</h2><span id="geo-count" class="muted"></span></div><div id="geo-table" class="table-list"></div></article>`; $('geo-refresh').onclick=loadGeoTable; $('geo-import-toggle').onclick=()=>{$('geo-import').hidden=!$('geo-import').hidden}; $('geo-import-form').onsubmit=submitImport; await loadGeoTable(); }
async function loadGeoTable() { const query=new URLSearchParams(); if($('geo-programme').value)query.set('programme',$('geo-programme').value); if($('geo-status').value)query.set('status',$('geo-status').value); query.set('pageSize','100'); try { const data=await api(`/v1/geodata/entities?${query}`); $('geo-count').textContent=`${data.total} entities`; $('geo-table').innerHTML=(data.items||[]).map(e=>`<div class="table-row entity-row"><span><strong>${esc(e.name)}</strong><small>${esc(e.programmeSlug)} · ${esc(e.entityType)} · ${esc(e.provenance?.adapter||'manual')}</small></span><span class="status-pill ${esc(e.status.toLowerCase())}">${esc(e.status)}</span>${e.status==='PROPOSED'?`<span class="row-actions"><button class="approve" data-id="${esc(e.id)}">Approve</button><button class="reject" data-id="${esc(e.id)}">Reject</button></span>`:'<span class="muted">No action</span>'}</div>`).join('')||'<p class="muted empty">No entities match these filters.</p>'; document.querySelectorAll('.approve').forEach(b=>b.onclick=()=>reviewEntity(b.dataset.id,'APPROVED')); document.querySelectorAll('.reject').forEach(b=>b.onclick=()=>reviewEntity(b.dataset.id,'REJECTED')); } catch(error) { $('geo-table').innerHTML=`<div class="error-card">${esc(error.message)}</div>`; } }
async function reviewEntity(id, decision) { try { await api(`/v1/geodata/entities/${id}/review`,{method:'POST',body:JSON.stringify({decision,reviewerId:state.account.id,note:'Reviewed in administration web'}),headers:{'Idempotency-Key':crypto.randomUUID()}}); notify(`Entity ${decision.toLowerCase()}`,'success'); await loadGeoTable(); } catch(error) { notify(error.message,'error'); } }
async function submitImport(event) { event.preventDefault(); try { const collection=JSON.parse($('import-features').value); const data=await api('/v1/geodata/imports/manual',{method:'POST',body:JSON.stringify({programmeSlug:$('import-programme').value,adapter:'MANUAL',source:{name:$('import-source').value,license:'programme-supplied',retrievedAt:new Date().toISOString()},features:collection.features||[]}),headers:{'Idempotency-Key':crypto.randomUUID()}}); notify(`Import queued: ${data.created?.length||0} created`,'success'); $('geo-import').hidden=true; await loadGeoTable(); } catch(error) { notify(error.message,'error'); } }
async function renderIdentity() { const view=$('identity-view'); view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">PEOPLE & ACCESS</p><h1>Identity administration</h1><p class="muted">Accounts, callsigns, evidence, roles and privacy actions.</p></div><button class="secondary" id="identity-refresh">Refresh</button></div><article class="panel"><div class="toolbar"><input id="identity-search" placeholder="Search name or email"><button class="secondary" id="identity-search-button">Search</button></div><div id="identity-table" class="table-list"></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">AUDIT CONTEXT</p><h2>Recent security events</h2></div></div><div id="identity-events" class="compact-list"></div></article>`; $('identity-refresh').onclick=renderIdentity; $('identity-search-button').onclick=loadAccounts; await loadAccounts(); try { const events=await api('/v1/identity/admin/security-events?pageSize=20'); $('identity-events').innerHTML=(events.items||[]).map(e=>`<div class="list-row"><span class="event-icon">↗</span><div><strong>${esc(e.eventType)}</strong><small>${esc(e.occurredAt)} · ${esc(e.payload?.accountId||'system')}</small></div></div>`).join('')||'<p class="muted empty">No recent security events.</p>'; } catch(error) { $('identity-events').innerHTML=`<div class="error-card">${esc(error.message)}</div>`; } }
async function loadAccounts() { const q=encodeURIComponent($('identity-search')?.value||''); try { const data=await api(`/v1/identity/admin/accounts?pageSize=100&q=${q}`); $('identity-table').innerHTML=(data.items||[]).map(a=>`<div class="table-row account-row"><span><strong>${esc(a.displayName)}</strong><small>${esc(a.email||'No email')} · ${esc(a.participationType)} · ${esc(a.callsigns?.map(c=>c.value).join(', ')||'No callsign')}</small></span><span class="status-pill ${a.status==='ACTIVE'?'approved':'muted-pill'}">${esc(a.status)}</span><span class="row-actions"><button class="link-button account-export" data-id="${esc(a.id)}">Export</button>${a.status==='ACTIVE'?`<button class="danger-button account-deactivate" data-id="${esc(a.id)}">Deactivate</button>`:''}</span></div>`).join('')||'<p class="muted empty">No accounts match.</p>'; document.querySelectorAll('.account-export').forEach(b=>b.onclick=()=>exportAccount(b.dataset.id)); document.querySelectorAll('.account-deactivate').forEach(b=>b.onclick=()=>deactivateAccount(b.dataset.id)); } catch(error) { $('identity-table').innerHTML=`<div class="error-card">${esc(error.message)}</div>`; } }
async function exportAccount(id) { try { const data=await api(`/v1/identity/accounts/${id}/export`); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`myota-account-${id}.json`; a.click(); URL.revokeObjectURL(a.href); } catch(error) { notify(error.message,'error'); } }
async function deactivateAccount(id) { if(!confirm('Deactivate and anonymize this account?'))return; try { await api(`/v1/identity/accounts/${id}/deactivate`,{method:'POST',body:JSON.stringify({anonymize:true}),headers:{'Idempotency-Key':crypto.randomUUID()}}); notify('Account deactivated','success'); await loadAccounts(); } catch(error) { notify(error.message,'error'); } }
async function renderActivity() { const view=$('activity-view'); view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">OPERATIONS</p><h1>Activity</h1><p class="muted">Protected activation and QSO operational view.</p></div><button class="secondary" id="activity-refresh">Refresh</button></div><article class="panel"><div id="activity-table" class="table-list"></div></article>`; $('activity-refresh').onclick=renderActivity; try { const data=await api('/v1/activations?pageSize=100'); $('activity-table').innerHTML=(data.items||[]).map(a=>`<div class="table-row"><span><strong>${esc(a.id.slice(0,8))}…</strong><small>${esc(a.programmeSlug)} · ${esc(a.entityId)} · ${esc(a.operatorId)}</small></span><span class="status-pill ${a.status==='OPEN'?'proposed':'approved'}">${esc(a.status)}</span><span>${esc(a.qsos?.length||0)} QSOs</span></div>`).join('')||'<p class="muted empty">No activations recorded.</p>'; } catch(error) { $('activity-table').innerHTML=`<div class="error-card">${esc(error.message)}</div>`; } }
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{location.hash=b.dataset.view;setView(b.dataset.view);}); $('programme-context').onchange=(e)=>{state.currentProgramme=e.target.value;}; $('mobile-menu').onclick=()=>$('sidebar').classList.toggle('open'); $('login-form').onsubmit=login; $('logout').onclick=logout; window.addEventListener('hashchange',()=>setView(location.hash.slice(1)||'dashboard')); if(token()){api('/v1/identity/me',{},false).then(data=>{showApp(data);start();}).catch(showLogin);} else showLogin();
function geoStatusClass(status) { return String(status || '').toLowerCase(); }
function cloneJson(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function geoVertexRefs(geometry) {
  if (!geometry || !geometry.coordinates) return [];
  if (geometry.type === 'Point') return [{get: () => geometry.coordinates, set: value => { geometry.coordinates = value; }}];
  if (geometry.type === 'Polygon') return (geometry.coordinates[0] || []).map((_, index) => ({get: () => geometry.coordinates[0][index], set: value => { geometry.coordinates[0][index] = value; if (index === 0 && geometry.coordinates[0].length > 1) geometry.coordinates[0][geometry.coordinates[0].length - 1] = value; }}));
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates[0]?.[0] || []).map((_, index) => ({get: () => geometry.coordinates[0][0][index], set: value => { geometry.coordinates[0][0][index] = value; if (index === 0 && geometry.coordinates[0][0].length > 1) geometry.coordinates[0][0][geometry.coordinates[0][0].length - 1] = value; }}));
  return [];
}
function geoBounds(entities) {
  const coords = entities.flatMap(entity => geoVertexRefs(entity.geometry).map(ref => ref.get())).filter(coord => Array.isArray(coord) && coord.length >= 2);
  if (!coords.length) return {minLon:-3.75,maxLon:-3.65,minLat:40.38,maxLat:40.46};
  const lons = coords.map(coord => Number(coord[0])), lats = coords.map(coord => Number(coord[1]));
  const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const lonPad = Math.max((maxLon - minLon) * .18, .01), latPad = Math.max((maxLat - minLat) * .18, .01);
  return {minLon:minLon-lonPad,maxLon:maxLon+lonPad,minLat:minLat-latPad,maxLat:maxLat+latPad};
}
function geoProject(coord, bounds) { return [24 + ((Number(coord[0]) - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 552, 336 - ((Number(coord[1]) - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 312]; }
function geoUnproject(x, y, bounds) { return [bounds.minLon + ((x - 24) / 552) * (bounds.maxLon - bounds.minLon), bounds.minLat + ((336 - y) / 312) * (bounds.maxLat - bounds.minLat)]; }
function geoShapeMarkup(entity, bounds, selected) {
  const refs = geoVertexRefs(selected && state.geoEditingGeometry ? state.geoEditingGeometry : entity.geometry);
  const projected = refs.map(ref => geoProject(ref.get(), bounds));
  const shape = entity.geometry?.type === 'Point' ? `<circle data-geo-shape="${esc(entity.id)}" cx="${projected[0]?.[0] || 0}" cy="${projected[0]?.[1] || 0}" r="${selected ? 9 : 7}" class="geo-shape-point"/>` : `<polygon data-geo-shape="${esc(entity.id)}" points="${projected.map(point => point.join(',')).join(' ')}" class="geo-shape-polygon"/>`;
  const handles = selected && state.geoEditingGeometry && refs.length ? projected.map((point, index) => `<circle data-vertex="${index}" cx="${point[0]}" cy="${point[1]}" r="6" class="geo-vertex"/>`).join('') : '';
  return `<g data-geo-id="${esc(entity.id)}" class="geo-layer ${geoStatusClass(entity.status)} ${selected ? 'selected' : ''}">${shape}${handles}<text x="${(projected[0]?.[0] || 30) + 10}" y="${(projected[0]?.[1] || 30) - 10}" class="geo-label">${esc(entity.name)}</text></g>`;
}
function renderGeoMap() {
  const map = $('geo-map'); if (!map) return;
  const visible = state.geoEntities.filter(entity => !$(`layer-${geoStatusClass(entity.status)}`) || $(`layer-${geoStatusClass(entity.status)}`).checked);
  state.geoMapBounds = geoBounds(visible.length ? visible : state.geoEntities);
  const layers = visible.map(entity => geoShapeMarkup(entity, state.geoMapBounds, state.geoSelected?.id === entity.id)).join('');
  map.innerHTML = `<svg id="geo-svg" viewBox="0 0 600 360" role="img" aria-label="Geodata review map"><rect width="600" height="360" class="geo-water"/><path d="M0 60H600M0 120H600M0 180H600M0 240H600M0 300H600M100 0V360M200 0V360M300 0V360M400 0V360M500 0V360" class="geo-grid"/>${layers || '<text x="220" y="180" class="geo-empty">No entities in these layers</text>'}</svg>`;
  document.querySelectorAll('[data-geo-id]').forEach(node => node.onclick = event => { if (!event.target.dataset.vertex) selectGeoEntity(node.dataset.geoId); });
  const svg = $('geo-svg'); let dragging = null;
  svg?.addEventListener('pointerdown', event => { const handle = event.target.closest('[data-vertex]'); if (!handle || !state.geoEditingGeometry) return; dragging = {index:Number(handle.dataset.vertex)}; svg.setPointerCapture(event.pointerId); });
  svg?.addEventListener('pointermove', event => { if (!dragging) return; const rect = svg.getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * 600, y = ((event.clientY - rect.top) / rect.height) * 360; const refs = geoVertexRefs(state.geoEditingGeometry); refs[dragging.index]?.set(geoUnproject(x, y, state.geoMapBounds)); const selectedShape = svg.querySelector('[data-geo-shape]'); if (selectedShape) { const refsNow = geoVertexRefs(state.geoEditingGeometry), points = refsNow.map(ref => geoProject(ref.get(), state.geoMapBounds)); if (state.geoEditingGeometry.type === 'Point') { selectedShape.setAttribute('cx', points[0][0]); selectedShape.setAttribute('cy', points[0][1]); } else selectedShape.setAttribute('points', points.map(point => point.join(',')).join(' ')); svg.querySelectorAll('[data-vertex]').forEach((vertex, index) => { vertex.setAttribute('cx', points[index][0]); vertex.setAttribute('cy', points[index][1]); }); } });
  svg?.addEventListener('pointerup', () => { dragging = null; });
}
async function renderGeoReview() {
  const view = $('geodata-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">POSTGIS WORKFLOW</p><h1>Map-based geodata review</h1><p class="muted">Compare source data, edit geometry, and record an auditable decision for each lifecycle layer.</p></div><button class="primary" id="geo-refresh">Refresh map</button></div><div class="toolbar"><select id="geo-programme"><option value="">All programmes</option>${state.programmes.map(p=>`<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select><button class="secondary" id="geo-import-toggle">Import GeoJSON</button></div><div class="geo-layout"><aside class="panel geo-sidebar"><div class="panel-heading"><div><h2>Layers</h2><small class="muted">Verified and candidate data stay visually distinct.</small></div><span id="geo-count" class="muted"></span></div><label class="layer-toggle candidate"><input id="layer-candidate" type="checkbox" checked> Candidate</label><label class="layer-toggle proposed"><input id="layer-proposed" type="checkbox" checked> Proposed</label><label class="layer-toggle approved"><input id="layer-approved" type="checkbox" checked> Approved</label><label class="layer-toggle rejected"><input id="layer-rejected" type="checkbox"> Rejected</label><div id="geo-entity-list" class="table-list geo-entity-list"></div></aside><section class="geo-center"><div id="geo-map" class="geo-map"></div><article id="geo-inspector" class="panel"><p class="muted empty">Select an entity on the map or in the list to inspect its source, geometry, notes, and audit history.</p></article></section></div><div id="geo-import" class="panel" hidden><div class="panel-heading"><h2>Manual import</h2><span class="muted">Imported features enter as candidates.</span></div><form id="geo-import-form" class="form-grid"><label>Programme<select id="import-programme">${state.programmes.map(p=>`<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select></label><label>Source name<input id="import-source" value="Manual administration import" required></label><label class="wide">GeoJSON feature collection<textarea id="import-features" required>{"type":"FeatureCollection","features":[]}</textarea></label><div class="form-actions wide"><button class="primary">Queue import</button></div></form></div>`;
  $('geo-refresh').onclick = loadGeoReview; $('geo-import-toggle').onclick = () => { $('geo-import').hidden = !$('geo-import').hidden; }; ['candidate','proposed','approved','rejected'].forEach(status => $(`layer-${status}`).onchange = renderGeoMap); $('geo-programme').onchange = loadGeoReview; $('geo-import-form').onsubmit = submitImport; await loadGeoReview();
}
async function loadGeoReview() { const query = new URLSearchParams({pageSize:'100'}); if ($('geo-programme')?.value) query.set('programme', $('geo-programme').value); try { const data = await api(`/v1/geodata/entities?${query}`); state.geoEntities = data.items || []; $('geo-count').textContent = `${data.total} entities`; $('geo-entity-list').innerHTML = state.geoEntities.map(entity => `<button class="table-row geo-entity-row ${state.geoSelected?.id===entity.id?'selected':''}" data-select-geo="${esc(entity.id)}"><span><strong>${esc(entity.name)}</strong><small>${esc(entity.entityType)} · ${esc(entity.provenance?.adapter || 'manual')}</small></span><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></button>`).join('') || '<p class="muted empty">No geodata entities match.</p>'; document.querySelectorAll('[data-select-geo]').forEach(button => button.onclick = () => selectGeoEntity(button.dataset.selectGeo)); if (!state.geoSelected || !state.geoEntities.some(entity => entity.id === state.geoSelected.id)) { state.geoSelected = state.geoEntities[0] || null; state.geoEditingGeometry = cloneJson(state.geoSelected?.geometry); } renderGeoMap(); if (state.geoSelected) await selectGeoEntity(state.geoSelected.id); } catch (error) { $('geo-entity-list').innerHTML = `<div class="error-card">${esc(error.message)}</div>`; } }
async function selectGeoEntity(id) { state.geoSelected = state.geoEntities.find(entity => entity.id === id) || null; state.geoEditingGeometry = cloneJson(state.geoSelected?.geometry); renderGeoMap(); const entity = state.geoSelected; if (!entity) return; const audit = await api(`/v1/geodata/entities/${encodeURIComponent(id)}/audit`); $('geo-inspector').innerHTML = `<div class="panel-heading"><div><p class="eyebrow">ENTITY INSPECTOR</p><h2>${esc(entity.name)}</h2><p class="muted">${esc(entity.programmeSlug)} · ${esc(entity.entityType)} · ${esc(entity.status)}</p></div><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></div><div class="inspector-grid"><section><h3>Source comparison</h3><p class="field-help">The imported source snapshot is shown beside the current platform geometry. Editing creates a history entry; it never changes the original provenance.</p><div class="compare-grid"><div><small class="muted">Source snapshot</small><pre class="data-preview">${esc(JSON.stringify(entity.provenance?.sourceFeature || entity.provenance?.source || {}, null, 2))}</pre></div><div><small class="muted">Current platform geometry</small><pre class="data-preview">${esc(JSON.stringify(entity.geometry || {}, null, 2))}</pre></div></div></section><section><h3>Geometry editing</h3><p class="field-help">Drag the blue vertices on the map. Point entities can be moved; polygon vertices can be adjusted. Save only after checking the source comparison.</p><label>Geometry change note<textarea id="geo-geometry-note" placeholder="Explain why the geometry was adjusted"></textarea></label><button class="secondary" id="geo-save-geometry">Save geometry</button></section></div><section><h3>Review decision</h3><label>Review note<textarea id="geo-review-note" placeholder="Record the evidence or reason for this decision"></textarea></label><div class="form-actions">${entity.status==='CANDIDATE'?'<button class="secondary" id="geo-propose">Propose for review</button>':''}${entity.status==='PROPOSED'?'<button class="approve" id="geo-approve">Approve</button><button class="reject" id="geo-reject">Reject</button>':''}</div></section><section><h3>Audit history</h3><div class="audit-list">${[...(audit.reviewHistory||[]),...(audit.geometryHistory||[])].sort((a,b)=>String(b.occurredAt||b.editedAt).localeCompare(String(a.occurredAt||a.editedAt))).map(item=>`<div class="audit-row"><strong>${esc(item.action || 'GEOMETRY_EDIT')}</strong><span>${esc(item.occurredAt || item.editedAt || '')}</span><small>${esc(item.note || item.reviewerId || item.editorId || '')}</small></div>`).join('') || '<p class="muted">No audit entries yet.</p>'}</div></section>`; $('geo-save-geometry').onclick = saveGeoGeometry; if ($('geo-propose')) $('geo-propose').onclick = () => reviewGeoEntity('PROPOSE'); if ($('geo-approve')) $('geo-approve').onclick = () => reviewGeoEntity('APPROVED'); if ($('geo-reject')) $('geo-reject').onclick = () => reviewGeoEntity('REJECTED'); }
async function saveGeoGeometry() { try { await api(`/v1/geodata/entities/${encodeURIComponent(state.geoSelected.id)}/geometry`, {method:'POST', body:JSON.stringify({geometry:state.geoEditingGeometry, editorId:state.account.id, note:$('geo-geometry-note').value}), headers:{'Idempotency-Key':crypto.randomUUID()}}); notify('Geometry saved with audit history','success'); await loadGeoReview(); } catch (error) { notify(error.message,'error'); } }
async function reviewGeoEntity(decision) { try { const note = $('geo-review-note').value; if (decision === 'PROPOSE') await api(`/v1/geodata/entities/${encodeURIComponent(state.geoSelected.id)}/propose`, {method:'POST',body:JSON.stringify({proposerId:state.account.id,note}),headers:{'Idempotency-Key':crypto.randomUUID()}}); else await api(`/v1/geodata/entities/${encodeURIComponent(state.geoSelected.id)}/review`, {method:'POST',body:JSON.stringify({decision,reviewerId:state.account.id,note}),headers:{'Idempotency-Key':crypto.randomUUID()}}); notify(decision === 'PROPOSE' ? 'Entity proposed for review' : `Entity ${decision.toLowerCase()}`,'success'); await loadGeoReview(); } catch(error) { notify(error.message,'error'); } }

function programmeChooser(id) { return `<select id="${id}">${state.programmes.map(p=>`<option value="${esc(p.slug)}" ${p.slug === (state.currentProgramme || state.programmes[0]?.slug) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`; }
function contentEditor(item = {}) {
  const effective = item.effectiveFrom ? String(item.effectiveFrom).slice(0,16) : '';
  const actions = item.id ? (item.status === 'DRAFT' || item.status === 'CHANGES_REQUESTED' ? '<button type="button" class="secondary" id="content-submit">Submit for review</button>' : item.status === 'UNDER_REVIEW' ? '<button type="button" class="approve" id="content-approve">Approve</button><button type="button" class="reject" id="content-request-changes">Request changes</button>' : item.status === 'APPROVED' ? '<button type="button" class="primary" id="content-publish">Publish</button>' : '') : '';
  return `<form id="content-form" class="form-grid"><input type="hidden" id="content-id" value="${esc(item.id || '')}"><label>Content key<input id="content-key" value="${esc(item.key || '')}" placeholder="programme.welcome" required><small class="field-help">A stable name used by the public application. Keep it unchanged after publication.</small></label><label>Locale<input id="content-locale" value="${esc(item.locale || 'en')}" placeholder="en" required><small class="field-help">Use the programme’s locale code, such as en or es.</small></label><label>Fallback locale<input id="content-fallback" value="${esc(item.fallbackLocale || '')}" placeholder="en"><small class="field-help">Optional locale to use when this translation is missing or unpublished.</small></label><label>Effective from<input id="content-effective" type="datetime-local" value="${esc(effective)}"><small class="field-help">Publishing requires an explicit effective date.</small></label><label class="wide">Text or content value<textarea id="content-value" required>${esc(item.value || '')}</textarea><small class="field-help">Programme-owned content. The platform stores it without imposing a message catalogue.</small></label><div class="form-actions wide"><button class="primary" type="submit">${item.id ? 'Save draft' : 'Create draft'}</button>${actions}</div>${item.status ? `<p class="field-help wide">Current status: <strong>${esc(item.status)}</strong>. Drafts can be edited; published content is immutable and should be superseded by a new draft.</p>` : ''}</form>`;
}
function setContentEditor(item = {}) { state.contentSelected = item; $('content-editor').innerHTML = `<div class="panel-heading"><div><p class="eyebrow">CONTENT VERSION</p><h2>${item.id ? esc(item.key) : 'New content draft'}</h2></div>${item.status ? `<span class="status-pill ${geoStatusClass(item.status)}">${esc(item.status)}</span>` : ''}</div>${contentEditor(item)}`; bindContentEditor(); }
function bindContentEditor() {
  $('content-form').onsubmit = async event => { event.preventDefault(); try { const slug = $('content-programme').value; const body = {contentId:$('content-id').value || undefined, key:$('content-key').value.trim(), locale:$('content-locale').value.trim(), fallbackLocale:$('content-fallback').value.trim() || null, value:$('content-value').value}; const saved = await api(`/v1/programmes/${encodeURIComponent(slug)}/content`, {method:'POST',body:JSON.stringify(body)}); notify('Content draft saved','success'); await loadContentAdmin(saved.id); } catch(error) { notify(error.message,'error'); } };
  if ($('content-submit')) $('content-submit').onclick = () => contentAction('submit');
  if ($('content-approve')) $('content-approve').onclick = () => contentAction('review', 'APPROVED');
  if ($('content-request-changes')) $('content-request-changes').onclick = () => contentAction('review', 'CHANGES_REQUESTED');
  if ($('content-publish')) $('content-publish').onclick = () => contentAction('publish');
}
async function contentAction(action, decision) { try { const slug=$('content-programme').value, id=$('content-id').value; if (!id) return; const note=$('content-review-note')?.value || ''; let path=`/v1/programmes/${encodeURIComponent(slug)}/content/${encodeURIComponent(id)}/${action}`; const body=action==='review'?{decision,reviewerId:state.account.id,note}:action==='publish'?{effectiveFrom:$('content-effective').value,publisherId:state.account.id}:{}; if(action==='publish'&&!body.effectiveFrom) throw new Error('Choose an effective date before publishing.'); await api(path,{method:'POST',body:JSON.stringify(body)}); notify(action==='publish'?'Content published':`Content ${action}ed`,'success'); await loadContentAdmin(id); } catch(error) { notify(error.message,'error'); } }
async function renderContent() { const view=$('content-view'); view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">CONTENT OPERATIONS</p><h1>Content & translations</h1><p class="muted">Programme-owned text follows a draft, review, publish lifecycle. Published locales and fallback coverage are visible at a glance.</p></div><button class="primary" id="content-new">New content draft</button></div><div class="toolbar"><label class="toolbar-field">Programme ${programmeChooser('content-programme')}</label><button class="secondary" id="content-refresh">Refresh</button></div><article class="panel"><div class="panel-heading"><div><h2>Locale coverage</h2><small class="muted">Coverage counts published keys only; drafts remain visible in the content list.</small></div></div><div id="content-coverage" class="coverage-grid"></div></article><div class="split-layout"><article class="panel"><div class="panel-heading"><h2>Content versions</h2></div><div id="content-list" class="table-list"></div></article><article class="panel" id="content-editor"><div class="panel-heading"><h2>New content draft</h2></div>${contentEditor()}</article></div>`; $('content-programme').onchange=()=>{state.currentProgramme=$('content-programme').value;loadContentAdmin();}; $('content-refresh').onclick=()=>loadContentAdmin(); $('content-new').onclick=()=>setContentEditor(); bindContentEditor(); await loadContentAdmin(); }
async function loadContentAdmin(selectedId) { const slug=$('content-programme')?.value || state.currentProgramme || state.programmes[0]?.slug; if(!slug)return; try { const [data,coverage]=await Promise.all([api(`/v1/programmes/${encodeURIComponent(slug)}/content?pageSize=100`),api(`/v1/programmes/${encodeURIComponent(slug)}/content/coverage`)]); state.contentItems=data.items||[]; $('content-coverage').innerHTML=(coverage.locales||[]).map(locale=>`<div class="coverage-card"><strong>${esc(locale.locale)}</strong><span>${esc(locale.coveragePercent)}%</span><small>${esc(locale.published)} of ${esc(locale.total)} published${locale.missingKeys?.length?` · missing: ${esc(locale.missingKeys.join(', '))}`:''}</small></div>`).join('')||'<p class="muted empty">No content keys yet.</p>'; $('content-list').innerHTML=state.contentItems.map(item=>`<button class="table-row" data-content-id="${esc(item.id)}"><span><strong>${esc(item.key)}</strong><small>${esc(item.locale)}${item.fallbackLocale?` · fallback ${esc(item.fallbackLocale)}`:''}</small></span><span class="status-pill ${geoStatusClass(item.status)}">${esc(item.status)}</span></button>`).join('')||'<p class="muted empty">No content drafts yet.</p>'; document.querySelectorAll('[data-content-id]').forEach(button=>button.onclick=()=>setContentEditor(state.contentItems.find(item=>item.id===button.dataset.contentId))); if(selectedId) setContentEditor(state.contentItems.find(item=>item.id===selectedId)||{}); } catch(error) { $('content-list').innerHTML=`<div class="error-card">${esc(error.message)}</div>`; } }

function policyEditor(item = {}) { const schema=JSON.stringify(item.schema || {rules:{minimumQsos:{activation:0,hunter:0}}}, null, 2); const effective=item.effectiveFrom?String(item.effectiveFrom).slice(0,16):''; const actions=item.id?(item.status==='DRAFT'||item.status==='CHANGES_REQUESTED'?'<button type="button" class="secondary" id="policy-submit">Submit for review</button>':item.status==='UNDER_REVIEW'?'<button type="button" class="approve" id="policy-approve">Approve</button><button type="button" class="reject" id="policy-request-changes">Request changes</button>':item.status==='APPROVED'?'<button type="button" class="primary" id="policy-publish">Publish</button>':''):''; return `<form id="policy-form" class="form-grid"><input type="hidden" id="policy-id" value="${esc(item.id||'')}"><label>Policy type<select id="policy-type" ${item.id?'':'required'}><option value="RULES" ${item.type==='RULES'?'selected':''}>Rules</option><option value="AWARD" ${item.type==='AWARD'?'selected':''}>Award</option></select><small class="field-help">Choose the programme-owned policy being drafted. MyOTA does not impose another programme’s rules.</small></label><label>Name<input id="policy-name" value="${esc(item.name||'')}" placeholder="Activation rules v2" required><small class="field-help">A human-readable version name for reviewers and programme administrators.</small></label><label>Effective from<input id="policy-effective" type="datetime-local" value="${esc(effective)}"><small class="field-help">An explicit date is mandatory when this version is published.</small></label><label class="wide">Programme-owned schema (JSON)<textarea id="policy-schema" required>${esc(schema)}</textarea><small class="field-help">The programme defines this object: rule thresholds, eligibility, award requirements, labels, and any other programme-specific data belong here.</small></label><div class="form-actions wide"><button class="primary" type="submit">${item.id?'Save draft':'Create draft'}</button>${actions}</div>${item.status?`<p class="field-help wide">Current status: <strong>${esc(item.status)}</strong>. Published versions are immutable.</p>`:''}</form>`; }
function setPolicyEditor(item = {}) { state.policySelected=item; $('policy-editor').innerHTML=`<div class="panel-heading"><div><p class="eyebrow">POLICY VERSION</p><h2>${item.id?esc(item.name):'New rule or award draft'}</h2></div>${item.status?`<span class="status-pill ${geoStatusClass(item.status)}">${esc(item.status)}</span>`:''}</div>${policyEditor(item)}`; bindPolicyEditor(); }
function bindPolicyEditor() { $('policy-form').onsubmit=async event=>{event.preventDefault();try{const slug=$('policy-programme').value,schema=JSON.parse($('policy-schema').value);const saved=await api(`/v1/programmes/${encodeURIComponent(slug)}/policy-drafts`,{method:'POST',body:JSON.stringify({draftId:$('policy-id').value||undefined,type:$('policy-type').value,name:$('policy-name').value.trim(),schema,effectiveFrom:$('policy-effective').value||null})});notify('Policy draft saved','success');await loadPolicyAdmin(saved.id);}catch(error){notify(error.message,'error');}};if($('policy-submit'))$('policy-submit').onclick=()=>policyAction('submit');if($('policy-approve'))$('policy-approve').onclick=()=>policyAction('review','APPROVED');if($('policy-request-changes'))$('policy-request-changes').onclick=()=>policyAction('review','CHANGES_REQUESTED');if($('policy-publish'))$('policy-publish').onclick=()=>policyAction('publish'); }
async function policyAction(action,decision){try{const slug=$('policy-programme').value,id=$('policy-id').value;if(!id)return;const path=`/v1/programmes/${encodeURIComponent(slug)}/policy-drafts/${encodeURIComponent(id)}/${action}`;const body=action==='review'?{decision,reviewerId:state.account.id,note:'Reviewed in programme administration'}:action==='publish'?{effectiveFrom:$('policy-effective').value,publisherId:state.account.id}:{};if(action==='publish'&&!body.effectiveFrom)throw new Error('Choose an effective date before publishing.');await api(path,{method:'POST',body:JSON.stringify(body)});notify(action==='publish'?'Policy published':`Policy ${action}ed`,'success');await loadPolicyAdmin(id);}catch(error){notify(error.message,'error');}}
async function renderPolicies(){const view=$('policies-view');view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">PROGRAMME POLICY</p><h1>Rules & awards</h1><p class="muted">Draft, review and explicitly publish programme-owned rules and awards. Effective dates are required at publication.</p></div><button class="primary" id="policy-new">New rule or award</button></div><div class="toolbar"><label class="toolbar-field">Programme ${programmeChooser('policy-programme')}</label><button class="secondary" id="policy-refresh">Refresh</button></div><div class="split-layout"><article class="panel"><div class="panel-heading"><div><h2>Policy drafts</h2><small class="muted">Each version remains owned by its programme.</small></div></div><div id="policy-list" class="table-list"></div></article><article class="panel" id="policy-editor"><div class="panel-heading"><h2>New rule or award draft</h2></div>${policyEditor()}</article></div>`;$('policy-programme').onchange=()=>{state.currentProgramme=$('policy-programme').value;loadPolicyAdmin();};$('policy-refresh').onclick=()=>loadPolicyAdmin();$('policy-new').onclick=()=>setPolicyEditor();bindPolicyEditor();await loadPolicyAdmin();}
async function loadPolicyAdmin(selectedId){const slug=$('policy-programme')?.value||state.currentProgramme||state.programmes[0]?.slug;if(!slug)return;try{const data=await api(`/v1/programmes/${encodeURIComponent(slug)}/policy-drafts?pageSize=100`);state.policyItems=data.items||[];$('policy-list').innerHTML=state.policyItems.map(item=>`<button class="table-row" data-policy-id="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><small>${esc(item.type)} · ${esc(item.updatedAt||'')}</small></span><span class="status-pill ${geoStatusClass(item.status)}">${esc(item.status)}</span></button>`).join('')||'<p class="muted empty">No rule or award drafts yet.</p>';document.querySelectorAll('[data-policy-id]').forEach(button=>button.onclick=()=>setPolicyEditor(state.policyItems.find(item=>item.id===button.dataset.policyId)));if(selectedId)setPolicyEditor(state.policyItems.find(item=>item.id===selectedId)||{});}catch(error){$('policy-list').innerHTML=`<div class="error-card">${esc(error.message)}</div>`;}}

let geoTileMapState = {lat: 37.395, lon: -5.995, zoom: 12};
function geoTileWorld(lon, lat, zoom) { const size = 256 * (2 ** zoom); const x = (Number(lon) + 180) / 360 * size; const sin = Math.sin(Number(lat) * Math.PI / 180); const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size; return {x, y, size}; }
function geoTileUnproject(x, y, width, height) { const center = geoTileWorld(geoTileMapState.lon, geoTileMapState.lat, geoTileMapState.zoom); const worldX = center.x + x - width / 2; const worldY = center.y + y - height / 2; const lon = ((worldX / center.size) * 360) - 180; const n = Math.PI - (2 * Math.PI * worldY / center.size); const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); return [lon, lat]; }
function geoTileProject(coord, width, height) { const center = geoTileWorld(geoTileMapState.lon, geoTileMapState.lat, geoTileMapState.zoom); const point = geoTileWorld(coord[0], coord[1], geoTileMapState.zoom); let dx = point.x - center.x; if (dx > center.size / 2) dx -= center.size; if (dx < -center.size / 2) dx += center.size; return [width / 2 + dx, height / 2 + point.y - center.y]; }
function geoTileCoordinates(entity) { const geometry = entity.geometry; if (!geometry) return []; if (geometry.type === 'Point') return [geometry.coordinates]; if (geometry.type === 'Polygon') return geometry.coordinates[0] || []; if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || []; return []; }
function geoTileShapeMarkup(entity, width, height) { const editing = state.geoSelected?.id === entity.id && state.geoEditingGeometry ? {...entity, geometry:state.geoEditingGeometry} : entity; const points = geoTileCoordinates(editing).map(coord => geoTileProject(coord, width, height)); if (!points.length) return ''; const selected = state.geoSelected?.id === entity.id; const shape = entity.geometry?.type === 'Point' ? `<circle data-geo-shape="${esc(entity.id)}" cx="${points[0][0]}" cy="${points[0][1]}" r="${selected ? 10 : 8}" class="geo-shape-point"/>` : `<polygon data-geo-shape="${esc(entity.id)}" points="${points.map(point=>point.join(',')).join(' ')}" class="geo-shape-polygon"/>`; const handles = selected && state.geoEditingGeometry ? points.map((point,index)=>`<circle data-vertex="${index}" cx="${point[0]}" cy="${point[1]}" r="6" class="geo-vertex"/>`).join('') : ''; return `<g data-geo-id="${esc(entity.id)}" class="geo-layer ${geoStatusClass(entity.status)} ${selected?'selected':''}">${shape}${handles}<text x="${points[0][0]+10}" y="${points[0][1]-10}" class="geo-label">${esc(entity.name)}</text></g>`; }
function geoTileRenderTiles(surface, width, height) { const center = geoTileWorld(geoTileMapState.lon, geoTileMapState.lat, geoTileMapState.zoom); const firstX = Math.floor((center.x - width / 2) / 256); const lastX = Math.floor((center.x + width / 2) / 256); const firstY = Math.max(0, Math.floor((center.y - height / 2) / 256)); const lastY = Math.min((2 ** geoTileMapState.zoom) - 1, Math.floor((center.y + height / 2) / 256)); const count = 2 ** geoTileMapState.zoom; for (let tileX=firstX;tileX<=lastX;tileX+=1) for (let tileY=firstY;tileY<=lastY;tileY+=1) { const image=document.createElement('img'); image.alt=''; image.draggable=false; image.className='geo-osm-tile'; image.src=`https://tile.openstreetmap.org/${geoTileMapState.zoom}/${((tileX%count)+count)%count}/${tileY}.png`; image.style.left=`${tileX*256-center.x+width/2}px`; image.style.top=`${tileY*256-center.y+height/2}px`; surface.appendChild(image); } }
function renderGeoMap() { const map=$('geo-map'); if(!map)return; const width=Math.max(map.clientWidth||600,300), height=Math.max(map.clientHeight||720,360); const visible=state.geoEntities.filter(entity=>!$(`layer-${geoStatusClass(entity.status)}`)||$(`layer-${geoStatusClass(entity.status)}`).checked); map.innerHTML=`<div id="geo-tile-surface" class="geo-tile-surface"></div><svg id="geo-svg" class="geo-map-overlay" viewBox="0 0 ${width} ${height}" role="img" aria-label="OpenStreetMap geodata review map"></svg><div class="geo-map-controls"><button type="button" data-geo-zoom="in" aria-label="Zoom in">+</button><button type="button" data-geo-zoom="out" aria-label="Zoom out">−</button><button type="button" data-geo-reset="true" aria-label="Reset map view">⌂</button></div><a class="geo-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>`; const surface=$('geo-tile-surface'),svg=$('geo-svg'); geoTileRenderTiles(surface,width,height); svg.innerHTML=visible.map(entity=>geoTileShapeMarkup(entity,width,height)).join('')||'<text x="24" y="40" class="geo-empty">No entities in these layers</text>'; document.querySelectorAll('[data-geo-id]').forEach(node=>node.onclick=event=>{if(!event.target.dataset.vertex)selectGeoEntity(node.dataset.geoId);}); document.querySelectorAll('[data-geo-zoom]').forEach(button=>button.onclick=()=>{geoTileMapState.zoom=Math.max(10,Math.min(18,geoTileMapState.zoom+(button.dataset.geoZoom==='in'?1:-1)));renderGeoMap();}); $('[data-geo-reset]').onclick=()=>{geoTileMapState={lat:37.395,lon:-5.995,zoom:12};renderGeoMap();}; let drag=null; svg.addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-vertex]');drag=handle?{kind:'vertex',index:Number(handle.dataset.vertex),moved:false}:{kind:'pan',x:event.clientX,y:event.clientY,moved:false};svg.setPointerCapture(event.pointerId);}); svg.addEventListener('pointermove',event=>{if(!drag)return;const rect=svg.getBoundingClientRect(),x=((event.clientX-rect.left)/rect.width)*width,y=((event.clientY-rect.top)/rect.height)*height;drag.moved=true;if(drag.kind==='pan'){surface.style.transform=`translate(${event.clientX-drag.x}px,${event.clientY-drag.y}px)`;svg.style.transform=`translate(${event.clientX-drag.x}px,${event.clientY-drag.y}px)`;}else{const refs=geoVertexRefs(state.geoEditingGeometry);refs[drag.index]?.set(geoTileUnproject(x,y,width,height));const shape=svg.querySelector('[data-geo-shape]'),points=geoTileCoordinates({geometry:state.geoEditingGeometry}).map(coord=>geoTileProject(coord,width,height));if(shape){if(state.geoEditingGeometry.type==='Point'){shape.setAttribute('cx',points[0][0]);shape.setAttribute('cy',points[0][1]);}else shape.setAttribute('points',points.map(point=>point.join(',')).join(' '));}svg.querySelectorAll('[data-vertex]').forEach((vertex,index)=>{vertex.setAttribute('cx',points[index][0]);vertex.setAttribute('cy',points[index][1]);});}}); svg.addEventListener('pointerup',event=>{if(!drag)return;const moved=drag.moved;if(drag.kind==='pan'&&moved){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;[geoTileMapState.lon,geoTileMapState.lat]=geoTileUnproject(width/2-dx,height/2-dy,width,height);renderGeoMap();}else if(drag.kind==='vertex'&&moved){renderGeoMap();}drag=null;}); svg.addEventListener('wheel',event=>{event.preventDefault();geoTileMapState.zoom=Math.max(10,Math.min(18,geoTileMapState.zoom+(event.deltaY<0?1:-1)));renderGeoMap();},{passive:false}); }

let geoLastCenteredId = null;
function centerGeoMapOnEntity(entity) {
  const coordinates = geoTileCoordinates(entity).filter(coord => Array.isArray(coord) && coord.length >= 2);
  if (!coordinates.length) return;
  const longitudes = coordinates.map(coord => Number(coord[0]));
  const latitudes = coordinates.map(coord => Number(coord[1]));
  geoTileMapState.lon = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  geoTileMapState.lat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  geoTileMapState.zoom = Math.max(14, geoTileMapState.zoom);
}
const renderGeoMapWithTiles = renderGeoMap;
renderGeoMap = function() {
  const selectedId = state.geoSelected?.id || null;
  if (selectedId !== geoLastCenteredId) {
    geoLastCenteredId = selectedId;
    if (state.geoSelected) centerGeoMapOnEntity(state.geoSelected);
  }
  return renderGeoMapWithTiles();
};

function bindGeoStatusControl() {
  const inspector = $('geo-inspector');
  const entity = state.geoSelected;
  if (!inspector || !entity || $('geo-status-editor')) return;
  const statuses = entity.status === 'APPROVED'
    ? ['RETIRED']
    : entity.status === 'RETIRED'
      ? ['RETIRED']
      : ['APPROVED', 'CANDIDATE', 'PROPOSED', 'RETIRED', 'REJECTED'];
  const terminal = entity.status === 'RETIRED';
  const section = document.createElement('section');
  section.id = 'geo-status-editor';
  section.className = 'geo-status-editor';
  section.innerHTML = `<h3>Entity status</h3><p class="field-help">Change the lifecycle status from this review page. Approved entities can only move to Retired so historical QSOs remain valid.</p><div class="geo-status-grid"><label>Status<select id="geo-status-select">${statuses.map(status => `<option value="${status}" ${status === entity.status ? 'selected' : ''}>${status[0] + status.slice(1).toLowerCase()}</option>`).join('')}</select></label><label>Change note<textarea id="geo-status-note" placeholder="Record the evidence or reason for this status change"></textarea></label><button class="secondary" id="geo-save-status" type="button" ${terminal || statuses.length === 1 && statuses[0] === entity.status ? 'disabled' : ''}>Save status</button></div><p class="field-help">${terminal ? 'Retired entities cannot be reactivated.' : 'Status changes are recorded in the entity audit history.'}</p>`;
  const geometrySection = inspector.querySelector('.inspector-grid');
  if (geometrySection) geometrySection.insertAdjacentElement('afterend', section);
  else inspector.appendChild(section);
  $('geo-save-status').onclick = async () => {
    const status = $('geo-status-select').value;
    if (status === entity.status) return;
    try {
      await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/status`, {method:'POST', body:JSON.stringify({status, reviewerId:state.account.id, note:$('geo-status-note').value}), headers:{'Idempotency-Key':crypto.randomUUID()}});
      notify(`Entity ${status.toLowerCase()}`,'success');
      await loadGeoReview();
    } catch (error) { notify(error.message,'error'); }
  };
}
const selectGeoEntityWithStatus = selectGeoEntity;
selectGeoEntity = async function(id) {
  geoLastCenteredId = null;
  await selectGeoEntityWithStatus(id);
  bindGeoStatusControl();
};

const renderGeoReviewWithRetired = renderGeoReview;
renderGeoReview = async function() {
  await renderGeoReviewWithRetired();
  const rejectedLayer = document.getElementById('layer-rejected');
  if (rejectedLayer && !document.getElementById('layer-retired')) {
    const label = document.createElement('label');
    label.className = 'layer-toggle retired';
    label.innerHTML = '<input id="layer-retired" type="checkbox" checked> Retired';
    rejectedLayer.closest('.layer-toggle')?.insertAdjacentElement('afterend', label);
    $('layer-retired').onchange = renderGeoMap;
    renderGeoMap();
  }
};

function ensureGeoDrawControls() {
  const importButton = $('geo-import-toggle');
  if (!importButton || $('geo-draw-toggle')) return;
  const drawButton = document.createElement('button');
  drawButton.id = 'geo-draw-toggle';
  drawButton.className = 'secondary';
  drawButton.type = 'button';
  drawButton.textContent = 'Draw candidate';
  importButton.insertAdjacentElement('afterend', drawButton);
  drawButton.onclick = () => {
    state.geoDrawingActive = !state.geoDrawingActive;
    state.geoDrawing = state.geoDrawingActive ? [] : [];
    drawButton.textContent = state.geoDrawingActive ? 'Stop drawing' : 'Draw candidate';
    renderGeoDrawPanel();
    renderGeoMap();
  };
}
function renderGeoDrawPanel() {
  const map = $('geo-map');
  if (!map) return;
  let panel = $('geo-draw-panel');
  if (!state.geoDrawingActive) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement('article');
    panel.id = 'geo-draw-panel';
    panel.className = 'panel geo-draw-panel';
    map.insertAdjacentElement('afterend', panel);
  }
  panel.innerHTML = `<div class="panel-heading"><div><h2>Draw candidate proposal</h2><small class="muted">Click at least three points on the map. The first point is closed automatically.</small></div><span class="status-pill candidate">CANDIDATE</span></div><div class="form-grid"><label>Name<input id="geo-draw-name" placeholder="Place name" required></label><label>Entity type<input id="geo-draw-type" value="MUNICIPAL_PARK" required></label><label>Jurisdiction<input id="geo-draw-jurisdiction" placeholder="Optional authority or area"></label><label>Attachment URI<input id="geo-draw-attachment" placeholder="Optional evidence URL"></label><div class="form-actions wide"><button class="secondary" type="button" id="geo-draw-undo">Undo last point</button><button class="primary" type="button" id="geo-draw-submit" ${state.geoDrawing.length < 3 ? 'disabled' : ''}>Submit candidate</button></div><p class="field-help wide">${state.geoDrawing.length} point${state.geoDrawing.length === 1 ? '' : 's'} recorded. Geometry is validated and normalized to WGS84 by the geodata service.</p></div>`;
  $('geo-draw-undo').onclick = () => { state.geoDrawing.pop(); renderGeoDrawPanel(); renderGeoMap(); };
  $('geo-draw-submit').onclick = submitGeoDrawing;
}
function bindGeoDrawing() {
  if (!state.geoDrawingActive) return;
  const map = $('geo-map');
  const svg = $('geo-svg');
  if (!svg) return;
  const width = Number(svg.viewBox.baseVal.width) || Math.max(svg.clientWidth, 300);
  const height = Number(svg.viewBox.baseVal.height) || 360;
  if (state.geoDrawing?.length) {
    const points = state.geoDrawing.map(coord => geoTileProject(coord, width, height));
    svg.insertAdjacentHTML('beforeend', `<polyline class="geo-drawing-line" points="${points.map(point => point.join(',')).join(' ')}"/><g class="geo-drawing-points">${points.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="5"/>`).join('')}</g>`);
  }
  if (map.dataset.geoDrawingBound === 'true') return;
  map.dataset.geoDrawingBound = 'true';
  map.addEventListener('click', event => {
    if (!state.geoDrawingActive || event.target.closest('[data-geo-id]') || event.target.closest('[data-vertex]') || event.target.closest('.geo-map-controls') || event.target.closest('.geo-attribution')) return;
    const activeSvg = $('geo-svg');
    if (!activeSvg) return;
    const rect = activeSvg.getBoundingClientRect();
    const activeWidth = Number(activeSvg.viewBox.baseVal.width) || Math.max(activeSvg.clientWidth, 300);
    const activeHeight = Number(activeSvg.viewBox.baseVal.height) || 360;
    state.geoDrawing.push(geoTileUnproject(((event.clientX - rect.left) / rect.width) * activeWidth, ((event.clientY - rect.top) / rect.height) * activeHeight, activeWidth, activeHeight));
    renderGeoDrawPanel();
    renderGeoMap();
  }, {capture: true});
}
async function submitGeoDrawing() {
  if (!state.geoDrawing || state.geoDrawing.length < 3) return;
  const ring = [...state.geoDrawing, state.geoDrawing[0]];
  const attachmentUri = $('geo-draw-attachment').value.trim();
  const attachments = attachmentUri ? [{name: attachmentUri.split('/').pop() || 'evidence', mediaType: 'application/octet-stream', uri: attachmentUri}] : [];
  try {
    await api('/v1/geodata/proposals/draw', {method:'POST', body:JSON.stringify({programmeSlug:$('geo-programme').value || state.currentProgramme || state.programmes[0]?.slug, source:{name:'Manual administration proposal',license:'programme-supplied'}, feature:{properties:{name:$('geo-draw-name').value.trim(),entityType:$('geo-draw-type').value.trim() || 'MUNICIPAL_PARK',jurisdiction:$('geo-draw-jurisdiction').value.trim() || undefined},geometry:{type:'Polygon',coordinates:[ring]}}, attachments}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Candidate proposal submitted','success');
    state.geoDrawingActive = false; state.geoDrawing = [];
    await loadGeoReview();
    ensureGeoDrawControls();
  } catch (error) { notify(error.message,'error'); }
}
const renderGeoMapWithDrawing = renderGeoMap;
renderGeoMap = function() {
  const result = renderGeoMapWithDrawing();
  renderGeoDrawPanel();
  bindGeoDrawing();
  return result;
};
const renderGeoReviewWithDrawing = renderGeoReview;
renderGeoReview = async function() {
  await renderGeoReviewWithDrawing();
  ensureGeoDrawControls();
  renderGeoDrawPanel();
};
