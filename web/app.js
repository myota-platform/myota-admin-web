const API_BASE = (window.MYOTA_API_BASE || 'http://localhost:8080').replace(/\/$/, '');
const state = { account: null, programmes: [], currentView: 'dashboard', currentProgramme: '', refreshing: false };
const $ = (id) => document.getElementById(id);
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
function setView(name) { state.currentView = name; document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `${name}-view`); document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name)); $('breadcrumb').textContent = name[0].toUpperCase() + name.slice(1); $('sidebar').classList.remove('open'); const fn = {dashboard:renderDashboard,programmes:renderProgrammes,geodata:renderGeodata,identity:renderIdentity,activity:renderActivity}[name]; if (fn) fn(); }
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
