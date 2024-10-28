import { Op } from '../op';
import type { BlobRecord } from './blob';
import type { DocDiff, DocRecord, DocUpdate } from './doc';
import type { HistoryFilter, ListedHistory } from './history';
import type { PeerClock } from './sync';

// Doc Operations
export class GetDocOp extends Op<{ docId: string }, DocRecord | null> {}
export class GetDocDiffOp extends Op<
  { docId: string; state?: Uint8Array },
  DocDiff | null
> {}
export class PushDocUpdateOp extends Op<
  { docId: string; bin: Uint8Array; editor?: string },
  void
> {}
export class GetDocTimestamps extends Op<void, Record<string, number>> {}
export class DeleteDocOp extends Op<{ docId: string }, void> {}
export class SubscribeDocUpdateOp extends Op<void, DocUpdate> {}

// History Operations
export class ListHistoryOp extends Op<
  { docId: string; filter?: HistoryFilter },
  ListedHistory[]
> {}
export class GetHistoryOp extends Op<
  { docId: string; timestamp: number },
  DocRecord | null
> {}
export class CreateHistoryOp extends Op<DocRecord, void> {}
export class DeleteHistoryOp extends Op<
  { docId: string; timestamp: number },
  void
> {}
export class RollbackDocOp extends Op<
  { docId: string; timestamp: number; editor?: string },
  void
> {}

// Blob Operations
export class GetBlobOp extends Op<{ key: string }, BlobRecord | null> {}
export class SetBlobOp extends Op<BlobRecord, void> {}
export class DeleteBlobOp extends Op<
  { key: string; permanently: boolean },
  void
> {}
export class ReleaseBlobsOp extends Op<void, { count: number }> {}
export class ListBlobsOp extends Op<void, BlobRecord[]> {}

// Sync Operations
export class GetPeerClocksOp extends Op<
  { peer: string },
  Record<string, number>
> {}
export class SetPeerClockOp extends Op<{ peer: string } & PeerClock, void> {}
export class GetPeerPushedClocksOp extends Op<
  { peer: string },
  Record<string, number>
> {}
export class SetPeerPushedClockOp extends Op<
  { peer: string } & PeerClock,
  void
> {}
