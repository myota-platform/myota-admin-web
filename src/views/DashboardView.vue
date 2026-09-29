<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest } from '../lib/api';
import { useAppStore } from '../stores/app';
import type { DashboardData } from '../types';

const store = useAppStore();
const loading = ref(true);
const error = ref('');
const data = ref<DashboardData>({ programmes: 0, reviewQueue: 0, accounts: 0, activations: 0 });

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [geo, accounts, activations] = await Promise.all([
      apiRequest<{ total?: number }>('/v1/geodata/entities?status=CANDIDATE&pageSize=1'),
      apiRequest<{ total?: number }>('/v1/identity/admin/accounts?pageSize=1'),
      apiRequest<{ total?: number }>('/v1/activations?pageSize=1'),
    ]);
    data.value = { programmes: store.programmes.length, reviewQueue: geo.total || 0, accounts: accounts.total || 0, activations: activations.total || 0 };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load dashboard.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">OVERVIEW</p><h1>Good to see you, {{ store.account?.displayName || 'administrator' }}</h1><p class="muted">A live view of programmes, reviews, activity and access signals.</p></div><button class="primary" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh data' }}</button></section>
  <div v-if="error" class="error-card" role="alert">{{ error }}</div>
  <div v-if="loading" class="loading-card">Loading dashboard…</div>
  <div v-else class="metrics">
    <article class="metric"><span>Programmes</span><strong>{{ data.programmes }}</strong><small>configured initiatives</small></article>
    <article class="metric amber"><span>Review queue</span><strong>{{ data.reviewQueue }}</strong><small>candidates awaiting decision</small></article>
    <article class="metric"><span>Accounts</span><strong>{{ data.accounts }}</strong><small>identity records</small></article>
    <article class="metric blue"><span>Activations</span><strong>{{ data.activations }}</strong><small>recorded activity</small></article>
  </div>
  <div class="dashboard-grid"><article class="panel"><p class="eyebrow">MIGRATION SLICE</p><h2>Vue administration shell</h2><p class="muted">The shell, authentication, programme scope and dashboard are now Vue 3 components with strict TypeScript. Other workflows remain available through the compatibility workspace while they are migrated domain by domain.</p></article><article class="panel"><p class="eyebrow">NEXT WORKSPACE</p><h2>Geodata imports</h2><p class="muted">The next migration slice will move the import queue and selected-run detail workspace into Vue, including validation, duplicate comparison and promotion controls.</p></article></div>
</template>
