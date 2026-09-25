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
  const style = geoLeafletStatusStyle(entity.status, selected);
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
  geoLeafletMap.on('moveend zoomend', geoLeafletScheduleViewportReload);
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
  list.innerHTML = state.geoEntities.map(entity => `<button class="table-row geo-entity-row ${state.geoSelected?.id === entity.id ? 'selected' : ''}" data-select-geo="${esc(entity.id)}" type="button"><span><strong>${esc(entity.name)}</strong><small>${esc(entity.entityType)} · ${esc(entity.provenance?.adapter || entity.provenance?.source?.name || 'manual')}</small></span><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></button>`).join('') || '<p class="muted empty">No entities are inside the visible map area.</p>';
  list.querySelectorAll('[data-select-geo]').forEach(button => { button.onclick = () => selectGeoEntity(button.dataset.selectGeo); });
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
  inspector.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">ENTITY INSPECTOR</p><h2>${esc(entity.name)}</h2><p class="muted">${esc(entity.programmeSlug)} · ${esc(entity.entityType)} · ${esc(entity.status)}</p></div><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></div>
    <section class="inspector-section"><div class="section-heading"><div><h3>Source comparison</h3><p class="field-help">The imported source snapshot stays beside the platform geometry. Geometry edits create audit history and never rewrite the original provenance.</p></div></div><div class="compare-grid"><div><small class="muted">Source snapshot</small><pre class="data-preview">${esc(JSON.stringify(entity.provenance?.sourceFeature || entity.provenance?.source || {}, null, 2))}</pre></div><div><small class="muted">Current platform geometry</small><pre class="data-preview">${esc(JSON.stringify(currentGeometry || {}, null, 2))}</pre></div></div></section>
    <section class="inspector-section geometry-inspector"><div class="section-heading"><div><h3>Geometry</h3><p class="field-help">Geometry is read-only until you explicitly enter edit mode. Use the map handles to adjust the selected point or polygon.</p></div>${editing ? '<span class="edit-badge">EDIT MODE</span>' : ''}</div>${editing ? `<label class="stacked-field">Geometry change note<textarea id="geo-geometry-note" placeholder="Explain why the geometry was adjusted"></textarea></label><div class="form-actions"><button class="primary" id="geo-save-geometry" type="button">Save geometry</button><button class="secondary" id="geo-cancel-geometry" type="button">Cancel</button></div>` : `<button class="secondary" id="geo-edit-geometry" type="button" ${entity.status === 'RETIRED' ? 'disabled' : ''}>Edit geometry</button><p class="field-help">Editing handles appear only after selecting this button.</p>`}</section>
    <section class="inspector-section"><div class="section-heading"><div><h3>Review decision</h3><p class="field-help">Record the evidence or reason for a lifecycle decision. Approved entities can only be retired so historical QSOs remain valid.</p></div></div><label class="stacked-field">Review note<textarea id="geo-review-note" placeholder="Record the evidence or reason for this decision"></textarea></label><div class="status-review-grid"><label>Status<select id="geo-status-select">${statuses.map(status => `<option value="${status}" ${status === entity.status ? 'selected' : ''}>${status[0] + status.slice(1).toLowerCase()}</option>`).join('')}</select></label><button class="primary" id="geo-save-status" type="button" ${statuses.length === 1 ? 'disabled' : ''}>Save status</button></div><p class="field-help">Status changes are recorded in the entity audit history.</p></section>
    <section class="inspector-section"><h3>Audit history</h3><div class="audit-list">${geoAuditMarkup(audit)}</div></section>
    <section class="inspector-section gis-admin-section"><h3>GIS administration</h3><p class="field-help">Global and GIS administrators can convert point entities to polygons and polygons to points. Rejected entities may be permanently removed together with their audit record.</p><div class="status-review-grid"><label>Geometry type<select id="geo-geometry-type"><option value="POINT" ${entity.geometry?.type === 'Point' ? 'selected' : ''}>Point</option><option value="POLYGON" ${entity.geometry?.type !== 'Point' ? 'selected' : ''}>Polygon</option></select></label><button class="secondary" id="geo-save-type" type="button" ${entity.status === 'RETIRED' ? 'disabled' : ''}>Save type</button></div><textarea id="geo-type-note" placeholder="Explain why the geometry type changed"></textarea>${entity.status === 'REJECTED' ? '<div class="form-actions"><button class="danger-button" id="geo-delete-rejected" type="button">Delete rejected entity permanently</button></div><p class="field-help">Deletion removes the entity and its audit record. It cannot be undone.</p>' : ''}</section>`;
  if (editing) {
    $('geo-save-geometry').onclick = saveGeoLeafletGeometry;
    $('geo-cancel-geometry').onclick = cancelGeoLeafletEdit;
  } else {
    $('geo-edit-geometry').onclick = enterGeoLeafletEdit;
  }
  $('geo-save-status').onclick = saveGeoLeafletStatus;
  $('geo-save-type').onclick = saveGeoLeafletGeometryType;
  if ($('geo-delete-rejected')) $('geo-delete-rejected').onclick = deleteGeoRejected;
  if (editableEntry?.editable && editing) editableEntry.editable.pm?.enable({allowSelfIntersection:false, snappable:true});
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
  const bounds = geoLeafletMap.getBounds();
  const query = new URLSearchParams({pageSize:'100', minLon:String(bounds.getWest()), minLat:String(bounds.getSouth()), maxLon:String(bounds.getEast()), maxLat:String(bounds.getNorth())});
  if ($('geo-programme')?.value) query.set('programme', $('geo-programme').value);
  if ($('geo-status')?.value) query.set('status', $('geo-status').value);
  try {
    const data = await api(`/v1/geodata/entities?${query}`);
    if (requestId !== geoLeafletLoadSequence || !geoLeafletMap) return;
    state.geoLoadedViewportKey = geoViewportKey({minLon:bounds.getWest(), minLat:bounds.getSouth(), maxLon:bounds.getEast(), maxLat:bounds.getNorth()});
    const selectedId = preserveSelection ? state.geoSelected?.id : null;
    state.geoEntities = data.items || [];
    state.geoSelected = selectedId ? state.geoEntities.find(entity => entity.id === selectedId) || null : null;
    $('geo-count').textContent = `${data.total || state.geoEntities.length} entities in the visible map area`;
    renderGeoQueue();
    renderGeoLeafletLayers();
    if (!geoLeafletHasFittedInitialData && state.geoEntities.length) {
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
  if (!panel) return;
  if (!state.geoDrawingActive) { panel.hidden = true; return; }
  const hasGeometry = Boolean(geoLeafletDrawingLayer);
  panel.hidden = false;
  panel.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">MANUAL PROPOSAL</p><h2>New candidate</h2><p class="field-help">Choose a geometry, start drawing, and click the first polygon point to close it. New candidates always enter the review queue as CANDIDATE.</p></div><button class="secondary" id="geo-draw-cancel" type="button">Cancel</button></div><div class="form-grid draw-form"><label>Geometry<select id="geo-draw-mode"><option value="POLYGON" ${state.geoDrawingMode === 'POLYGON' ? 'selected' : ''}>Polygon area</option><option value="POINT" ${state.geoDrawingMode === 'POINT' ? 'selected' : ''}>Point location</option></select><small class="field-help">Use a point when the entity has no boundary.</small></label><label>Name<input id="geo-draw-name" value="${esc(state.geoDrawingDraft?.name || '')}" required></label><label>Entity type<input id="geo-draw-type" value="${esc(state.geoDrawingDraft?.type || 'MUNICIPAL_PARK')}" required></label><label>Jurisdiction<input id="geo-draw-jurisdiction" value="${esc(state.geoDrawingDraft?.jurisdiction || '')}" placeholder="Optional authority or area"></label><label>Attachment URI<input id="geo-draw-attachment" value="${esc(state.geoDrawingDraft?.attachment || '')}" placeholder="Optional evidence URL"></label><div class="form-actions wide"><button class="secondary" id="geo-draw-start" type="button">${hasGeometry ? 'Redraw geometry' : state.geoDrawingActiveNow ? 'Drawing…' : 'Start drawing'}</button><button class="primary" id="geo-draw-submit" type="button" ${hasGeometry ? '' : 'disabled'}>Submit candidate</button></div></div>`;
  $('geo-draw-mode').onchange = event => { state.geoDrawingMode = event.target.value; geoLeafletDrawingLayer?.remove(); geoLeafletDrawingLayer = null; renderGeoDrawPanel(); };
  ['name','type','jurisdiction','attachment'].forEach(key => { $(`geo-draw-${key}`)?.addEventListener('input', event => { state.geoDrawingDraft = {...(state.geoDrawingDraft || {}), [key]:event.target.value}; }); });
  $('geo-draw-cancel').onclick = stopGeoDrawing;
  $('geo-draw-start').onclick = startGeoDrawing;
  $('geo-draw-submit').onclick = submitGeoDrawingLeaflet;
}

