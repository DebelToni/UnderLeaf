import type { ActorIdentity, AuthActor } from './types.js';

export function actorIdentity(actor: AuthActor): ActorIdentity {
  return { type: actor.type, id: actor.id, name: actor.name };
}
