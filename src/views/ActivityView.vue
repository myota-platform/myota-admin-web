<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest } from '../lib/api';
interface Activation { id: string; programmeSlug?: string; entityId?: string; operatorId?: string; status?: string; qsos?: unknown[]; startedAt?: string; closedAt?: string; }
const items = ref<Activation[]>([]); const error = ref('');
async function load(): Promise<void> { try { const data = await apiRequest<{ items: Activation[] }>('/v1/activations?pageSize=100'); items.value = data.items || []; } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to load activity.'; } }
onMounted(load);
</script>

<template><section class="page-heading"><div><p class="eyebrow">OPERATIONS</p><h1>Activations & QSOs</h1><p class="muted">Protected activation and QSO operational view. Activity and awards share the same service boundary.</p></div><button class="secondary" @click="load">Refresh</button></section><div v-if="error" class="error-card">{{ error }}</div><article class="panel"><div class="panel-heading"><h2>Activations</h2><span class="muted">{{ items.length }} loaded</span></div><div class="table-list"><div v-for="item in items" :key="item.id" class="table-row"><span><strong>{{ item.id.slice(0, 8) }}…</strong><small>{{ item.programmeSlug || 'Unassigned' }} · {{ item.entityId }} · {{ item.operatorId }}</small><small>{{ item.startedAt || 'Not started' }}<span v-if="item.closedAt"> → {{ item.closedAt }}</span></small></span><span class="status-pill" :class="item.status === 'OPEN' ? 'proposed' : 'approved'">{{ item.status }}</span><span>{{ item.qsos?.length || 0 }} QSOs</span></div><p v-if="!items.length" class="muted empty">No activations recorded.</p></div></article></template>
