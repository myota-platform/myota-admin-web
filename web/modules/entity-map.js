// Read-only map of the complete geodata catalogue for administrators.
// This deliberately has independent state from the review map: selecting an
// entity here opens context only and never starts geometry editing.
let entityMapLeafletMap = null;
let entityMapLayerGroup = null;
let entityMapLoadSequence = 0;
let entityMapHasFitted = false;

const ENTITY_MAP_DEFAULT_CENTER = [37.395, -5.995];
const ENTITY_MAP_DEFAULT_ZOOM = 12;

function entityMapStatusStyle(status) {
  const colors = {
    CANDIDATE: {fill:'#fbbf24', stroke:'#7c5410'},
    PROPOSED: {fill:'#8b5cf6', stroke:'#4c1d95'},
    APPROVED: {fill:'#10b981', stroke:'#065f46'},
    RETIRED: {fill:'#64748b', stroke:'#334155'},
    REJECTED: {fill:'#ef4444', stroke:'#991b1b'}
  };
  const color = colors[String(status || '').toUpperCase()] || colors.CANDIDATE;
  return {color:color.stroke, fillColor:color.fill, fillOpacity:0.3, weight:2, radius:8};
}

function entityMapCodes(entity) {
  return geoEntityCodes(entity);
}

function entityMapCategoryLabel(code) {
  const item = (state.entityTypeCatalogue || []).find(candidate => String(candidate.code).toUpperCase() === code);
  return item?.label ? `${item.label} (${code})` : code;
}

function entityMapProgrammeNames(entity) {
  const codes = new Set(entityMapCodes(entity));
  const names = new Map();
  const explicit = entity.programmes || entity.programmeSlugs || entity.programmeSlug;
  const explicitValues = Array.isArray(explicit) ? explicit : explicit ? [explicit] : [];
  explicitValues.forEach(value => {
    const slug = typeof value === 'object' ? value.slug : value;
    if (!slug) return;
    const programme = state.programmes.find(item => item.slug === slug);
    names.set(slug, programme?.name || slug);
  });
  state.programmes.forEach(programme => {
    const assigned = new Set((programme.entityTypeCodes || programme.entityTypes || []).map(item => String(item?.code || item || '').toUpperCase()).filter(Boolean));
    if ([...codes].some(code => assigned.has(code))) names.set(programme.slug, programme.name || programme.slug);
  });
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function entityMapLocationRows(entity) {
  const location = entity.location || {};
  const value = field => entity[field] ?? location[field];
  const rows = [
    ['Continent', value('continent')],
    ['Country', value('country')],
    ['Region', value('region') || value('subdivision')],
    ['Province', value('province')],
    ['County', value('county')],
    ['City / municipality', value('city') || value('municipality')]
  ].filter(([, item]) => String(item || '').trim());
  return rows.map(([label, item]) => `<div class="entity-map-popup-row"><dt>${esc(label)}</dt><dd>${esc(item)}</dd></div>`).join('') || '<div class="muted">No location metadata recorded</div>';
}

function entityMapPopup(entity) {
  const categories = entityMapCodes(entity).map(entityMapCategoryLabel).join(', ') || 'No category assigned';
  const programmes = entityMapProgrammeNames(entity);
  const programmeMarkup = programmes.length ? programmes.map(name => `<li>${esc(name)}</li>`).join('') : '<li class="muted">Not assigned to a programme</li>';
  const status = String(entity.status || '').toUpperCase();
  return `<div class="entity-map-popup"><h3>${esc(entity.name || 'Unnamed entity')}</h3><div class="entity-map-popup-status"><span class="status-pill ${geoStatusClass(status)}">${esc(status || 'UNKNOWN')}</span><span>${esc(entity.geometry?.type || 'Unknown geometry')}</span></div><dl class="entity-map-popup-location">${entityMapLocationRows(entity)}</dl><p class="entity-map-popup-label">Categories</p><p>${esc(categories)}</p><p class="entity-map-popup-label">Programmes</p><ul>${programmeMarkup}</ul></div>`;
}

function entityMapFeature(entity) {
  return {type:'Feature', id:entity.id, properties:{name:entity.name, status:entity.status}, geometry:entity.geometry};
}

function entityMapCreateLayer(entity) {
  const style = entityMapStatusStyle(entity.status);
  const geometryType = entity.geometry?.type;
  const pathStyle = ['LineString', 'MultiLineString'].includes(geometryType) ? {...style, dashArray:'8 6', lineCap:'round', lineJoin:'round'} : style;
  const group = L.geoJSON(entityMapFeature(entity), {
    style:pathStyle,
    pointToLayer:(_feature, latlng) => L.circleMarker(latlng, style)
  });
  group.bindPopup(entityMapPopup(entity), {maxWidth:340, minWidth:250});
  group.bindTooltip(`${entity.name || 'Unnamed entity'} · ${entity.status || 'UNKNOWN'}`, {direction:'top', sticky:true});
  return group;
}

function entityMapRenderLayers(entities) {
  if (!entityMapLeafletMap) return;
  entityMapLayerGroup?.remove();
  entityMapLayerGroup = L.featureGroup().addTo(entityMapLeafletMap);
  entities.filter(entity => entity.geometry).forEach(entity => entityMapCreateLayer(entity).addTo(entityMapLayerGroup));
  const count = $('entity-map-count');
  if (count) count.textContent = `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`;
  if (!entityMapHasFitted && entities.length) {
    const bounds = entityMapLayerGroup.getBounds();
    if (bounds.isValid()) entityMapLeafletMap.fitBounds(bounds, {padding:[36,36], maxZoom:15});
    entityMapHasFitted = true;
  }
}

function ensureEntityMap() {
  const container = $('entity-map-canvas');
  if (!container) return null;
  if (entityMapLeafletMap) return entityMapLeafletMap;
  if (!window.L || !L.map || !L.GeoJSON) {
    container.innerHTML = '<div class="error-card">The entity map could not be loaded. Refresh the page or contact an administrator.</div>';
    return null;
  }
  entityMapLeafletMap = L.map(container, {center:ENTITY_MAP_DEFAULT_CENTER, zoom:ENTITY_MAP_DEFAULT_ZOOM, minZoom:2, maxZoom:19, worldCopyJump:false, preferCanvas:true, zoomControl:false, attributionControl:true});
  L.control.zoom({position:'topleft'}).addTo(entityMapLeafletMap);
  L.tileLayer(window.MYOTA_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19,
    maxNativeZoom:19,
    noWrap:true,
    keepBuffer:1,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Report a map issue</a>'
  }).addTo(entityMapLeafletMap);
  return entityMapLeafletMap;
}

