import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type { ActorIdentity } from './types.js';

export function audit(
  db: Database,
  projectId: string | null,
  actor: ActorIdentity,
  action: string,
  metadata: Record<string, unknown> = {}
): void {
  db.run(
    `INSERT INTO audit_events
      (id, project_id, actor_type, actor_id, actor_name, action, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    projectId,
    actor.type,
    actor.id,
    actor.name,
    action,
    JSON.stringify(metadata),
    new Date().toISOString()
  );
}
