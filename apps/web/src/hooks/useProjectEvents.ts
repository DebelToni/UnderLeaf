import { useEffect, useRef } from 'react';
import type { ApiClient } from '../lib/api';
import type { ProjectEvent } from '../types';

export function useProjectEvents(
  api: ApiClient,
  projectHash: string | undefined,
  onEvent: (event: ProjectEvent) => void
) {
  const callback = useRef(onEvent);
  callback.current = onEvent;

  useEffect(() => {
    if (!projectHash) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let timer: number | null = null;
    let attempt = 0;
    let connectionCount = 0;

    async function connect() {
      if (stopped || !projectHash) return;
      try {
        const ticket = await api.createWsTicket(projectHash, 'events');
        if (stopped) return;
        socket = new WebSocket(api.websocketUrl(ticket.path, ticket.ticket));
        socket.addEventListener('open', () => { attempt = 0; connectionCount += 1; });
        socket.addEventListener('message', (message) => {
          try {
            const event = JSON.parse(message.data as string) as ProjectEvent;
            if (event.type === 'connected') event.reconnected = connectionCount > 1;
            callback.current(event);
          } catch { /* Ignore malformed events. */ }
        });
        socket.addEventListener('close', schedule);
        socket.addEventListener('error', () => socket?.close());
      } catch {
        schedule();
      }
    }

    function schedule() {
      if (stopped || timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        attempt += 1;
        void connect();
      }, Math.min(10_000, 500 * 2 ** attempt));
    }

    void connect();
    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
      socket?.close(1000, 'Workspace closed');
    };
  }, [api, projectHash]);
}
