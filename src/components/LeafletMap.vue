<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GeoEntity } from '../types';

declare global { interface Window { L?: any } }

const props = withDefaults(defineProps<{ entities: GeoEntity[]; selectedId?: string; height?: string }>(), { height: '620px' });
const emit = defineEmits<{ select: [entity: GeoEntity] }>();
const mapElement = ref<HTMLElement | null>(null);
let map: any = null;
let layerGroup: any = null;

function styleFor(entity: GeoEntity): Record<string, unknown> {
  const colors: Record<string, [string, string]> = { CANDIDATE: ['#fbbf24', '#7c5410'], APPROVED: ['#10b981', '#065f46'], RETIRED: ['#94a3b8', '#475569'], REJECTED: ['#ef4444', '#991b1b'] };
  const [fillColor, color] = colors[entity.status] || colors.CANDIDATE;
  return { color, fillColor, fillOpacity: .35, weight: 2, radius: 8 };
}

function popupText(entity: GeoEntity): string {
  const location = entity.location || {};
  const categories = (entity.entityTypes || []).map(item => typeof item === 'string' ? item : item.code).join(', ');
  const programmes = (entity.programmes || []).map(item => typeof item === 'string' ? item : item.name || item.slug).join(', ');
  return `<strong>${escapeHtml(entity.name)}</strong><br>Status: ${escapeHtml(entity.status)}<br>Category: ${escapeHtml(categories || entity.entityType || '—')}<br>Programmes: ${escapeHtml(programmes || 'Unassigned')}<br>Location: ${escapeHtml([location.city, location.region, location.country].filter(Boolean).join(', ') || '—')}`;
}

function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character)); }

function renderLayers(): void {
  if (!map || !window.L) return;
  layerGroup?.clearLayers();
  const bounds = window.L.latLngBounds([]);
  props.entities.filter(entity => entity.geometry).forEach(entity => {
    const style = styleFor(entity);
    const feature = { type: 'Feature', geometry: entity.geometry };
    const layer = window.L.geoJSON(feature, {
      style,
      pointToLayer: (_feature: unknown, latlng: unknown) => window.L.circleMarker(latlng, style),
    });
    layer.on('click', () => emit('select', entity));
    layer.bindPopup(popupText(entity));
    if (entity.id === props.selectedId) layer.setStyle({ weight: 4, color: '#123d3a' });
    layer.addTo(layerGroup);
    const layerBounds = layer.getBounds();
    if (layerBounds.isValid()) bounds.extend(layerBounds);
  });
  if (bounds.isValid() && !props.selectedId) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
}

function focusSelected(): void {
  const entity = props.entities.find(item => item.id === props.selectedId);
  if (!map || !entity?.geometry || !window.L) return;
  const layer = window.L.geoJSON({ type: 'Feature', geometry: entity.geometry });
  const bounds = layer.getBounds();
  if (!bounds.isValid()) return;
  if (entity.geometry.type === 'Point') map.setView(bounds.getCenter(), Math.max(map.getZoom(), 15), { animate: true });
  else map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17, animate: true });
}

onMounted(async () => {
  await nextTick();
  if (!mapElement.value || !window.L) return;
  map = window.L.map(mapElement.value, { zoomControl: true, attributionControl: true });
  window.L.tileLayer((window as any).MYOTA_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' }).addTo(map);
  layerGroup = window.L.layerGroup().addTo(map);
  map.setView([37.395, -5.995], 12);
  renderLayers();
});
watch(() => props.entities, renderLayers, { deep: true });
watch(() => props.selectedId, () => { renderLayers(); focusSelected(); });
onBeforeUnmount(() => { map?.remove(); map = null; });
</script>

<template>
  <div ref="mapElement" class="leaflet-map" :style="{ height }" role="application" aria-label="OpenStreetMap entity map">
  </div>
</template>
