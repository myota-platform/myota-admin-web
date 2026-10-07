export interface Account {
  id: string;
  email: string;
  displayName: string;
  roles?: Array<{ role: string; scopes?: string[] }>;
  scopes?: string[];
}

export interface Programme {
  slug: string;
  name: string;
  description?: string;
  status?: string;
}

export interface DashboardData {
  programmes: number;
  reviewQueue: number;
  accounts: number;
  activations: number;
}

export interface EntityCategory {
  code: string;
  label?: string;
  description?: string;
  geometryTypes?: string[];
  geometry?: string;
  active?: boolean;
  assignedProgrammes?: string[];
}

export interface GeoEntity {
  version?: number;
  id: string;
  name: string;
  status: string;
  entityType?: string;
  entityTypes?: string[] | EntityCategory[];
  programmeSlug?: string;
  programmes?: Array<string | { slug: string; name?: string }>;
  geometry?: { type: string; coordinates: unknown };
  location?: Record<string, string | null | undefined>;
  provenance?: Record<string, unknown>;
}
