// Leaflet review workspace. This deliberately supersedes the original SVG map
// implementation above so map state, queue state and edit state have one owner.
let geoLeafletMap = null;
let geoLeafletLayers = null;
let geoLeafletEntityLayers = new Map();
let geoLeafletLoadSequence = 0;
let geoLeafletViewportTimer = null;
let geoLeafletHasFittedInitialData = false;
let geoLeafletEditMode = false;
let geoLeafletDrawingLayer = null;
let geoLeafletSuppressViewportUntil = 0;

// Older page wrappers may still finish an in-flight request while this module
// is being replaced. Their controls are intentionally disabled so they cannot
// append a second inspector or duplicate status/type editors.
bindGeoEntityControls = () => {};
bindGeoStatusControl = () => {};

const GEO_TILE_URL = window.MYOTA_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const GEO_DEFAULT_CENTER = [37.395, -5.995];
const GEO_DEFAULT_ZOOM = 12;
const GEO_STATUS_ORDER = ['CANDIDATE', 'PROPOSED', 'APPROVED', 'RETIRED', 'REJECTED'];
let geoReviewPage = 1;
let geoReviewPageSize = 25;
let geoReviewTotal = 0;
let geoReviewLocationOptions = [];
function geoIsGlobalAdmin() { try { const payload = JSON.parse(atob(token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return (payload.scp || []).includes('*') || (payload.roles || []).some(role => ['GLOBAL_ADMIN', 'GLOBAL_OPERATOR'].includes(String(role.role || '').toUpperCase())); } catch (_) { return (state.account?.scopes || []).includes('*') || (state.account?.roles || []).some(role => ['GLOBAL_ADMIN', 'GLOBAL_OPERATOR'].includes(String(role.role || '').toUpperCase())); } }

function geoLeafletStatusStyle(status, selected = false) {
  const colors = {
    CANDIDATE: {fill:'#fbbf24', stroke:'#7c5410'},
    PROPOSED: {fill:'#8b5cf6', stroke:'#4c1d95'},
    APPROVED: {fill:'#10b981', stroke:'#065f46'},
    RETIRED: {fill:'#64748b', stroke:'#334155'},
    REJECTED: {fill:'#ef4444', stroke:'#991b1b'}
  };
  const color = colors[String(status || '').toUpperCase()] || colors.CANDIDATE;
  return {color: selected ? '#123d3a' : color.stroke, fillColor: color.fill, fillOpacity: selected ? 0.42 : 0.25, weight: selected ? 4 : 2, radius: selected ? 10 : 8};
}

function geoLeafletFeature(entity) {
  return {type:'Feature', id:entity.id, properties:{name:entity.name, status:entity.status, entityType:entity.entityType}, geometry:entity.geometry};
}

function geoLeafletVisible(status) {
  const toggle = $(`layer-${geoStatusClass(status)}`);
  return !toggle || toggle.checked;
}

function geoLeafletMakeLayer(entity) {
  const selected = state.geoSelected?.id === entity.id;
  const baseStyle = geoLeafletStatusStyle(entity.status, selected);
  const style = ['LineString', 'MultiLineString'].includes(entity.geometry?.type) ? {...baseStyle, dashArray:'8 6', lineCap:'round', lineJoin:'round'} : baseStyle;
  const group = L.geoJSON(geoLeafletFeature(entity), {
    style,
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, style)
  });
  let editable = null;
  group.eachLayer(layer => { editable = layer; });
  if (!editable) return null;
  editable.bindTooltip(`${entity.name} · ${entity.status}`, {direction:'top', sticky:true});
  editable.on('click', event => {
    L.DomEvent.stopPropagation(event);
    selectGeoEntity(entity.id);
  });
  editable.on('pm:edit', () => {
    if (geoLeafletEditMode && state.geoSelected?.id === entity.id) {
      state.geoEditingGeometry = cloneJson(editable.toGeoJSON().geometry);
      renderGeoInspector();
    }
  });
  return {group, editable};
}

function renderGeoLeafletLayers() {
  if (!geoLeafletMap) return;
  if (geoLeafletLayers) geoLeafletLayers.remove();
  geoLeafletEntityLayers = new Map();
  geoLeafletLayers = L.layerGroup().addTo(geoLeafletMap);
  for (const entity of state.geoEntities) {
    if (!geoLeafletVisible(entity.status)) continue;
    const entry = geoLeafletMakeLayer(entity);
    if (!entry) continue;
    geoLeafletEntityLayers.set(entity.id, entry);
    entry.group.addTo(geoLeafletLayers);
    if (state.geoSelected?.id === entity.id) entry.editable.bringToFront?.();
  }
  if (geoLeafletEditMode && state.geoSelected) {
    const selected = geoLeafletEntityLayers.get(state.geoSelected.id);
    selected?.editable.pm?.enable({allowSelfIntersection:false, snappable:true});
  }
}

function geoLeafletScheduleViewportReload() {
  if (!geoLeafletMap || geoLeafletEditMode || state.geoDrawingActive || Date.now() < geoLeafletSuppressViewportUntil) return;
  clearTimeout(geoLeafletViewportTimer);
  geoLeafletViewportTimer = setTimeout(() => loadGeoReview({preserveSelection:true}), 260);
}

function ensureGeoLeafletMap() {
  const container = $('geo-map');
  if (!container) return null;
  if (geoLeafletMap) return geoLeafletMap;
  if (!window.L || !L.map || !L.GeoJSON) {
    container.innerHTML = '<div class="error-card">The map editor could not be loaded. Refresh the page or contact an administrator.</div>';
    return null;
  }
  geoLeafletMap = L.map(container, {center:GEO_DEFAULT_CENTER, zoom:GEO_DEFAULT_ZOOM, minZoom:2, maxZoom:19, worldCopyJump:false, preferCanvas:true, zoomControl:false, attributionControl:true});
  L.control.zoom({position:'topleft'}).addTo(geoLeafletMap);
  // The browser supplies its standard User-Agent and Referer headers. JavaScript
  // cannot set User-Agent; the nginx Referrer-Policy keeps a valid origin referrer.
  L.tileLayer(GEO_TILE_URL, {
    maxZoom:19,
    maxNativeZoom:19,
    noWrap:true,
    keepBuffer:1,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Report a map issue</a>'
  }).addTo(geoLeafletMap);
  // Panning and zooming are map-only interactions. The filtered, paged queue
  // must remain stable while a reviewer inspects the current result set.
  geoLeafletMap.on('pm:create', event => {
    if (!state.geoDrawingActive) {
      event.layer.remove();
      return;
    }
    geoLeafletDrawingLayer?.remove();
    geoLeafletDrawingLayer = event.layer;
    geoLeafletDrawingLayer.pm?.disable();
    renderGeoDrawPanel();
  });
  return geoLeafletMap;
}

function geoLeafletBoundsForEntity(entity) {
  const layer = L.geoJSON(geoLeafletFeature(entity));
  return layer.getBounds();
}

function geoLeafletCenterOnEntity(entity) {
  if (!geoLeafletMap || !entity?.geometry) return;
  const bounds = geoLeafletBoundsForEntity(entity);
  if (!bounds.isValid()) return;
  // Selecting an item is an inspection action, not a new viewport query. Keep
  // the queue stable while the map animates to the selected entity.
  geoLeafletSuppressViewportUntil = Date.now() + 1400;
  if (entity.geometry.type === 'Point') geoLeafletMap.setView(bounds.getCenter(), Math.max(geoLeafletMap.getZoom(), 15), {animate:true});
  else geoLeafletMap.fitBounds(bounds, {padding:[80,80], maxZoom:17, animate:true});
}

function renderGeoQueue() {
  const list = $('geo-entity-list');
  if (!list) return;
  list.innerHTML = state.geoEntities.map(entity => `<button class="table-row geo-entity-row ${state.geoSelected?.id === entity.id ? 'selected' : ''}" data-select-geo="${esc(entity.id)}" type="button"><span><strong>${esc(entity.name)}</strong><small>${esc(entity.entityType)} · ${esc(entity.programmeSlug || 'Platform-wide')} · ${esc(geoLocationValue(entity, 'city') || geoLocationValue(entity, 'municipality') || 'Location unavailable')}</small></span><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></button>`).join('') || '<p class="muted empty">No entities match the selected filters.</p>';
  list.querySelectorAll('[data-select-geo]').forEach(button => { button.onclick = () => selectGeoEntity(button.dataset.selectGeo); });
  const count = $('geo-count');
  if (count) count.textContent = `${geoReviewTotal} matching ${geoReviewTotal === 1 ? 'entity' : 'entities'}`;
  const pageLabel = $('geo-page-label');
  const pageCount = Math.max(1, Math.ceil(geoReviewTotal / geoReviewPageSize));
  if (pageLabel) pageLabel.textContent = `Page ${geoReviewPage} of ${pageCount}`;
  if ($('geo-page-prev')) $('geo-page-prev').disabled = geoReviewPage <= 1;
  if ($('geo-page-next')) $('geo-page-next').disabled = geoReviewPage >= pageCount;
}

function geoFilterLocationValues(field) {
  const values = new Map();
  const add = value => { const text = String(value || '').trim(); if (text) values.set(text.toLowerCase(), text); };
  if (field === 'continent') geoReviewLocationOptions.forEach(item => add(item.name));
  if (field === 'country') geoReviewLocationOptions.flatMap(item => item.countries || []).forEach(item => add(item.name));
  if (field === 'region') geoReviewLocationOptions.flatMap(item => (item.countries || []).flatMap(country => country.subdivisions || [])).forEach(item => add(item.name));
  if (field === 'province') geoReviewLocationOptions.flatMap(item => (item.countries || []).flatMap(country => (country.subdivisions || []).flatMap(region => region.provinces || []))).forEach(item => add(item.name));
  return [...values.values()].sort((a, b) => a.localeCompare(b));
}

function renderGeoFilterOptions() {
  ['continent', 'country', 'region', 'province'].forEach(field => {
    const list = $(`geo-filter-${field}-options`);
    if (list) list.innerHTML = geoFilterLocationValues(field).map(value => `<option value="${esc(value)}"></option>`).join('');
  });
}

function geoFilterParams() {
  const query = new URLSearchParams({page: String(geoReviewPage), pageSize: String(geoReviewPageSize)});
  const programme = $('geo-programme')?.value;
  if (programme) query.set('programme', programme);
  const statuses = [...document.querySelectorAll('[data-geo-filter-status]:checked')].map(input => input.value);
  if (statuses.length && statuses.length < GEO_STATUS_ORDER.length) statuses.forEach(status => query.append('status', status));
  const fields = [['entity-type', 'entityType'], ['continent', 'continent'], ['country', 'country'], ['region', 'region'], ['province', 'province'], ['city', 'city']];
  fields.forEach(([control, queryField]) => { const value = $(`geo-filter-${control}`)?.value?.trim(); if (value) query.set(queryField, value); });
  return query;
}

function geoAuditMarkup(audit) {
  const entries = [...(audit?.reviewHistory || []), ...(audit?.geometryHistory || []), ...(audit?.statusHistory || [])].sort((a,b) => String(b.occurredAt || b.editedAt || '').localeCompare(String(a.occurredAt || a.editedAt || '')));
  return entries.map(item => `<div class="audit-row"><strong>${esc(item.action || 'GEOMETRY_EDIT')}</strong><span>${esc(item.occurredAt || item.editedAt || '')}</span><small>${esc(item.note || item.reviewerId || item.editorId || '')}</small></div>`).join('') || '<p class="muted">No audit entries yet.</p>';
}

function geoAllowedStatuses(entity) {
  if (entity.status === 'APPROVED') return ['APPROVED', 'RETIRED'];
  if (entity.status === 'RETIRED') return ['RETIRED'];
  return GEO_STATUS_ORDER;
}

function geoEntityTypeCatalogue(entity) {
  const configured = state.entityTypeCatalogue || [];
  const current = entity?.entityType;
  return configured.filter(item => item.active !== false || item.code === current);
}

async function loadGeoEntityTypeCatalogue() {
  const data = await api('/v1/entity-types');
  state.entityTypeCatalogue = data.items || [];
  return state.entityTypeCatalogue;
}

const GEO_LOCATION_FIELDS = [
  ['continent', 'Continent'], ['continentCode', 'Continent code'],
  ['country', 'Country'], ['countryCode', 'Country code'],
  ['region', 'Region / first subdivision'], ['regionCode', 'Subdivision code'],
  ['province', 'Province'], ['provinceCode', 'Province code'],
  ['county', 'County / equivalent'], ['countyCode', 'County code'],
  ['city', 'City'], ['municipality', 'Municipality'],
];
const GEO_LOCATION_HIERARCHY = [
  {field:'continent', code:'continentCode', label:'Continent', child:'countries'},
  {field:'country', code:'countryCode', label:'Country', child:'subdivisions'},
  {field:'region', code:'regionCode', aliasCode:'subdivisionCode', label:'Region / first subdivision', child:'provinces'},
  {field:'province', code:'provinceCode', label:'Province'},
];
const GEO_LOCATION_TEXT_FIELDS = ['continent', 'country', 'region', 'province', 'county', 'city', 'municipality', 'locality'];

function geoLocationValue(entity, field) {
  if (field === 'region') return entity.region ?? entity.subdivision ?? entity.location?.region ?? entity.location?.subdivision ?? '';
  return entity[field] ?? entity.location?.[field] ?? '';
}

function geoLocationSection(entity) {
  const manual = new Set(entity.manualLocationFields || []);
  const rows = GEO_LOCATION_FIELDS.map(([field, label]) => `<div class="location-value"><span>${esc(label)}</span><strong>${esc(geoLocationValue(entity, field) || 'Not available')}</strong>${manual.has(field) ? '<small class="manual-value">Manual override</small>' : ''}</div>`).join('');
  return `<section class="inspector-section location-inspector"><div class="section-heading"><div><h3>Location metadata</h3><p class="field-help">Values come from BigDataCloud reverse geocoding unless a field is marked as a manual override. Manual values always take precedence during imports and geometry refreshes.</p></div><span class="help-badge ${manual.size ? '' : 'neutral'}">${manual.size ? `${manual.size} manual` : 'Automatic'}</span></div><div class="location-summary">${rows}</div><button class="secondary" id="geo-edit-location" type="button">Edit location metadata</button></section>`;
}

function geoCatalogOptions(field) {
  const tree = state.geoLocationOptions || [];
  if (field === 'continent') return tree;
  const countries = tree.flatMap(continent => continent.countries || []);
  if (field === 'country') return countries;
  const selectedCountry = document.querySelector('[data-location-selector="country"]')?.value?.trim().toLowerCase();
  const country = countries.find(item => item.name.toLowerCase() === selectedCountry);
  if (field === 'region') return country ? country.subdivisions : countries.flatMap(item => item.subdivisions || []);
  const selectedRegion = document.querySelector('[data-location-selector="region"]')?.value?.trim().toLowerCase();
  const subdivisions = country ? country.subdivisions : countries.flatMap(item => item.subdivisions || []);
  const subdivision = subdivisions.find(item => item.name.toLowerCase() === selectedRegion);
  return subdivision ? subdivision.provinces : subdivisions.flatMap(item => item.provinces || []);
}

function geoCatalogMatch(field, value) {
  const normalized = String(value || '').trim().toLowerCase();
  return geoCatalogOptions(field).find(item => item.name.toLowerCase() === normalized) || null;
}

function geoLocationHierarchyField(entity, metadata, manual) {
  const value = geoLocationValue(entity, metadata.field);
  const codeFields = [metadata.code, metadata.aliasCode].filter(Boolean);
  const codeInputs = codeFields.map(code => `<label class="derived-code"><span>${esc(code === 'subdivisionCode' ? 'Subdivision code' : `${metadata.label} code`)}</span><input data-location-code="${code}" value="${esc(geoLocationValue(entity, code))}" readonly aria-readonly="true"><small>Provider-derived; not editable</small></label>`).join('');
  return `<div class="location-edit-field location-hierarchy-field"><span>${esc(metadata.label)}</span><input list="geo-options-${metadata.field}" data-location-selector="${metadata.field}" data-location-field="${metadata.field}" value="${esc(value)}" placeholder="Search valid provider value" autocomplete="off"><datalist id="geo-options-${metadata.field}"></datalist>${codeInputs}<span class="manual-toggle"><input type="checkbox" aria-label="Manual override for ${esc(metadata.label)}" data-location-manual="${metadata.field}" ${manual.has(metadata.field) ? 'checked' : ''}> Manual override</span></div>`;
}

function geoLocationTextField(entity, field, label, manual) {
  return `<label class="location-edit-field"><span>${esc(label)}</span><input data-location-field="${field}" value="${esc(geoLocationValue(entity, field))}" placeholder="Automatic value"><span class="manual-toggle"><input type="checkbox" aria-label="Manual override for ${esc(label)}" data-location-manual="${field}" ${manual.has(field) ? 'checked' : ''}> Manual override</span></label>`;
}

function geoRefreshLocationSelectors(changedField) {
  const changedIndex = GEO_LOCATION_HIERARCHY.findIndex(item => item.field === changedField);
  const selected = geoCatalogMatch(changedField, document.querySelector(`[data-location-selector="${changedField}"]`)?.value);
  const selectedInput = document.querySelector(`[data-location-selector="${changedField}"]`);
  const metadata = GEO_LOCATION_HIERARCHY[changedIndex];
  const codeInput = document.querySelector(`[data-location-code="${metadata.code}"]`);
  if (codeInput) codeInput.value = selected?.code || '';
  if (metadata.aliasCode) {
    const aliasInput = document.querySelector(`[data-location-code="${metadata.aliasCode}"]`);
    if (aliasInput) aliasInput.value = selected?.code || '';
  }
  GEO_LOCATION_HIERARCHY.slice(changedIndex + 1).forEach(item => {
    const input = document.querySelector(`[data-location-selector="${item.field}"]`);
    if (input) input.value = '';
    [item.code, item.aliasCode].filter(Boolean).forEach(code => { const codeInput = document.querySelector(`[data-location-code="${code}"]`); if (codeInput) codeInput.value = ''; });
  });
  GEO_LOCATION_HIERARCHY.forEach(item => {
    const list = document.querySelector(`#geo-options-${item.field}`);
    if (!list) return;
    list.innerHTML = geoCatalogOptions(item.field).map(option => `<option value="${esc(option.name)}" label="${esc(option.code || 'Code unavailable')}"></option>`).join('');
  });
  if (selectedInput && !selected) selectedInput.setCustomValidity('Choose a value from the provider-derived list.');
  else if (selectedInput) selectedInput.setCustomValidity('');
}

function populateGeoLocationSelectors() {
  GEO_LOCATION_HIERARCHY.forEach(item => {
    const list = document.querySelector(`#geo-options-${item.field}`);
    if (list) list.innerHTML = geoCatalogOptions(item.field).map(option => `<option value="${esc(option.name)}" label="${esc(option.code || 'Code unavailable')}"></option>`).join('');
  });
}

function geoLocationEditor(entity) {
  const manual = new Set(entity.manualLocationFields || []);
  const hierarchy = GEO_LOCATION_HIERARCHY.map(metadata => geoLocationHierarchyField(entity, metadata, manual)).join('');
  const supporting = [
    ['county', 'County / equivalent'], ['city', 'City'], ['municipality', 'Municipality'], ['locality', 'Locality'],
  ].map(([field, label]) => geoLocationTextField(entity, field, label, manual)).join('');
  return `<div class="section-heading"><div><h3>Edit location metadata</h3><p class="field-help">Choose values from the provider-derived hierarchy. Codes are read-only and are filled from the selected name. Check Manual override only for values that must remain authoritative.</p></div><span class="edit-badge">EDIT MODE</span></div><div class="location-edit-grid">${hierarchy}${supporting}</div><label class="stacked-field location-note">Change note<textarea id="geo-location-note" placeholder="Explain the location correction"></textarea></label><div class="form-actions"><button class="primary" id="geo-save-location" type="button">Save location</button><button class="secondary" id="geo-cancel-location" type="button">Cancel</button></div>`;
}

function bindGeoLocationEditor() {
  const entity = state.geoSelected;
  const section = document.querySelector('.location-inspector');
  if (!entity || !section) return;
  $('geo-edit-location').onclick = async () => {
    try { state.geoLocationOptions = (await api('/v1/geodata/location-options')).continents || []; } catch (error) { notify(`Location options unavailable: ${error.message}`, 'error'); state.geoLocationOptions = []; }
    section.innerHTML = geoLocationEditor(entity);
    populateGeoLocationSelectors();
    document.querySelectorAll('[data-location-selector]').forEach(input => input.addEventListener('change', () => geoRefreshLocationSelectors(input.dataset.locationSelector)));
    $('geo-save-location').onclick = saveGeoLocation;
    $('geo-cancel-location').onclick = () => renderGeoInspector(state.geoAudit || {});
  };
}

async function saveGeoLocation() {
  const entity = state.geoSelected;
  if (!entity) return;
  const location = {};
  document.querySelectorAll('[data-location-field]').forEach(input => { location[input.dataset.locationField] = input.value.trim() || null; });
  document.querySelectorAll('[data-location-code]').forEach(input => { location[input.dataset.locationCode] = input.value.trim() || null; });
  const region = location.region || location.subdivision;
  if (region) location.subdivision = region;
  const manualFields = [...document.querySelectorAll('[data-location-manual]:checked')].map(input => input.dataset.locationManual);
  try {
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/location`, {method:'POST', body:JSON.stringify({location, manualFields, editorId:state.account.id, note:$('geo-location-note')?.value || ''}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Location metadata saved', 'success');
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

function renderGeoInspector(audit = state.geoAudit || {}) {
  const inspector = $('geo-inspector');
  const entity = state.geoSelected;
  if (!inspector) return;
  if (!entity) {
    inspector.innerHTML = '<div class="geo-empty-inspector"><p class="eyebrow">ENTITY INSPECTOR</p><h2>Select an entity</h2><p class="muted">Choose an item from the queue to center the map and review its source, geometry, lifecycle, and audit history.</p></div>';
    return;
  }
  const editing = geoLeafletEditMode && state.geoEditingGeometry;
  const editableEntry = geoLeafletEntityLayers.get(entity.id);
  const currentGeometry = editing ? state.geoEditingGeometry : entity.geometry;
  const statuses = geoAllowedStatuses(entity);
  inspector.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">ENTITY INSPECTOR</p><h2>${esc(entity.name)}</h2><p class="muted">${esc(entity.programmeSlug || 'Platform-wide')} · ${esc(entity.entityType)} · ${esc(entity.status)}</p></div><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></div>
    <section class="inspector-section"><div class="section-heading"><div><h3>Source comparison</h3><p class="field-help">The imported source snapshot stays beside the platform geometry. Geometry edits create audit history and never rewrite the original provenance.</p></div></div><div class="compare-grid"><div><small class="muted">Source snapshot</small><pre class="data-preview">${esc(JSON.stringify(entity.provenance?.sourceFeature || entity.provenance?.source || {}, null, 2))}</pre></div><div><small class="muted">Current platform geometry</small><pre class="data-preview">${esc(JSON.stringify(currentGeometry || {}, null, 2))}</pre></div></div></section>
    ${geoLocationSection(entity)}
    <section class="inspector-section entity-name-inspector"><div class="section-heading"><div><h3>Entity name</h3><p class="field-help">Correct the display name when the source contains a spelling, language, or naming error. Name changes are audited and do not alter source provenance.</p></div></div><label class="stacked-field">Name<input id="geo-entity-name" value="${esc(entity.name || '')}" maxlength="240" required></label><label class="stacked-field">Name change note<textarea id="geo-entity-name-note" placeholder="Explain why the name was corrected"></textarea></label><button class="secondary" id="geo-save-entity-name" type="button">Save name</button></section>
    <section class="inspector-section entity-type-inspector"><div class="section-heading"><div><h3>Entity category</h3><p class="field-help">Categories are shared Master data, not programme-owned. A programme may assign a category for eligibility separately. You can change the category for platform-wide entities as well as programme-assigned entities; every change is audited because rules and awards may use the category code.</p></div></div><div class="status-review-grid"><label>Category<select id="geo-entity-type-select">${geoEntityTypeCatalogue(entity).map(item => `<option value="${esc(item.code)}" ${item.code === entity.entityType ? 'selected' : ''}>${esc(item.label || item.code)}${item.active === false ? ' (inactive)' : ''}</option>`).join('')}</select></label><button class="secondary" id="geo-save-entity-type" type="button" ${entity.status === 'RETIRED' || !geoEntityTypeCatalogue(entity).length ? 'disabled' : ''}>Save category</button></div><label class="stacked-field">Category change note<textarea id="geo-entity-type-note" placeholder="Explain why the category was changed"></textarea></label>${geoEntityTypeCatalogue(entity).length ? '' : '<p class="field-help">No shared categories are available. Add one in Master data first.</p>'}</section>
    <section class="inspector-section geometry-inspector"><div class="section-heading"><div><h3>Geometry</h3><p class="field-help">Geometry is read-only until you explicitly enter edit mode. Use the map handles to adjust the selected point, way / trail, or polygon.</p></div>${editing ? '<span class="edit-badge">EDIT MODE</span>' : ''}</div>${editing ? `<label class="stacked-field">Geometry change note<textarea id="geo-geometry-note" placeholder="Explain why the geometry was adjusted"></textarea></label><div class="form-actions"><button class="primary" id="geo-save-geometry" type="button">Save geometry</button><button class="secondary" id="geo-cancel-geometry" type="button">Cancel</button></div>` : `<button class="secondary" id="geo-edit-geometry" type="button" ${entity.status === 'RETIRED' ? 'disabled' : ''}>Edit geometry</button><p class="field-help">Editing handles appear only after selecting this button.</p>`}</section>
    <section class="inspector-section"><div class="section-heading"><div><h3>Review decision</h3><p class="field-help">Record the evidence or reason for a lifecycle decision. Approved entities can only be retired so historical QSOs remain valid.</p></div></div><label class="stacked-field">Review note<textarea id="geo-review-note" placeholder="Record the evidence or reason for this decision"></textarea></label><div class="status-review-grid"><label>Status<select id="geo-status-select">${statuses.map(status => `<option value="${status}" ${status === entity.status ? 'selected' : ''}>${status[0] + status.slice(1).toLowerCase()}</option>`).join('')}</select></label><button class="primary" id="geo-save-status" type="button" ${statuses.length === 1 ? 'disabled' : ''}>Save status</button></div><p class="field-help">Status changes are recorded in the entity audit history.</p></section>
    <section class="inspector-section"><h3>Audit history</h3><div class="audit-list">${geoAuditMarkup(audit)}</div></section>
    <section class="inspector-section gis-admin-section"><h3>GIS administration</h3><p class="field-help">Global and GIS administrators can convert point, way, and polygon geometries. A way is a trail or other linear feature stored as GeoJSON LineString. Rejected entities may be permanently removed together with their audit record.</p><div class="status-review-grid"><label>Geometry type<select id="geo-geometry-type"><option value="POINT" ${entity.geometry?.type === 'Point' ? 'selected' : ''}>Point</option><option value="WAY" ${entity.geometry?.type === 'LineString' ? 'selected' : ''}>Way / trail</option><option value="POLYGON" ${entity.geometry?.type === 'Polygon' || entity.geometry?.type === 'MultiPolygon' ? 'selected' : ''}>Polygon</option></select></label><button class="secondary" id="geo-save-type" type="button" ${entity.status === 'RETIRED' ? 'disabled' : ''}>Save type</button></div><textarea id="geo-type-note" placeholder="Explain why the geometry type changed"></textarea>${entity.status === 'REJECTED' ? '<div class="form-actions"><button class="danger-button" id="geo-delete-rejected" type="button">Delete rejected entity permanently</button></div><p class="field-help">Deletion removes the entity and its audit record. It cannot be undone.</p>' : ''}</section>`;
  if (editing) {
    $('geo-save-geometry').onclick = saveGeoLeafletGeometry;
    $('geo-cancel-geometry').onclick = cancelGeoLeafletEdit;
  } else {
    $('geo-edit-geometry').onclick = enterGeoLeafletEdit;
  }
  bindGeoLocationEditor();
  const geometryTypeSelect = $('geo-geometry-type');
  if (geometryTypeSelect) {
    const currentType = entity.geometry?.type === 'LineString' ? 'LINESTRING' : entity.geometry?.type === 'MultiLineString' ? 'MULTILINESTRING' : entity.geometry?.type === 'MultiPolygon' ? 'MULTIPOLYGON' : String(entity.geometry?.type || 'Polygon').toUpperCase();
    geometryTypeSelect.innerHTML = [['POINT','Point'],['LINESTRING','LineString / way'],['MULTILINESTRING','MultiLineString'],['POLYGON','Polygon'],['MULTIPOLYGON','MultiPolygon']].map(([value,label]) => `<option value="${value}" ${value === currentType ? 'selected' : ''}>${label}</option>`).join('');
  }
  if (geoIsGlobalAdmin()) {
    const adminSection = document.querySelector('.gis-admin-section');
    adminSection?.insertAdjacentHTML('beforeend', '<div class="form-actions"><button class="danger-button" id="geo-delete-any" type="button">Delete entity permanently</button></div><p class="field-help stern-warning">Global deletion removes this entity, all linked QSOs, recalculates award progress, and may invalidate previously qualified awards. This cannot be undone.</p>');
  }
  $('geo-save-entity-type').onclick = saveGeoLeafletEntityType;
  $('geo-save-entity-name').onclick = saveGeoLeafletEntityName;
  $('geo-save-status').onclick = saveGeoLeafletStatus;
  $('geo-save-type').onclick = saveGeoLeafletGeometryType;
  if ($('geo-delete-rejected')) $('geo-delete-rejected').onclick = deleteGeoRejected;
  if ($('geo-delete-any')) $('geo-delete-any').onclick = deleteGeoAny;
  if (editableEntry?.editable && editing) editableEntry.editable.pm?.enable({allowSelfIntersection:false, snappable:true});
}

async function deleteGeoAny() {
  const entity = state.geoSelected;
  if (!entity) return;
  try {
    const impact = await api(`/v1/activations/admin/entities/${encodeURIComponent(entity.id)}/deletion-impact`);
    const warning = `PERMANENT GLOBAL DELETION\n\n${entity.name} (${entity.status}) will be removed. ${impact.qsoCount || 0} valid QSOs will be deleted in cascade and ${impact.activationCount || 0} activation(s) will become invalid. Award progress will be recalculated and previously qualified awards may become invalid.\n\nThis cannot be undone. Continue?`;
    if (!confirm(warning)) return;
    await api(`/v1/activations/admin/entities/${encodeURIComponent(entity.id)}/cascade-delete`, {method:'POST', body:JSON.stringify({deletedBy:state.account.id}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/delete`, {method:'POST', body:JSON.stringify({deletedBy:state.account.id}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Entity deleted; linked QSOs were removed and award recalculation was queued', 'success'); state.geoSelected = null; await loadGeoReview({preserveSelection:false, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function selectGeoEntity(id) {
  const entity = state.geoEntities.find(item => item.id === id);
  if (!entity) return;
  if (geoLeafletEditMode) cancelGeoLeafletEdit();
  state.geoSelected = entity;
  state.geoEditingGeometry = null;
  renderGeoQueue();
  renderGeoLeafletLayers();
  geoLeafletCenterOnEntity(entity);
  try { state.geoAudit = await api(`/v1/geodata/entities/${encodeURIComponent(id)}/audit`); } catch (_) { state.geoAudit = {}; }
  renderGeoInspector(state.geoAudit);
}

function enterGeoLeafletEdit() {
  const entity = state.geoSelected;
  const entry = entity && geoLeafletEntityLayers.get(entity.id);
  if (!entity || !entry?.editable) return notify('Select a visible entity before editing its geometry', 'error');
  geoLeafletEditMode = true;
  state.geoEditingGeometry = cloneJson(entity.geometry);
  entry.editable.pm?.enable({allowSelfIntersection:false, snappable:true});
  entry.editable.bringToFront?.();
  renderGeoInspector(state.geoAudit || {});
}

function cancelGeoLeafletEdit() {
  geoLeafletEditMode = false;
  state.geoEditingGeometry = null;
  geoLeafletEntityLayers.get(state.geoSelected?.id)?.editable.pm?.disable();
  renderGeoLeafletLayers();
  renderGeoInspector(state.geoAudit || {});
}

async function saveGeoLeafletGeometry() {
  const entity = state.geoSelected;
  const entry = entity && geoLeafletEntityLayers.get(entity.id);
  if (!entity || !entry?.editable) return;
  try {
    const geometry = entry.editable.toGeoJSON().geometry;
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/geometry`, {method:'POST', body:JSON.stringify({geometry, editorId:state.account.id, note:$('geo-geometry-note')?.value || ''}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Geometry saved with audit history', 'success');
    geoLeafletEditMode = false;
    state.geoEditingGeometry = null;
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function saveGeoLeafletStatus() {
  const entity = state.geoSelected;
  const status = $('geo-status-select')?.value;
  if (!entity || !status || status === entity.status) return;
  try {
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/status`, {method:'POST', body:JSON.stringify({status, reviewerId:state.account.id, note:$('geo-review-note')?.value || ''}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify(`Entity ${status.toLowerCase()}`, 'success');
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function saveGeoLeafletEntityType() {
  const entity = state.geoSelected;
  const entityType = $('geo-entity-type-select')?.value;
  if (!entity || !entityType || entityType === entity.entityType) return;
  try {
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/entity-type`, {method:'POST', body:JSON.stringify({entityType, editorId:state.account.id, note:$('geo-entity-type-note')?.value || ''}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Entity category changed with audit history', 'success');
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function saveGeoLeafletEntityName() {
  const entity = state.geoSelected;
  const name = $('geo-entity-name')?.value?.trim();
  if (!entity || !name) return notify('Enter an entity name.', 'error');
  if (name === entity.name) return;
  try {
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/name`, {method:'POST', body:JSON.stringify({name, editorId:state.account.id, note:$('geo-entity-name-note')?.value || ''}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Entity name changed with audit history', 'success');
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function saveGeoLeafletGeometryType() {
  const entity = state.geoSelected;
  if (!entity) return;
  try {
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/geometry-type`, {method:'POST', body:JSON.stringify({geometryType:$('geo-geometry-type').value, editorId:state.account.id, note:$('geo-type-note').value}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Geometry type changed with audit history', 'success');
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function deleteGeoRejected() {
  const entity = state.geoSelected;
  if (!entity || !confirm(`Permanently delete ${entity.name}? This also deletes its audit record.`)) return;
  try {
    await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/delete`, {method:'POST', body:JSON.stringify({deletedBy:state.account.id}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Rejected entity and audit record deleted', 'success');
    state.geoSelected = null;
    await loadGeoReview({force:true});
  } catch (error) { notify(error.message, 'error'); }
}

async function loadGeoReview({preserveSelection = true, force = false} = {}) {
  if (!geoLeafletMap) return;
  if (geoLeafletEditMode && !force) return;
  const requestId = ++geoLeafletLoadSequence;
  const query = geoFilterParams();
  try {
    const data = await api(`/v1/geodata/entities?${query}`);
    if (requestId !== geoLeafletLoadSequence || !geoLeafletMap) return;
    const selectedId = preserveSelection ? state.geoSelected?.id : null;
    state.geoEntities = data.items || [];
    state.geoSelected = selectedId ? state.geoEntities.find(entity => entity.id === selectedId) || null : null;
    geoReviewTotal = Number(data.total || 0);
    renderGeoQueue();
    renderGeoLeafletLayers();
    if (state.geoEntities.length && (!geoLeafletHasFittedInitialData || !state.geoSelected)) {
      geoLeafletHasFittedInitialData = true;
      const boundsToFit = L.featureGroup([...geoLeafletEntityLayers.values()].map(entry => entry.group)).getBounds();
      if (boundsToFit.isValid()) geoLeafletMap.fitBounds(boundsToFit, {padding:[40,40], maxZoom:16});
    }
    if (state.geoSelected) renderGeoInspector(state.geoAudit || {}); else renderGeoInspector();
  } catch (error) {
    if (requestId === geoLeafletLoadSequence) {
      $('geo-entity-list').innerHTML = `<div class="error-card">${esc(error.message)}</div>`;
      notify(error.message, 'error');
    }
  }
}

function renderGeoDrawPanel() {
  const panel = $('geo-draw-panel');
  const toggle = $('geo-draw-toggle');
  if (toggle) toggle.textContent = state.geoDrawingActive ? 'Close candidate form' : 'New candidate';
  if (!panel) return;
  if (!state.geoDrawingActive) { panel.hidden = true; return; }
  const hasGeometry = Boolean(geoLeafletDrawingLayer);
  panel.hidden = false;
  panel.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">MANUAL PROPOSAL</p><h2>New candidate</h2><p class="field-help">Choose a geometry, start drawing, and click the first polygon point to close it. A way / trail is drawn as a connected line; double-click or finish the line to submit it. New candidates always enter the review queue as CANDIDATE.</p></div><button class="secondary" id="geo-draw-cancel" type="button">Cancel</button></div><div class="form-grid draw-form"><label>Geometry<select id="geo-draw-mode"><option value="POLYGON" ${state.geoDrawingMode === 'POLYGON' ? 'selected' : ''}>Polygon area</option><option value="WAY" ${state.geoDrawingMode === 'WAY' ? 'selected' : ''}>Way / trail</option><option value="POINT" ${state.geoDrawingMode === 'POINT' ? 'selected' : ''}>Point location</option></select><small class="field-help">Use a point for a location, a way for a trail or route, or a polygon for an area.</small></label><label>Name<input id="geo-draw-name" value="${esc(state.geoDrawingDraft?.name || '')}" required></label><label>Entity type<input id="geo-draw-type" value="${esc(state.geoDrawingDraft?.type || 'MUNICIPAL_PARK')}" required></label><label>Jurisdiction<input id="geo-draw-jurisdiction" value="${esc(state.geoDrawingDraft?.jurisdiction || '')}" placeholder="Optional authority or area"></label><label>Attachment URI<input id="geo-draw-attachment" value="${esc(state.geoDrawingDraft?.attachment || '')}" placeholder="Optional evidence URL"></label><div class="form-actions wide"><button class="secondary" id="geo-draw-start" type="button">${hasGeometry ? 'Redraw geometry' : state.geoDrawingActiveNow ? 'Drawing…' : 'Start drawing'}</button><button class="primary" id="geo-draw-submit" type="button" ${hasGeometry ? '' : 'disabled'}>Submit candidate</button></div></div>`;
  $('geo-draw-mode').onchange = event => { state.geoDrawingMode = event.target.value; if (state.geoDrawingMode === 'WAY' && (!state.geoDrawingDraft?.type || state.geoDrawingDraft.type === 'MUNICIPAL_PARK')) state.geoDrawingDraft = {...(state.geoDrawingDraft || {}), type:'TRAIL'}; geoLeafletDrawingLayer?.remove(); geoLeafletDrawingLayer = null; renderGeoDrawPanel(); };
  ['name','type','jurisdiction','attachment'].forEach(key => { $(`geo-draw-${key}`)?.addEventListener('input', event => { state.geoDrawingDraft = {...(state.geoDrawingDraft || {}), [key]:event.target.value}; }); });
  $('geo-draw-cancel').onclick = stopGeoDrawing;
  $('geo-draw-start').onclick = startGeoDrawing;
  $('geo-draw-submit').onclick = submitGeoDrawingLeaflet;
}

function startGeoDrawing() {
  if (!geoLeafletMap) return;
  if (!geoLeafletMap.pm?.enableDraw) return notify('The map drawing controls are unavailable. Refresh the page and try again.', 'error');
  geoLeafletDrawingLayer?.remove();
  geoLeafletDrawingLayer = null;
  state.geoDrawingActiveNow = true;
  geoLeafletMap.pm?.disableDraw();
  // Use a compact circle for point proposals instead of Leaflet's large
  // default pin icon; the submitted GeoJSON remains a Point geometry.
  const drawShape = state.geoDrawingMode === 'POINT' ? 'CircleMarker' : state.geoDrawingMode === 'WAY' ? 'Line' : 'Polygon';
  geoLeafletMap.pm?.enableDraw(drawShape, {snappable:true, allowSelfIntersection:false, markerStyle:{radius:8, color:'#123d3a', fillColor:'#10b981', fillOpacity:0.9}});
  renderGeoDrawPanel();
}

function stopGeoDrawing() {
  geoLeafletMap?.pm?.disableDraw();
  geoLeafletDrawingLayer?.remove();
  geoLeafletDrawingLayer = null;
  state.geoDrawingActive = false;
  state.geoDrawingActiveNow = false;
  renderGeoDrawPanel();
}

async function submitGeoDrawingLeaflet() {
  const layer = geoLeafletDrawingLayer;
  const programmeSlug = $('geo-programme')?.value || null;
  if (!layer) return notify('Draw a geometry before submitting.', 'error');
  const draft = state.geoDrawingDraft || {};
  if (!draft.name?.trim()) return notify('Enter a name for the candidate.', 'error');
  const feature = layer.toGeoJSON();
  const attachmentUri = draft.attachment?.trim();
  const attachments = attachmentUri ? [{name:attachmentUri.split('/').pop() || 'evidence', mediaType:'application/octet-stream', uri:attachmentUri}] : [];
  try {
    await api('/v1/geodata/proposals/draw', {method:'POST', body:JSON.stringify({programmeSlug, source:{name:'Manual administration proposal', license:'programme-supplied'}, feature:{properties:{name:draft.name.trim(), entityType:draft.type?.trim() || 'MUNICIPAL_PARK', jurisdiction:draft.jurisdiction?.trim() || undefined}, geometry:feature.geometry}, attachments}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Candidate proposal submitted', 'success');
    stopGeoDrawing();
    state.geoDrawingDraft = {};
    await loadGeoReview({preserveSelection:true, force:true});
  } catch (error) { notify(error.message, 'error'); }
}

function bindGeoLeafletWorkspace() {
  $('geo-refresh').onclick = () => loadGeoReview({preserveSelection:true, force:true});
  $('geo-programme').onchange = () => { state.geoSelected = null; geoReviewPage = 1; loadGeoReview({preserveSelection:false, force:true}); };
  $('geo-status').onchange = event => {
    document.querySelectorAll('[data-geo-filter-status]').forEach(input => { input.checked = !event.target.value || input.value === event.target.value; });
    state.geoSelected = null;
    geoReviewPage = 1;
    loadGeoReview({preserveSelection:false, force:true});
  };
  $('geo-filter-status-all').onchange = event => {
    if (!event.target.checked) {
      event.target.checked = true;
      return;
    }
    document.querySelectorAll('[data-geo-filter-status]').forEach(input => { input.checked = event.target.checked; });
    geoReviewPage = 1;
    loadGeoReview({preserveSelection:false, force:true});
  };
  document.querySelectorAll('[data-geo-filter-status]').forEach(input => input.onchange = () => {
    const checked = [...document.querySelectorAll('[data-geo-filter-status]:checked')];
    if (!checked.length) document.querySelectorAll('[data-geo-filter-status]').forEach(item => { item.checked = true; });
    const all = document.querySelectorAll('[data-geo-filter-status]:checked').length === GEO_STATUS_ORDER.length;
    $('geo-filter-status-all').checked = all;
    $('geo-status').value = all || checked.length !== 1 ? '' : checked[0].value;
    geoReviewPage = 1;
    loadGeoReview({preserveSelection:false, force:true});
  });
  document.querySelectorAll('[data-geo-filter]').forEach(input => input.onchange = () => { geoReviewPage = 1; state.geoSelected = null; loadGeoReview({preserveSelection:false, force:true}); });
  $('geo-page-size').onchange = event => { geoReviewPageSize = Number(event.target.value) || 25; geoReviewPage = 1; loadGeoReview({preserveSelection:false, force:true}); };
  $('geo-page-prev').onclick = () => { if (geoReviewPage > 1) { geoReviewPage -= 1; state.geoSelected = null; loadGeoReview({preserveSelection:false, force:true}); } };
  $('geo-page-next').onclick = () => { if (geoReviewPage < Math.max(1, Math.ceil(geoReviewTotal / geoReviewPageSize))) { geoReviewPage += 1; state.geoSelected = null; loadGeoReview({preserveSelection:false, force:true}); } };
  document.querySelectorAll('[data-geo-layer]').forEach(input => input.onchange = renderGeoLeafletLayers);
  $('geo-draw-toggle').onclick = () => {
    if (state.geoDrawingActive) return stopGeoDrawing();
    state.geoDrawingActive = true;
    state.geoDrawingDraft = {};
    renderGeoDrawPanel();
    startGeoDrawing();
  };
}

renderGeoReview = async function() {
  try { await loadGeoEntityTypeCatalogue(); } catch (error) { state.entityTypeCatalogue = []; notify(`Unable to load shared categories: ${error.message}`, 'error'); }
  try { geoReviewLocationOptions = (await api('/v1/geodata/location-options')).continents || []; } catch (error) { geoReviewLocationOptions = []; notify(`Location filters unavailable: ${error.message}`, 'error'); }
  geoReviewPage = 1;
  geoReviewPageSize = 25;
  geoReviewTotal = 0;
  geoLeafletLoadSequence += 1;
  clearTimeout(geoLeafletViewportTimer);
  if (geoLeafletMap) { geoLeafletMap.remove(); geoLeafletMap = null; }
  geoLeafletLayers = null;
  geoLeafletEntityLayers = new Map();
  geoLeafletHasFittedInitialData = false;
  geoLeafletEditMode = false;
  geoLeafletDrawingLayer = null;
  const view = $('geodata-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">POSTGIS WORKFLOW</p><h1>Geodata review</h1><p class="muted">Filter the platform-wide entity catalogue, select an item to centre the map, and review its source, geometry, and lifecycle below the map.</p></div><button class="secondary" id="geo-refresh" type="button">Refresh list</button></div><div class="toolbar geo-toolbar"><label class="toolbar-field">Programme<select id="geo-programme"><option value="">All programmes and unassigned</option>${state.programmes.map(p => `<option value="${esc(p.slug)}" ${p.slug === state.currentProgramme ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label class="toolbar-field">Status<select id="geo-status"><option value="">All statuses</option>${GEO_STATUS_ORDER.map(status => `<option value="${status}">${status[0] + status.slice(1).toLowerCase()}</option>`).join('')}</select></label><button class="primary" id="geo-draw-toggle" type="button">New candidate</button></div><section class="panel geo-review-filters"><div class="panel-heading"><div><p class="eyebrow">CATALOGUE FILTERS</p><h2>Find entities</h2><p class="field-help">Filters apply to the paged list below. Programme is optional: “All programmes and unassigned” also includes platform-wide entities.</p></div></div><div class="form-grid geo-filter-grid"><label>Entity type<select id="geo-filter-entity-type" data-geo-filter><option value="">All entity types</option>${state.entityTypeCatalogue.map(item => `<option value="${esc(item.code)}">${esc(item.label || item.code)}</option>`).join('')}</select></label><label>Continent<input id="geo-filter-continent" data-geo-filter list="geo-filter-continent-options" placeholder="All continents"><datalist id="geo-filter-continent-options"></datalist></label><label>Country<input id="geo-filter-country" data-geo-filter list="geo-filter-country-options" placeholder="All countries"><datalist id="geo-filter-country-options"></datalist></label><label>Region / subdivision<input id="geo-filter-region" data-geo-filter list="geo-filter-region-options" placeholder="All regions"><datalist id="geo-filter-region-options"></datalist></label><label>Province<input id="geo-filter-province" data-geo-filter list="geo-filter-province-options" placeholder="All provinces"><datalist id="geo-filter-province-options"></datalist></label><label>City / municipality<input id="geo-filter-city" data-geo-filter placeholder="All cities and municipalities"></label></div><div class="geo-status-filter"><strong>Entity status</strong><label><input id="geo-filter-status-all" type="checkbox" checked> All</label>${GEO_STATUS_ORDER.map(status => `<label><input data-geo-filter-status value="${status}" type="checkbox" checked> ${status[0] + status.slice(1).toLowerCase()}</label>`).join('')}</div></section><section class="panel geo-results"><div class="panel-heading"><div><p class="eyebrow">FILTERED RESULTS</p><h2>Entities</h2></div><span id="geo-count" class="muted"></span></div><div id="geo-entity-list" class="geo-entity-list"></div><div class="geo-pagination"><label>Show<select id="geo-page-size"><option value="10">10</option><option value="25" selected>25</option><option value="50">50</option></select></label><span id="geo-page-label" class="muted">Page 1</span><button class="secondary" id="geo-page-prev" type="button">Previous</button><button class="secondary" id="geo-page-next" type="button">Next</button></div></section><article id="geo-draw-panel" class="panel geo-draw-panel" hidden></article><section class="panel geo-map-panel"><div class="panel-heading"><div><p class="eyebrow">MAP</p><h2>Selected result locations</h2><p class="field-help">The map shows the current page of filtered results. Selecting a list item centres it here; panning and zooming do not change the list.</p></div></div><div id="geo-map" class="geo-map" role="application" aria-label="OpenStreetMap geodata review map"></div></section><article id="geo-inspector" class="panel geo-inspector"><div class="geo-empty-inspector"><p class="eyebrow">ENTITY INSPECTOR</p><h2>Select an entity</h2><p class="muted">Choose an item from the results to review its source, geometry, lifecycle, and audit history.</p></div></article>`;
  renderGeoFilterOptions();
  $('geo-import-toggle')?.remove(); $('geo-import')?.remove();
  bindGeoLeafletWorkspace();
  const map = ensureGeoLeafletMap();
  if (!map) return;
  await new Promise(resolve => requestAnimationFrame(resolve));
  map.invalidateSize(false);
  await loadGeoReview({preserveSelection:true, force:true});
};
