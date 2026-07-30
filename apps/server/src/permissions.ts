import type { Database } from './database.js';
import { HttpError } from './errors.js';
import type { AuthActor, ProjectRecord, ProjectRole } from './types.js';

export interface ProjectAccess {
  project: ProjectRecord;
  role: ProjectRole | 'agent';
  canWrite: boolean;
  canManage: boolean;
}

export function projectAccess(db: Database, actor: AuthActor, publicHash: string): ProjectAccess {
  const project = db.get<ProjectRecord>('SELECT * FROM projects WHERE public_hash = ?', publicHash);
  if (!project) throw new HttpError(404, 'Project not found', 'project_not_found');

  if (actor.type === 'agent') {
    if (actor.projectId !== project.id) throw new HttpError(404, 'Project not found', 'project_not_found');
    return { project, role: 'agent', canWrite: true, canManage: false };
  }

  const membership = db.get<{ role: ProjectRole }>(
    'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    project.id,
    actor.id
  );
  if (!membership) throw new HttpError(404, 'Project not found', 'project_not_found');
  return {
    project,
    role: membership.role,
    canWrite: membership.role === 'owner' || membership.role === 'editor',
    canManage: membership.role === 'owner'
  };
}

export function requireWrite(access: ProjectAccess): void {
  if (!access.canWrite) throw new HttpError(403, 'Editor access is required', 'editor_required');
}

export function requireOwner(access: ProjectAccess): void {
  if (!access.canManage) throw new HttpError(403, 'Project owner access is required', 'owner_required');
}
