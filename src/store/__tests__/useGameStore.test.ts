import { useGameStore, selectTotalScore, selectLevelStatus, STARTING_CLUE_TOKENS } from '../useGameStore';
import { ensurePlayer, flushScoreSnapshot } from '../../lib/scoreSync';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/deviceId', () => ({ getOrCreateDeviceId: jest.fn(async () => 'device-test') }));
jest.mock('../../lib/scoreSync', () => ({
  ensurePlayer: jest.fn(),
  flushScoreSnapshot: jest.fn(),
}));

const mockedEnsurePlayer = ensurePlayer as jest.Mock;
const mockedFlush = flushScoreSnapshot as jest.Mock;

function resetStore() {
  useGameStore.setState({
    deviceId: 'device-test',
    playerId: null,
    displayName: null,
    displayNameSynced: false,
    levels: {
      1: { score: 0, completed: false },
      2: { score: 0, completed: false },
      3: { score: 0, completed: false },
    },
    clueTokens: STARTING_CLUE_TOKENS,
    hadErrorThisLevel: { 1: false, 2: false, 3: false },
    hasSeenInstructions: { 1: false, 2: false, 3: false },
    pendingSync: [],
    hasHydrated: true,
  });
}

describe('useGameStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  it('guards spendClueToken at zero', () => {
    useGameStore.setState({ clueTokens: 1 });

    expect(useGameStore.getState().spendClueToken()).toBe(true);
    expect(useGameStore.getState().clueTokens).toBe(0);
    expect(useGameStore.getState().spendClueToken()).toBe(false);
    expect(useGameStore.getState().clueTokens).toBe(0);
  });

  it('derives sequential level unlock status for all three levels', () => {
    let state = useGameStore.getState();
    expect(selectLevelStatus(state, 1)).toBe('unlocked');
    expect(selectLevelStatus(state, 2)).toBe('locked');
    expect(selectLevelStatus(state, 3)).toBe('locked');

    useGameStore.setState((s) => ({ levels: { ...s.levels, 1: { score: 63, completed: true } } }));
    state = useGameStore.getState();
    expect(selectLevelStatus(state, 1)).toBe('completed');
    expect(selectLevelStatus(state, 2)).toBe('unlocked');
    expect(selectLevelStatus(state, 3)).toBe('locked');

    useGameStore.setState((s) => ({ levels: { ...s.levels, 2: { score: 40, completed: true } } }));
    state = useGameStore.getState();
    expect(selectLevelStatus(state, 3)).toBe('unlocked');
  });

  it('setPlayerId writes the id directly, for callers that resolved it ad hoc via ensurePlayer', () => {
    expect(useGameStore.getState().playerId).toBeNull();

    useGameStore.getState().setPlayerId('player-1');

    expect(useGameStore.getState().playerId).toBe('player-1');
  });

  it('computes total score across all three levels', () => {
    useGameStore.setState((s) => ({
      levels: {
        1: { score: 63, completed: true },
        2: { score: 40, completed: true },
        3: { score: 0, completed: false },
      },
    }));
    expect(selectTotalScore(useGameStore.getState())).toBe(103);
  });

  it('completeLevel commits score/completion synchronously before the sync attempt resolves', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: false, kind: 'network' });

    await useGameStore.getState().completeLevel(1, 63);

    expect(useGameStore.getState().levels[1]).toEqual({ score: 63, completed: true });
    expect(useGameStore.getState().pendingSync).toHaveLength(1);
  });

  it('keeps a snapshot queued in pendingSync when ensurePlayer fails', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: false, kind: 'network' });
    useGameStore.setState({ pendingSync: [{ level1: 63, level2: 0, level3: 0, tokensUsed: 0, at: 'x' }] });

    await useGameStore.getState().flushPendingSync();

    expect(useGameStore.getState().pendingSync).toHaveLength(1);
    expect(mockedFlush).not.toHaveBeenCalled();
  });

  it('clears pendingSync once flushPendingSync succeeds', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: true, playerId: 'player-1' });
    mockedFlush.mockResolvedValue({ ok: true });
    useGameStore.setState({ pendingSync: [{ level1: 63, level2: 0, level3: 0, tokensUsed: 0, at: 'x' }] });

    await useGameStore.getState().flushPendingSync();

    expect(useGameStore.getState().pendingSync).toHaveLength(0);
    expect(useGameStore.getState().playerId).toBe('player-1');
  });

  it('leaves a failed snapshot in pendingSync while dropping a successful one in the same batch', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: true, playerId: 'player-1' });
    mockedFlush
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, kind: 'db_error' });
    useGameStore.setState({
      pendingSync: [
        { level1: 30, level2: 0, level3: 0, tokensUsed: 0, at: 'a' },
        { level1: 63, level2: 0, level3: 0, tokensUsed: 0, at: 'b' },
      ],
    });

    await useGameStore.getState().flushPendingSync();

    expect(useGameStore.getState().pendingSync).toEqual([
      { level1: 63, level2: 0, level3: 0, tokensUsed: 0, at: 'b' },
    ]);
  });

  it('submitDisplayName sets the name locally and immediately before any sync resolves', () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: true, playerId: 'player-1' });

    useGameStore.getState().submitDisplayName('Jordan');

    expect(useGameStore.getState().displayName).toBe('Jordan');
    expect(useGameStore.getState().displayNameSynced).toBe(false);
  });

  it('flushPendingSync establishes the player and syncs a pending display name even with no scores queued', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: true, playerId: 'player-1' });
    useGameStore.setState({ displayName: 'Jordan', displayNameSynced: false });

    await useGameStore.getState().flushPendingSync();

    expect(mockedEnsurePlayer).toHaveBeenCalledWith('device-test', 'Jordan');
    expect(useGameStore.getState().playerId).toBe('player-1');
    expect(useGameStore.getState().displayNameSynced).toBe(true);
    expect(mockedFlush).not.toHaveBeenCalled();
  });

  it('flushPendingSync leaves the display name unsynced if ensurePlayer fails', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: false, kind: 'network' });
    useGameStore.setState({ displayName: 'Jordan', displayNameSynced: false });

    await useGameStore.getState().flushPendingSync();

    expect(useGameStore.getState().displayNameSynced).toBe(false);
    expect(useGameStore.getState().playerId).toBeNull();
  });

  it('flushPendingSync re-syncs the display name even when a playerId already exists', async () => {
    mockedEnsurePlayer.mockResolvedValue({ ok: true, playerId: 'player-1' });
    useGameStore.setState({ playerId: 'player-1', displayName: 'Jordan', displayNameSynced: false });

    await useGameStore.getState().flushPendingSync();

    expect(mockedEnsurePlayer).toHaveBeenCalledWith('device-test', 'Jordan');
    expect(useGameStore.getState().displayNameSynced).toBe(true);
  });

  it('markInstructionsSeen marks only the given level', () => {
    useGameStore.getState().markInstructionsSeen(1);

    const state = useGameStore.getState();
    expect(state.hasSeenInstructions).toEqual({ 1: true, 2: false, 3: false });
  });

  it('resetGame clears score/tokens/error flags but preserves deviceId, pendingSync, and hasSeenInstructions', () => {
    useGameStore.setState({
      levels: { 1: { score: 63, completed: true }, 2: { score: 0, completed: false }, 3: { score: 0, completed: false } },
      clueTokens: 1,
      hadErrorThisLevel: { 1: true, 2: false, 3: false },
      hasSeenInstructions: { 1: true, 2: false, 3: false },
      pendingSync: [{ level1: 63, level2: 0, level3: 0, tokensUsed: 2, at: 'x' }],
    });

    useGameStore.getState().resetGame();

    const state = useGameStore.getState();
    expect(state.levels[1]).toEqual({ score: 0, completed: false });
    expect(state.clueTokens).toBe(STARTING_CLUE_TOKENS);
    expect(state.hadErrorThisLevel[1]).toBe(false);
    expect(state.deviceId).toBe('device-test');
    expect(state.pendingSync).toHaveLength(1);
    expect(state.hasSeenInstructions).toEqual({ 1: true, 2: false, 3: false });
  });
});
