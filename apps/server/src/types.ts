export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type ActorType = 'user' | 'agent' | 'system';

export interface UserRecord {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export interface AgentRecord {
  id: string;
  project_id: string;
  project_hash: string;
  name: string;
  token_hash: string;
  revoked_at: string | null;
}

export type AuthActor =
  | {
      type: 'user';
      id: string;
      name: string;
      isAdmin: boolean;
      sessionHash: string;
    }
  | {
      type: 'agent';
      id: string;
      name: string;
      projectId: string;
      projectHash: string;
      tokenHash: string;
    };

export interface ProjectRecord {
  id: string;
  public_hash: string;
  owner_id: string;
  name: string;
  entry_file: string;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: string;
  project_id: string;
  path: string;
  kind: 'text' | 'binary';
  mime_type: string;
  content: Uint8Array;
  y_state: Uint8Array | null;
  revision_hash: string;
  created_at: string;
  updated_at: string;
}

export interface ActorIdentity {
  type: ActorType;
  id: string;
  name: string;
}
