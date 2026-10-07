export interface JetStreamConsumer {
  name: string;
  durable?: string;
  filterSubjects: string[];
  pending: number;
  ackPending: number;
  redelivered: number;
  waiting: number;
  ackPolicy: string;
  ackWaitSeconds: number;
  maxAckPending: number;
  maxDeliver: number;
  deliveredSequence: number;
  ackFloorSequence: number;
  oldestMessageAgeSeconds: number | null;
}
export interface JetStreamStream {
  name: string;
  subjects: string[];
  messages: number;
  bytes: number;
  storage: string;
  retention: string;
  firstSequence: number;
  lastSequence: number;
  consumerCount: number;
  consumersTruncated?: boolean;
  consumers: JetStreamConsumer[];
}
export interface JetStreamSnapshot {
  id: string;
  capturedAt: string;
  status: 'HEALTHY' | 'PARTIAL' | 'UNAVAILABLE';
  stale?: boolean;
  streamsTruncated?: boolean;
  streams: JetStreamStream[];
  errors: string[];
  pollSeconds: number;
  historyRetentionDays: number;
}
export function consumerRows(snapshot: JetStreamSnapshot | null, stream = '', consumer = '') {
  return (snapshot?.streams || []).filter(item => !stream || item.name === stream)
    .flatMap(item => item.consumers.filter(row => !consumer || row.name === consumer)
      .map(row => ({ ...row, stream: item.name })));
}
export function queueTotals(snapshot: JetStreamSnapshot | null, stream = '', consumer = '') {
  if (!snapshot || snapshot.status === 'UNAVAILABLE') return null;
  return consumerRows(snapshot, stream, consumer).reduce((total, row) => ({
    pending: total.pending + row.pending, ackPending: total.ackPending + row.ackPending,
    redelivered: total.redelivered + row.redelivered, consumers: total.consumers + 1,
  }), { pending: 0, ackPending: 0, redelivered: 0, consumers: 0 });
}
