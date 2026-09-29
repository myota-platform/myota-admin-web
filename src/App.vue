<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from './stores/app';
import AppShell from './components/AppShell.vue';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const loading = ref(true);

onMounted(async () => {
  if (route.meta.public) {
    loading.value = false;
    return;
  }
  if (!await store.bootstrap()) await router.replace({ path: '/login', query: { redirect: route.fullPath } });
  loading.value = false;
});
</script>

<template>
  <div v-if="loading" class="loading-screen">Loading MyOTA administration…</div>
  <router-view v-else v-slot="{ Component }">
    <AppShell v-if="!route.meta.public"><component :is="Component" /></AppShell>
    <component :is="Component" v-else />
  </router-view>
</template>
