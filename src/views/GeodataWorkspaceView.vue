<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ApiError, apiRequest } from '../lib/api';
import { myotaClient } from '../lib/myotaClient';
import { pendingDeletionStatuses, pollDeletionJobs } from '../lib/deletionPolling';
import { useAppStore } from '../stores/app';
import LeafletMap from '../components/LeafletMap.vue';
import type { EntityCategory, GeoEntity } from '../types';

const props = defineProps<{ mode: 'review' | 'management' }>();
const store = useAppStore();
interface AuditEntry { action?: string; occurredAt?: string; editedAt?: string; note?: string; reviewerId?: string; editorId?: string; [key: string]: unknown }
interface AuditData { items?: AuditEntry[]; reviewHistory?: AuditEntry[]; geometryHistory?: AuditEntry[]; statusHistory?: AuditEntry[] }
interface DeletionImpact { qsoCount?: number; activationCount?: number; awardCount?: number; }
interface LocationOption { name: string; code?: string | null; countries?: LocationOption[]; subdivisions?: LocationOption[]; provinces?: LocationOption[]; cities?: LocationOption[] }
const entities = ref<GeoEntity[]>([]); const categories = ref<EntityCategory[]>([]); const selected = ref<GeoEntity | null>(null); const selectedIds = ref<string[]>([]); const total = ref(0); const page = ref(1); const pageSize = ref(25); const loading = ref(false); const error = ref(''); const message = ref(''); const audit = ref<AuditData>({});
const statuses = ['CANDIDATE', 'APPROVED', 'RETIRED', 'REJECTED'];
const filters = reactive({ programme: '', status: [] as string[], entityType: '', continent: '', country: '', region: '', province: '', city: '' });
const editName = ref(''); const editNote = ref(''); const geometryNote = ref(''); const geometryJson = ref(''); const editTypes = ref<string[]>([]); const geometryType = ref('');
const creating = ref(false); const newName = ref(''); const newTypes = ref<string[]>([]); const newGeometry = ref('{\n  "type": "Point",\n  "coordinates": [-5.99, 37.39]\n}');
const editingId = ref(''); const drawing = ref(false); const drawingMode = ref<'POINT' | 'WAY' | 'POLYGON'>('POLYGON');
const editingLocation = ref(false); const locationOptions = ref<LocationOption[]>([]); const locationLoading = ref(false); const locationManual = ref<string[]>([]); const locationForm = reactive({ continent: '', country: '', region: '', province: '', county: '', city: '', municipality: '', locality: '', continentCode: '', countryCode: '', regionCode: '', subdivisionCode: '', provinceCode: '', countyCode: '' });
const isManagement = computed(() => props.mode === 'management'); const allSelected = computed(() => entities.value.length > 0 && entities.value.every(item => selectedIds.value.includes(item.id))); const isGlobalAdmin = computed(() => { const account = store.account as { roles?: Array<{ role?: string; scopes?: string[] } | string>; role?: string; scopes?: string[] } | null; const roles = account?.roles || []; return roles.some(role => { const roleName = typeof role === 'string' ? role : role.role; const scopes = typeof role === 'string' ? [] : role.scopes || []; return ['GLOBAL_ADMIN', 'GLOBAL_OPERATOR'].includes(String(roleName || '').toUpperCase()) || scopes.includes('*'); }) || ['GLOBAL_ADMIN', 'GLOBAL_OPERATOR'].includes(String(account?.role || '').toUpperCase()) || (account?.scopes || []).includes('*'); });
const selectedStatusOptions = computed(() => ['APPROVED', 'RETIRED'].includes(selected.value?.status || '') ? ['RETIRED'] : statuses);
const reviewStatus = ref('');
const title = computed(() => isManagement.value ? 'Entity management' : 'Geodata review');

