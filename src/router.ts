import { createRouter, createWebHistory } from 'vue-router';
import { accessToken } from './lib/api';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import LegacyWorkspaceView from './views/LegacyWorkspaceView.vue';

const routes = [
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: DashboardView, meta: { title: 'Dashboard' } },
  { path: '/:pathMatch(.*)*', component: LegacyWorkspaceView, meta: { title: 'Administration' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!accessToken()) return { path: '/login', query: { redirect: to.fullPath } };
  return true;
});