function startGeoDrawing() {
  if (!geoLeafletMap) return;
  geoLeafletDrawingLayer?.remove();
  geoLeafletDrawingLayer = null;
  state.geoDrawingActiveNow = true;
  geoLeafletMap.pm?.disableDraw();
  // Use a compact circle for point proposals instead of Leaflet's large
  // default pin icon; the submitted GeoJSON remains a Point geometry.
  geoLeafletMap.pm?.enableDraw(state.geoDrawingMode === 'POINT' ? 'CircleMarker' : 'Polygon', {snappable:true, allowSelfIntersection:false, markerStyle:{radius:8, color:'#123d3a', fillColor:'#10b981', fillOpacity:0.9}});
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
  const programmeSlug = $('geo-programme')?.value || state.currentProgramme || state.programmes[0]?.slug;
  if (!layer || !programmeSlug) return notify('Draw a geometry and select a programme before submitting.', 'error');
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
  $('geo-programme').onchange = () => { state.geoSelected = null; loadGeoReview({preserveSelection:false, force:true}); };
  $('geo-status').onchange = () => loadGeoReview({preserveSelection:true, force:true});
  document.querySelectorAll('[data-geo-layer]').forEach(input => input.onchange = renderGeoLeafletLayers);
  $('geo-import-toggle').onclick = event => { event.preventDefault(); $('geo-import').hidden = !$('geo-import').hidden; if (!$('geo-import').hidden) $('import-features')?.focus(); };
  $('geo-import-form').onsubmit = submitImport;
  $('geo-draw-toggle').onclick = () => { state.geoDrawingActive = !state.geoDrawingActive; if (!state.geoDrawingActive) stopGeoDrawing(); renderGeoDrawPanel(); };
}

