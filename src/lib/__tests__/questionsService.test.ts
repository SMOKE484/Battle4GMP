import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadLevel1Puzzle, loadLevel2Puzzle, loadLevel3Puzzle, QuestionsUnavailableError } from '../questionsService';
import { generateClues, generateDefinitions, generateScenarios, DeepSeekError } from '../deepseek';
import { supabase } from '../supabase';
import * as crosswordLayout from '../crosswordLayout';
import * as wordSearchLayout from '../wordSearchLayout';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../deepseek', () => {
  const actual = jest.requireActual('../deepseek');
  return { ...actual, generateClues: jest.fn(), generateDefinitions: jest.fn(), generateScenarios: jest.fn() };
});

jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

function chainable(finalResult: unknown) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(async () => finalResult);
  builder.insert = jest.fn(async () => finalResult);
  return builder;
}

const mockedGenerateClues = generateClues as jest.MockedFunction<typeof generateClues>;
const mockedGenerateDefinitions = generateDefinitions as jest.MockedFunction<typeof generateDefinitions>;
const mockedGenerateScenarios = generateScenarios as jest.MockedFunction<typeof generateScenarios>;
const mockedFrom = supabase.from as jest.Mock;

describe('loadLevel1Puzzle fallback chain', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear(); // the AsyncStorage jest mock's in-memory store persists across tests otherwise
  });

  it('returns a deepseek-sourced puzzle and caches it (non-blocking) on success', async () => {
    mockedGenerateClues.mockResolvedValue([
      { term: 'ACCURATE', clue: 'Correct and truthful.' },
      { term: 'LEGIBLE', clue: 'Readable and permanent.' },
    ]);
    const insertBuilder = chainable({ error: null });
    mockedFrom.mockReturnValue(insertBuilder);

    const puzzle = await loadLevel1Puzzle();

    expect(puzzle.source).toBe('deepseek');
    expect(puzzle.terms).toHaveLength(2);
    expect(puzzle.grid.words.length).toBe(2);

    // cache writes are fire-and-forget — flush microtasks, then assert they happened
    await Promise.resolve();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('@battle4gmp/level1-puzzle-cache')).not.toBeNull();
    expect(insertBuilder.insert).toHaveBeenCalled();
  });

  it('falls back to the local AsyncStorage cache when DeepSeek fails', async () => {
    mockedGenerateClues.mockRejectedValue(new DeepSeekError('network', 'offline'));
    const cached = { terms: [{ word: 'ACCURATE', clue: 'c' }], grid: { rows: 1, cols: 8, cells: [], words: [] } };
    await AsyncStorage.setItem('@battle4gmp/level1-puzzle-cache', JSON.stringify(cached));

    const puzzle = await loadLevel1Puzzle();

    expect(puzzle.source).toBe('cache');
    expect(puzzle.terms).toEqual(cached.terms);
  });

  it('falls back to the most recent Supabase cache when DeepSeek fails and local cache is empty', async () => {
    mockedGenerateClues.mockRejectedValue(new DeepSeekError('timeout', 'slow'));
    const remote = { terms: [{ word: 'LEGIBLE', clue: 'c' }], grid: { rows: 1, cols: 7, cells: [], words: [] } };
    mockedFrom.mockReturnValue(chainable({ data: { question_set: remote }, error: null }));

    const puzzle = await loadLevel1Puzzle();

    expect(puzzle.source).toBe('supabase_cache');
    expect(puzzle.terms).toEqual(remote.terms);
  });

  it('falls back to the static notes-sourced puzzle when DeepSeek, local cache, and Supabase cache all fail', async () => {
    mockedGenerateClues.mockRejectedValue(new DeepSeekError('api_error', 'down'));
    const builder = chainable({ data: null, error: null });
    mockedFrom.mockReturnValue(builder);

    const puzzle = await loadLevel1Puzzle();

    expect(puzzle.source).toBe('static_fallback');
    expect(puzzle.terms.length).toBe(6);
    expect(puzzle.grid.words.length).toBe(6);

    // the static tier must never overwrite a better cache with weaker fallback content
    expect(builder.insert).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('@battle4gmp/level1-puzzle-cache')).toBeNull();
  });

  it('throws QuestionsUnavailableError as a last resort if even static puzzle layout fails', async () => {
    mockedGenerateClues.mockRejectedValue(new DeepSeekError('api_error', 'down'));
    mockedFrom.mockReturnValue(chainable({ data: null, error: null }));
    const layoutSpy = jest.spyOn(crosswordLayout, 'layoutCrossword').mockImplementation(() => {
      throw new Error('layout bug');
    });

    await expect(loadLevel1Puzzle()).rejects.toBeInstanceOf(QuestionsUnavailableError);

    layoutSpy.mockRestore();
  });

  it('rethrows an unexpected (non-DeepSeekError) failure instead of swallowing it into a fallback', async () => {
    mockedGenerateClues.mockRejectedValue(new Error('a real bug, not an API failure'));

    await expect(loadLevel1Puzzle()).rejects.toThrow('a real bug, not an API failure');
  });
});

