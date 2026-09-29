<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const sidebarOpen = ref(false);

const sections = [
  { label: 'Overview', items: [{ label: 'Dashboard', icon: '⌂', path: '/dashboard' }] },
  { label: 'Programme setup', items: [
    { label: 'Programmes', icon: '◈', path: '/programmes' },
    { label: 'Programme policy', icon: '✓', path: '/policies' },
    { label: 'Content & translations', icon: '文', path: '/content' },
    { label: 'Shared catalogue', icon: '▦', path: '/master-data' },
  ] },
  { label: 'Geodata', items: [
    { label: 'Review queue', icon: '⌖', path: '/geodata' },
    { label: 'Imports', icon: '⇧', path: '/geodata-imports' },
    { label: 'Entity catalogue', icon: '✎', path: '/entity-management' },
    { label: 'Map explorer', icon: '◉', path: '/entity-map' },
  ] },
  { label: 'Operations & access', items: [
    { label: 'Activations & QSOs', icon: '◷', path: '/activity' },
    { label: 'Award certificates', icon: '▣', path: '/awards' },
    { label: 'Users & roles', icon: '◎', path: '/identity' },
  ] },
];

const pageTitle = computed(() => route.path === '/dashboard' ? 'Dashboard' : String(route.meta.title || 'Administration'));
function isActive(path: string): boolean { return route.path === path; }
async function signOut(): Promise<void> { store.signOut(); await router.push('/login'); }
</script>

<template>
  <header class="topbar">
    <button class="mobile-menu" aria-label="Open navigation" @click="sidebarOpen = !sidebarOpen">☰</button>
    <RouterLink class="brand" to="/dashboard"><span class="brand-mark">M</span><span><strong>MyOTA</strong><small>Administration · Vue</small></span></RouterLink>
    <div class="top-actions">
      <label class="programme-context"><span>Programme scope</span><select v-model="store.currentProgramme" aria-label="Programme scope"><option value="">All programmes</option><option v-for="programme in store.programmes" :key="programme.slug" :value="programme.slug">{{ programme.name }}</option></select></label>
      <span class="status-dot" :class="store.apiStatus">{{ store.apiStatus === 'connected' ? 'API connected' : 'API warning' }}</span>
      <span class="account-label">{{ store.account?.displayName || store.account?.email }}</span>
      <button class="quiet" @click="signOut">Sign out</button>
    </div>
  </header>
  <div class="app-layout">
    <aside class="sidebar" :class="{ open: sidebarOpen }" aria-label="Administration navigation">
      <p class="nav-label">Workspace</p>
      <nav v-for="section in sections" :key="section.label" class="nav-section">
        <p class="nav-section-label">{{ section.label }}</p>
        <RouterLink v-for="item in section.items" :key="item.path" class="nav-item" :class="{ active: isActive(item.path) }" :aria-current="isActive(item.path) ? 'page' : undefined" :to="item.path" @click="sidebarOpen = false"><span class="nav-item-icon" aria-hidden="true">{{ item.icon }}</span>{{ item.label }}</RouterLink>
      </nav>
      <div class="sidebar-footer"><p class="scope-note">The Vue migration is incremental. Unmigrated workflows remain available through the compatibility workspace on this feature branch.</p></div>
    </aside>
    <main class="content">
      <div class="breadcrumbs"><span>MyOTA</span><span>/</span><strong>{{ pageTitle }}</strong></div>
      <slot />
    </main>
  </div>
</template>
