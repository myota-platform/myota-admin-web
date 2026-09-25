// Administration extensions: user/role management, viewport-bound geodata and
// protected rejected-entity maintenance.
state.identityRoles = [];
state.identityPermissions = [];
state.geoLoadedViewportKey = '';
state.geoViewportReloadTimer = null;
state.geoLoading = false;

function identityRoleCodes(account) { return new Set((account?.roles || []).map(role => String(role.role || '').toUpperCase())); }
function identityRoleClass(role) { return role?.system ? 'system-role' : 'custom-role'; }
function identityRoleForm(role = {}) {
  const selected = new Set(role.scopes || []);
  const disabled = role.system ? 'disabled' : '';
  return `<form id="identity-role-form" class="form-grid"><input type="hidden" id="identity-role-code" value="${esc(role.code || '')}"><label>Role code<input id="identity-role-code-input" value="${esc(role.code || '')}" placeholder="REGIONAL_REVIEWER" ${role.code ? 'readonly' : ''} required><small class="field-help">Stable uppercase identifier used in assignments and audit history.</small></label><label>Display name<input id="identity-role-name" value="${esc(role.name || '')}" placeholder="Regional reviewer" required><small class="field-help">Human-readable name shown to administrators.</small></label><label class="wide">Description<textarea id="identity-role-description" placeholder="What can this role do?">${esc(role.description || '')}</textarea></label><fieldset class="permission-fieldset wide"><legend>Administrative permissions</legend><p class="field-help">Choose the smallest set of permissions this role needs. Wildcard access is reserved for the global administrator.</p><div class="permission-grid">${state.identityPermissions.map(permission => `<label class="permission-option"><input type="checkbox" value="${esc(permission.code)}" ${selected.has(permission.code) ? 'checked' : ''} ${disabled}><span><strong>${esc(permission.code)}</strong><small>${esc(permission.label)}</small></span></label>`).join('')}</div></fieldset><div class="form-actions wide"><button class="primary" type="submit">${role.code ? 'Save role' : 'Create role'}</button></div>${role.system ? '<p class="field-help wide">Built-in roles are protected. Create a custom role when a programme needs a different combination.</p>' : ''}</form>`;
}
function bindIdentityRoleForm() {
  $('identity-role-form').onsubmit = async event => {
    event.preventDefault();
    try {
      const code = $('identity-role-code-input').value.trim().toUpperCase();
      const scopes = [...document.querySelectorAll('#identity-role-form input[type=checkbox]:checked')].map(input => input.value);
      const payload = {code, name:$('identity-role-name').value.trim(), description:$('identity-role-description').value, scopes};
      const existing = $('identity-role-code').value;
      await api(existing ? `/v1/identity/admin/roles/${encodeURIComponent(existing)}/update` : '/v1/identity/admin/roles', {method:'POST', body:JSON.stringify(payload), headers:{'Idempotency-Key':crypto.randomUUID()}});
      notify(existing ? 'Role updated' : 'Role created', 'success');
      await loadIdentityRoles();
      renderIdentityRoleEditor(existing ? state.identityRoles.find(role => role.code === existing) : {});
    } catch (error) { notify(error.message, 'error'); }
  };
}
function renderIdentityRoleEditor(role = {}) {
  const target = $('identity-role-editor');
  if (!target) return;
  target.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">ROLE DEFINITION</p><h2>${role.code ? esc(role.name) : 'Create a custom role'}</h2></div>${role.code ? `<span class="status-pill ${identityRoleClass(role)}">${role.system ? 'BUILT-IN' : 'CUSTOM'}</span>` : ''}</div>${identityRoleForm(role)}`;
  bindIdentityRoleForm();
}
async function loadIdentityRoles() {
  const data = await api('/v1/identity/admin/roles');
  state.identityRoles = data.items || [];
  state.identityPermissions = data.permissions || [];
  const list = $('identity-role-list');
  if (list) {
    list.innerHTML = state.identityRoles.map(role => `<button class="table-row role-row" data-role-code="${esc(role.code)}"><span><strong>${esc(role.name)}</strong><small>${esc(role.code)} · ${esc(role.scopes.join(', ') || 'No permissions')}</small></span><span class="status-pill ${identityRoleClass(role)}">${role.system ? 'Built-in' : 'Custom'}</span></button>`).join('') || '<p class="muted empty">No role definitions yet.</p>';
    document.querySelectorAll('[data-role-code]').forEach(button => button.onclick = () => renderIdentityRoleEditor(state.identityRoles.find(role => role.code === button.dataset.roleCode) || {}));
  }
}
function renderIdentityAccountEditor(account = {}) {
  const target = $('identity-account-editor');
  if (!target) return;
  const selected = identityRoleCodes(account);
  const currentAssignments = Object.fromEntries((account.roles || []).map(role => [String(role.role).toUpperCase(), role]));
  target.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">USER EDITOR</p><h2>${account.id ? esc(account.displayName) : 'Select a user'}</h2></div></div>${account.id ? `<form id="identity-account-form" class="form-grid"><label>Display name<input id="account-display-name" value="${esc(account.displayName || '')}" required></label><label>Email<input id="account-email" type="email" value="${esc(account.email || '')}"></label><label>Status<select id="account-status"><option value="ACTIVE" ${account.status === 'ACTIVE' ? 'selected' : ''}>Active</option><option value="DEACTIVATED" ${account.status === 'DEACTIVATED' ? 'selected' : ''}>Deactivated</option></select></label><label>Reset password<input id="account-password" type="password" autocomplete="new-password" placeholder="Leave blank to keep current password"><small class="field-help">Use at least 12 characters. Saving a password revokes existing sessions.</small></label><fieldset class="permission-fieldset wide"><legend>Assigned roles</legend><p class="field-help">A user may hold several roles. Programme, jurisdiction, and entity-type scopes remain attached to an existing assignment when possible.</p><div class="permission-grid">${state.identityRoles.map(role => `<label class="permission-option"><input type="checkbox" value="${esc(role.code)}" data-account-role ${selected.has(role.code) ? 'checked' : ''}><span><strong>${esc(role.name)}</strong><small>${esc(role.code)} · ${esc(role.scopes.join(', ') || 'No permissions')}</small></span></label>`).join('')}</div></fieldset><div class="form-actions wide"><button class="primary" type="submit">Save user</button><button type="button" class="secondary" id="identity-account-cancel">Close</button></div></form>` : '<p class="muted empty">Choose a user to edit account details and assigned roles.</p>'}`;
  if (!account.id) return;
  $('identity-account-form').onsubmit = async event => {
    event.preventDefault();
    try {
      const roles = [...document.querySelectorAll('[data-account-role]:checked')].map(input => ({code:input.value, ...(currentAssignments[input.value] ? {programmeSlug:currentAssignments[input.value].programmeSlug, jurisdiction:currentAssignments[input.value].jurisdiction, entityType:currentAssignments[input.value].entityType} : {})}));
      await api(`/v1/identity/admin/accounts/${encodeURIComponent(account.id)}/update`, {method:'POST', body:JSON.stringify({displayName:$('account-display-name').value.trim(), email:$('account-email').value.trim() || null, status:$('account-status').value, password:$('account-password').value || undefined, roles}), headers:{'Idempotency-Key':crypto.randomUUID()}});
      notify('User updated', 'success');
      await loadAccounts();
      renderIdentityAccountEditor(state.identityAccounts.find(item => item.id === account.id) || {});
    } catch (error) { notify(error.message, 'error'); }
  };
  $('identity-account-cancel').onclick = () => renderIdentityAccountEditor({});
}
state.identityAccounts = [];
async function loadAccounts() {
  const q = encodeURIComponent($('identity-search')?.value || '');
  try {
    const data = await api(`/v1/identity/admin/accounts?pageSize=100&q=${q}`);
    state.identityAccounts = data.items || [];
    $('identity-table').innerHTML = state.identityAccounts.map(account => `<div class="table-row account-row"><span><strong>${esc(account.displayName)}</strong><small>${esc(account.email || 'No email')} · ${esc(account.participationType)} · ${esc(account.callsigns?.map(call => call.value).join(', ') || 'No callsign')}</small><span class="role-chips">${(account.roles || []).map(role => `<span class="role-chip">${esc(role.role)}</span>`).join('') || '<span class="muted">No admin roles</span>'}</span></span><span class="status-pill ${account.status === 'ACTIVE' ? 'approved' : 'muted-pill'}">${esc(account.status)}</span><span class="row-actions"><button class="link-button account-edit" data-id="${esc(account.id)}">Edit</button><button class="link-button account-export" data-id="${esc(account.id)}">Export</button>${account.status === 'ACTIVE' ? `<button class="danger-button account-deactivate" data-id="${esc(account.id)}">Deactivate</button>` : ''}</span></div>`).join('') || '<p class="muted empty">No accounts match.</p>';
    document.querySelectorAll('.account-edit').forEach(button => button.onclick = () => renderIdentityAccountEditor(state.identityAccounts.find(account => account.id === button.dataset.id) || {}));
    document.querySelectorAll('.account-export').forEach(button => button.onclick = () => exportAccount(button.dataset.id));
    document.querySelectorAll('.account-deactivate').forEach(button => button.onclick = () => deactivateAccount(button.dataset.id));
  } catch (error) { $('identity-table').innerHTML = `<div class="error-card">${esc(error.message)}</div>`; }
}
async function renderIdentity() {
  const view = $('identity-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PEOPLE & ACCESS</p><h1>Identity administration</h1><p class="muted">Edit users, assign multiple roles, and define least-privilege administrative access.</p></div><button class="secondary" id="identity-refresh">Refresh</button></div><div class="identity-admin-grid"><article class="panel"><div class="toolbar"><input id="identity-search" placeholder="Search name or email"><button class="secondary" id="identity-search-button">Search</button></div><div id="identity-table" class="table-list"></div></article><article class="panel" id="identity-account-editor"><div class="panel-heading"><h2>User editor</h2></div><p class="muted empty">Choose a user to edit account details and assigned roles.</p></article></div><div class="identity-admin-grid"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">ACCESS CATALOGUE</p><h2>Roles and permissions</h2></div><button class="primary" id="identity-new-role">New custom role</button></div><div id="identity-role-list" class="table-list"></div></article><article class="panel" id="identity-role-editor"><div class="panel-heading"><h2>Create a custom role</h2></div>${identityRoleForm()}</article></div><article class="panel"><div class="panel-heading"><div><p class="eyebrow">AUDIT CONTEXT</p><h2>Recent security events</h2></div></div><div id="identity-events" class="compact-list"></div></article>`;
  $('identity-refresh').onclick = renderIdentity;
  $('identity-search-button').onclick = loadAccounts;
  $('identity-new-role').onclick = () => renderIdentityRoleEditor({});
  bindIdentityRoleForm();
  try { await Promise.all([loadIdentityRoles(), loadAccounts()]); } catch (error) { notify(error.message, 'error'); }
  try { const events = await api('/v1/identity/admin/security-events?pageSize=20'); $('identity-events').innerHTML = (events.items || []).map(event => `<div class="list-row"><span class="event-icon">↗</span><div><strong>${esc(event.eventType)}</strong><small>${esc(event.occurredAt)} · ${esc(event.payload?.accountId || 'system')}</small></div></div>`).join('') || '<p class="muted empty">No recent security events.</p>'; } catch (error) { $('identity-events').innerHTML = `<div class="error-card">${esc(error.message)}</div>`; }
}
