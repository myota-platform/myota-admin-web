<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";
import { utcDisplay } from "../lib/utc";
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiRequest } from '../lib/api';
import { consumerRows, queueTotals } from '../lib/jetstream';
import type { JetStreamSnapshot } from '../lib/jetstream';

const latest = ref<JetStreamSnapshot | null>(null);
const history = ref<JetStreamSnapshot[]>([]);
const historyTotal = ref(0);
const page = ref(1);
const pageSize = 20;
const stream = ref('');
const consumer = ref('');
const refreshing = ref(false);
const error = ref('');
const detail = ref<JetStreamSnapshot | null>(null);
const controller = new AbortController();
let poll: ReturnType<typeof setInterval> | undefined;
let disposed = false;
const totals = computed(() => queueTotals(latest.value, stream.value, consumer.value));
const rows = computed(() => consumerRows(latest.value, stream.value, consumer.value));
const streams = computed(() => (latest.value?.streams || []).filter(item => !stream.value || item.name === stream.value));
const consumers = computed(() => [...new Set(consumerRows(latest.value, stream.value).map(item => item.name))]);
watch(stream, () => { consumer.value = ''; });
function timestamp(value?: string): string { return utcDisplay(value); }
function age(value: number | null): string { return value === null ? 'Unavailable' : `${Math.round(value)} s`; }
async function refresh(): Promise<void> {
  if (refreshing.value || disposed) return;
  refreshing.value = true;
  const requestedPage = page.value;
  try {
    const [status, samples] = await Promise.all([
      apiRequest<JetStreamSnapshot>('/v1/operations/jetstream', { signal: controller.signal }),
      apiRequest<{ items: JetStreamSnapshot[]; total: number }>(`/v1/operations/jetstream/snapshots?page=${requestedPage}&pageSize=${pageSize}`, { signal: controller.signal }),
    ]);
    if (disposed) return;
    latest.value = status;
    if (page.value === requestedPage) { history.value = samples.items; historyTotal.value = samples.total; }
    error.value = '';
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { refreshing.value = false; }
}
async function changePage(next: number): Promise<void> { page.value = next; await refresh(); }
function refreshVisible(): void { if (!document.hidden) void refresh(); }
onMounted(() => { void refresh(); poll = setInterval(refreshVisible, 10_000); document.addEventListener('visibilitychange', refreshVisible); });
onBeforeUnmount(() => { disposed = true; controller.abort(); clearInterval(poll); document.removeEventListener('visibilitychange', refreshVisible); });
</script>

<template>
<PageHeader :refresh="refresh" :busy="refreshing"></PageHeader>
  <p v-if="error" class="error-card" role="alert">{{ error }}. Previously recorded data, if shown, is not a fresh broker check.</p>
  <section v-if="latest" class="panel">
    <div class="panel-heading"><div><h2>{{ latest.status }}</h2><p class="muted">Sampled {{ timestamp(latest.capturedAt) }} · every {{ latest.pollSeconds }} seconds · history retained {{ latest.historyRetentionDays }} days</p></div><span v-if="latest.stale" class="warning-pill">Stale sample</span></div>
    <p v-for="issue in latest.errors" :key="issue" class="error">{{ issue }}</p>
    <p v-if="latest.streamsTruncated || latest.streams.some(item => item.consumersTruncated)" class="error">The configured inspection limit was reached. This is a partial view; totals exclude unlisted streams or consumers.</p>
    <div class="form-grid">
      <label>Stream<select v-model="stream"><option value="">All streams</option><option v-for="item in latest.streams" :key="item.name">{{ item.name }}</option></select></label>
      <label>Consumer<select v-model="consumer"><option value="">All consumers</option><option v-for="name in consumers" :key="name">{{ name }}</option></select></label>
    </div>
  </section>
  <div class="metrics jetstream-metrics">
    <article class="metric"><span>Pending delivery</span><strong>{{ totals?.pending ?? '—' }}</strong></article>
    <article class="metric amber"><span>Awaiting acknowledgement</span><strong>{{ totals?.ackPending ?? '—' }}</strong></article>
    <article class="metric"><span>Broker redelivered count</span><strong>{{ totals?.redelivered ?? '—' }}</strong></article>
    <article class="metric blue"><span>Listed consumers</span><strong>{{ totals?.consumers ?? '—' }}</strong></article>
  </div>
  <p class="field-help">Totals count deliveries per consumer, not unique files or messages. Redeliveries are the broker's current consumer count, not a lifetime counter. Unknown message age is shown as unavailable.</p>
  <section class="panel">
    <h2>Streams and queue subjects</h2>
    <div v-for="item in streams" :key="item.name" class="form-section jetstream-stream">
      <h3>{{ item.name }}</h3><p class="muted">{{ item.subjects.join(', ') }} · {{ item.messages.toLocaleString() }} stored messages · {{ (item.bytes / 1024 / 1024).toFixed(2) }} MiB · {{ item.storage }} storage · {{ item.retention }} retention</p>
      <p class="field-help">Sequence range {{ item.firstSequence }}–{{ item.lastSequence }} · {{ item.consumerCount }} consumers</p>
    </div>
    <p v-if="!streams.length" class="empty">{{ latest?.status === 'UNAVAILABLE' ? 'Broker state unavailable.' : 'No listed streams.' }}</p>
  </section>
  <section class="panel jetstream-section">
    <h2>Consumers</h2>
    <div class="table-scroll"><table class="operations-table"><thead><tr><th>Stream / consumer</th><th>Queue subjects</th><th>Pending</th><th>Ack pending</th><th>Redelivered</th><th>Oldest age</th><th>Acknowledgement / limits</th></tr></thead><tbody>
      <tr v-for="item in rows" :key="`${item.stream}:${item.name}`"><td><strong>{{ item.name }}</strong><small>{{ item.stream }} · {{ item.durable ? 'durable' : 'ephemeral' }}</small></td><td>{{ item.filterSubjects.join(', ') }}</td><td>{{ item.pending }}</td><td>{{ item.ackPending }}</td><td>{{ item.redelivered }}</td><td>{{ age(item.oldestMessageAgeSeconds) }}</td><td>{{ item.ackPolicy }} · {{ item.ackWaitSeconds }}s timeout<small>Max ack pending {{ item.maxAckPending }} · max deliveries {{ item.maxDeliver }} · waiting pulls {{ item.waiting }}</small><small>Delivered seq {{ item.deliveredSequence }} · ack floor {{ item.ackFloorSequence }}</small></td></tr>
    </tbody></table></div><p v-if="!rows.length" class="empty">No consumer data for this selection.</p>
  </section>
  <section class="panel jetstream-section">
    <h2>Recorded history</h2><p class="muted">Timestamped status samples, not an exhaustive message delivery log. Click a sample for its recorded details. Filters above also apply to the counts below.</p>
    <div class="table-scroll"><table class="operations-table"><thead><tr><th>Captured</th><th>Status</th><th>Pending</th><th>Ack pending</th><th>Redelivered</th></tr></thead><tbody>
      <tr v-for="sample in history" :key="sample.id"><td><button class="link-button" @click="detail = sample">{{ timestamp(sample.capturedAt) }}</button></td><td>{{ sample.status }}</td><td>{{ queueTotals(sample, stream, consumer)?.pending ?? '—' }}</td><td>{{ queueTotals(sample, stream, consumer)?.ackPending ?? '—' }}</td><td>{{ queueTotals(sample, stream, consumer)?.redelivered ?? '—' }}</td></tr>
    </tbody></table></div><p v-if="!history.length" class="empty">No recorded history yet.</p>
    <div class="pagination"><button class="secondary" :disabled="page <= 1 || refreshing" @click="changePage(page - 1)">Previous</button><span>Page {{ page }} · {{ historyTotal }} samples</span><button class="secondary" :disabled="page * pageSize >= historyTotal || refreshing" @click="changePage(page + 1)">Next</button></div>
  </section>
  <div v-if="detail" class="modal-backdrop" @click.self="detail = null" @keydown.esc="detail = null"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="jetstream-history-title"><div class="panel-heading"><div><h2 id="jetstream-history-title">Recorded broker snapshot</h2><p>{{ timestamp(detail.capturedAt) }} · {{ detail.status }}</p></div><button class="secondary" @click="detail = null">Close</button></div><pre class="data-preview">{{ JSON.stringify(detail, null, 2) }}</pre></section></div>
</template>
