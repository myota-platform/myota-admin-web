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
  // A text document may be pasted or uploaded. The submit handler validates
  // that at least one source is present; the textarea must never remain
  // required after a file has been selected.
  $('geo-import-content').required = false;
  $('geo-import-content').removeAttribute('required');
  $('geo-import-content').disabled = !text;
  $('geo-import-file').accept = format === 'SHAPEFILE' ? '.zip,.shp' : format === 'GEOJSON' ? '.json,.geojson' : format === 'KML' ? '.kml' : format === 'GPX' ? '.gpx' : '*/*';
  $('geo-import-format-help').textContent = importFormatHelp(format);
}

function importRunCount(run, key) { return Number(run.stats?.[key] ?? run[key]?.length ?? 0); }

const importCandidateState = new Map();

function candidateState(runId) {
  if (!importCandidateState.has(runId)) importCandidateState.set(runId, {page: 1, pageSize: 25, selected: new Set(), total: 0});
  return importCandidateState.get(runId);
}

function renderImportSummary(run) {
  const stats = [['Pre-processed', 'preprocessed'], ['Entities added', 'created'], ['Entities updated', 'updated'], ['Skipped features', 'skipped'], ['Errors', 'errors']];
  const manifest = run.manifest || {};
  const summary = $('geo-import-summary');
  summary.dataset.runId = run.id || run.importRunId || '';
  summary.innerHTML = `<div class="import-summary-heading"><div><p class="eyebrow">IMPORT RUN</p><h2>${esc(run.filename || run.format || 'Dataset import')}</h2><p class="muted">${esc(run.adapter || 'MANUAL')} · ${esc(run.format || 'GEOJSON')} · ${esc(run.entityTypes?.join(', ') || run.entityType || 'No category')}</p></div><span class="status-pill ${geoStatusClass(run.status)}">${esc(run.status || 'QUEUED')}</span></div><div class="import-summary-metrics">${stats.map(([label,key]) => `<div class="metric"><span>${label}</span><strong>${importRunCount(run, key)}</strong></div>`).join('')}</div><dl class="import-summary-details"><div><dt>Run ID</dt><dd>${esc(run.id || run.importRunId || '')}</dd></div><div><dt>Queued</dt><dd>${esc(run.queuedAt || '')}</dd></div><div><dt>Started</dt><dd>${esc(run.startedAt || 'Not started')}</dd></div><div><dt>Completed</dt><dd>${esc(run.completedAt || 'Still processing')}</dd></div><div><dt>Source</dt><dd>${esc(run.source?.name || 'Not specified')}</dd></div><div><dt>Licence / attribution</dt><dd>${esc([run.source?.license, run.source?.attribution].filter(Boolean).join(' · ') || 'Not specified')}</dd></div><div><dt>Source hash</dt><dd>${esc(run.source?.sha256 || manifest.sourceHash || 'Not available')}</dd></div><div><dt>Source changed</dt><dd>${manifest.sourceChanged == null ? 'Not available' : manifest.sourceChanged ? 'Yes' : 'No'}</dd></div></dl><section id="geo-import-candidates" class="import-candidate-queue"><h3>Validate pre-processed records</h3><p class="field-help">These records have been normalized but are not entities yet. Select records to confirm them, then choose whether the processing queue should create candidates or approve them directly.</p><div class="import-candidate-loading muted">Loading pre-processed records…</div></section>${run.errors?.length ? `<section class="import-summary-errors"><h3>Processing errors</h3><ul>${run.errors.map(error => `<li>${esc(error.message || error.detail || JSON.stringify(error))}</li>`).join('')}</ul></section>` : ''}`;
  const dialog = $('geo-import-modal');
  if (dialog && !dialog.open) dialog.showModal();
}

async function showImportSummary(runId) {
  try {
    const run = await api(`/v1/geodata/imports/${encodeURIComponent(runId)}`);
    renderImportSummary(run);
    await loadImportCandidates(runId);
  } catch (error) { notify(error.message, 'error'); }
}

async function loadImportCandidates(runId, page = candidateState(runId).page) {
  const state = candidateState(runId);
  state.page = page;
  const data = await api(`/v1/geodata/imports/${encodeURIComponent(runId)}/candidates?page=${page}&pageSize=${state.pageSize}`);
  state.total = data.total || 0;
  renderImportCandidateQueue(runId, data);
}

