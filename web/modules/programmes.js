function entityTypeListMarkup(entityTypes) {
  return entityTypes.map(item => `<div class="entity-type-row"><div><strong>${esc(item.label || item.code)}</strong><small><code>${esc(item.code)}</code> · ${esc(item.geometry || 'MULTIPOLYGON')} · ${item.active === false ? 'Inactive' : 'Active'}</small>${item.description ? `<p class="field-help">${esc(item.description)}</p>` : ''}</div><button type="button" class="danger-outline" data-remove-entity-type="${esc(item.code)}">Remove assignment</button></div>`).join('') || '<p class="muted empty">No categories assigned to this programme yet.</p>';
}

function programmeEntityTypeOptions(entityTypes) {
  const assigned = new Set(entityTypes.map(item => item.code));
  const options = state.entityTypeCatalogue.filter(item => !assigned.has(item.code)).map(item => `<option value="${esc(item.code)}">${esc(item.label || item.code)} · ${esc(item.code)} · ${esc(item.geometry || 'MULTIPOLYGON')}</option>`).join('');
  return options || '<option value="">All shared categories are assigned</option>';
}

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
      <div class="section-heading"><div><p class="eyebrow">ENTITY CATALOGUE</p><h3 id="entity-types-heading">Entity category assignments</h3></div><span class="help-badge">Shared master data</span></div>
      <p class="field-help section-intro">Assign categories from the shared Master data catalogue to this programme. The same category can be assigned to multiple programmes; editing the category definition itself is done on the Master data page.</p>
      <div id="entity-type-list" class="entity-type-list">${entityTypeListMarkup(entityTypes)}</div>
      <div class="form-grid nested-grid entity-type-editor">
        <label class="wide">Available shared category<select id="entity-type-available">${programmeEntityTypeOptions(entityTypes)}</select><small class="field-help">Choose a category already defined in Master data, then assign it to this programme.</small></label>
        <div class="form-actions"><button type="button" class="secondary" id="entity-type-reset">Clear selection</button><button type="button" class="primary" id="entity-type-save">Assign category</button></div>
      </div>
      <details class="help-box"><summary>Advanced JSON view</summary><p>This is the current assignment snapshot used for compatibility with programme creation and update payloads. Manage shared definitions in Master data.</p><textarea id="programme-entities" aria-label="Assigned entity types JSON">${esc(JSON.stringify(entityTypes, null, 2))}</textarea></details>
    </section>

    <section class="form-section wide" aria-labelledby="theme-heading">
      <div class="section-heading"><div><p class="eyebrow">PRESENTATION</p><h3 id="theme-heading">Programme appearance</h3></div></div>
      <p class="field-help section-intro">These colors personalize the public and administration surfaces without changing programme rules.</p>
      <div class="form-grid nested-grid"><label>Primary colour<input id="programme-primary" type="color" value="${esc(p.theme?.primary || '#0f766e')}"><small class="field-help">Main buttons, links, and programme accents.</small></label><label>Accent colour<input id="programme-accent" type="color" value="${esc(p.theme?.accent || '#f59e0b')}"><small class="field-help">Highlights, notices, and secondary emphasis.</small></label></div>
    </section>
    <div class="form-actions wide"><button class="primary" type="submit">${p.slug ? 'Save programme' : 'Create programme'}</button>${p.slug ? '<button type="button" class="danger-outline" id="archive-programme">Archive programme</button>' : ''}</div>
  </form>`;
}
async function renderProgrammes() { try { await loadEntityTypeCatalogue(); } catch (error) { notify(`Unable to load shared category catalogue: ${error.message}`, 'error'); } const view = $('programmes-view'); view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">CONFIGURATION</p><h1>Programmes</h1><p class="muted">Each programme owns its rules, category assignments, themes and policy versions.</p></div><button class="primary" id="new-programme">New programme</button></div><div class="split-layout"><article class="panel"><div class="panel-heading"><h2>Configured programmes</h2></div><div id="programme-list" class="table-list"></div></article><article class="panel" id="programme-editor"><div class="panel-heading"><h2>Select a programme</h2></div><p class="muted empty">Choose a programme to edit its configuration, or create a new one.</p></article></div>`; $('new-programme').onclick = () => { $('programme-editor').innerHTML = `<div class="panel-heading"><h2>New programme</h2></div>${programmeForm()}`; bindProgrammeForm(); }; $('programme-list').innerHTML = state.programmes.map(p => `<button class="table-row" data-programme="${esc(p.slug)}"><span><strong>${esc(p.name)}</strong><small>${esc(p.slug)} · policy v${esc(p.policyVersion || 1)}</small></span><span class="status-pill ${p.status === 'ACTIVE' ? 'approved' : 'muted-pill'}">${esc(p.status)}</span></button>`).join(''); document.querySelectorAll('[data-programme]').forEach(b => b.onclick = () => editProgramme(b.dataset.programme)); }
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
  bindEntityTypeManager();
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

function bindEntityTypeManager() {
  const jsonField = $('programme-entities');
  const list = $('entity-type-list');
  if (!jsonField || !list) return;
  let entityTypes;
  try { entityTypes = JSON.parse(jsonField.value || '[]'); } catch (_) { entityTypes = []; }
  const programmeSlug = $('programme-original').value;
  const render = () => {
    jsonField.value = JSON.stringify(entityTypes, null, 2);
    list.innerHTML = entityTypeListMarkup(entityTypes);
    $('entity-type-available').innerHTML = programmeEntityTypeOptions(entityTypes);
    list.querySelectorAll('[data-remove-entity-type]').forEach(button => {
      button.onclick = async () => {
        const code = button.dataset.removeEntityType;
        if (programmeSlug) {
          try {
            const response = await api(`/v1/programmes/${encodeURIComponent(programmeSlug)}/entity-types/unassign`, {method:'POST', body:JSON.stringify({code}), headers:{'Idempotency-Key':crypto.randomUUID()}});
            entityTypes = response.items || [];
            const programme = state.programmes.find(item => item.slug === programmeSlug);
            if (programme) programme.entityTypes = cloneJson(entityTypes);
            notify('Category unassigned', 'success');
          } catch (error) { return notify(error.message, 'error'); }
        } else {
          entityTypes = entityTypes.filter(item => item.code !== code);
        }
        render();
      };
    });
  };
  $('entity-type-reset').onclick = () => { $('entity-type-available').value = ''; };
  $('entity-type-save').onclick = async () => {
    const code = $('entity-type-available').value;
    if (!code) return notify('Select a shared category first.', 'error');
    const record = state.entityTypeCatalogue.find(item => item.code === code);
    if (!record) return notify('The selected category is no longer available. Refresh the catalogue.', 'error');
    if (programmeSlug) {
      try {
        const response = await api(`/v1/programmes/${encodeURIComponent(programmeSlug)}/entity-types/assign`, {method:'POST', body:JSON.stringify({code}), headers:{'Idempotency-Key':crypto.randomUUID()}});
        entityTypes = response.items || entityTypes;
        const programme = state.programmes.find(item => item.slug === programmeSlug);
        if (programme) programme.entityTypes = cloneJson(entityTypes);
        notify('Category assigned', 'success');
      } catch (error) { return notify(error.message, 'error'); }
    } else {
      entityTypes.push(cloneJson(record));
    }
    render();
    $('entity-type-available').value = '';
  };
  render();
}
