import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { ApiClient } from './api';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_FLUSH_REQUEST = 2;
const MESSAGE_FLUSH_ACK = 3;

export type ConnectionStatus = 'connecting' | 'synchronizing' | 'connected' | 'disconnected';

export class TicketedYProvider {
  readonly awareness: awarenessProtocol.Awareness;
  private socket: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private retryTimer: number | null = null;
  private listeners = new Set<(status: ConnectionStatus) => void>();
  private status: ConnectionStatus = 'disconnected';
  private nextFlushId = 1;
  private readonly pendingFlushes = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: number }>();

  constructor(
    private readonly api: ApiClient,
    private readonly projectHash: string,
    private readonly fileId: string,
    readonly doc: Y.Doc
  ) {
    this.awareness = new awarenessProtocol.Awareness(doc);
    doc.on('update', this.onDocumentUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    void this.connect();
  }

  subscribe(listener: (status: ConnectionStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  flush(): Promise<void> {
    if (this.status !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('The editor is not synchronized yet'));
    }
    const requestId = this.nextFlushId++;
    const message = encoding.createEncoder();
    encoding.writeVarUint(message, MESSAGE_FLUSH_REQUEST);
    encoding.writeVarUint(message, requestId);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingFlushes.delete(requestId);
        reject(new Error('Timed out while synchronizing the editor'));
      }, 5_000);
      this.pendingFlushes.set(requestId, { resolve, reject, timer });
      this.socket!.send(encoding.toUint8Array(message));
    });
  }

  destroy(): void {
    this.stopped = true;
    if (this.retryTimer != null) window.clearTimeout(this.retryTimer);
    this.doc.off('update', this.onDocumentUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    this.awareness.destroy();
    this.rejectPendingFlushes(new Error('Editor closed'));
    this.socket?.close(1000, 'Editor closed');
    this.socket = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus('connecting');
    try {
      const ticket = await this.api.createWsTicket(this.projectHash, 'file', this.fileId);
      if (this.stopped) return;
      const socket = new WebSocket(this.api.websocketUrl(ticket.path, ticket.ticket));
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.setStatus('synchronizing');
        const sync = encoding.createEncoder();
        encoding.writeVarUint(sync, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(sync, this.doc);
        socket.send(encoding.toUint8Array(sync));
        if (this.awareness.getLocalState() != null) this.sendAwareness([this.doc.clientID]);
      });
      socket.addEventListener('message', (event) => this.receive(new Uint8Array(event.data as ArrayBuffer)));
      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = null;
        this.rejectPendingFlushes(new Error('Editor disconnected'));
        this.setStatus('disconnected');
        this.scheduleReconnect();
      });
      socket.addEventListener('error', () => socket.close());
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private receive(bytes: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(bytes);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const syncType = decoding.peekVarUint(decoder);
        const response = encoding.createEncoder();
        encoding.writeVarUint(response, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, response, this.doc, this);
        if (encoding.length(response) > 1 && this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(encoding.toUint8Array(response));
        }
        if (syncType === syncProtocol.messageYjsSyncStep2) {
          this.retry = 0;
          this.setStatus('connected');
        }
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
      } else if (type === MESSAGE_FLUSH_ACK) {
        const requestId = decoding.readVarUint(decoder);
        const pending = this.pendingFlushes.get(requestId);
        if (pending) {
          window.clearTimeout(pending.timer);
          this.pendingFlushes.delete(requestId);
          pending.resolve();
        }
      }
    } catch {
      this.socket?.close(1003, 'Invalid collaboration message');
    }
  }

  private readonly onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.socket?.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.socket.send(encoding.toUint8Array(encoder));
  };

  private readonly onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return;
    this.sendAwareness(added.concat(updated, removed));
  };

  private sendAwareness(clients: number[]): void {
    if (!clients.length || this.socket?.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients));
    this.socket.send(encoding.toUint8Array(encoder));
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer != null) return;
    const delay = Math.min(10_000, 500 * 2 ** this.retry++);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private rejectPendingFlushes(error: Error): void {
    for (const pending of this.pendingFlushes.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingFlushes.clear();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}
