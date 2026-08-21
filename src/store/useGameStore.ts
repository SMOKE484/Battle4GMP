import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getOrCreateDeviceId } from '../lib/deviceId';
import { ensurePlayer, flushScoreSnapshot, ScoreSnapshot } from '../lib/scoreSync';
import { OnlinePlayer } from '../lib/presenceService';

export type LevelNumber = 1 | 2 | 3;
export type LevelStatus = 'locked' | 'unlocked' | 'completed';

export interface LevelState {
  score: number;
  completed: boolean;
}

interface PendingSync extends ScoreSnapshot {
  at: string;
}

export interface PendingInvite {
  id: string;
  roomId: string;
  roomCode: string;
  inviterDisplayName: string;
}

export interface GameState {
  deviceId: string | null;
  playerId: string | null;
  displayName: string | null;
  displayNameSynced: boolean;
  levels: Record<LevelNumber, LevelState>;
  clueTokens: number;
  hadErrorThisLevel: Record<LevelNumber, boolean>;
  hasSeenInstructions: Record<LevelNumber, boolean>;
  // Separate from hasSeenInstructions (which is keyed 1|2|3 per level) since
  // this covers the "Play with Friends" hub, not any one level.
  hasSeenMultiplayerInstructions: boolean;
  pendingSync: PendingSync[];
  hasHydrated: boolean;
  // Not persisted — always freshly derived from the live presence/invites
  // channels app._layout.tsx owns; see onRehydrateStorage below for the reset.
  onlinePlayers: OnlinePlayer[];
  pendingInvite: PendingInvite | null;
}

interface GameActions {
  initDeviceId: () => Promise<void>;
  setPlayerId: (playerId: string) => void;
  submitDisplayName: (name: string) => void;
  spendClueToken: () => boolean;
  markError: (level: LevelNumber) => void;
  markInstructionsSeen: (level: LevelNumber) => void;
  markMultiplayerInstructionsSeen: () => void;
  completeLevel: (level: LevelNumber, score: number) => Promise<void>;
  flushPendingSync: () => Promise<void>;
  resetGame: () => void;
  setHasHydrated: (value: boolean) => void;
  setOnlinePlayers: (players: OnlinePlayer[]) => void;
  setPendingInvite: (invite: PendingInvite) => void;
  clearPendingInvite: () => void;
}

export const STARTING_CLUE_TOKENS = 3;

const INITIAL_LEVELS: Record<LevelNumber, LevelState> = {
  1: { score: 0, completed: false },
  2: { score: 0, completed: false },
  3: { score: 0, completed: false },
};

function buildSnapshot(levels: Record<LevelNumber, LevelState>, tokensUsed: number): ScoreSnapshot {
  return {
    level1: levels[1].score,
    level2: levels[2].score,
    level3: levels[3].score,
    tokensUsed,
  };
}

