<script setup lang="ts">
import { utcDisplay } from "../lib/utc";
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { apiRequest } from '../lib/api';
import { storageBytes } from '../lib/objectStorage';
import type { ObjectStorageSnapshot } from '../lib/objectStorage';

const latest = ref<ObjectStorageSnapshot | null>(null);
const history = ref<ObjectStorageSnapshot[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const refreshing = ref(false);
const error = ref('');
const detail = ref<ObjectStorageSnapshot | null>(null);
const controller = new AbortController();
let poll: ReturnType<typeof setInterval> | undefined;
let disposed = false;

function timestamp(value?: string): string { return utcDisplay(value); }
function count(value?: number | null): string { return value == null ? 'Unavailable' : value.toLocaleString(); }
async function refresh(): Promise<void> {
  if (refreshing.value || disposed) return;
  refreshing.value = true;
  const requestedPage = page.value;
  try {
    const [status, samples] = await Promise.all([
      apiRequest<ObjectStorageSnapshot>('/v1/operations/object-storage', { signal: controller.signal }),
      apiRequest<{ items: ObjectStorageSnapshot[]; total: number }>(`/v1/operations/object-storage/snapshots?page=${requestedPage}&pageSize=${pageSize}`, { signal: controller.signal }),
    ]);
    if (disposed) return;
    latest.value = status;
    if (page.value === requestedPage) { history.value = samples.items; total.value = samples.total; }
    error.value = '';
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { refreshing.value = false; }
}
async function changePage(next: number): Promise<void> { page.value = next; await refresh(); }
function refreshVisible(): void { if (!document.hidden) void refresh(); }
async function openDashboard(): Promise<void> {
  try {
    await apiRequest('/v1/operations/observability-session');
    window.location.assign('/observability/d/myota-object-storage');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
onMounted(() => {
  void refresh();
  poll = setInterval(refreshVisible, 30_000);
  document.addEventListener('visibilitychange', refreshVisible);
});
onBeforeUnmount(() => {
  disposed = true;
  controller.abort();
  clearInterval(poll);
  document.removeEventListener('visibilitychange', refreshVisible);
});
</script>

<template>
  <section class="page-heading">
    <div><p class="eyebrow">PLATFORM HEALTH</p><h1>SeaweedFS storage</h1><p class="muted">Storage health, reported buckets, activity and recorded history.</p></div>
    <div class="actions"><button class="secondary" @click="openDashboard">Open storage dashboard</button><button class="secondary" :disabled="refreshing" @click="refresh">{{ refreshing ? 'Refreshing…' : 'Refresh status' }}</button></div>
  </section>
  <p v-if="error" class="error-card" role="alert">{{ error }}. Previously displayed data is not a fresh storage check.</p>
  <section v-if="latest" class="panel">
    <div class="panel-heading"><div><h2>{{ latest.status }}</h2><p class="muted">SeaweedFS {{ latest.version || 'version unavailable' }} · sampled {{ timestamp(latest.capturedAt) }} · every {{ latest.pollSeconds }} seconds · {{ latest.historyRetentionDays }} days of history</p></div><span v-if="latest.stale" class="warning-pill">Stale sample</span></div>
    <p>S3 health: <strong>{{ latest.s3Healthy ? 'Healthy' : 'Unavailable' }}</strong> · Storage metrics: <strong>{{ latest.metricsHealthy ? 'Available' : 'Unavailable' }}</strong></p>
    <p v-for="issue in latest.errors" :key="issue" class="error">{{ issue }}</p>
    <p v-if="latest.bucketsTruncated" class="error">The inspection limit was reached. Totals include only the listed buckets.</p>
  </section>
  <div class="metrics">
    <article class="metric"><span>Reported buckets</span><strong>{{ latest?.metricsHealthy ? count(latest.summary.reportedBuckets) : 'Unavailable' }}</strong></article>
    <article class="metric"><span>Reported objects</span><strong>{{ count(latest?.summary.objects) }}</strong></article>
    <article class="metric blue"><span>Logical object size</span><strong>{{ storageBytes(latest?.summary.logicalBytes) }}</strong></article>
    <article class="metric"><span>Physical bucket size</span><strong>{{ storageBytes(latest?.summary.physicalBytes) }}</strong></article>
    <article class="metric amber"><span>Active uploads</span><strong>{{ count(latest?.summary.activeUploads) }}</strong></article>
    <article class="metric"><span>Bytes being uploaded</span><strong>{{ storageBytes(latest?.summary.activeUploadBytes) }}</strong></article>
  </div>
  <section class="panel">
    <h2>Reported buckets</h2><p class="field-help">These are SeaweedFS exporter gauges, not a full S3 inventory. Empty or inactive buckets may not be reported. Missing values are unavailable; totals exclude unreported buckets.</p>
    <div class="table-scroll"><table class="operations-table"><thead><tr><th>Bucket</th><th>Objects</th><th>Logical size</th><th>Physical size</th><th>Read-only</th></tr></thead><tbody><tr v-for="bucket in latest?.buckets || []" :key="bucket.name"><td><strong>{{ bucket.name }}</strong></td><td>{{ count(bucket.objects) }}</td><td>{{ storageBytes(bucket.logicalBytes) }}</td><td>{{ storageBytes(bucket.physicalBytes) }}</td><td>{{ bucket.readOnly == null ? 'Unavailable' : bucket.readOnly ? 'Yes' : 'No' }}</td></tr></tbody></table></div>
    <p v-if="!latest?.buckets.length" class="empty">No bucket gauges available.</p>
  </section>
  <section class="panel">
    <h2>Storage filesystems</h2><p class="field-help">Capacity comes from the underlying filesystem reported by SeaweedFS. With local-path volumes this can be shared host capacity, rather than the Kubernetes volume quota.</p>
    <div class="table-scroll"><table class="operations-table"><thead><tr><th>Filesystem</th><th>Total</th><th>Used</th><th>Available</th></tr></thead><tbody><tr v-for="volume in latest?.volumes || []" :key="volume.name"><td>{{ volume.name }}</td><td>{{ storageBytes(volume.totalBytes) }}</td><td>{{ storageBytes(volume.usedBytes) }}</td><td>{{ storageBytes(volume.availableBytes) }}</td></tr></tbody></table></div><p v-if="!latest?.volumes.length" class="empty">Filesystem gauges unavailable.</p>
  </section>
  <section class="panel">
    <h2>S3 request counters</h2><p class="field-help">Cumulative exporter counters, which can reset on restart. Open the storage dashboard for request rates and latency graphs.</p>
    <div class="table-scroll"><table class="operations-table"><thead><tr><th>Operation</th><th>HTTP status</th><th>Requests</th></tr></thead><tbody><tr v-for="request in latest?.requests || []" :key="`${request.operation}:${request.code}`"><td>{{ request.operation }}</td><td>{{ request.code }}</td><td>{{ count(request.count) }}</td></tr></tbody></table></div><p v-if="!latest?.requests.length" class="empty">No request counters available.</p>
  </section>
  <section class="panel">
    <h2>Recorded history</h2><p class="muted">Click a timestamp for the recorded sample. These are status samples, not object access logs.</p>
    <div class="table-scroll"><table class="operations-table"><thead><tr><th>Captured</th><th>Status</th><th>Objects</th><th>Logical size</th><th>Active uploads</th></tr></thead><tbody><tr v-for="sample in history" :key="sample.id"><td><button class="link-button" @click="detail = sample">{{ timestamp(sample.capturedAt) }}</button></td><td>{{ sample.status }}</td><td>{{ count(sample.summary.objects) }}</td><td>{{ storageBytes(sample.summary.logicalBytes) }}</td><td>{{ count(sample.summary.activeUploads) }}</td></tr></tbody></table></div><p v-if="!history.length" class="empty">No history recorded yet.</p>
    <div class="pagination"><button class="secondary" :disabled="page <= 1 || refreshing" @click="changePage(page - 1)">Previous</button><span>Page {{ page }} · {{ total }} samples</span><button class="secondary" :disabled="page * pageSize >= total || refreshing" @click="changePage(page + 1)">Next</button></div>
  </section>
  <div v-if="detail" class="modal-backdrop" @click.self="detail = null" @keydown.esc="detail = null"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="storage-history-title"><div class="panel-heading"><div><h2 id="storage-history-title">Recorded storage snapshot</h2><p>{{ timestamp(detail.capturedAt) }} · {{ detail.status }}</p></div><button class="secondary" @click="detail = null">Close</button></div><pre class="data-preview">{{ JSON.stringify(detail, null, 2) }}</pre></section></div>
</template>