renderGeoReview = async function() {
  geoLeafletLoadSequence += 1;
  clearTimeout(geoLeafletViewportTimer);
  if (geoLeafletMap) { geoLeafletMap.remove(); geoLeafletMap = null; }
  geoLeafletLayers = null;
  geoLeafletEntityLayers = new Map();
  geoLeafletHasFittedInitialData = false;
  geoLeafletEditMode = false;
  geoLeafletDrawingLayer = null;
  const view = $('geodata-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">POSTGIS WORKFLOW</p><h1>Geodata review</h1><p class="muted">Review source-backed entities inside the visible map area. Select an item to center the map; enter edit mode only when geometry needs changing.</p></div><button class="secondary" id="geo-refresh" type="button">Refresh map</button></div><div class="toolbar geo-toolbar"><label class="toolbar-field">Programme<select id="geo-programme"><option value="">All programmes</option>${state.programmes.map(p => `<option value="${esc(p.slug)}" ${p.slug === state.currentProgramme ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label class="toolbar-field">Status<select id="geo-status"><option value="">All statuses</option>${GEO_STATUS_ORDER.map(status => `<option value="${status}">${status[0] + status.slice(1).toLowerCase()}</option>`).join('')}</select></label><button class="secondary" id="geo-import-toggle" type="button">Import GeoJSON</button><button class="primary" id="geo-draw-toggle" type="button">New candidate</button></div><div id="geo-import" class="panel geo-import-panel" hidden><div class="panel-heading"><h2>Import GeoJSON</h2><span class="muted">Imported features enter as candidates and retain source metadata.</span></div><form id="geo-import-form" class="form-grid"><label>Programme<select id="import-programme">${state.programmes.map(p => `<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select></label><label>Source name<input id="import-source" value="Manual administration import" required></label><label class="wide">GeoJSON feature collection<textarea id="import-features" required>{"type":"FeatureCollection","features":[]}</textarea></label><div class="form-actions wide"><button class="primary" type="submit">Queue import</button></div></form></div><div class="geo-layout"><aside class="panel geo-sidebar"><div class="panel-heading"><div><p class="eyebrow">VISIBLE QUEUE</p><h2>Entities</h2></div><span id="geo-count" class="muted"></span></div><div class="layer-filter"><strong>Layers</strong><label class="layer-toggle candidate"><input data-geo-layer id="layer-candidate" type="checkbox" checked> Candidate</label><label class="layer-toggle proposed"><input data-geo-layer id="layer-proposed" type="checkbox" checked> Proposed</label><label class="layer-toggle approved"><input data-geo-layer id="layer-approved" type="checkbox" checked> Approved</label><label class="layer-toggle retired"><input data-geo-layer id="layer-retired" type="checkbox" checked> Retired</label><label class="layer-toggle rejected"><input data-geo-layer id="layer-rejected" type="checkbox" checked> Rejected</label></div><p class="map-binding-note">The queue follows the current map bounding box. Panning or zooming refreshes it.</p><div id="geo-entity-list" class="geo-entity-list"></div></aside><section class="geo-center"><div id="geo-map" class="geo-map" role="application" aria-label="OpenStreetMap geodata review map"></div><article id="geo-draw-panel" class="panel geo-draw-panel" hidden></article><article id="geo-inspector" class="panel geo-inspector"><div class="geo-empty-inspector"><p class="eyebrow">ENTITY INSPECTOR</p><h2>Select an entity</h2><p class="muted">Choose an item from the queue to begin review.</p></div></article></section></div>`;
  bindGeoLeafletWorkspace();
  const map = ensureGeoLeafletMap();
  if (!map) return;
  await new Promise(resolve => requestAnimationFrame(resolve));
  map.invalidateSize(false);
  await loadGeoReview({preserveSelection:true, force:true});
};
