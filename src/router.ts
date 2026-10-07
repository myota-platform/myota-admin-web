import { createRouter, createWebHistory } from 'vue-router';
import { accessToken } from './lib/api';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import ProgrammesView from './views/ProgrammesView.vue';
import PoliciesView from './views/PoliciesView.vue';
import ContentView from './views/ContentView.vue';
import MasterDataView from './views/MasterDataView.vue';
import IdentityView from './views/IdentityView.vue';
import ActivityView from './views/ActivityView.vue';
import AwardsView from './views/AwardsView.vue';
import GeodataImportsView from './views/GeodataImportsView.vue';
import GeodataWorkspaceView from './views/GeodataWorkspaceView.vue';
import EntityMapView from './views/EntityMapView.vue';
import JetStreamView from './views/JetStreamView.vue';

const routes = [
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: DashboardView, meta: { title: 'Dashboard' } },
  { path: '/programmes', component: ProgrammesView, meta: { title: 'Programmes' } },
  { path: '/policies', component: PoliciesView, meta: { title: 'Programme policy' } },
  { path: '/content', component: ContentView, meta: { title: 'Content & translations' } },
  { path: '/master-data', component: MasterDataView, meta: { title: 'Master data' } },
  { path: '/identity', component: IdentityView, meta: { title: 'Users & roles' } },
  { path: '/activity', component: ActivityView, meta: { title: 'Activations & QSOs' } },
  { path: '/awards', component: AwardsView, meta: { title: 'Award certificates' } },
  { path: '/geodata', component: GeodataWorkspaceView, props: { mode: 'review' }, meta: { title: 'Review queue' } },
  { path: '/entity-management', component: GeodataWorkspaceView, props: { mode: 'management' }, meta: { title: 'Entity catalogue' } },
  { path: '/entity-map', component: EntityMapView, meta: { title: 'Map explorer' } },
  { path: '/geodata-imports', component: GeodataImportsView, meta: { title: 'Geodata imports' } },
  { path: '/jetstream', component: JetStreamView, meta: { title: 'NATS / JetStream' } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!accessToken()) return { path: '/login', query: { redirect: to.fullPath } };
  return true;
});
