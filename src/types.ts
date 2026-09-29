export interface Account {
  id: string;
  email: string;
  displayName: string;
  roles?: Array<{ role: string; scopes?: string[] }>;
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
