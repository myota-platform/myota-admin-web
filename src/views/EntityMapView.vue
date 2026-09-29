<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest } from '../lib/api';
import LeafletMap from '../components/LeafletMap.vue';
import type { GeoEntity } from '../types';

const entities = ref<GeoEntity[]>([]); const selected = ref<GeoEntity | null>(null); const loading = ref(false); const error = ref('');
async function load(): Promise<void> { loading.value = true; try { const data = await apiRequest<{ items: GeoEntity[] }>('/v1/geodata/entities?page=1&pageSize=1000'); entities.value = data.items || []; } catch (e) { error.value = e instanceof Error ? e.message : 'Unable to load entities.'; } finally { loading.value = false; } }
function select(entity: GeoEntity): void { selected.value = entity; }
function categories(entity: GeoEntity): string { return (entity.entityTypes || (entity.entityType ? [entity.entityType] : [])).map(item => typeof item === 'string' ? item : item.code).join(', ') || '—'; }
function programmes(entity: GeoEntity): string { return (entity.programmes || []).map(item => typeof item === 'string' ? item : item.name || item.slug).join(', ') || 'Unassigned'; }
onMounted(load);
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">GEODATA</p><h1>Entity map</h1><p class="muted">Explore all catalogue entities. Click a feature to open its popup and details.</p></div><button class="secondary" @click="load">Refresh map</button></section>
  <div v-if="error" class="error-card">{{ error }}</div><article class="panel map-panel"><div class="panel-heading"><h2>{{ loading ? 'Loading…' : `${entities.length} entities` }}</h2></div><LeafletMap :entities="entities" :selected-id="selected?.id" height="760px" @select="select"></LeafletMap></article>
  <article v-if="selected" class="panel selected-entity"><div class="panel-heading"><div><p class="eyebrow">SELECTED ENTITY</p><h2>{{ selected.name }}</h2></div><span class="status-pill" :class="selected.status.toLowerCase()">{{ selected.status }}</span></div><div class="info-grid"><div><span>Category</span><strong>{{ categories(selected) }}</strong></div><div><span>Programmes</span><strong>{{ programmes(selected) }}</strong></div><div><span>Continent</span><strong>{{ selected.location?.continent || '—' }}</strong></div><div><span>Country</span><strong>{{ selected.location?.country || '—' }}</strong></div><div><span>Region</span><strong>{{ selected.location?.region || '—' }}</strong></div><div><span>City</span><strong>{{ selected.location?.city || '—' }}</strong></div></div></article>
</template>
