export interface StorageBucket {
  name: string;
  objects: number | null;
  logicalBytes: number | null;
  physicalBytes: number | null;
  readOnly: boolean | null;
}

export interface ObjectStorageSnapshot {
  id: string;
  capturedAt: string;
  sampledAt?: string;
  status: 'HEALTHY' | 'PARTIAL' | 'UNAVAILABLE';
  stale?: boolean;
  version: string | null;
  s3Healthy: boolean;
  metricsHealthy: boolean;
  bucketsTruncated: boolean;
  pollSeconds: number;
  historyRetentionDays: number;
  errors: string[];
  buckets: StorageBucket[];
  volumes: { name: string; totalBytes: number | null; usedBytes: number | null; availableBytes: number | null }[];
  requests: { operation: string; code: string; count: number }[];
  summary: {
    reportedBuckets: number;
    objects: number | null;
    logicalBytes: number | null;
    physicalBytes: number | null;
    activeUploads: number | null;
    activeUploadBytes: number | null;
  };
}

export function storageBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = value > 0 ? Math.min(4, Math.floor(Math.log(value) / Math.log(1024))) : 0;
  return `${(value / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units[index]}`;
}
