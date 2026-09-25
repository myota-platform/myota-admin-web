function geoViewportBounds() {
  const map = $('geo-map');
  const width = Math.max(map?.clientWidth || 900, 300);
  const height = Math.max(map?.clientHeight || 720, 360);
  const northwest = geoTileUnproject(0, 0, width, height);
  const southeast = geoTileUnproject(width, height, width, height);
  return {minLon:Math.min(northwest[0], southeast[0]), minLat:Math.min(northwest[1], southeast[1]), maxLon:Math.max(northwest[0], southeast[0]), maxLat:Math.max(northwest[1], southeast[1])};
}
function geoViewportKey(bounds) { return [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].map(value => Number(value).toFixed(5)).join(','); }
function scheduleGeoViewportReload() {
  if (state.geoLoading || state.geoViewportReloadTimer) return;
  state.geoViewportReloadTimer = setTimeout(() => { state.geoViewportReloadTimer = null; loadGeoReview(); }, 180);
}
async function loadGeoReview() {
  if (state.geoLoading) return;
  state.geoLoading = true;
  try {
    const bounds = geoViewportBounds();
    const query = new URLSearchParams({pageSize:'100', minLon:String(bounds.minLon), minLat:String(bounds.minLat), maxLon:String(bounds.maxLon), maxLat:String(bounds.maxLat)});
    if ($('geo-programme')?.value) query.set('programme', $('geo-programme').value);
    const data = await api(`/v1/geodata/entities?${query}`);
    state.geoLoadedViewportKey = geoViewportKey(bounds);
    state.geoEntities = data.items || [];
    $('geo-count').textContent = `${data.total} entities in the visible map area`;
    $('geo-entity-list').innerHTML = state.geoEntities.map(entity => `<button class="table-row geo-entity-row ${state.geoSelected?.id === entity.id ? 'selected' : ''}" data-select-geo="${esc(entity.id)}"><span><strong>${esc(entity.name)}</strong><small>${esc(entity.entityType)} · ${esc(entity.provenance?.adapter || 'manual')}</small></span><span class="status-pill ${geoStatusClass(entity.status)}">${esc(entity.status)}</span></button>`).join('') || '<p class="muted empty">No entities in the visible map area.</p>';
    document.querySelectorAll('[data-select-geo]').forEach(button => button.onclick = () => selectGeoEntity(button.dataset.selectGeo));
    if (!state.geoSelected || !state.geoEntities.some(entity => entity.id === state.geoSelected.id)) { state.geoSelected = state.geoEntities[0] || null; state.geoEditingGeometry = cloneJson(state.geoSelected?.geometry); }
    renderGeoMap();
    if (state.geoSelected) await selectGeoEntity(state.geoSelected.id);
  } catch (error) { $('geo-entity-list').innerHTML = `<div class="error-card">${esc(error.message)}</div>`; }
  finally { state.geoLoading = false; }
}
const renderGeoMapWithViewport = renderGeoMap;
renderGeoMap = function() {
  const result = renderGeoMapWithViewport();
  const bounds = geoViewportBounds();
  if (state.geoLoadedViewportKey && geoViewportKey(bounds) !== state.geoLoadedViewportKey) scheduleGeoViewportReload();
  return result;
};
const renderGeoReviewWithViewport = renderGeoReview;
renderGeoReview = async function() {
  await renderGeoReviewWithViewport();
  const heading = $('geo-count');
  if (heading) heading.insertAdjacentHTML('afterend', '<small class="map-binding-note">The queue is limited to the current visible map bounding box.</small>');
};

function bindGeoEntityControls() {
  const inspector = $('geo-inspector');
  const entity = state.geoSelected;
  if (!inspector || !entity || $('geo-entity-controls')) return;
  const type = entity.geometry?.type === 'Point' ? 'POINT' : 'POLYGON';
  const section = document.createElement('section');
  section.id = 'geo-entity-controls';
  section.className = 'geo-status-editor';
  section.innerHTML = `<h3>GIS administration</h3><p class="field-help">Global and GIS administrators can convert point entities to polygons and polygons to points. The previous geometry remains in audit history.</p><div class="geo-status-grid"><label>Geometry type<select id="geo-geometry-type"><option value="POINT" ${type === 'POINT' ? 'selected' : ''}>Point</option><option value="POLYGON" ${type === 'POLYGON' ? 'selected' : ''}>Polygon</option></select></label><label>Change note<textarea id="geo-type-note" placeholder="Explain why the geometry type changed"></textarea></label><button class="secondary" id="geo-save-type" type="button" ${entity.status === 'RETIRED' ? 'disabled' : ''}>Save type</button></div>${entity.status === 'REJECTED' ? '<div class="form-actions"><button class="danger-button" id="geo-delete-rejected" type="button">Delete rejected entity permanently</button></div><p class="field-help">Deletion removes the entity, related conflation candidates, and its audit record. It cannot be undone.</p>' : ''}`;
  inspector.appendChild(section);
  $('geo-save-type').onclick = async () => {
    try { await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/geometry-type`, {method:'POST', body:JSON.stringify({geometryType:$('geo-geometry-type').value, editorId:state.account.id, note:$('geo-type-note').value}), headers:{'Idempotency-Key':crypto.randomUUID()}}); notify('Geometry type changed with audit history', 'success'); await loadGeoReview(); } catch (error) { notify(error.message, 'error'); }
  };
  if ($('geo-delete-rejected')) $('geo-delete-rejected').onclick = async () => {
    if (!confirm(`Permanently delete ${entity.name}? This also deletes its audit record.`)) return;
    try { await api(`/v1/geodata/entities/${encodeURIComponent(entity.id)}/delete`, {method:'POST', body:JSON.stringify({deletedBy:state.account.id}), headers:{'Idempotency-Key':crypto.randomUUID()}}); notify('Rejected entity and audit record deleted', 'success'); state.geoSelected = null; await loadGeoReview(); } catch (error) { notify(error.message, 'error'); }
  };
}
const selectGeoEntityWithEntityControls = selectGeoEntity;
selectGeoEntity = async function(id) { await selectGeoEntityWithEntityControls(id); bindGeoEntityControls(); };

function bindGeoImportControls() {
  const toggle = $('geo-import-toggle');
  const panel = $('geo-import');
  const form = $('geo-import-form');
  if (!toggle || !panel || !form) return;
  toggle.type = 'button';
  toggle.onclick = event => {
    event.preventDefault();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) $('import-features')?.focus();
  };
  form.onsubmit = submitImport;
}
const renderGeoReviewWithImportControls = renderGeoReview;
renderGeoReview = async function() {
  await renderGeoReviewWithImportControls();
  bindGeoImportControls();
};
