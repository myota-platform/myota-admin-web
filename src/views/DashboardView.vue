<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest } from '../lib/api';
import { useAppStore } from '../stores/app';
import type { DashboardData } from '../types';

const store = useAppStore();
const loading = ref(true);
const error = ref('');
const data = ref<DashboardData>({ programmes: 0, reviewQueue: 0, accounts: 0, activations: 0 });
const reviewItems = ref<Array<{ id: string; name: string; programmeSlug?: string; entityType?: string; status?: string }>>([]);
const securityEvents = ref<Array<{ id?: string; eventType: string; occurredAt?: string; payload?: { accountId?: string } }>>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [geo, accounts, events, activations] = await Promise.all([
      apiRequest<{ items?: typeof reviewItems.value; total?: number }>('/v1/geodata/entities?status=CANDIDATE&pageSize=5'),
      apiRequest<{ total?: number }>('/v1/identity/admin/accounts?pageSize=1'),
      apiRequest<{ items?: typeof securityEvents.value }>('/v1/identity/admin/security-events?pageSize=5'),
      apiRequest<{ total?: number }>('/v1/activations?pageSize=1'),
    ]);
    data.value = { programmes: store.programmes.length, reviewQueue: geo.total || 0, accounts: accounts.total || 0, activations: activations.total || 0 };
    reviewItems.value = geo.items || [];
    securityEvents.value = events.items || [];
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
  <div class="dashboard-grid">
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">REVIEW QUEUE</p><h2>Geodata needing attention</h2></div><RouterLink class="link-button" to="/geodata">Open queue →</RouterLink></div><div class="compact-list"><div v-for="item in reviewItems" :key="item.id" class="list-row"><span class="status-pill candidate">CANDIDATE</span><div><strong>{{ item.name }}</strong><small>{{ item.programmeSlug || 'Platform-wide' }} · {{ item.entityType || 'Uncategorised' }}</small></div><RouterLink class="link-button" to="/geodata">Review</RouterLink></div><p v-if="!reviewItems.length" class="muted empty">The review queue is clear.</p></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">SECURITY CONTEXT</p><h2>Recent identity events</h2></div><RouterLink class="link-button" to="/identity">Identity →</RouterLink></div><div class="compact-list"><div v-for="event in securityEvents" :key="event.id || event.occurredAt" class="list-row"><span class="event-icon">↗</span><div><strong>{{ event.eventType }}</strong><small>{{ event.occurredAt || 'Time unavailable' }} · {{ event.payload?.accountId || 'system' }}</small></div></div><p v-if="!securityEvents.length" class="muted empty">No security events yet.</p></div></article>
  </div>
</template>
