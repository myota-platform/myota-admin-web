function masterDataCategoryListMarkup(items) {
  return items.map(item => `<button type="button" class="table-row entity-type-master-row" data-master-entity-type="${esc(item.code)}"><span><strong>${esc(item.label || item.code)}</strong><small><code>${esc(item.code)}</code> · ${esc(item.geometry || 'MULTIPOLYGON')}</small><small>${item.active === false ? 'Inactive for new entities' : 'Available for new entities'} · ${(item.assignedProgrammes || []).length} programme${(item.assignedProgrammes || []).length === 1 ? '' : 's'}</small></span><span class="status-pill ${item.active === false ? 'muted-pill' : 'approved'}">${item.active === false ? 'Inactive' : 'Active'}</span></button>`).join('') || '<p class="muted empty">No shared categories are configured yet.</p>';
}

async function loadEntityTypeCatalogue() {
  const data = await api('/v1/entity-types');
  state.entityTypeCatalogue = data.items || [];
  return state.entityTypeCatalogue;
}

function masterDataCategoryEditor(item = {}) {
  const editing = Boolean(item.code);
  return `<div class="panel-heading"><div><p class="eyebrow">ENTITY CATEGORY</p><h2>${editing ? `Edit ${esc(item.label || item.code)}` : 'New category'}</h2></div>${editing ? `<span class="status-pill ${item.active === false ? 'muted-pill' : 'approved'}">${item.active === false ? 'INACTIVE' : 'ACTIVE'}</span>` : ''}</div>
    <p class="field-help">Categories are programme-owned master data. Their codes are stable identifiers used by imports, activity, awards, and historical records.</p>
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
      <label>Geometry type
        <select id="master-data-category-geometry">
          <option value="POINT" ${item.geometry === 'POINT' ? 'selected' : ''}>Point</option>
          <option value="LINESTRING" ${item.geometry === 'LINESTRING' ? 'selected' : ''}>Way / trail (LineString)</option>
          <option value="POLYGON" ${item.geometry === 'POLYGON' ? 'selected' : ''}>Polygon</option>
          <option value="MULTIPOLYGON" ${!item.geometry || item.geometry === 'MULTIPOLYGON' ? 'selected' : ''}>MultiPolygon</option>
        </select>
        <small class="field-help">The geometry shape expected for entities in this category.</small>
      </label>
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
    try {
      await api('/v1/entity-types', {
        method: 'POST',
        body: JSON.stringify({
          code,
          originalCode: originalCode || code,
          label,
          geometry: $('master-data-category-geometry').value,
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
    <article class="panel master-data-help"><div class="panel-heading"><div><p class="eyebrow">HOW THIS WORKS</p><h2>Programme-owned categories</h2></div></div><div class="master-data-help-grid"><div><strong>Stable code</strong><p class="field-help">The code is the durable identifier stored with entities and referenced by programme rules, awards, imports, and historical activity. It cannot be renamed.</p></div><div><strong>Geometry type</strong><p class="field-help">This tells the platform whether the category accepts a point, trail/way, polygon, or multipolygon. It guides validation and map editing.</p></div><div><strong>Active lifecycle</strong><p class="field-help">Deactivate a category when it should no longer be used for new entities. Existing entities keep their historical category.</p></div></div></article>`;
  $('master-data-refresh').onclick = () => loadMasterDataCategories();
  $('master-data-new-category').onclick = () => setMasterDataCategoryEditor({});
  await loadMasterDataCategories();
}
