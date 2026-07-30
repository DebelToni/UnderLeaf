import type { AuthService } from './auth.js';
import type { CollaborationManager, EventHub } from './collaboration.js';
import type { Compiler } from './compiler.js';
import type { Database } from './database.js';
import type { ProjectStore } from './project-store.js';
import type { TicketStore, WebSocketGateway } from './websockets.js';

export interface AppContext {
  db: Database;
  auth: AuthService;
  projects: ProjectStore;
  collaboration: CollaborationManager;
  events: EventHub;
  compiler: Compiler;
  tickets: TicketStore;
  gateway: WebSocketGateway;
}
