const GEO_IMPORT_FORMATS = [
  ['GEOJSON', 'GeoJSON'], ['KML', 'KML'], ['GPX', 'GPX'], ['SHAPEFILE', 'Shapefile archive (.shp/.shx/.dbf or .zip)'],
  ['OSM_PBF', 'OpenStreetMap PBF'], ['PARKSERVE_US', 'ParkServe US'], ['WFS', 'WFS / GeoJSON'], ['ARCGIS_FEATURESERVER', 'ArcGIS FeatureServer']
];

function importFormatHelp(format) {
  return ['GEOJSON', 'KML', 'GPX', 'WFS', 'ARCGIS_FEATURESERVER'].includes(format)
    ? 'Paste the source document into the text area, or choose a file below.'
    : 'Choose a file. Shapefiles must be uploaded as a ZIP containing the .shp, .shx, and .dbf sidecars.';
}

async function loadImportCategories() {
  const data = await api('/v1/entity-types');
  return data.items || [];
}

function updateImportFormat() {
  const format = $('geo-import-format')?.value || 'GEOJSON';
  const text = ['GEOJSON', 'KML', 'GPX', 'WFS', 'ARCGIS_FEATURESERVER'].includes(format);
  $('geo-import-content-wrap').hidden = !text;
  $('geo-import-file-wrap').hidden = false;
  $('geo-import-content').required = text;
  $('geo-import-file').accept = format === 'SHAPEFILE' ? '.zip,.shp' : format === 'GEOJSON' ? '.json,.geojson' : format === 'KML' ? '.kml' : format === 'GPX' ? '.gpx' : '*/*';
  $('geo-import-format-help').textContent = importFormatHelp(format);
}

async function refreshImportRuns() {
  try {
    const data = await api('/v1/geodata/imports?pageSize=20');
    $('geo-import-runs').innerHTML = (data.items || []).map(run => `<div class="table-row"><span><strong>${esc(run.filename || run.format || 'Dataset import')}</strong><small>${esc(run.adapter || '')} · ${esc(run.entityType || '')} · ${esc(run.programmeSlug || 'Platform-wide')} · ${esc(run.queuedAt || run.startedAt || '')}</small></span><span class="status-pill ${String(run.status || '').toLowerCase()}">${esc(run.status || 'QUEUED')}</span></div>`).join('') || '<p class="muted empty">No imports have been queued yet.</p>';
  } catch (error) { $('geo-import-runs').innerHTML = `<div class="error-card">${esc(error.message)}</div>`; }
}

async function updateImportCategories() {
  const categories = await loadImportCategories();
  $('geo-import-category').innerHTML = categories.map(category => `<option value="${esc(category.code)}" ${category.active === false ? 'disabled' : ''}>${esc(category.label || category.code)} · ${esc((category.geometryTypes || [category.geometry || '']).join(', '))}${category.active === false ? ' · inactive' : ''}</option>`).join('');
  if (!categories.length) $('geo-import-category').innerHTML = '<option value="">No shared entity categories configured</option>';
  if (!categories.some(category => category.active !== false)) $('geo-import-category').innerHTML = '<option value="">No active entity categories available</option>';
}

async function submitGeodataImport(event) {
  event.preventDefault();
  const format = $('geo-import-format').value;
  const entityType = $('geo-import-category').value;
  if (!entityType) { notify('Choose a shared feature category before importing.', 'error'); return; }
  const source = {name: $('geo-import-source').value, license: $('geo-import-license').value || 'Not specified', attribution: $('geo-import-attribution').value, url: $('geo-import-source-url').value, retrievedAt: new Date().toISOString()};
  const file = $('geo-import-file').files[0];
  try {
    let data;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      data = await api('/v1/geodata/imports/upload', {method:'POST', body:JSON.stringify({adapter:$('geo-import-adapter').value, format, entityType, source, filename:file.name, contentBase64:btoa(binary)}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    } else {
      data = await api('/v1/geodata/imports', {method:'POST', body:JSON.stringify({adapter:$('geo-import-adapter').value, format, entityType, source, filename:$('geo-import-filename').value || undefined, content:$('geo-import-content').value}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    }
    notify(`Import queued as candidates: ${data.created?.length || 0} created, ${data.updated?.length || 0} updated`, 'success');
    $('geo-import-form').reset(); updateImportFormat(); await updateImportCategories(); await refreshImportRuns();
  } catch (error) { notify(error.message, 'error'); }
}

async function renderGeodataImports() {
  const view = $('geodata-imports-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">GEODATA INTAKE</p><h1>Geodata imports</h1><p class="muted">Upload or paste source data, choose a shared entity category, and queue it for candidate review. Imports are platform-wide and are not assigned to a programme.</p></div><button class="secondary" id="geo-import-refresh">Refresh queue</button></div><article class="panel"><div class="panel-heading"><div><h2>Queue a dataset</h2><p class="field-help">Text formats can be pasted or uploaded. Binary formats are malware-scanned, stored in object storage, and queued for processing.</p></div></div><form id="geo-import-form" class="form-grid"><label>Entity category<select id="geo-import-category" required></select><small class="field-help">This list comes from the shared Master data catalogue. Programme assignment is handled separately.</small></label><label>Source adapter<select id="geo-import-adapter"><option value="MANUAL">Manual / supplied dataset</option><option value="GOVERNMENT_GIS">Government GIS</option><option value="OSM">OpenStreetMap</option><option value="PARKSERVE_US">ParkServe US</option></select></label><label>File format<select id="geo-import-format">${GEO_IMPORT_FORMATS.map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>Source name<input id="geo-import-source" value="Administration import" required></label><label>Filename (when pasting)<input id="geo-import-filename" placeholder="parks.geojson"></label><label>Licence<input id="geo-import-license" placeholder="e.g. ODbL 1.0"></label><label>Attribution<input id="geo-import-attribution" placeholder="Required source attribution"></label><label class="wide">Source URL<input id="geo-import-source-url" type="url" placeholder="https://…"></label><label class="wide" id="geo-import-content-wrap">Paste source document<textarea id="geo-import-content" rows="14" placeholder="Paste GeoJSON, KML, GPX, WFS or ArcGIS JSON here"></textarea></label><label class="wide" id="geo-import-file-wrap">Upload file<input id="geo-import-file" type="file"><small id="geo-import-format-help" class="field-help"></small></label><div class="form-actions wide"><button class="primary" type="submit">Queue import as candidates</button></div></form></article><article class="panel"><div class="panel-heading"><div><h2>Recent import runs</h2><p class="field-help">Processing status and source provenance remain visible here after the review page receives the candidate entities.</p></div></div><div id="geo-import-runs" class="table-list"></div></article>`;
  $('geo-import-format').onchange = updateImportFormat; $('geo-import-form').onsubmit = submitGeodataImport; $('geo-import-refresh').onclick = refreshImportRuns;
  updateImportFormat(); await updateImportCategories(); await refreshImportRuns();
}
