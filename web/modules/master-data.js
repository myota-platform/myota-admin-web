const MASTER_DATA_GEOMETRY_TYPES = [
  ['POINT', 'Point'], ['LINESTRING', 'LineString'], ['MULTILINESTRING', 'MultiLineString'],
  ['POLYGON', 'Polygon'], ['MULTIPOLYGON', 'MultiPolygon']
];

function masterDataCategoryListMarkup(items) {
  return items.map(item => `<button type="button" class="table-row entity-type-master-row" data-master-entity-type="${esc(item.code)}"><span><strong>${esc(item.label || item.code)}</strong><small><code>${esc(item.code)}</code> · ${esc((item.geometryTypes || [item.geometry || 'MULTIPOLYGON']).join(', '))}</small><small>${item.active === false ? 'Inactive for new entities' : 'Available for new entities'} · ${(item.assignedProgrammes || []).length} programme${(item.assignedProgrammes || []).length === 1 ? '' : 's'}</small></span><span class="status-pill ${item.active === false ? 'muted-pill' : 'approved'}">${item.active === false ? 'Inactive' : 'Active'}</span></button>`).join('') || '<p class="muted empty">No shared categories are configured yet.</p>';
}

async function loadEntityTypeCatalogue() {
  const data = await api('/v1/entity-types');
  state.entityTypeCatalogue = data.items || [];
  return state.entityTypeCatalogue;
}

function masterDataCategoryEditor(item = {}) {
  const editing = Boolean(item.code);
  const selectedGeometryTypes = new Set(item.geometryTypes || (item.geometry ? [item.geometry] : ['MULTIPOLYGON']));
  const geometryOptions = MASTER_DATA_GEOMETRY_TYPES.map(([value, label]) => `<label class="master-data-geometry-option"><input type="checkbox" name="master-data-category-geometry" value="${value}" ${selectedGeometryTypes.has(value) ? 'checked' : ''}><span>${label}</span></label>`).join('');
  return `<div class="panel-heading"><div><p class="eyebrow">ENTITY CATEGORY</p><h2>${editing ? `Edit ${esc(item.label || item.code)}` : 'New category'}</h2></div>${editing ? `<span class="status-pill ${item.active === false ? 'muted-pill' : 'approved'}">${item.active === false ? 'INACTIVE' : 'ACTIVE'}</span>` : ''}</div>
    <p class="field-help">Categories are shared master data. Their codes are stable identifiers used by imports, activity, awards, and historical records, and the same category can be assigned to multiple programmes.</p>
    <form id="master-data-category-form" class="form-grid">
      <input type="hidden" id="master-data-category-original" value="${esc(item.code || '')}">
      <label>Category code
        <input id="master-data-category-code" value="${esc(item.code || '')}" placeholder="MUNICIPAL_PARK" ${editing ? 'readonly' : ''} required>
        <small class="field-help">Use uppercase letters, numbers, and underscores. Codes cannot be renamed after creation.</small>
      </label>
      <label>Display name
        <input id="master-data-category-label" value="${esc(item.label || '')}" placeholder="Municipal park" required>
        <small class="field-help">The readable name shown in Geodata Review and programme interfaces.</small>
      </label>
      <fieldset class="master-data-geometry-field"><legend>Allowed geometry types</legend><div class="master-data-geometry-grid">${geometryOptions}</div><small class="field-help">Select every GeoJSON geometry type accepted by this category. A category may support multiple types.</small></fieldset>
      <label>Availability
        <select id="master-data-category-active">
          <option value="true" ${item.active !== false ? 'selected' : ''}>Active — available for new entities</option>
          <option value="false" ${item.active === false ? 'selected' : ''}>Inactive — retain for historical entities</option>
        </select>
        <small class="field-help">Inactive categories remain visible on existing records but are not offered for new assignments.</small>
      </label>
      <label class="wide">Description
        <textarea id="master-data-category-description" placeholder="Explain what this category represents for this programme.">${esc(item.description || '')}</textarea>
        <small class="field-help">Optional programme-specific guidance for administrators and reviewers.</small>
      </label>
      <div class="form-actions wide"><button type="submit" class="primary">${editing ? 'Save category' : 'Create category'}</button><button type="button" class="secondary" id="master-data-category-cancel">${editing ? 'Cancel' : 'Clear form'}</button></div>
    </form>`;
}