function renderImportCandidateQueue(runId, data) {
  const root = $('geo-import-candidates');
  if (!root) return;
  const state = candidateState(runId);
  const items = data.items || [];
  if (!data.total) {
    root.innerHTML = `<h3>Validate pre-processed records</h3><p class="muted empty">No pre-processed records are available for this run.</p>`;
    return;
  }
  root.innerHTML = `<div class="section-heading"><div><h3>Validate pre-processed records</h3><p class="field-help">Select individual records or select every record in the run. Confirmed records can then be sent to the CANDIDATE or APPROVED queue.</p></div><strong class="muted">${data.total} total</strong></div><div class="import-candidate-toolbar"><label class="checkbox-label"><input type="checkbox" id="geo-import-select-page"> Select page</label><button type="button" class="secondary" id="geo-import-select-all">Select all records</button><label>Page size<select id="geo-import-page-size"><option value="10" ${state.pageSize === 10 ? 'selected' : ''}>10</option><option value="25" ${state.pageSize === 25 ? 'selected' : ''}>25</option><option value="50" ${state.pageSize === 50 ? 'selected' : ''}>50</option></select></label></div><div class="import-candidate-list">${items.map(candidate => `<label class="import-candidate-row"><input type="checkbox" data-import-candidate="${esc(candidate.id)}" ${state.selected.has(candidate.id) ? 'checked' : ''} ${candidate.validationStatus === 'PROCESSED' ? 'disabled' : ''}><span><strong>${esc(candidate.name || 'Unnamed candidate')}</strong><small>${esc(candidate.entityTypes?.join(', ') || 'No category')} · ${esc(candidate.geometry?.type || 'Unknown geometry')} · ${esc(candidate.sourceRef || 'No source reference')}</small></span><span class="status-pill ${geoStatusClass(candidate.validationStatus)}">${esc(candidate.validationStatus || 'PENDING')}</span></label>`).join('')}</div><div class="import-candidate-actions"><button type="button" class="secondary" id="geo-import-confirm-selected">Confirm selected</button><label>Promote as<select id="geo-import-target-status"><option value="CANDIDATE">CANDIDATE</option><option value="APPROVED">APPROVED</option></select></label><button type="button" class="primary" id="geo-import-process-selected">Queue selected</button></div><div class="import-candidate-pagination"><button type="button" class="secondary" id="geo-import-prev" ${data.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${data.page} of ${Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" class="secondary" id="geo-import-next" ${!data.nextPage ? 'disabled' : ''}>Next</button></div>`;
  document.querySelectorAll('[data-import-candidate]').forEach(input => input.onchange = () => input.checked ? state.selected.add(input.dataset.importCandidate) : state.selected.delete(input.dataset.importCandidate));
  $('geo-import-select-page').onchange = event => { items.filter(item => item.validationStatus !== 'PROCESSED').forEach(item => event.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id)); renderImportCandidateQueue(runId, data); };
  $('geo-import-select-all').onclick = () => selectAllImportCandidates(runId);
  $('geo-import-page-size').onchange = event => { state.pageSize = Number(event.target.value); loadImportCandidates(runId, 1).catch(error => notify(error.message, 'error')); };
  $('geo-import-prev').onclick = () => loadImportCandidates(runId, data.page - 1).catch(error => notify(error.message, 'error'));
  $('geo-import-next').onclick = () => loadImportCandidates(runId, data.nextPage).catch(error => notify(error.message, 'error'));
  $('geo-import-confirm-selected').onclick = () => validateImportCandidates(runId);
  $('geo-import-process-selected').onclick = () => processImportCandidates(runId);
}

async function selectAllImportCandidates(runId) {
  const state = candidateState(runId);
  try {
    let page = 1;
    do {
      const data = await api(`/v1/geodata/imports/${encodeURIComponent(runId)}/candidates?page=${page}&pageSize=100`);
      (data.items || []).filter(item => item.validationStatus !== 'PROCESSED').forEach(item => state.selected.add(item.id));
      page = data.nextPage;
    } while (page);
    await loadImportCandidates(runId, state.page);
  } catch (error) { notify(error.message, 'error'); }
}

function selectedImportCandidateIds(runId) { return [...candidateState(runId).selected]; }

