import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from './config.js';
import type { Database } from './database.js';
import { HttpError } from './errors.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './security.js';
import type { AgentRecord, AuthActor, UserRecord } from './types.js';

interface SessionRow extends UserRecord {
  token_hash: string;
  expires_at: string;
}

export class AuthService {
  constructor(private readonly db: Database) {}

  async createUser(usernameInput: string, password: string, isAdmin = false): Promise<UserRecord> {
    const username = validateUserInput(usernameInput, password);
    const duplicate = this.db.get<{ id: string }>('SELECT id FROM users WHERE username = ?', username);
    if (duplicate) throw new HttpError(409, 'Username is already taken', 'username_taken');
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      username,
      display_name: username,
      password_hash: await hashPassword(password),
      is_admin: isAdmin ? 1 : 0,
      created_at: now
    };
    this.db.run(
      'INSERT INTO users (id, username, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      user.id,
      user.username,
      user.display_name,
      user.password_hash,
      user.is_admin,
      user.created_at
    );
    return user;
  }

  async registerWithInvite(inviteToken: string, usernameInput: string, password: string): Promise<UserRecord> {
    const username = validateUserInput(usernameInput, password);
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      const invite = this.db.get<{ id: string }>(
        'SELECT id FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
        sha256(inviteToken),
        now
      );
      if (!invite) throw new HttpError(400, 'This invitation is invalid or expired', 'invalid_invite');
      if (this.db.get<{ id: string }>('SELECT id FROM users WHERE username = ?', username)) {
        throw new HttpError(409, 'Username is already taken', 'username_taken');
      }
      const user: UserRecord = {
        id: randomUUID(),
        username,
        display_name: username,
        password_hash: passwordHash,
        is_admin: 0,
        created_at: now
      };
      this.db.run(
        'INSERT INTO users (id, username, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        user.id,
        user.username,
        user.display_name,
        user.password_hash,
        user.created_at
      );
      const consumed = this.db.run(
        'UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL',
        now,
        user.id,
        invite.id
      );
      if (Number(consumed.changes) !== 1) throw new HttpError(409, 'This invitation was already used', 'invite_used');
      return user;
    });
  }

  async login(username: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const user = this.db.get<UserRecord>('SELECT * FROM users WHERE username = ?', username.trim());
    const valid = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, 'Invalid username or password', 'invalid_credentials');

    const token = randomToken('ul_session_');
    const now = new Date();
    const expires = new Date(now.getTime() + config.sessionDays * 86_400_000);
    this.db.run(
      'INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?)',
      sha256(token),
      user.id,
      expires.toISOString(),
      now.toISOString(),
      now.toISOString()
    );
    return { token, user: publicUser(user) };
  }

  authenticate(request: FastifyRequest): AuthActor | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    const tokenHash = sha256(token);
    const now = new Date().toISOString();

    if (token.startsWith('ul_session_')) {
      const row = this.db.get<SessionRow>(
        `SELECT u.*, s.token_hash, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
        tokenHash,
        now
      );
      if (!row) return null;
      this.db.run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', now, tokenHash);
      return { type: 'user', id: row.id, name: row.display_name, isAdmin: row.is_admin === 1, sessionHash: tokenHash };
    }

    if (token.startsWith('ul_agent_')) {
      const row = this.db.get<AgentRecord>(
        `SELECT a.*, p.public_hash AS project_hash
         FROM agent_credentials a JOIN projects p ON p.id = a.project_id
         WHERE a.token_hash = ? AND a.revoked_at IS NULL`,
        tokenHash
      );
      if (!row) return null;
      this.db.run('UPDATE agent_credentials SET last_used_at = ? WHERE id = ?', now, row.id);
      return {
        type: 'agent',
        id: row.id,
        name: row.name,
        projectId: row.project_id,
        projectHash: row.project_hash,
        tokenHash
      };
    }
    return null;
  }

  require(request: FastifyRequest): AuthActor {
    const actor = this.authenticate(request);
    if (!actor) throw new HttpError(401, 'Authentication required', 'authentication_required');
    return actor;
  }

  requireUser(request: FastifyRequest): Extract<AuthActor, { type: 'user' }> {
    const actor = this.require(request);
    if (actor.type !== 'user') throw new HttpError(403, 'A human account is required', 'human_account_required');
    return actor;
  }

  logout(actor: AuthActor): void {
    if (actor.type === 'user') this.db.run('DELETE FROM sessions WHERE token_hash = ?', actor.sessionHash);
  }

  cleanup(): void {
    this.db.run('DELETE FROM sessions WHERE expires_at <= ?', new Date().toISOString());
  }
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

function validateUserInput(usernameInput: string, password: string): string {
  const username = usernameInput.trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3–32 letters, numbers, dots, dashes, or underscores', 'invalid_username');
  }
  if (password.length < 8 || password.length > 256) {
    throw new HttpError(400, 'Password must be at least 8 characters', 'invalid_password');
  }
  return username;
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: user.is_admin === 1,
    createdAt: user.created_at
  };
}

// Equalizes nonexistent-user login work. Generated with the same scrypt parameters.
const DUMMY_HASH = 'scrypt$32768$8$1$MDAwMDAwMDAwMDAwMDAwMA$RG8K3j8c6cxMowqsmG4iDmITAcX7whkgfG8iCVDfwFZLqhgWWUwlhJw1YTdUTvNJUZ6Dre5mww6OUPPsYJgQEA';