function setMasterDataCategoryEditor(item = {}) {
  const target = $('master-data-category-editor');
  if (!target) return;
  target.innerHTML = masterDataCategoryEditor(item);
  $('master-data-category-form').onsubmit = async event => {
    event.preventDefault();
    const code = $('master-data-category-code').value.trim().toUpperCase();
    const originalCode = $('master-data-category-original').value.trim().toUpperCase();
    const label = $('master-data-category-label').value.trim();
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return notify('Category code must use uppercase letters, numbers, and underscores.', 'error');
    if (!label) return notify('Enter a display name for the category.', 'error');
    const geometryTypes = [...document.querySelectorAll('input[name="master-data-category-geometry"]:checked')].map(input => input.value);
    if (!geometryTypes.length) return notify('Select at least one allowed geometry type.', 'error');
    try {
      await api('/v1/entity-types', {
        method: 'POST',
        body: JSON.stringify({
          code,
          originalCode: originalCode || code,
          label,
          geometryTypes,
          active: $('master-data-category-active').value === 'true',
          description: $('master-data-category-description').value.trim()
        }),
        headers: {'Idempotency-Key': crypto.randomUUID()}
      });
      notify('Category saved', 'success');
      await loadMasterDataCategories(code);
    } catch (error) {
      notify(error.message, 'error');
    }
  };
  $('master-data-category-cancel').onclick = () => setMasterDataCategoryEditor({});
}

async function loadMasterDataCategories(selectedCode = '') {
    const list = $('master-data-category-list');
  if (!list) return;
  list.innerHTML = '<p class="muted loading-card">Loading categories…</p>';
  try {
    const data = await api('/v1/entity-types');
    const items = data.items || [];
    list.innerHTML = masterDataCategoryListMarkup(items);
    list.querySelectorAll('[data-master-entity-type]').forEach(button => {
      button.onclick = () => setMasterDataCategoryEditor(items.find(item => item.code === button.dataset.masterEntityType) || {});
    });
    if (selectedCode) setMasterDataCategoryEditor(items.find(item => item.code === selectedCode) || {});
    else if (!items.length) setMasterDataCategoryEditor({});
  } catch (error) {
    list.innerHTML = `<div class="error-card">${esc(error.message)}</div>`;
  }
}

async function renderMasterData() {
  const view = $('master-data-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PLATFORM CATALOGUE</p><h1>Master data</h1><p class="muted">Manage the programme-owned values used across imports, geodata review, activity, and awards.</p></div><button class="secondary" id="master-data-refresh">Refresh</button></div>
    <div class="toolbar"><span class="toolbar-context">Shared catalogue · assignments are managed from Programme Management</span><button type="button" class="primary" id="master-data-new-category">New category</button></div>
    <div class="split-layout master-data-layout"><article class="panel"><div class="panel-heading"><div><h2>Entity categories</h2><small class="muted">Examples include MUNICIPAL_PARK, NATURE_RESERVE, and TRAIL.</small></div></div><div id="master-data-category-list" class="table-list"></div></article><article class="panel" id="master-data-category-editor"><div class="panel-heading"><h2>Select a category</h2></div><p class="muted empty">Choose a category to edit it, or create a new one.</p></article></div>
    <article class="panel master-data-help"><div class="panel-heading"><div><p class="eyebrow">HOW THIS WORKS</p><h2>Shared categories</h2></div></div><div class="master-data-help-grid"><div><strong>Stable code</strong><p class="field-help">The code is the durable identifier stored with entities and referenced by programme rules, awards, imports, and historical activity. It cannot be renamed.</p></div><div><strong>Allowed geometry types</strong><p class="field-help">Select one or more of Point, LineString, MultiLineString, Polygon, and MultiPolygon. The selection guides validation and map editing for entities using this category.</p></div><div><strong>Active lifecycle</strong><p class="field-help">Deactivate a category when it should no longer be used for new entities. Existing entities keep their historical category.</p></div></div></article>`;
  $('master-data-refresh').onclick = () => loadMasterDataCategories();
  $('master-data-new-category').onclick = () => setMasterDataCategoryEditor({});
  await loadMasterDataCategories();
}
