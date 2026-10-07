<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiRequest } from '../lib/api';
import { useAppStore } from '../stores/app';
import LeafletMap from '../components/LeafletMap.vue';
import type { EntityCategory, GeoEntity } from '../types';

interface ImportRun { id: string; filename?: string; format?: string; adapter?: string; status?: string; source?: string | Record<string, unknown>; entityType?: string; entityTypes?: string[]; entityCount?: number; processedCount?: number; candidateCount?: number; errorCount?: number; createdAt?: string; updatedAt?: string; queuedAt?: string; startedAt?: string; message?: string; stats?: Record<string, unknown>; errors?: unknown[]; }
interface DuplicateMatch extends GeoEntity { entityId?: string; distanceMeters?: number; matchType?: string; }
interface ImportCandidate { id: string; ordinal?: number; name?: string; geom?: { type: string; coordinates: unknown }; geometry?: { type: string; coordinates: unknown }; validationStatus?: string; validationNote?: string; targetStatus?: string; possibleDuplicate?: boolean; duplicateEntity?: DuplicateMatch; possibleDuplicates?: DuplicateMatch[]; processedEntityId?: string; sourceRef?: string; entityTypes?: string[]; }
const store = useAppStore();
const categories = ref<EntityCategory[]>([]); const imports = ref<ImportRun[]>([]); const preprocessingRuns = ref<ImportRun[]>([]); const selectedRun = ref<ImportRun | null>(null); const candidates = ref<ImportCandidate[]>([]); const selectedCandidateIds = ref<string[]>([]); const page = ref(1); const pageSize = ref(20); const totalCandidates = ref(0); const importPage = ref(1); const importPageSize = 10; const importTotal = ref(0);
const format = ref('GEOJSON'); const adapter = ref('MANUAL'); const entityType = ref(''); const filename = ref(''); const source = ref('MANUAL'); const sourceLicense = ref(''); const sourceAttribution = ref(''); const sourceUrl = ref(''); const content = ref(''); const file = ref<File | null>(null); const busy = ref(false); const selectingAll = ref(false); const message = ref(''); const error = ref('');
const uploadProgress = ref(0);
const formats = ['GEOJSON', 'OSM_GEOJSON', 'KML', 'GPX', 'SHAPEFILE', 'OSM_PBF', 'PARKSERVE_US', 'WFS', 'ARCGIS_FEATURESERVER'];
const activeImports = computed(() => preprocessingRuns.value.filter(item => !['PROCESSED', 'FAILED', 'REJECTED'].includes(String(item.status || '').toUpperCase())));
const preprocessingImports = computed(() => preprocessingRuns.value.filter(item => !['PROCESSED', 'FAILED', 'REJECTED', 'COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(String(item.status || '').toUpperCase())));
const allSelected = computed(() => totalCandidates.value > 0 && selectedCandidateIds.value.length >= totalCandidates.value);
const candidateDetail = ref<ImportCandidate | null>(null); const candidateMapEntities = ref<GeoEntity[]>([]);

function unwrap<T>(data: T | { items?: T }): T { return (data && typeof data === 'object' && 'items' in (data as object) ? (data as { items: T }).items : data) as T; }
function setError(value: unknown): void { error.value = value instanceof Error ? value.message : String(value); }
async function loadCategories(): Promise<void> { try { const data = await apiRequest<{ items: EntityCategory[] }>('/v1/entity-types'); categories.value = data.items || []; } catch (e) { setError(e); } }
async function loadImports(): Promise<void> { try { const [history, active] = await Promise.all([apiRequest<{ items: ImportRun[]; total?: number }>(`/v1/geodata/imports?page=${importPage.value}&pageSize=${importPageSize}`), apiRequest<{ items: ImportRun[] }>('/v1/geodata/imports?page=1&pageSize=100')]); imports.value = history.items || []; importTotal.value = Number(history.total ?? imports.value.length); preprocessingRuns.value = active.items || []; } catch (e) { setError(e); } }
async function setImportPage(nextPage: number): Promise<void> { const pageCount = Math.max(1, Math.ceil(importTotal.value / importPageSize)); importPage.value = Math.min(Math.max(1, nextPage), pageCount); await loadImports(); }
async function queueImport(): Promise<void> {
  error.value = ''; message.value = '';
  if (!entityType.value) { error.value = 'Select the entity category for this dataset.'; return; }
  if (!file.value && !content.value.trim()) { error.value = 'Choose a file or paste source data.'; return; }
  if (!file.value && ['SHAPEFILE', 'OSM_PBF'].includes(format.value)) { error.value = `${format.value} must be uploaded as a file.`; return; }
  busy.value = true;
  try {
    const requestFormat = format.value === 'OSM_GEOJSON' ? 'GEOJSON' : format.value;
    const requestAdapter = format.value === 'OSM_GEOJSON' ? 'OSM' : adapter.value;
    const sourceMetadata = { name: source.value, license: sourceLicense.value || 'Not specified', attribution: sourceAttribution.value, url: sourceUrl.value, retrievedAt: new Date().toISOString() };
    if (file.value) {
      await uploadResumableFile(file.value, requestAdapter, requestFormat, sourceMetadata);
    } else {
      await apiRequest('/v1/geodata/imports', { method: 'POST', body: JSON.stringify({ adapter: requestAdapter, format: requestFormat, entityType: entityType.value, source: sourceMetadata, filename: filename.value || `pasted-${format.value.toLowerCase()}`, content: content.value }), headers: { 'Idempotency-Key': crypto.randomUUID() } });
    }
    content.value = ''; file.value = null; filename.value = ''; sourceLicense.value = ''; sourceAttribution.value = ''; sourceUrl.value = ''; message.value = 'Import queued for preprocessing as candidate entities.'; await loadImports();
  } catch (e) { setError(e); } finally { busy.value = false; }
}
async function uploadResumableFile(selectedFile: File, selectedAdapter: string, selectedFormat: string, sourceMetadata: Record<string, unknown>): Promise<void> {
  const identity = `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}:${selectedAdapter}:${selectedFormat}:${entityType.value}`;
  const identityDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const createKey = Array.from(new Uint8Array(identityDigest), value => value.toString(16).padStart(2, '0')).join('');
  const storageKey = `myota-geodata-upload:${createKey}`;
  const metadata = { adapter: selectedAdapter, format: selectedFormat, entityTypes: [entityType.value], source: sourceMetadata, filename: selectedFile.name, expectedSize: selectedFile.size };
  let uploadId = localStorage.getItem(storageKey) || '';
  let session: { uploadId: string; partSizeBytes: number; parts?: { partNumber: number }[]; status?: string; importRunId?: string } | null = null;
  if (uploadId) {
    try { session = await apiRequest<typeof session>(`/v1/geodata/import-uploads/${encodeURIComponent(uploadId)}`); }
    catch { localStorage.removeItem(storageKey); uploadId = ''; }
  }
  if (!uploadId || !session) {
    session = await apiRequest<typeof session>('/v1/geodata/import-uploads', { method: 'POST', body: JSON.stringify(metadata), headers: { 'Idempotency-Key': createKey } });
    if (!session?.uploadId) throw new Error('The upload session could not be created.');
    uploadId = session.uploadId;
    localStorage.setItem(storageKey, uploadId);
  }
  if (session.status === 'COMPLETED') { localStorage.removeItem(storageKey); uploadProgress.value = 100; return; }
  if (session.status === 'COMPLETING') {
    await apiRequest(`/v1/geodata/import-uploads/${encodeURIComponent(uploadId)}/complete`, { method: 'POST', body: '{}' });
    localStorage.removeItem(storageKey);
    uploadProgress.value = 100;
    return;
  }
  const partSize = Math.max(5 * 1024 * 1024, Number(session.partSizeBytes || 16 * 1024 * 1024));
  const uploadedParts = new Set((session.parts || []).map(part => Number(part.partNumber)));
  const partCount = Math.ceil(selectedFile.size / partSize);
  for (let index = 0; index < partCount; index += 1) {
    const partNumber = index + 1;
    const start = index * partSize;
    const end = Math.min(selectedFile.size, start + partSize);
    if (uploadedParts.has(partNumber)) { uploadProgress.value = Math.min(99, Math.round(end / selectedFile.size * 100)); continue; }
    const part = selectedFile.slice(start, end);
    const partDigest = await crypto.subtle.digest('SHA-256', await part.arrayBuffer());
    const partSha256 = Array.from(new Uint8Array(partDigest), value => value.toString(16).padStart(2, '0')).join('');
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await apiRequest(`/v1/geodata/import-uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`, { method: 'POST', body: part, headers: { 'Content-Type': 'application/octet-stream', 'X-Part-SHA256': partSha256 } });
        lastError = null;
        break;
      } catch (cause) { lastError = cause; await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1))); }
    }
    if (lastError) throw lastError;
    uploadProgress.value = Math.min(99, Math.round(end / selectedFile.size * 100));
  }
  await apiRequest(`/v1/geodata/import-uploads/${encodeURIComponent(uploadId)}/complete`, { method: 'POST', body: '{}' });
  localStorage.removeItem(storageKey);
  uploadProgress.value = 100;
}
function chooseFile(event: Event): void { file.value = (event.target as HTMLInputElement).files?.[0] || null; if (file.value) filename.value = file.value.name; }
async function selectRun(run: ImportRun): Promise<void> { page.value = 1; selectedCandidateIds.value = []; try { selectedRun.value = await apiRequest<ImportRun>(`/v1/geodata/imports/${encodeURIComponent(run.id)}`); } catch { selectedRun.value = run; } await loadCandidates(); }
async function loadCandidates(): Promise<void> { if (!selectedRun.value) return; try { const data = await apiRequest<{ items: ImportCandidate[]; total?: number }>(`/v1/geodata/imports/${encodeURIComponent(selectedRun.value.id)}/candidates?page=${page.value}&pageSize=${pageSize.value}`); candidates.value = data.items || []; totalCandidates.value = Number(data.total || candidates.value.length); } catch (e) { setError(e); } }
async function toggleAll(): Promise<void> {
  if (selectingAll.value) return;
  if (allSelected.value) { selectedCandidateIds.value = []; return; }
  const run = selectedRun.value;
  if (!run) return;
  selectingAll.value = true;
  try {
    const ids: string[] = [];
    let nextPage: number | undefined = 1;
    while (nextPage !== undefined) {
      const requestedPage: number = nextPage;
      const endpoint = `/v1/geodata/imports/${encodeURIComponent(run.id)}/candidates?page=${requestedPage}&pageSize=100`;
      const data: { items: ImportCandidate[]; nextPage?: number } = await apiRequest<{ items: ImportCandidate[]; nextPage?: number }>(endpoint);
      const pageItems: ImportCandidate[] = data.items || [];
      ids.push(...pageItems.filter((item: ImportCandidate) => (item.validationStatus || 'PENDING') === 'PENDING').map((item: ImportCandidate) => item.id));
      nextPage = data.nextPage || (pageItems.length === 100 ? requestedPage + 1 : undefined);
    }
    selectedCandidateIds.value = ids;
  } catch (e) { setError(e); } finally { selectingAll.value = false; }
}
function toggleCandidate(id: string): void { selectedCandidateIds.value = selectedCandidateIds.value.includes(id) ? selectedCandidateIds.value.filter(item => item !== id) : [...selectedCandidateIds.value, id]; }
async function rejectCandidates(): Promise<void> { if (!selectedRun.value || !selectedCandidateIds.value.length) return; try { await apiRequest(`/v1/geodata/imports/${encodeURIComponent(selectedRun.value.id)}/candidates/validate`, { method: 'POST', body: JSON.stringify({ candidateIds: selectedCandidateIds.value, validationStatus: 'REJECTED', reviewerId: store.account?.id || 'administrator' }), headers: { 'Idempotency-Key': crypto.randomUUID() } }); selectedCandidateIds.value = []; message.value = 'Rejected records were removed from the import.'; await loadCandidates(); await loadImports(); } catch (e) { setError(e); } }
async function processCandidates(targetStatus: 'CANDIDATE' | 'APPROVED'): Promise<void> { if (!selectedRun.value || !selectedCandidateIds.value.length) return; const selectedCount = selectedCandidateIds.value.length; try { await apiRequest(`/v1/geodata/imports/${encodeURIComponent(selectedRun.value.id)}/process`, { method: 'POST', body: JSON.stringify({ candidateIds: selectedCandidateIds.value, targetStatus, processorId: store.account?.id || 'administrator' }), headers: { 'Idempotency-Key': crypto.randomUUID() } }); selectedCandidateIds.value = []; message.value = `${selectedCount} selected record${selectedCount === 1 ? '' : 's'} queued for promotion to ${targetStatus.toLowerCase()}.`; await loadCandidates(); await loadImports(); } catch (e) { setError(e); } }
async function markProcessed(): Promise<void> { if (!selectedRun.value || !window.confirm('Mark this import as processed and remove its pending candidate records?')) return; try { await apiRequest(`/v1/geodata/imports/${encodeURIComponent(selectedRun.value.id)}/processed`, { method: 'POST', body: JSON.stringify({ processedBy: store.account?.id }) }); message.value = 'Import marked as processed.'; await loadImports(); selectedRun.value = null; candidates.value = []; } catch (e) { setError(e); } }
function duplicateMatches(item: ImportCandidate): DuplicateMatch[] { const matches = item.possibleDuplicates?.length ? item.possibleDuplicates : item.duplicateEntity ? [item.duplicateEntity] : []; return matches.map((match, index) => ({ ...match, id: match.id || match.entityId || `${item.id}-duplicate-${index}` })); }
function candidateEntity(item: ImportCandidate): GeoEntity { return { id: item.id, name: item.name || 'Pre-processed entity', status: item.targetStatus || 'CANDIDATE', geometry: item.geometry || item.geom }; }
function openCandidate(item: ImportCandidate): void { candidateDetail.value = item; candidateMapEntities.value = [candidateEntity(item), ...duplicateMatches(item)]; }
function closeCandidate(): void { candidateDetail.value = null; candidateMapEntities.value = []; }
onMounted(async () => { await Promise.all([loadCategories(), loadImports()]); });
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">GEODATA PIPELINE</p><h1>Geodata imports</h1><p class="muted">Upload or paste a source dataset, preprocess it, review duplicates, then promote selected records to candidates or approved entities.</p></div><button class="secondary" @click="loadImports">Refresh history</button></section>
  <div v-if="message" class="notice" role="status">{{ message }}</div><div v-if="error" class="error-card" role="alert">{{ error }}</div>
  <article class="panel"><div class="panel-heading"><div><h2>Queue a dataset</h2><p class="field-help">All imports start as candidate records. Binary formats must be uploaded; text formats may be pasted or uploaded. Files upload in resumable chunks to object storage.</p></div></div><form class="form-grid" @submit.prevent="queueImport"><label>Format<select v-model="format"><option v-for="item in formats" :key="item" :value="item">{{ item }}</option></select><small class="field-help">OSM GeoJSON is submitted through the OSM adapter automatically.</small></label><label>Adapter<select v-model="adapter"><option value="MANUAL">Manual upload</option><option value="OSM">OpenStreetMap</option><option value="PARKSERVE_US">ParkServe US</option><option value="WFS">WFS / ArcGIS</option><option value="LOCAL_GIS">Local government GIS</option></select></label><label>Feature category<select v-model="entityType" required><option value="">Select a category…</option><option v-for="category in categories" :key="category.code" :value="category.code">{{ category.label || category.code }}</option></select></label><label>Source label<input v-model="source" placeholder="OSM, municipal GIS, manual proposal…"></label><label>Licence<input v-model="sourceLicense" placeholder="e.g. ODbL 1.0"></label><label>Attribution<input v-model="sourceAttribution" placeholder="Required source attribution"></label><label class="wide">Source URL<input v-model="sourceUrl" type="url" placeholder="https://…"></label><label class="wide">Paste source document<textarea v-model="content" :placeholder="file ? `File selected: ${file.name}` : 'Paste GeoJSON, KML, GPX, WFS or ArcGIS JSON here'"></textarea><small class="field-help">The text is optional when a file is selected. Shapefile and OSM PBF require a file.</small></label><label class="wide">Upload file<input type="file" accept=".json,.geojson,.kml,.gpx,.zip,.shp,.pbf,.csv" @change="chooseFile"><small v-if="file" class="field-help">Selected: {{ file.name }} ({{ Math.round(file.size / 1024) }} KB)</small></label><label v-if="!file">Source filename<input v-model="filename" placeholder="dataset.geojson"></label><div v-if="busy && file" class="wide"><progress :value="uploadProgress" max="100"></progress><small>{{ uploadProgress }}% uploaded</small></div><div class="form-actions wide"><button class="primary" :disabled="busy" type="submit">{{ busy ? `Uploading… ${uploadProgress}%` : 'Queue preprocessing' }}</button></div></form></article>
  <div class="split-layout imports-workspace"><article class="panel import-queue-panel"><div class="panel-heading"><div><h2>Pre-processing queue</h2><small class="muted">{{ preprocessingImports.length }} awaiting validation</small></div><span class="status-pill queued">Separate from review</span></div><div class="table-list"><button v-for="run in preprocessingImports" :key="`pre-${run.id}`" class="table-row" :class="{ selected: selectedRun?.id === run.id }" @click="selectRun(run)"><span><strong>{{ run.filename || run.id }}</strong><small>{{ run.format }} · {{ run.adapter }} · {{ run.queuedAt || run.startedAt || run.createdAt || 'time unknown' }}</small></span><span class="status-pill" :class="(run.status || '').toLowerCase()">{{ run.status }}</span></button><p v-if="!preprocessingImports.length" class="muted empty">No imports are waiting for pre-processing validation.</p></div></article><article v-if="selectedRun" class="panel import-detail-panel"><div class="panel-heading"><div><p class="eyebrow">IMPORT DETAIL</p><h2>{{ selectedRun.filename || selectedRun.id }}</h2><p class="muted">{{ selectedRun.status }} · {{ selectedRun.entityCount ?? 0 }} source records · {{ selectedRun.candidateCount ?? 0 }} candidates</p></div><button class="secondary" @click="markProcessed">Mark import as processed</button></div><div class="info-grid"><div><span>Status</span><strong>{{ selectedRun.status }}</strong></div><div><span>Processed</span><strong>{{ selectedRun.processedCount ?? 0 }}</strong></div><div><span>Errors</span><strong>{{ selectedRun.errorCount ?? 0 }}</strong></div><div><span>Source</span><strong>{{ typeof selectedRun.source === 'string' ? selectedRun.source : selectedRun.source?.name || '—' }}</strong></div><div><span>Adapter</span><strong>{{ selectedRun.adapter || '—' }}</strong></div><div><span>Updated</span><strong>{{ selectedRun.updatedAt || '—' }}</strong></div></div><div v-if="selectedRun.errors?.length" class="error-card"><strong>Processing errors</strong><div v-for="(item, index) in selectedRun.errors" :key="index">{{ typeof item === 'string' ? item : JSON.stringify(item) }}</div></div><h3>Review pre-processed records</h3><div class="toolbar"><label class="check-field"><input type="checkbox" :checked="allSelected" :disabled="selectingAll" @change="toggleAll"><span>{{ selectingAll ? 'Selecting all…' : 'Select all pending records' }}</span></label><button class="secondary" :disabled="!selectedCandidateIds.length" @click="processCandidates('CANDIDATE')">Promote selected to candidate</button><button class="secondary" :disabled="!selectedCandidateIds.length" @click="processCandidates('APPROVED')">Promote selected to approved</button><button class="primary" :disabled="!selectedCandidateIds.length" @click="rejectCandidates">Reject selected</button></div><div class="candidate-list"><div v-for="item in candidates" :key="item.id" class="candidate-row"><input type="checkbox" :checked="selectedCandidateIds.includes(item.id)" @change="toggleCandidate(item.id)"><button class="candidate-name" @click="openCandidate(item)">{{ item.name || 'Unnamed entity' }}</button><span>{{ item.validationStatus || 'PENDING' }}</span><span v-if="item.possibleDuplicate || duplicateMatches(item).length" class="warning-pill">Possible duplicate ({{ duplicateMatches(item).length }})</span><small>{{ item.geometry?.type || item.geom?.type || 'No geometry' }}</small></div><p v-if="!candidates.length" class="muted empty">No pending records for this import.</p></div><div class="pagination"><button class="secondary" :disabled="page <= 1" @click="page--; loadCandidates()">Previous</button><span>Page {{ page }} · {{ totalCandidates }} pending records</span><button class="secondary" :disabled="page * pageSize >= totalCandidates" @click="page++; loadCandidates()">Next</button></div></article><article v-else class="panel empty-state import-detail-empty"><h2>Select an import</h2><p class="muted">Click an import in the queue or history below to inspect its processing status and pending records.</p></article></div>
  <article class="panel import-history-panel"><div class="panel-heading"><div><h2>Import history</h2><small class="muted">Showing the latest {{ importPageSize }} imports · {{ activeImports.length }} active or waiting</small></div><button class="secondary" @click="loadImports">Refresh history</button></div><div class="table-list"><button v-for="run in imports" :key="run.id" class="table-row" :class="{ selected: selectedRun?.id === run.id }" @click="selectRun(run)"><span><strong>{{ run.filename || run.id }}</strong><small>{{ run.format }} · {{ run.adapter }} · {{ run.createdAt || run.queuedAt || 'time unknown' }}</small></span><span class="status-pill" :class="(run.status || '').toLowerCase()">{{ run.status }}</span></button><p v-if="!imports.length" class="muted empty">No imports have been queued.</p></div><div class="pagination"><button class="secondary" :disabled="importPage <= 1" @click="setImportPage(importPage - 1)">Previous</button><span>Page {{ importPage }} · {{ importTotal }} imports</span><button class="secondary" :disabled="importPage * importPageSize >= importTotal" @click="setImportPage(importPage + 1)">Next</button></div></article>
  <div v-if="candidateDetail" class="modal-backdrop" role="presentation" @click.self="closeCandidate"><article class="modal-card"><div class="panel-heading"><div><p class="eyebrow">PRE-PROCESSED RECORD</p><h2>{{ candidateDetail.name || 'Unnamed entity' }}</h2><p class="muted">{{ candidateDetail.validationStatus || 'PENDING' }}<span v-if="duplicateMatches(candidateDetail).length"> · Possible duplicate</span></p></div><button class="quiet" @click="closeCandidate">Close</button></div><p class="field-help">The map compares the imported location with nearby existing entities returned by the deduplication check.</p><LeafletMap :entities="candidateMapEntities" :selected-id="candidateDetail.id" height="480px" :show-clusters="false"></LeafletMap><div v-for="duplicate in duplicateMatches(candidateDetail)" :key="duplicate.id" class="notice">Possible duplicate: {{ duplicate.name }}<span v-if="duplicate.matchType"> · {{ duplicate.matchType }}</span><span v-if="duplicate.distanceMeters != null"> · {{ duplicate.distanceMeters }} m away</span><span v-if="duplicate.entityId"> · {{ duplicate.entityId }}</span></div></article></div>
</template>