async function loadAllEntityMapEntities() {
  const sequence = ++entityMapLoadSequence;
  const items = [];
  let page = 1;
  do {
    const data = await api(`/v1/geodata/entities?page=${page}&pageSize=100`);
    items.push(...(data.items || []));
    if (!data.nextPage) break;
    page = data.nextPage;
  } while (page <= 1000);
  if (sequence !== entityMapLoadSequence) return;
  state.entityMapEntities = items;
  entityMapRenderLayers(items);
  const empty = $('entity-map-empty');
  if (empty) empty.hidden = items.length > 0;
}

async function renderEntityMap() {
  entityMapLoadSequence += 1;
  entityMapLeafletMap?.remove();
  entityMapLeafletMap = null;
  entityMapLayerGroup = null;
  entityMapHasFitted = false;
  const view = $('entity-map-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">GEODATA CATALOGUE</p><h1>Entity map</h1><p class="muted">Browse all stored entities. Select a shape to inspect its metadata, categories, and programme memberships.</p></div><button class="secondary" id="entity-map-refresh" type="button">Refresh map</button></div><article class="panel entity-map-panel"><div class="panel-heading"><div><h2>All entities</h2><small class="muted">Colours show lifecycle status. The map is read-only.</small></div><span id="entity-map-count" class="muted">Loading…</span></div><div id="entity-map-canvas" class="entity-map-canvas"></div><p id="entity-map-empty" class="muted empty" hidden>No entities with geometry were found.</p></article>`;
  $('entity-map-refresh').onclick = () => loadAllEntityMapEntities().catch(error => notify(error.message, 'error'));
  const map = ensureEntityMap();
  if (!map) return;
  try {
    if (!state.entityTypeCatalogue?.length) {
      try { await loadEntityTypeCatalogue(); } catch (_) {}
    }
    await loadAllEntityMapEntities();
    setTimeout(() => map.invalidateSize(), 0);
  } catch (error) {
    $('entity-map-count').textContent = 'Unavailable';
    $('entity-map-canvas').innerHTML = `<div class="error-card">${esc(error.message)}</div>`;
  }
}