export const useGameStore = create<GameState & GameActions>()(
  persist(
    (set, get) => ({
      deviceId: null,
      playerId: null,
      displayName: null,
      displayNameSynced: false,
      levels: INITIAL_LEVELS,
      clueTokens: STARTING_CLUE_TOKENS,
      hadErrorThisLevel: { 1: false, 2: false, 3: false },
      hasSeenInstructions: { 1: false, 2: false, 3: false },
      hasSeenMultiplayerInstructions: false,
      pendingSync: [],
      hasHydrated: false,
      onlinePlayers: [],
      pendingInvite: null,

      setHasHydrated: (value) => set({ hasHydrated: value }),
      setOnlinePlayers: (players) => set({ onlinePlayers: players }),
      // A second invite arriving while one is already showing simply replaces
      // it — multiple simultaneous invites are an edge case not worth a queue.
      setPendingInvite: (invite) => set({ pendingInvite: invite }),
      clearPendingInvite: () => set({ pendingInvite: null }),

      initDeviceId: async () => {
        if (get().deviceId) return;
        const deviceId = await getOrCreateDeviceId();
        set({ deviceId });
      },

      // Lets a screen that resolves a playerId ad hoc (e.g. a challenge/room
      // create/join flow calling ensurePlayer directly, ahead of the normal
      // flushPendingSync path) write it back so the store stops being stale —
      // ensurePlayer is idempotent per device_id, so this never creates a
      // second player row, only caches the id sooner.
      setPlayerId: (playerId) => set({ playerId }),

      // Applies the chosen name locally right away (the welcome screen never
      // waits on this) and marks it unsynced so the next flushPendingSync —
      // called immediately below, and again at app start / level completion —
      // picks it up and retries until it lands in Supabase.
      submitDisplayName: (name) => {
        set({ displayName: name, displayNameSynced: false });
        void get().flushPendingSync();
      },

      spendClueToken: () => {
        const { clueTokens } = get();
        if (clueTokens <= 0) return false;
        set({ clueTokens: clueTokens - 1 });
        return true;
      },

      markError: (level) => {
        set((s) => ({ hadErrorThisLevel: { ...s.hadErrorThisLevel, [level]: true } }));
      },

      // Persisted so the first-time instructions overlay only shows once per
      // level per device — replaying a level (or resetGame) never re-triggers
      // it. The in-level "help bulb" re-opens the same overlay on demand
      // without calling this again, so it doesn't touch this flag.
      markInstructionsSeen: (level) => {
        set((s) => ({ hasSeenInstructions: { ...s.hasSeenInstructions, [level]: true } }));
      },

      markMultiplayerInstructionsSeen: () => set({ hasSeenMultiplayerInstructions: true }),

      completeLevel: async (level, score) => {
        const nextLevels = { ...get().levels, [level]: { score, completed: true } };
        const tokensUsed = STARTING_CLUE_TOKENS - get().clueTokens;
        const snapshot: PendingSync = { ...buildSnapshot(nextLevels, tokensUsed), at: new Date().toISOString() };
        set((s) => ({ levels: nextLevels, pendingSync: [...s.pendingSync, snapshot] }));
        // fire-and-forget — a sync failure must never block gameplay/navigation
        void get().flushPendingSync();
      },

      flushPendingSync: async () => {
        const { deviceId, pendingSync, displayName, displayNameSynced } = get();
        if (!deviceId) return;

        let playerId = get().playerId;
        const nameNeedsSync = !!displayName && !displayNameSynced;
        if (!playerId || nameNeedsSync) {
          const result = await ensurePlayer(deviceId, displayName ?? undefined);
          if (!result.ok) return; // stays unsynced/queued, retried at the next trigger point
          playerId = result.playerId;
          set({ playerId, displayNameSynced: !!displayName });
        }

        if (pendingSync.length === 0) return;

        const remaining: PendingSync[] = [];
        for (const snapshot of pendingSync) {
          const result = await flushScoreSnapshot(playerId, snapshot);
          if (!result.ok) remaining.push(snapshot);
        }
        set({ pendingSync: remaining });
      },

      resetGame: () =>
        set({
          levels: INITIAL_LEVELS,
          clueTokens: STARTING_CLUE_TOKENS,
          hadErrorThisLevel: { 1: false, 2: false, 3: false },
          // deviceId/playerId/displayName/pendingSync/hasSeenInstructions intentionally
          // preserved — a fresh playthrough is still the same anonymous player, still
          // knows how each level works, and shouldn't drop anything still waiting to sync.
        }),
    }),
    {
      name: '@battle4gmp/game-state',
      storage: createJSONStorage(() => AsyncStorage),
      // onlinePlayers/pendingInvite are live channel state, not durable
      // progress — persisting them would show a stale roster or resurface an
      // already-handled invite after an app restart, before the real
      // presence/invite subscriptions in app/_layout.tsx have even reconnected.
      partialize: (state) => {
        const { onlinePlayers: _onlinePlayers, pendingInvite: _pendingInvite, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function selectTotalScore(state: GameState): number {
  return state.levels[1].score + state.levels[2].score + state.levels[3].score;
}

// Level status is always derived, never a stored field: level 1 is always
// unlocked, level N>1 is unlocked iff level N-1 is completed. Storing lock
// state separately (as the design mockup does) is how it drifts out of sync.
export function selectLevelStatus(state: GameState, level: LevelNumber): LevelStatus {
  if (state.levels[level].completed) return 'completed';
  if (level === 1) return 'unlocked';
  const previous = (level - 1) as LevelNumber;
  return state.levels[previous].completed ? 'unlocked' : 'locked';
}
