import type {MinigameKind} from './types';

/** Explicit memory selection is deterministic; existing reflex rounds keep their variant. */
export function minigameVariant(kind: MinigameKind, id: string): 'reflex' | 'memory' | 'balance' {
 if (kind === 'memory') return 'memory';
 if (kind === 'social_guess') return 'reflex';
 const mod = id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
 return mod === 0 ? 'reflex' : mod === 1 ? 'memory' : 'balance';
}