async function validateImportCandidates(runId) {
  const candidateIds = selectedImportCandidateIds(runId);
  if (!candidateIds.length) { notify('Select at least one pre-processed record first.', 'error'); return; }
  try {
    await api(`/v1/geodata/imports/${encodeURIComponent(runId)}/candidates/validate`, {method:'POST', body:JSON.stringify({candidateIds, reviewerId:state.account.id, note:'Validated in the import queue'}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify('Selected records confirmed.', 'success'); await showImportSummary(runId);
  } catch (error) { notify(error.message, 'error'); }
}

async function processImportCandidates(runId) {
  const candidateIds = selectedImportCandidateIds(runId);
  if (!candidateIds.length) { notify('Select at least one confirmed record first.', 'error'); return; }
  try {
    const targetStatus = $('geo-import-target-status').value;
    await api(`/v1/geodata/imports/${encodeURIComponent(runId)}/process`, {method:'POST', body:JSON.stringify({candidateIds, targetStatus, processorId:state.account.id, note:'Promoted from the validated import queue'}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    notify(`Selected records queued as ${targetStatus}.`, 'success'); await showImportSummary(runId);
  } catch (error) { notify(error.message, 'error'); }
}

async function refreshImportRuns() {
  try {
    const data = await api('/v1/geodata/imports?pageSize=20');
    $('geo-import-runs').innerHTML = (data.items || []).map(run => `<button type="button" class="table-row import-run-row" data-import-run-id="${esc(run.id)}"><span><strong>${esc(run.filename || run.format || 'Dataset import')}</strong><small>${esc(run.adapter || '')} · ${esc(run.entityTypes?.join(', ') || run.entityType || '')} · ${esc(run.programmeSlug || 'Platform-wide')} · ${esc(run.queuedAt || run.startedAt || '')}</small></span><span class="status-pill ${String(run.status || '').toLowerCase()}">${esc(run.status || 'QUEUED')}</span><span class="muted">View summary</span></button>`).join('') || '<p class="muted empty">No imports have been queued yet.</p>';
    document.querySelectorAll('[data-import-run-id]').forEach(row => row.onclick = () => showImportSummary(row.dataset.importRunId));
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
  const pastedContent = $('geo-import-content').value;
  if (!file && !pastedContent.trim()) { notify('Choose a file or paste a source document before queueing the import.', 'error'); return; }
  if (!file && !['GEOJSON', 'KML', 'GPX', 'WFS', 'ARCGIS_FEATURESERVER'].includes(format)) { notify('This format requires a file upload.', 'error'); return; }
  try {
    let data;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      data = await api('/v1/geodata/imports/upload', {method:'POST', body:JSON.stringify({adapter:$('geo-import-adapter').value, format, entityType, source, filename:file.name, contentBase64:btoa(binary)}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    } else {
      data = await api('/v1/geodata/imports', {method:'POST', body:JSON.stringify({adapter:$('geo-import-adapter').value, format, entityType, source, filename:$('geo-import-filename').value || undefined, content:pastedContent}), headers:{'Idempotency-Key':crypto.randomUUID()}});
    }
    notify(`Import pre-processing queued. Validate the normalized records from the run below.`, 'success');
    $('geo-import-form').reset(); updateImportFormat(); await updateImportCategories(); await refreshImportRuns();
  } catch (error) { notify(error.message, 'error'); }
}

async function renderGeodataImports() {
  const view = $('geodata-imports-view');
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">GEODATA INTAKE</p><h1>Geodata imports</h1><p class="muted">Upload or paste source data, choose a shared entity category, and pre-process it for administrator validation. Imports are platform-wide and are not assigned to a programme.</p></div><button class="secondary" id="geo-import-refresh">Refresh queue</button></div><article class="panel"><div class="panel-heading"><div><h2>Pre-process a dataset</h2><p class="field-help">Text formats can be pasted or uploaded. Binary formats are malware-scanned, stored in object storage, and queued for processing. Large pasted datasets are processed asynchronously and do not become entities until an administrator confirms them.</p></div></div><form id="geo-import-form" class="form-grid" novalidate><label>Entity category<select id="geo-import-category" required></select><small class="field-help">This list comes from the shared Master data catalogue. Programme assignment is handled separately.</small></label><label>Source adapter<select id="geo-import-adapter"><option value="MANUAL">Manual / supplied dataset</option><option value="GOVERNMENT_GIS">Government GIS</option><option value="OSM">OpenStreetMap</option><option value="PARKSERVE_US">ParkServe US</option></select></label><label>File format<select id="geo-import-format">${GEO_IMPORT_FORMATS.map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>Source name<input id="geo-import-source" value="Administration import" required></label><label>Filename (when pasting)<input id="geo-import-filename" placeholder="parks.geojson"></label><label>Licence<input id="geo-import-license" placeholder="e.g. ODbL 1.0"></label><label>Attribution<input id="geo-import-attribution" placeholder="Required source attribution"></label><label class="wide">Source URL<input id="geo-import-source-url" type="url" placeholder="https://…"></label><label class="wide" id="geo-import-content-wrap">Paste source document<textarea id="geo-import-content" rows="14" placeholder="Paste GeoJSON, KML, GPX, WFS or ArcGIS JSON here"></textarea></label><label class="wide" id="geo-import-file-wrap">Upload file<input id="geo-import-file" type="file"><small id="geo-import-format-help" class="field-help"></small></label><div class="form-actions wide"><button class="primary" type="submit">Pre-process import for validation</button></div></form></article><article class="panel"><div class="panel-heading"><div><h2>Recent import runs</h2><p class="field-help">Click an import to view pre-processing status, validation records, promotion queues, source metadata, and errors.</p></div></div><div id="geo-import-runs" class="table-list"></div></article><dialog id="geo-import-modal" class="geo-import-modal"><div id="geo-import-summary"></div><div class="form-actions"><button type="button" class="secondary" id="geo-import-modal-refresh">Refresh summary</button><button type="button" class="primary" id="geo-import-modal-close">Close</button></div></dialog>`;
  const form = $('geo-import-form'); form.noValidate = true; $('geo-import-format').onchange = updateImportFormat; form.onsubmit = submitGeodataImport; $('geo-import-refresh').onclick = refreshImportRuns;
  $('geo-import-modal-close').onclick = () => $('geo-import-modal').close();
  $('geo-import-modal-refresh').onclick = () => { const id = $('geo-import-summary').dataset.runId; if (id) showImportSummary(id); };
  updateImportFormat(); await updateImportCategories(); await refreshImportRuns();
}
