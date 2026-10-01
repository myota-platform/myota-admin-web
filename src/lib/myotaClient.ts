/** Contract-generated preferred resource client.
 *
 * Reads and uploads continue to use apiRequest directly; lifecycle writes go
 * through this façade so deprecated action routes cannot quietly return to the
 * admin UI during future edits.
 */
import { apiRequest } from './api';

function write<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown = {}): Promise<T> {
  return apiRequest<T>(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export const myotaClient = {
  patchProgramme<T = unknown>(slug: string, body: unknown) { return write<T>(`/v1/programmes/${encodeURIComponent(slug)}`, 'PATCH', body); },
  assignProgrammeEntityCategory<T = unknown>(slug: string, code: string) { return write<T>(`/v1/programmes/${encodeURIComponent(slug)}/entity-types/${encodeURIComponent(code)}`, 'PUT'); },
  unassignProgrammeEntityCategory<T = unknown>(slug: string, code: string) { return write<T>(`/v1/programmes/${encodeURIComponent(slug)}/entity-types/${encodeURIComponent(code)}`, 'DELETE'); },
  patchProgrammeContent<T = unknown>(slug: string, id: string, body: unknown) { return write<T>(`/v1/programmes/${encodeURIComponent(slug)}/content/${encodeURIComponent(id)}`, 'PATCH', body); },
  patchProgrammePolicyDraft<T = unknown>(slug: string, id: string, body: unknown) { return write<T>(`/v1/programmes/${encodeURIComponent(slug)}/policy-drafts/${encodeURIComponent(id)}`, 'PATCH', body); },
  patchIdentityAccount<T = unknown>(id: string, body: unknown) { return write<T>(`/v1/identity/accounts/${encodeURIComponent(id)}`, 'PATCH', body); },
  createIdentityRole<T = unknown>(body: unknown) { return write<T>('/v1/identity/roles', 'POST', body); },
  patchIdentityRole<T = unknown>(code: string, body: unknown) { return write<T>(`/v1/identity/roles/${encodeURIComponent(code)}`, 'PATCH', body); },
  patchGeodataEntityMetadata<T = unknown>(id: string, body: unknown) { return write<T>(`/v1/geodata/entities/${encodeURIComponent(id)}`, 'PATCH', body); },
  putGeodataEntityGeometry<T = unknown>(id: string, body: unknown) { return write<T>(`/v1/geodata/entities/${encodeURIComponent(id)}/geometry`, 'PUT', body); },
  putGeodataEntityCategories<T = unknown>(id: string, body: unknown) { return write<T>(`/v1/geodata/entities/${encodeURIComponent(id)}/categories`, 'PUT', body); },
  postGeodataEntityReview<T = unknown>(id: string, body: unknown) { return write<T>(`/v1/geodata/entities/${encodeURIComponent(id)}/reviews`, 'POST', body); },
  postGeodataProposal<T = unknown>(body: unknown) { return write<T>('/v1/geodata/proposals', 'POST', body); },
  createGeodataEntityDeletionJob<T = unknown>(body: unknown) { return write<T>('/v1/geodata/entity-deletion-jobs', 'POST', body); },
  confirmGeodataEntityDeletionJob<T = unknown>(jobId: string, body: unknown) { return write<T>(`/v1/geodata/entity-deletion-jobs/${encodeURIComponent(jobId)}/confirm`, 'POST', body); },
  patchAward<T = unknown>(id: string, body: unknown) { return write<T>(`/v1/awards/${encodeURIComponent(id)}`, 'PATCH', body); },
};