describe('loadLevel2Puzzle fallback chain', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns a deepseek-sourced puzzle and caches it (non-blocking) on success', async () => {
    mockedGenerateDefinitions.mockResolvedValue([
      { term: 'DISQUALIFICATION', definition: 'Removal from aseptic duties pending retraining.' },
      { term: 'GRADE C GOWNING', definition: 'A trouser suit gathered at the wrists.' },
    ]);
    const insertBuilder = chainable({ error: null });
    mockedFrom.mockReturnValue(insertBuilder);

    const puzzle = await loadLevel2Puzzle();

    expect(puzzle.source).toBe('deepseek');
    expect(puzzle.pairs).toHaveLength(2);

    await Promise.resolve();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('@battle4gmp/level2-puzzle-cache')).not.toBeNull();
    expect(insertBuilder.insert).toHaveBeenCalled();
  });

  it('falls back to the local AsyncStorage cache when DeepSeek fails', async () => {
    mockedGenerateDefinitions.mockRejectedValue(new DeepSeekError('network', 'offline'));
    const cached = { pairs: [{ term: 'DISQUALIFICATION', definition: 'd' }] };
    await AsyncStorage.setItem('@battle4gmp/level2-puzzle-cache', JSON.stringify(cached));

    const puzzle = await loadLevel2Puzzle();

    expect(puzzle.source).toBe('cache');
    expect(puzzle.pairs).toEqual(cached.pairs);
  });

  it('falls back to the most recent Supabase cache when DeepSeek fails and local cache is empty', async () => {
    mockedGenerateDefinitions.mockRejectedValue(new DeepSeekError('timeout', 'slow'));
    const remote = { pairs: [{ term: 'GRADE B GOWNING', definition: 'd' }] };
    mockedFrom.mockReturnValue(chainable({ data: { question_set: remote }, error: null }));

    const puzzle = await loadLevel2Puzzle();

    expect(puzzle.source).toBe('supabase_cache');
    expect(puzzle.pairs).toEqual(remote.pairs);
  });

  it('falls back to the static notes-sourced puzzle when DeepSeek, local cache, and Supabase cache all fail', async () => {
    mockedGenerateDefinitions.mockRejectedValue(new DeepSeekError('api_error', 'down'));
    const builder = chainable({ data: null, error: null });
    mockedFrom.mockReturnValue(builder);

    const puzzle = await loadLevel2Puzzle();

    expect(puzzle.source).toBe('static_fallback');
    expect(puzzle.pairs.length).toBe(4);

    // the static tier must never overwrite a better cache with weaker fallback content
    expect(builder.insert).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('@battle4gmp/level2-puzzle-cache')).toBeNull();
  });

  it('rethrows an unexpected (non-DeepSeekError) failure instead of swallowing it into a fallback', async () => {
    mockedGenerateDefinitions.mockRejectedValue(new Error('a real bug, not an API failure'));

    await expect(loadLevel2Puzzle()).rejects.toThrow('a real bug, not an API failure');
  });
});

