/**
 * Wire-message shapes exchanged between the main thread and the
 * background worker (`background.worker.ts`).
 *
 * Business rules:
 *   - Every field is a JSON-cloneable primitive so `postMessage` survives
 *     the structured-clone hop.
 *   - Each union is discriminated on `type` so both sides can `switch`
 *     exhaustively.
 */

/** main → worker: kick off a job. */
export interface StartJobMessage {
  type: 'start';
  jobId: string;
  kind: string;
  input?: unknown;
}

/** main → worker: cancel an in-flight job. */
export interface CancelJobMessage {
  type: 'cancel';
  jobId: string;
}

/** main → worker: terminate cleanly on app shutdown. */
export interface ShutdownMessage {
  type: 'shutdown';
}

/** worker → main: acknowledgement that a job started running. */
export interface StartedMessage {
  type: 'started';
  jobId: string;
}

/** worker → main: progress tick (throttled by main to ≤ 1/50 ms). */
export interface ProgressMessage {
  type: 'progress';
  jobId: string;
  /** 0..100 inclusive. */
  pct: number;
  label: string;
}

/** worker → main: terminal success with a result payload. */
export interface DoneMessage {
  type: 'done';
  jobId: string;
  result: unknown;
}

/** worker → main: terminal error / cancellation. */
export interface ErrorMessage {
  type: 'error';
  jobId: string;
  error: { code: string; message: string };
}

/** Union of every legal main → worker message. */
export type MainToWorkerMessage = StartJobMessage | CancelJobMessage | ShutdownMessage;

/** Union of every legal worker → main message. */
export type WorkerToMainMessage =
  | StartedMessage
  | ProgressMessage
  | DoneMessage
  | ErrorMessage;