const entityConflict = ref(false);
function setError(value: unknown): void {
  entityConflict.value = value instanceof ApiError && value.status === 409;
  error.value = value instanceof Error ? value.message : String(value);
}
async function reloadConflictedEntity(): Promise<void> {
  if (!window.confirm('Reload the selected entity from the server? Unsaved edits will be discarded.')) return;
  try { await refreshSelection(); error.value = ''; entityConflict.value = false; }
  catch (cause) { setError(cause); }
}
function categoryCodes(entity: GeoEntity): string[] { return (entity.entityTypes || (entity.entityType ? [entity.entityType] : [])).map(item => typeof item === 'string' ? item : item.code); }
function locationValue(entity: GeoEntity, key: string): string { return String((entity as any)[key] ?? entity.location?.[key] ?? (key === 'region' ? (entity as any).subdivision ?? entity.location?.subdivision : '') ?? ''); }
function sourceSnapshot(entity: GeoEntity): string { return JSON.stringify(entity.provenance?.sourceFeature || entity.provenance?.source || {}, null, 2); }
function auditEntries(): AuditEntry[] { const value = audit.value; return (value.items || [...(value.reviewHistory || []), ...(value.geometryHistory || []), ...(value.statusHistory || [])]).sort((a, b) => String(b.occurredAt || b.editedAt || '').localeCompare(String(a.occurredAt || a.editedAt || ''))); }
function query(): string { const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) }); if (filters.programme) params.set('programme', filters.programme); filters.status.forEach(status => params.append('status', status)); if (filters.entityType) params.set('entityType', filters.entityType); for (const key of ['continent', 'country', 'region', 'province', 'city']) { const value = filters[key as keyof typeof filters]; if (typeof value === 'string' && value) params.set(key, value); } return params.toString(); }
async function load(): Promise<void> { loading.value = true; error.value = ''; try { const data = await apiRequest<{ items: GeoEntity[]; total?: number }>(`/v1/geodata/entities?${query()}`); entities.value = data.items || []; total.value = Number(data.total ?? entities.value.length); if (selected.value && !entities.value.some(item => item.id === selected.value?.id)) selected.value = null; } catch (e) { setError(e); } finally { loading.value = false; } }
async function loadCategories(): Promise<void> { try { const data = await apiRequest<{ items: EntityCategory[] }>('/v1/entity-types'); categories.value = data.items || []; } catch (e) { setError(e); } }
async function loadLocationOptions(): Promise<void> { locationLoading.value = true; try { const data = await apiRequest<{ continents: LocationOption[] }>('/v1/geodata/location-options'); locationOptions.value = data.continents || []; } catch (e) { setError(e); } finally { locationLoading.value = false; } }
function selectEntity(entity: GeoEntity): void { selected.value = entity; editingId.value = ''; editName.value = entity.name; editNote.value = ''; geometryNote.value = ''; geometryJson.value = entity.geometry ? JSON.stringify(entity.geometry, null, 2) : ''; editTypes.value = categoryCodes(entity); geometryType.value = entity.geometry?.type || 'Point'; reviewStatus.value = entity.status; if (isManagement.value) window.setTimeout(() => document.getElementById('entity-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); loadAudit(entity.id); }
async function refreshSelection(): Promise<void> {
  if (!selected.value) return;
  const entity = await apiRequest<GeoEntity>(`/v1/geodata/entities/${encodeURIComponent(selected.value.id)}`);
  selectEntity(entity);
}
async function loadAudit(id: string): Promise<void> { try { audit.value = await apiRequest<AuditData>(`/v1/geodata/entities/${encodeURIComponent(id)}/audit`); } catch { audit.value = {}; } }
function toggleStatus(status: string): void { filters.status = filters.status.includes(status) ? filters.status.filter(item => item !== status) : [...filters.status, status]; page.value = 1; load(); }
function toggleAll(): void { selectedIds.value = allSelected.value ? [] : entities.value.map(item => item.id); }
function toggleEntity(id: string): void { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(item => item !== id) : [...selectedIds.value, id]; }
function statusEvent(event: Event): string { return (event.target as HTMLSelectElement).value; }
async function saveStatus(status: string): Promise<void> { if (!selected.value) return; if (['APPROVED', 'RETIRED'].includes(selected.value.status) && status !== 'RETIRED') { error.value = `${selected.value.status} entities can only be retired.`; return; } if (status === selected.value.status) return; try { await myotaClient.postGeodataEntityReview(selected.value.id, { status, reviewerId: store.account?.id, note: editNote.value }, selected.value.version); message.value = `Status changed to ${status}.`; await load(); const refreshed = entities.value.find(item => item.id === selected.value?.id); if (refreshed) selectEntity(refreshed); } catch (e) { setError(e); } }
async function bulkApprove(): Promise<void> { if (!selectedIds.value.length) return; try { const eligible = entities.value.filter(entity => selectedIds.value.includes(entity.id) && entity.status === 'CANDIDATE'); if (!eligible.length) { message.value = 'No selected candidates are eligible for approval.'; return; } await Promise.all(eligible.map(entity => myotaClient.postGeodataEntityReview(entity.id, { status: 'APPROVED', reviewerId: store.account?.id, note: 'Bulk approval from Geodata Review' }, entity.version))); message.value = `${eligible.length} candidates approved.`; selectedIds.value = []; await load(); } catch (e) { setError(e); } }
type DeletionJob = { id: string; status?: string; error?: string; impact?: DeletionImpact };
type DeletionItem = { entity: GeoEntity; job: DeletionJob; error?: string; idempotencyKey: string };
type PendingDeletion =
  | { kind: 'single'; entity: GeoEntity; job: DeletionJob }
  | { kind: 'bulk'; items: DeletionItem[]; totalCount: number; completedCount: number; impact: DeletionImpact };
const deletionModal = ref<PendingDeletion | null>(null);
const deleting = ref(false);
const preparingBulkDelete = ref(false);
const bulkPreparationFailed = computed(() => deletionModal.value?.kind === 'bulk' && deletionModal.value.items.some(item => String(item.job.status).toUpperCase() === 'PREPARATION_FAILED'));
function aggregateDeletionImpact(items: DeletionItem[]): DeletionImpact { return items.reduce<DeletionImpact>((sum, item) => ({ qsoCount: (sum.qsoCount || 0) + Number(item.job.impact?.qsoCount || 0), activationCount: (sum.activationCount || 0) + Number(item.job.impact?.activationCount || 0), awardCount: (sum.awardCount || 0) + Number(item.job.impact?.awardCount || 0) }), {}); }
async function createDeletionJob(id: string, idempotencyKey?: string): Promise<DeletionJob> { return myotaClient.createGeodataEntityDeletionJob<DeletionJob>({ entityId: id, requestedBy: store.account?.id }, idempotencyKey); }
const deletionPollDelayMs = 1_500;
function delay(ms: number): Promise<void> { return new Promise(resolve => window.setTimeout(resolve, ms)); }
async function refreshSingleDeletionStatus(pending: Extract<PendingDeletion, { kind: 'single' }>): Promise<void> {
  while (pendingDeletionStatuses.has(String(pending.job.status).toUpperCase())) {
    try {
      pending.job = { ...pending.job, ...await myotaClient.getGeodataEntityDeletionJob<DeletionJob>(pending.job.id) };
      pending.job.error = String(pending.job.status).toUpperCase() === 'FAILED' ? pending.job.error || 'Deletion job failed.' : undefined;
    } catch (cause) {
      pending.job.error = cause instanceof Error ? cause.message : String(cause);
    }
    if (pendingDeletionStatuses.has(String(pending.job.status).toUpperCase())) await delay(deletionPollDelayMs);
  }
}
async function refreshBulkDeletionStatuses(pending: Extract<PendingDeletion, { kind: 'bulk' }>): Promise<void> {
  const completedBeforePoll = pending.completedCount;
  await pollDeletionJobs({
    items: pending.items,
    jobFor: item => item.job,
    refresh: jobId => myotaClient.getGeodataEntityDeletionJob<DeletionJob>(jobId),
    update: (item, job) => {
      item.job = { ...item.job, ...job };
      item.error = String(job.status).toUpperCase() === 'FAILED'
        ? job.error || 'Deletion job failed.'
        : undefined;
    },
    onError: (item, cause) => {
      item.error = cause instanceof Error ? cause.message : String(cause);
    },
    pause: () => delay(deletionPollDelayMs),
  });
  const completedIds = new Set(
    pending.items
      .filter(item => String(item.job.status).toUpperCase() === 'COMPLETED')
      .map(item => item.job.id),
  );
  pending.items = pending.items.filter(item => !completedIds.has(item.job.id));
  pending.completedCount = completedBeforePoll + completedIds.size;
  pending.impact = aggregateDeletionImpact(pending.items);
}
async function prepareDelete(id: string): Promise<void> { const entity = selected.value?.id === id ? selected.value : entities.value.find(item => item.id === id); if (!entity || !isGlobalAdmin.value) return; try { deletionModal.value = { kind: 'single', entity, job: await createDeletionJob(id) }; } catch (e) { setError(e); } }
function cancelDelete(): void {
  if (deleting.value) message.value = 'Confirmed deletion jobs continue in the background after this dialog closes.';
  deletionModal.value = null;
}
async function confirmDelete(): Promise<void> {
  const pending = deletionModal.value;
  if (!pending) return;
  if (pending.kind === 'bulk' && (preparingBulkDelete.value || pending.items.some(item => !item.job.id))) {
    error.value = 'Prepare deletion details for every selected entity before confirming.';
    return;
  }
  deleting.value = true;
  try {
    if (pending.kind === 'single') {
      if (!pendingDeletionStatuses.has(String(pending.job.status).toUpperCase())) {
        try {
          pending.job = { ...pending.job, ...await myotaClient.confirmGeodataEntityDeletionJob<DeletionJob>(pending.job.id, { confirmation: 'DELETE', deletedBy: store.account?.id }) };
        } catch (cause) {
          const current = await myotaClient.getGeodataEntityDeletionJob<DeletionJob>(pending.job.id);
          if (!pendingDeletionStatuses.has(String(current.status).toUpperCase()) && String(current.status).toUpperCase() !== 'COMPLETED') throw cause;
          pending.job = { ...pending.job, ...current };
        }
      }
      await refreshSingleDeletionStatus(pending);
      if (String(pending.job.status).toUpperCase() === 'COMPLETED') {
        message.value = 'Entity permanently deleted; linked activity and award progress were reconciled.';
        deletionModal.value = null;
        selected.value = null;
        selectedIds.value = [];
        await load();
      } else if (String(pending.job.status).toUpperCase() === 'FAILED') {
        error.value = pending.job.error || 'Entity deletion failed. The entity was not reported as deleted.';
      } else {
        message.value = 'Deletion is still processing. You can check its status again or close this dialog.';
      }
      return;
    } else {
      const submittedItems = [...pending.items];
      const results = await Promise.allSettled(submittedItems.map(async item => {
        if (String(item.job.status).toUpperCase() === 'FAILED') item.job = await createDeletionJob(item.entity.id);
        if (!item.job.status || String(item.job.status).toUpperCase() === 'AWAITING_CONFIRMATION' || String(item.job.status).toUpperCase() === 'FAILED') {
          try {
            item.job = { ...item.job, ...await myotaClient.confirmGeodataEntityDeletionJob<DeletionJob>(item.job.id, { confirmation: 'DELETE', deletedBy: store.account?.id }) };
          } catch (cause) {
            // A timeout can happen after the server has durably queued the job.
            // Read it back before treating the confirmation as failed.
            const current = await myotaClient.getGeodataEntityDeletionJob<DeletionJob>(item.job.id);
            if (!pendingDeletionStatuses.has(String(current.status).toUpperCase()) && String(current.status).toUpperCase() !== 'COMPLETED') throw cause;
            item.job = { ...item.job, ...current };
          }
        }
        item.error = undefined;
        return item;
      }));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const item = submittedItems[index];
          item.error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        }
      });
      await refreshBulkDeletionStatuses(pending);
      selectedIds.value = selectedIds.value.filter(id => pending.items.some(item => item.entity.id === id));
      await load();
      const awaitingConfirmation = pending.items.some(item =>
        String(item.job.status).toUpperCase() === 'AWAITING_CONFIRMATION',
      );
      const failedItems = pending.items.filter(item =>
        String(item.job.status).toUpperCase() === 'FAILED',
      );
      if (awaitingConfirmation) {
        message.value = `${pending.completedCount} of ${pending.totalCount} entities deleted. Some jobs still need confirmation; review and confirm again.`;
        error.value = pending.items.find(item => item.error)?.error || '';
        return;
      }
      message.value = `${pending.completedCount} of ${pending.totalCount} entities were permanently deleted.`;
      if (failedItems.length) {
        error.value = failedItems.map(item =>
          `${item.entity.name}: ${item.error || item.job.error || 'Deletion failed.'}`,
        ).join(' · ');
      } else {
        message.value += ' Linked QSOs were removed and award recalculation was queued.';
        error.value = '';
      }
      deletionModal.value = null;
      selected.value = null;
      selectedIds.value = [];
      await load();
      return;
    }
    deletionModal.value = null;
    selected.value = null;
    selectedIds.value = [];
    await load();
  } catch (e) {
    setError(e);
  } finally {
    deleting.value = false;
  }
}
async function deleteEntity(id: string, confirmAction = true, existingJob?: DeletionJob): Promise<void> { if (confirmAction) { await prepareDelete(id); return; } const entity = selected.value?.id === id ? selected.value : entities.value.find(item => item.id === id); if (!entity || !existingJob) return; try { await myotaClient.confirmGeodataEntityDeletionJob(existingJob.id, { confirmation: 'DELETE', deletedBy: store.account?.id }); message.value = 'Entity deletion queued; linked QSOs will be removed and award recalculation will run.'; selected.value = null; await load(); } catch (e) { setError(e); } }
async function bulkDelete(): Promise<void> {
  const selectedEntities = entities.value.filter(entity => selectedIds.value.includes(entity.id));
  if (!selectedEntities.length || !isGlobalAdmin.value) return;
  error.value = '';
  const pending: Extract<PendingDeletion, { kind: 'bulk' }> = {
    kind: 'bulk',
    items: selectedEntities.map(entity => ({
      entity,
      job: { id: '', status: 'PREPARING' },
      idempotencyKey: crypto.randomUUID(),
    })),
    totalCount: selectedEntities.length,
    completedCount: 0,
    impact: {},
  };
  // Render the stern confirmation modal before any network request. A failed
  // impact/job lookup must not make the bulk-delete action appear to do nothing.
  deletionModal.value = pending;
  await prepareBulkDeletionJobs(pending);
}
async function prepareBulkDeletionJobs(
  pending: Extract<PendingDeletion, { kind: 'bulk' }>,
): Promise<void> {
  preparingBulkDelete.value = true;
  try {
    const pendingItems = pending.items.filter(item =>
      !item.job.id || String(item.job.status).toUpperCase() === 'PREPARATION_FAILED',
    );
    for (let offset = 0; offset < pendingItems.length; offset += 5) {
      const batch = pendingItems.slice(offset, offset + 5);
      await Promise.all(batch.map(async item => {
        try {
          item.job = await createDeletionJob(item.entity.id, item.idempotencyKey);
          item.error = undefined;
        } catch (cause) {
          item.job = { id: '', status: 'PREPARATION_FAILED' };
          item.error = cause instanceof Error ? cause.message : String(cause);
        }
      }));
    }
    pending.impact = aggregateDeletionImpact(pending.items);
  } finally {
    preparingBulkDelete.value = false;
  }
}
async function retryBulkDeletionPreparation(): Promise<void> {
  const pending = deletionModal.value;
  if (pending?.kind === 'bulk') await prepareBulkDeletionJobs(pending);
}
async function saveName(): Promise<void> { if (!selected.value || !editName.value.trim()) return; try { await myotaClient.patchGeodataEntityMetadata(selected.value.id, { name: editName.value.trim(), note: editNote.value, editorId: store.account?.id }, selected.value.version); message.value = 'Entity name saved.'; await load(); const refreshed = entities.value.find(item => item.id === selected.value?.id); if (refreshed) selectEntity(refreshed); } catch (e) { setError(e); } }
async function saveCategories(): Promise<void> { if (!selected.value) return; try { await myotaClient.putGeodataEntityCategories(selected.value.id, { entityTypes: editTypes.value, editorId: store.account?.id }, selected.value.version); message.value = 'Entity categories saved.'; await load(); await refreshSelection(); } catch (e) { setError(e); } }
async function saveGeometry(): Promise<void> { if (!selected.value) return; try { const geometry = JSON.parse(geometryJson.value); geometry.type = geometryType.value; await myotaClient.putGeodataEntityGeometry(selected.value.id, { geometry, note: geometryNote.value, editorId: store.account?.id }, selected.value.version); message.value = 'Geometry saved.'; await load(); await refreshSelection(); } catch (e) { setError(e instanceof SyntaxError ? new Error('Geometry must be valid JSON.') : e); } }
function startGeometryEdit(): void { if (selected.value?.geometry && selected.value.status !== 'RETIRED') { editingId.value = selected.value.id; geometryJson.value = JSON.stringify(selected.value.geometry, null, 2); geometryType.value = selected.value.geometry.type; } }
function stopGeometryEdit(): void { editingId.value = ''; }
function onGeometryChange(geometry: { type: string; coordinates: unknown }): void { geometryJson.value = JSON.stringify(geometry, null, 2); geometryType.value = geometry.type; }
function startDrawing(mode: 'POINT' | 'WAY' | 'POLYGON'): void { drawingMode.value = mode; drawing.value = true; }
function onDrawCreated(geometry: { type: string; coordinates: unknown }): void { newGeometry.value = JSON.stringify(geometry, null, 2); drawing.value = false; }
function fillLocationForm(entity: GeoEntity): void { for (const key of Object.keys(locationForm) as Array<keyof typeof locationForm>) locationForm[key] = locationValue(entity, key); locationManual.value = [...(((entity as any).manualLocationFields || []) as string[])]; }
function uniqueLocationOptions(items: LocationOption[]): LocationOption[] { const seen = new Set<string>(); return items.filter(item => { const key = item.name.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.name.localeCompare(b.name)); }
function selectedContinent(): LocationOption | undefined { return locationOptions.value.find(item => item.name === filters.continent); }
function locationCountries(): LocationOption[] { const continent = selectedContinent(); return uniqueLocationOptions(continent ? continent.countries || [] : locationOptions.value.flatMap(item => item.countries || [])); }
function selectedCountry(): LocationOption | undefined { return locationCountries().find(item => item.name === filters.country); }
function locationRegions(): LocationOption[] { const country = selectedCountry(); return uniqueLocationOptions(country ? country.subdivisions || [] : locationCountries().flatMap(item => item.subdivisions || [])); }
function selectedRegion(): LocationOption | undefined { return locationRegions().find(item => item.name === filters.region); }
function locationProvinces(): LocationOption[] { const region = selectedRegion(); return uniqueLocationOptions(region ? region.provinces || [] : locationRegions().flatMap(item => item.provinces || [])); }
function selectedProvince(): LocationOption | undefined { return locationProvinces().find(item => item.name === filters.province); }
function locationCities(): LocationOption[] { const province = selectedProvince(); if (province?.cities?.length) return uniqueLocationOptions(province.cities); const region = selectedRegion(); if (region?.cities?.length) return uniqueLocationOptions(region.cities); const country = selectedCountry(); return uniqueLocationOptions(country ? country.cities || [] : locationCountries().flatMap(item => item.cities || [])); }
function locationOptionLabel(item: LocationOption): string { return item.code ? `${item.name} (${item.code})` : item.name; }
async function startLocationEdit(): Promise<void> { if (!selected.value) return; fillLocationForm(selected.value); if (!locationOptions.value.length) await loadLocationOptions(); editingLocation.value = true; }
function locationValues(field: string): LocationOption[] { if (field === 'continent') return locationOptions.value; const countries = locationCountries(); if (field === 'country') return countries; const country = countries.find(item => item.name === locationForm.country); const regions = country ? country.subdivisions || [] : countries.flatMap(item => item.subdivisions || []); if (field === 'region') return regions; const region = regions.find(item => item.name === locationForm.region); return region ? region.provinces || [] : regions.flatMap(item => item.provinces || []); }
function refreshLocationCodes(field: string): void { const match = locationValues(field).find(item => item.name === locationForm[field as keyof typeof locationForm]); if (field === 'continent') locationForm.continentCode = match?.code || ''; if (field === 'country') locationForm.countryCode = match?.code || ''; if (field === 'region') { locationForm.regionCode = match?.code || ''; locationForm.subdivisionCode = match?.code || ''; } if (field === 'province') locationForm.provinceCode = match?.code || ''; }
async function saveLocation(): Promise<void> { if (!selected.value) return; try { const location = { ...locationForm, region: locationForm.region || null, subdivision: locationForm.region || null }; await myotaClient.patchGeodataEntityMetadata(selected.value.id, { location, manualFields: locationManual.value, editorId: store.account?.id }, selected.value.version); message.value = 'Location metadata saved.'; editingLocation.value = false; await load(); const refreshed = entities.value.find(item => item.id === selected.value?.id); if (refreshed) selectEntity(refreshed); } catch (e) { setError(e); } }
function toggleNewType(code: string): void { newTypes.value = newTypes.value.includes(code) ? newTypes.value.filter(item => item !== code) : [...newTypes.value, code]; }
async function createCandidate(): Promise<void> { if (!newName.value.trim() || !newTypes.value.length) { error.value = 'Enter a name and select at least one category.'; return; } try { const geometry = JSON.parse(newGeometry.value); await myotaClient.postGeodataProposal({ source: { name: 'Manual administration proposal', license: 'programme-supplied' }, proposerId: store.account?.id, entityTypes: newTypes.value, feature: { type: 'Feature', properties: { name: newName.value.trim() }, geometry } }); message.value = 'New candidate submitted.'; creating.value = false; newName.value = ''; newTypes.value = []; await load(); } catch (e) { setError(e instanceof SyntaxError ? new Error('Geometry must be valid JSON.') : e); } }
function setPage(next: number): void { page.value = next; load(); }
watch(() => filters.continent, () => { filters.country = ''; filters.region = ''; filters.province = ''; filters.city = ''; });
watch(() => filters.country, () => { filters.region = ''; filters.province = ''; filters.city = ''; });
watch(() => filters.region, () => { filters.province = ''; filters.city = ''; });
watch(() => filters.province, () => { filters.city = ''; });
watch(() => [pageSize.value, filters.programme, filters.entityType, filters.continent, filters.country, filters.region, filters.province, filters.city], () => { page.value = 1; load(); });
onMounted(async () => { await Promise.all([loadCategories(), loadLocationOptions(), load()]); });
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">GEODATA</p><h1>{{ title }}</h1><p class="muted">{{ isManagement ? 'Edit catalogue data, geometry, categories and audit history.' : 'Review candidate entities and make durable status decisions.' }}</p></div><div class="heading-actions"><button class="secondary" @click="load">Refresh</button><button v-if="!isManagement" class="primary" @click="creating = !creating">New Candidate</button><button v-if="isManagement" class="primary" @click="selected = null">New entity</button></div></section>
  <div v-if="message" class="notice" role="status">{{ message }}</div><div v-if="error" class="error-card" role="alert">{{ error }} <button v-if="entityConflict && selected" class="secondary" @click="reloadConflictedEntity">Reload selected entity</button></div>
  <article class="panel filter-panel"><div class="top-controls"><label>Programme<select v-model="filters.programme"><option value="">All programmes, including unassigned</option><option v-for="programme in store.programmes" :key="programme.slug" :value="programme.slug">{{ programme.name }}</option></select></label></div><div class="geo-filter-grid"><label>Entity type<select v-model="filters.entityType"><option value="">All types</option><option v-for="category in categories" :key="category.code" :value="category.code">{{ category.label || category.code }}</option></select></label><label>Continent<select v-model="filters.continent" :disabled="locationLoading"><option value="">All continents</option><option v-for="item in locationOptions" :key="`${item.code || ''}-${item.name}`" :value="item.name">{{ locationOptionLabel(item) }}</option></select></label><label>Country<select v-model="filters.country" :disabled="locationLoading || !locationCountries().length"><option value="">All countries</option><option v-for="item in locationCountries()" :key="`${item.code || ''}-${item.name}`" :value="item.name">{{ locationOptionLabel(item) }}</option></select></label><label>Region / subdivision<select v-model="filters.region" :disabled="locationLoading || !locationRegions().length"><option value="">All regions / subdivisions</option><option v-for="item in locationRegions()" :key="`${item.code || ''}-${item.name}`" :value="item.name">{{ locationOptionLabel(item) }}</option></select></label><label>Province<select v-model="filters.province" :disabled="locationLoading || !locationProvinces().length"><option value="">All provinces</option><option v-for="item in locationProvinces()" :key="`${item.code || ''}-${item.name}`" :value="item.name">{{ locationOptionLabel(item) }}</option></select></label><label>City / municipality<select v-model="filters.city" :disabled="locationLoading || !locationCities().length"><option value="">All cities / municipalities</option><option v-for="item in locationCities()" :key="item.name" :value="item.name">{{ item.name }}</option></select></label></div><div class="status-filters"><span>Status:</span><label v-for="status in statuses" :key="status"><input type="checkbox" :checked="filters.status.includes(status)" @change="toggleStatus(status)">{{ status }}</label></div></article>
  <article v-if="creating" class="panel"><div class="panel-heading"><div><p class="eyebrow">MANUAL PROPOSAL</p><h2>New Candidate</h2><p class="muted">Manual proposals enter the candidate queue and are not approved automatically.</p></div></div><form class="form-grid" @submit.prevent="createCandidate"><label>Name<input v-model="newName" required></label><label>Programme scope<select v-model="filters.programme"><option value="">Unassigned / platform-wide</option><option v-for="programme in store.programmes" :key="programme.slug" :value="programme.slug">{{ programme.name }}</option></select></label><fieldset class="wide"><legend>Entity categories</legend><div class="checkbox-grid"><label v-for="category in categories" :key="category.code"><input type="checkbox" :checked="newTypes.includes(category.code)" @change="toggleNewType(category.code)">{{ category.label || category.code }}</label></div></fieldset><div class="form-actions wide"><button class="secondary" type="button" @click="startDrawing('POINT')">Draw point on map</button><button class="secondary" type="button" @click="startDrawing('WAY')">Draw way / trail</button><button class="secondary" type="button" @click="startDrawing('POLYGON')">Draw polygon</button></div><label class="wide">GeoJSON geometry<textarea v-model="newGeometry" class="code-editor" required></textarea><small class="field-help">Use the map buttons for interactive drawing, or enter a Point, LineString, MultiLineString, Polygon or MultiPolygon geometry.</small></label><div class="form-actions wide"><button class="primary" type="submit">Submit candidate</button><button class="secondary" type="button" @click="creating = false; drawing = false">Cancel</button></div></form></article>
  <article class="panel"><div class="panel-heading"><div><h2>Entities</h2><small class="muted">{{ total }} matching entities · page {{ page }}</small></div><div class="toolbar"><label>Show <select v-model.number="pageSize"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label><label class="check-field"><input type="checkbox" :checked="allSelected" @change="toggleAll"><span>Select all</span></label><button v-if="!isManagement" class="primary" :disabled="!selectedIds.length" @click="bulkApprove">Change status to approved</button><button v-if="isGlobalAdmin" class="danger" :disabled="!selectedIds.length || deleting || preparingBulkDelete" @click="bulkDelete">{{ preparingBulkDelete ? 'Preparing deletion…' : 'Permanently delete entities' }}</button></div></div><div class="geo-list"><div v-for="entity in entities" :key="entity.id" class="geo-row" :class="{ selected: selected?.id === entity.id }"><input type="checkbox" :checked="selectedIds.includes(entity.id)" @change="toggleEntity(entity.id)"><button class="entity-link" @click="selectEntity(entity)"><strong>{{ entity.name }}</strong><small>{{ categoryCodes(entity).join(', ') || 'Uncategorised' }} · {{ locationValue(entity, 'city') || 'Location unavailable' }}</small><small class="locator-values">4-character grid squares: {{ entity.maidenheadGridSquares4?.join(', ') || '—' }} · 6-character locators: {{ entity.maidenheadLocators6?.join(', ') || '—' }}</small></button><span class="status-pill" :class="entity.status.toLowerCase()">{{ entity.status }}</span></div><p v-if="loading" class="muted empty">Loading entities…</p><p v-else-if="!entities.length" class="muted empty">No entities match these filters.</p></div><div class="pagination"><button class="secondary" :disabled="page <= 1" @click="setPage(page - 1)">Previous</button><span>{{ page }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span><button class="secondary" :disabled="page * pageSize >= total" @click="setPage(page + 1)">Next</button></div></article>
  <article class="panel map-panel"><div class="panel-heading"><div><h2>Map</h2><small class="muted">Selecting an entity centres the map and opens its details. Point entities are clustered at wider zoom levels.</small></div></div><LeafletMap :entities="entities" :selected-id="selected?.id" :editable-id="isManagement ? editingId : undefined" :drawing="drawing" :drawing-mode="drawingMode" height="680px" @select="selectEntity" @geometry-change="onGeometryChange" @draw-created="onDrawCreated"></LeafletMap><div v-if="isManagement && selected" class="map-actions"><button class="secondary" :disabled="selected.status === 'RETIRED'" @click="startGeometryEdit">Edit geometry</button><button v-if="editingId" class="secondary" @click="stopGeometryEdit">Exit edit mode</button></div></article>
  <article v-if="selected" id="entity-editor" class="panel editor-panel"><div class="panel-heading"><div><p class="eyebrow">{{ isManagement ? 'ENTITY MANAGEMENT' : 'REVIEW DECISION' }}</p><h2>{{ selected.name }}</h2><small class="muted">{{ selected.id }}</small></div><span class="status-pill" :class="selected.status.toLowerCase()">{{ selected.status }}</span></div><section class="form-section source-comparison"><div class="section-heading"><div><h3>Source comparison</h3><p class="field-help">The imported source snapshot remains immutable. Compare it with the current platform geometry before editing or recording a review decision.</p></div></div><div class="compare-grid"><div><small class="muted">Source snapshot</small><pre class="data-preview">{{ sourceSnapshot(selected) }}</pre></div><div><small class="muted">Current platform geometry</small><pre class="data-preview">{{ JSON.stringify(selected.geometry || {}, null, 2) }}</pre></div></div></section><div class="editor-grid"><section v-if="isManagement" class="form-section"><h3>Entity name</h3><p class="field-help">Name changes are audited and do not alter the original source.</p><input v-model="editName"><textarea v-model="editNote" placeholder="Explain this name change"></textarea><button class="primary" @click="saveName">Save name</button></section><section v-if="isManagement" class="form-section"><h3>Entity categories</h3><p class="field-help">Categories are shared master data. Select one or more categories; changes are audited.</p><div class="checkbox-grid"><label v-for="category in categories" :key="category.code"><input v-model="editTypes" type="checkbox" :value="category.code">{{ category.label || category.code }}</label></div><button class="secondary" @click="saveCategories">Save categories</button></section><section class="form-section gis-admin-section"><h3>{{ isManagement ? 'GIS administration & geometry editor' : 'Review decision' }}</h3><p v-if="isManagement" class="field-help">Global and GIS administrators can edit geometry explicitly. Point, LineString, MultiLineString, Polygon and MultiPolygon are supported. Use the map edit button above for vertex editing, or save a validated GeoJSON geometry below.</p><template v-if="isManagement"><label>Geometry type<select v-model="geometryType"><option>Point</option><option>LineString</option><option>MultiLineString</option><option>Polygon</option><option>MultiPolygon</option></select></label><textarea v-model="geometryJson" class="code-editor" placeholder="GeoJSON geometry"></textarea><textarea v-model="geometryNote" placeholder="Geometry change note"></textarea><button class="primary" @click="saveGeometry">Save geometry</button></template><template v-else><label>Status<select v-model="reviewStatus"><option v-for="status in selectedStatusOptions" :key="status" :value="status">{{ status }}</option></select></label><textarea v-model="editNote" placeholder="Review note / decision evidence"></textarea><button class="primary" @click="saveStatus(reviewStatus)">Save review decision</button></template></section></div><section class="form-section"><div class="section-heading"><div><h3>Location metadata</h3><p class="field-help">Reverse-geocoded values are automatic unless a field is explicitly marked as a manual override. Provider codes are read-only.</p></div><button v-if="isManagement" class="secondary" @click="startLocationEdit">{{ editingLocation ? 'Reload provider options' : 'Edit location metadata' }}</button></div><div v-if="!editingLocation" class="info-grid"><div><span>Continent</span><strong>{{ locationValue(selected, 'continent') || '—' }}</strong></div><div><span>Country</span><strong>{{ locationValue(selected, 'country') || '—' }}</strong></div><div><span>Region</span><strong>{{ locationValue(selected, 'region') || '—' }}</strong></div><div><span>Province</span><strong>{{ locationValue(selected, 'province') || '—' }}</strong></div><div><span>County</span><strong>{{ locationValue(selected, 'county') || '—' }}</strong></div><div><span>City / municipality</span><strong>{{ locationValue(selected, 'city') || locationValue(selected, 'municipality') || '—' }}</strong></div><div><span>Maidenhead grid squares (4)</span><strong>{{ selected.maidenheadGridSquares4?.join(', ') || '—' }}</strong></div><div><span>Maidenhead locators (6)</span><strong>{{ selected.maidenheadLocators6?.join(', ') || '—' }}</strong></div></div><div v-else class="form-grid location-editor-grid"><label v-for="field in ['continent','country','region','province']" :key="field">{{ field === 'region' ? 'Region / first subdivision' : field[0].toUpperCase() + field.slice(1) }}<input v-model="locationForm[field]" list="location-options" @change="refreshLocationCodes(field)"><small class="field-help">Provider-derived name; choose a valid value.</small></label><datalist id="location-options"><option v-for="item in locationValues('country')" :key="item.code || item.name" :value="item.name">{{ item.code }}</option></datalist><label>Continent code<input v-model="locationForm.continentCode" readonly></label><label>Country code<input v-model="locationForm.countryCode" readonly></label><label>Subdivision code<input v-model="locationForm.subdivisionCode" readonly></label><label>Province code<input v-model="locationForm.provinceCode" readonly></label><label>County / equivalent<input v-model="locationForm.county"></label><label>City<input v-model="locationForm.city"></label><label>Municipality<input v-model="locationForm.municipality"></label><label>Locality<input v-model="locationForm.locality"></label><fieldset class="wide"><legend>Manual overrides</legend><div class="checkbox-grid"><label v-for="field in ['continent','country','region','province','county','city','municipality','locality']" :key="field"><input v-model="locationManual" type="checkbox" :value="field">Keep {{ field }} manual</label></div></fieldset><div class="form-actions wide"><button class="primary" @click="saveLocation">Save location</button><button class="secondary" @click="editingLocation = false">Cancel</button></div></div></section><section v-if="isManagement" class="form-section"><h3>Audit history</h3><div class="audit-list"><div v-for="(item, index) in auditEntries()" :key="`${item.action || 'event'}-${item.occurredAt || item.editedAt || index}`" class="audit-row"><strong>{{ item.action || 'AUDIT_EVENT' }}</strong><span>{{ item.occurredAt || item.editedAt || 'Time unavailable' }}</span><small>{{ item.note || item.reviewerId || item.editorId || '' }}</small></div><p v-if="!auditEntries().length" class="muted">No audit entries available.</p></div><button v-if="isGlobalAdmin" class="danger" @click="deleteEntity(selected.id)">Permanently delete entity</button></section><section v-else class="form-section"><h3>Review audit context</h3><div class="audit-list"><div v-for="(item, index) in auditEntries()" :key="`${item.action || 'event'}-${item.occurredAt || item.editedAt || index}`" class="audit-row"><strong>{{ item.action || 'AUDIT_EVENT' }}</strong><span>{{ item.occurredAt || item.editedAt || 'Time unavailable' }}</span><small>{{ item.note || item.reviewerId || item.editorId || '' }}</small></div><p v-if="!auditEntries().length" class="muted">No audit entries available.</p></div></section></article>
  <div v-if="deletionModal" class="modal-backdrop" role="presentation" @click.self="cancelDelete">
    <article class="modal-card deletion-modal" role="alertdialog" aria-modal="true" aria-labelledby="deletion-title">
      <div class="panel-heading">
        <div><p class="eyebrow">PERMANENT DELETION</p><h2 id="deletion-title">{{ deletionModal.kind === 'single' ? `Delete ${deletionModal.entity.name}?` : `Delete ${deletionModal.totalCount} entities?` }}</h2></div>
        <button class="quiet" type="button" @click="cancelDelete">Close</button>
      </div>
      <ul v-if="deletionModal.kind === 'bulk'" class="bulk-delete-list">
        <li v-for="item in deletionModal.items" :key="item.entity.id">
          <strong>{{ item.entity.name }}</strong>
          <small>{{ item.job.status === 'PREPARING' ? 'Preparing deletion details…' : item.job.status === 'PREPARATION_FAILED' ? 'Could not prepare this entity' : item.job.status || 'Ready for confirmation' }}<template v-if="item.error || item.job.error"> · {{ item.error || item.job.error }}</template></small>
        </li>
      </ul>
      <p v-if="deletionModal.kind === 'bulk' && preparingBulkDelete" class="notice" role="status">Preparing deletion details for {{ deletionModal.items.filter(item => item.job.id).length }} of {{ deletionModal.totalCount }} entities. No deletion is queued until you confirm below.</p>
      <p v-if="deletionModal.kind === 'single' && (deletionModal.job.status || deletionModal.job.error)" class="notice">{{ deletionModal.job.status }}<template v-if="deletionModal.job.error"> · {{ deletionModal.job.error }}</template></p>
      <p v-if="deletionModal.kind === 'bulk' && deletionModal.completedCount" class="notice">{{ deletionModal.completedCount }} of {{ deletionModal.totalCount }} entities have been deleted. Remaining jobs are shown below.</p>
      <div class="error-card deletion-warning">
        <strong>This action cannot be undone.</strong>
        <p>{{ deletionModal.kind === 'single' ? 'The entity, its audit history, and all linked activity will be permanently removed.' : 'The selected entities, their audit histories, and all linked activity will be permanently removed.' }}</p>
        <p v-if="deletionModal.kind === 'bulk' && preparingBulkDelete">Calculating linked QSO and activation impact…</p>
        <p v-else><strong>{{ deletionModal.kind === 'single' ? deletionModal.job.impact?.qsoCount || 0 : deletionModal.impact.qsoCount || 0 }}</strong> valid QSO(s) will be deleted in cascade. <strong>{{ deletionModal.kind === 'single' ? deletionModal.job.impact?.activationCount || 0 : deletionModal.impact.activationCount || 0 }}</strong> activation(s) may become invalid.</p>
        <p>Award progress will be recalculated, and previously qualified awards may become invalid.</p>
      </div>
      <div class="form-actions">
        <button class="secondary" type="button" @click="cancelDelete">Cancel</button>
        <button v-if="deletionModal.kind === 'bulk' && bulkPreparationFailed" class="secondary" type="button" :disabled="preparingBulkDelete" @click="retryBulkDeletionPreparation">{{ preparingBulkDelete ? 'Retrying preparation…' : 'Retry failed preparation' }}</button>
        <button class="danger" type="button" :disabled="deleting || (deletionModal.kind === 'bulk' && (preparingBulkDelete || bulkPreparationFailed || !deletionModal.items.length)) || (deletionModal.kind === 'single' && String(deletionModal.job.status).toUpperCase() === 'FAILED')" @click="confirmDelete">
          {{ deleting ? 'Processing deletion jobs…' : deletionModal.kind === 'single' ? pendingDeletionStatuses.has(String(deletionModal.job.status).toUpperCase()) ? 'Check deletion status' : String(deletionModal.job.status).toUpperCase() === 'FAILED' ? 'Deletion failed' : 'Permanently delete entity' : preparingBulkDelete ? 'Preparing deletion details…' : bulkPreparationFailed ? 'Resolve preparation errors first' : deletionModal.items.some(item => pendingDeletionStatuses.has(String(item.job.status).toUpperCase())) ? 'Check deletion status' : `Permanently delete ${deletionModal.items.length} entities` }}
        </button>
      </div>
    </article>
  </div>
</template>