describe('loadLevel3Puzzle fallback chain', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns a deepseek-sourced puzzle and caches it (non-blocking) on success', async () => {
    mockedGenerateScenarios.mockResolvedValue([
      { term: 'AIRLOCK', clue: 'A doorway that controls pressure between two rooms.' },
      { term: 'BIOFILM', clue: 'Microbes stuck together on a surface.' },
    ]);
    const insertBuilder = chainable({ error: null });
    mockedFrom.mockReturnValue(insertBuilder);

    const puzzle = await loadLevel3Puzzle();

    expect(puzzle.source).toBe('deepseek');
    expect(puzzle.pairs).toHaveLength(2);
    expect(puzzle.grid.placements.length).toBe(2);

    await Promise.resolve();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('@battle4gmp/level3-puzzle-cache')).not.toBeNull();
    expect(insertBuilder.insert).toHaveBeenCalled();
  });

  it('falls back to the local AsyncStorage cache when DeepSeek fails', async () => {
    mockedGenerateScenarios.mockRejectedValue(new DeepSeekError('network', 'offline'));
    const cached = { pairs: [{ term: 'AIRLOCK', clue: 'c' }], grid: { columns: 7, rows: [] } };
    await AsyncStorage.setItem('@battle4gmp/level3-puzzle-cache', JSON.stringify(cached));

    const puzzle = await loadLevel3Puzzle();

    expect(puzzle.source).toBe('cache');
    expect(puzzle.pairs).toEqual(cached.pairs);
  });

  it('falls back to the most recent Supabase cache when DeepSeek fails and local cache is empty', async () => {
    mockedGenerateScenarios.mockRejectedValue(new DeepSeekError('timeout', 'slow'));
    const remote = { pairs: [{ term: 'BIOFILM', clue: 'c' }], grid: { columns: 7, rows: [] } };
    mockedFrom.mockReturnValue(chainable({ data: { question_set: remote }, error: null }));

    const puzzle = await loadLevel3Puzzle();

    expect(puzzle.source).toBe('supabase_cache');
    expect(puzzle.pairs).toEqual(remote.pairs);
  });

  it('falls back to the static notes-sourced puzzle when DeepSeek, local cache, and Supabase cache all fail', async () => {
    mockedGenerateScenarios.mockRejectedValue(new DeepSeekError('api_error', 'down'));
    const builder = chainable({ data: null, error: null });
    mockedFrom.mockReturnValue(builder);

    const puzzle = await loadLevel3Puzzle();

    expect(puzzle.source).toBe('static_fallback');
    expect(puzzle.pairs.length).toBe(6);
    expect(puzzle.grid.placements.length).toBe(6);

    // the static tier must never overwrite a better cache with weaker fallback content
    expect(builder.insert).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('@battle4gmp/level3-puzzle-cache')).toBeNull();
  });

  it('throws QuestionsUnavailableError as a last resort if even static puzzle layout fails', async () => {
    mockedGenerateScenarios.mockRejectedValue(new DeepSeekError('api_error', 'down'));
    mockedFrom.mockReturnValue(chainable({ data: null, error: null }));
    const layoutSpy = jest.spyOn(wordSearchLayout, 'layoutWordSearch').mockImplementation(() => {
      throw new Error('layout bug');
    });

    await expect(loadLevel3Puzzle()).rejects.toBeInstanceOf(QuestionsUnavailableError);

    layoutSpy.mockRestore();
  });

  it('rethrows an unexpected (non-DeepSeekError) failure instead of swallowing it into a fallback', async () => {
    mockedGenerateScenarios.mockRejectedValue(new Error('a real bug, not an API failure'));

    await expect(loadLevel3Puzzle()).rejects.toThrow('a real bug, not an API failure');
  });
});
