<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const legacyPath = computed(() => {
  const path = route.path.replace(/^\//, '') || 'dashboard';
  return `/legacy/index.html#${encodeURIComponent(path)}`;
});
</script>

<template>
  <section class="legacy-workspace">
    <div class="workspace-banner"><div><p class="eyebrow">COMPATIBILITY WORKSPACE</p><h1>{{ route.meta.title || 'Administration' }}</h1><p class="muted">This workflow is still running in the proven administration implementation while it is migrated to Vue.</p></div></div>
    <iframe :src="legacyPath" :title="`Legacy ${route.meta.title || 'administration'} workspace`" />
  </section>
</template>
