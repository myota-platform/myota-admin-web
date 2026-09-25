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
    state.geoDrawing = [];
    state.geoDrawingMode = 'POLYGON';
    state.geoDrawingClosed = false;
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
  const mode = state.geoDrawingMode || 'POLYGON';
  const draft = {
    name: $('geo-draw-name')?.value || '',
    type: $('geo-draw-type')?.value || 'MUNICIPAL_PARK',
    jurisdiction: $('geo-draw-jurisdiction')?.value || '',
    attachment: $('geo-draw-attachment')?.value || ''
  };
  const ready = mode === 'POINT' ? state.geoDrawing.length === 1 : state.geoDrawing.length >= 3 && state.geoDrawingClosed;
  const instruction = mode === 'POINT'
    ? 'Click once on the map to mark the entity location.'
    : 'Click at least three points, then click the first point or nearby to close the polygon.';
  const progress = mode === 'POINT'
    ? `${state.geoDrawing.length ? 'Point placed' : 'No point placed yet'}.`
    : `${state.geoDrawing.length} point${state.geoDrawing.length === 1 ? '' : 's'} recorded${state.geoDrawingClosed ? ' · polygon closed' : ' · click the first point to close'}.`;
  panel.innerHTML = `<div class="panel-heading"><div><h2>Draw candidate proposal</h2><small class="muted">${instruction}</small></div><span class="status-pill candidate">CANDIDATE</span></div><div class="form-grid"><label>Geometry<select id="geo-draw-mode"><option value="POLYGON" ${mode === 'POLYGON' ? 'selected' : ''}>Polygon area</option><option value="POINT" ${mode === 'POINT' ? 'selected' : ''}>Point location</option></select><small class="field-help">Use a polygon for an area or a point for a location that has no boundary.</small></label><label>Name<input id="geo-draw-name" value="${esc(draft.name)}" placeholder="Place name" required></label><label>Entity type<input id="geo-draw-type" value="${esc(draft.type)}" required></label><label>Jurisdiction<input id="geo-draw-jurisdiction" value="${esc(draft.jurisdiction)}" placeholder="Optional authority or area"></label><label>Attachment URI<input id="geo-draw-attachment" value="${esc(draft.attachment)}" placeholder="Optional evidence URL"></label><div class="form-actions wide"><button class="secondary" type="button" id="geo-draw-undo" ${state.geoDrawing.length ? '' : 'disabled'}>Undo last point</button><button class="primary" type="button" id="geo-draw-submit" ${ready ? '' : 'disabled'}>Submit candidate</button></div><p class="field-help wide">${progress} Geometry is validated and normalized to WGS84 by the geodata service.</p></div>`;
  $('geo-draw-mode').onchange = event => { state.geoDrawingMode = event.target.value; state.geoDrawing = []; state.geoDrawingClosed = false; renderGeoDrawPanel(); renderGeoMap(); };
  $('geo-draw-undo').onclick = () => { if (mode === 'POLYGON' && state.geoDrawingClosed) state.geoDrawingClosed = false; else state.geoDrawing.pop(); renderGeoDrawPanel(); renderGeoMap(); };
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
    const shape = state.geoDrawingMode === 'POLYGON' && state.geoDrawingClosed
      ? `<polygon class="geo-drawing-area" points="${points.map(point => point.join(',')).join(' ')}"/>`
      : `<polyline class="geo-drawing-line" points="${points.map(point => point.join(',')).join(' ')}"/>`;
    svg.insertAdjacentHTML('beforeend', `${shape}<g class="geo-drawing-points">${points.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="5"/>`).join('')}</g>`);
  }
  if (map.dataset.geoDrawingBound === 'true') return;
  map.dataset.geoDrawingBound = 'true';
  map.addEventListener('click', event => {
    if (!state.geoDrawingActive || event.target.closest('[data-geo-id]') || event.target.closest('[data-vertex]') || event.target.closest('.geo-map-controls') || event.target.closest('.geo-attribution')) return;
    const activeSvg = $('geo-svg');
    if (!activeSvg) return;
    const rect = activeSvg.getBoundingClientRect();
    const activeWidth = Number(activeSvg.viewBox.baseVal.width) || Math.max(activeSvg.clientWidth, 300);
    const activeHeight = Number(activeSvg.viewBox.baseVal.height) || 720;
    const coordinate = geoTileUnproject(((event.clientX - rect.left) / rect.width) * activeWidth, ((event.clientY - rect.top) / rect.height) * activeHeight, activeWidth, activeHeight);
    if (state.geoDrawingMode === 'POINT') {
      state.geoDrawing = [coordinate];
    } else {
      const first = state.geoDrawing[0];
      if (first && state.geoDrawing.length >= 3) {
        const firstPoint = geoTileProject(first, activeWidth, activeHeight);
        const clickedPoint = geoTileProject(coordinate, activeWidth, activeHeight);
        if (Math.hypot(firstPoint[0] - clickedPoint[0], firstPoint[1] - clickedPoint[1]) <= 18) {
          state.geoDrawingClosed = true;
          renderGeoDrawPanel();
          renderGeoMap();
          return;
        }
      }
      if (!state.geoDrawingClosed) state.geoDrawing.push(coordinate);
    }
    renderGeoDrawPanel();
    renderGeoMap();
  }, {capture: true});
}
async function submitGeoDrawing() {
  const mode = state.geoDrawingMode || 'POLYGON';
  if (!state.geoDrawing || (mode === 'POINT' ? state.geoDrawing.length !== 1 : state.geoDrawing.length < 3 || !state.geoDrawingClosed)) return;
  const geometry = mode === 'POINT'
    ? {type: 'Point', coordinates: state.geoDrawing[0]}
    : {type: 'Polygon', coordinates: [[...state.geoDrawing, state.geoDrawing[0]]]};
  const attachmentUri = $('geo-draw-attachment').value.trim();
  const attachments = attachmentUri ? [{name: attachmentUri.split('/').pop() || 'evidence', mediaType: 'application/octet-stream', uri: attachmentUri}] : [];
  try {
    await api('/v1/geodata/proposals/draw', {method:'POST', body:JSON.stringify({programmeSlug:$('geo-programme').value || state.currentProgramme || state.programmes[0]?.slug, source:{name:'Manual administration proposal',license:'programme-supplied'}, feature:{properties:{name:$('geo-draw-name').value.trim(),entityType:$('geo-draw-type').value.trim() || 'MUNICIPAL_PARK',jurisdiction:$('geo-draw-jurisdiction').value.trim() || undefined},geometry}, attachments}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Candidate proposal submitted','success');
    state.geoDrawingActive = false; state.geoDrawing = []; state.geoDrawingClosed = false;
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
