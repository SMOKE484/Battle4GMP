import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { generateClues, generateDefinitions, generateScenarios, DeepSeekError } from './deepseek';
import { layoutCrossword, CrosswordGrid } from './crosswordLayout';
import { layoutWordSearch, WordSearchGrid } from './wordSearchLayout';
import { selectCrosswordTerms } from './selectCrosswordTerms';
import { selectPersonnelTerms } from './selectPersonnelTerms';
import { selectSterilityTerms } from './selectSterilityTerms';

export interface CrosswordPuzzle {
  terms: { word: string; clue: string }[];
  grid: CrosswordGrid;
  source: 'deepseek' | 'cache' | 'supabase_cache' | 'static_fallback';
}

export interface PersonnelPuzzle {
  pairs: { term: string; definition: string }[];
  source: 'deepseek' | 'cache' | 'supabase_cache' | 'static_fallback';
}

export interface WordSearchPuzzle {
  pairs: { term: string; clue: string }[];
  grid: WordSearchGrid;
  source: 'deepseek' | 'cache' | 'supabase_cache' | 'static_fallback';
}

export class QuestionsUnavailableError extends Error {
  constructor(message = 'No crossword questions are available right now.') {
    super(message);
    this.name = 'QuestionsUnavailableError';
  }
}

const CACHE_KEY = '@battle4gmp/level1-puzzle-cache';

interface StoredPuzzle {
  terms: { word: string; clue: string }[];
  grid: CrosswordGrid;
}

function isStoredPuzzle(value: unknown): value is StoredPuzzle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { terms?: unknown; grid?: unknown };
  return Array.isArray(v.terms) && typeof v.grid === 'object' && v.grid !== null;
}

async function cachePuzzleLocally(puzzle: StoredPuzzle): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(puzzle));
  } catch {
    // best-effort only — never block gameplay on a cache write failure
  }
}

async function cachePuzzleRemotely(puzzle: StoredPuzzle): Promise<void> {
  try {
    await supabase.from('cached_questions').insert({
      level: 1,
      topic: 'data_integrity',
      question_set: puzzle,
      source: 'deepseek',
    });
  } catch {
    // best-effort only
  }
}

async function readLocalCache(): Promise<StoredPuzzle | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredPuzzle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readSupabaseCache(): Promise<StoredPuzzle | null> {
  try {
    const { data, error } = await supabase
      .from('cached_questions')
      .select('question_set')
      .eq('level', 1)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return isStoredPuzzle(data.question_set) ? data.question_set : null;
  } catch {
    return null;
  }
}

/**
 * Fallback chain: DeepSeek (fresh wording every session) → last-known-good local
 * cache → most recent Supabase cache → static notes-sourced fallback (fixed clue
 * text from `crosswordTerms.ts`, grounded in the PIC/S/WHO/FDA data-integrity
 * sources) → QuestionsUnavailableError. DeepSeek is tried first deliberately — the
 * whole point of calling it is fresh clues, so falling back to cache first would
 * silently defeat that every session after the first. The static tier is never
 * cached (locally or remotely): it exists purely as a last-resort, offline-safe
 * source of correct clues, and shouldn't overwrite a better DeepSeek-sourced cache.
 */
export async function loadLevel1Puzzle(): Promise<CrosswordPuzzle> {
  const sessionTerms = selectCrosswordTerms();
  const sessionTermNames = sessionTerms.map((t) => t.term);

  try {
    const clues = await generateClues(sessionTermNames);
    const terms = clues.map((c) => ({ word: c.term, clue: c.clue }));
    const grid = layoutCrossword(terms);
    const puzzle: StoredPuzzle = { terms, grid };
    void cachePuzzleLocally(puzzle);
    void cachePuzzleRemotely(puzzle);
    return { ...puzzle, source: 'deepseek' };
  } catch (err) {
    if (!(err instanceof DeepSeekError)) throw err; // an unexpected bug, not a fallback-worthy failure
  }

  const local = await readLocalCache();
  if (local) {
    return { ...local, source: 'cache' };
  }

  const remote = await readSupabaseCache();
  if (remote) {
    return { ...remote, source: 'supabase_cache' };
  }

  try {
    const terms = sessionTerms.map((t) => ({ word: t.term, clue: t.fallbackClue }));
    const grid = layoutCrossword(terms);
    return { terms, grid, source: 'static_fallback' };
  } catch {
    throw new QuestionsUnavailableError();
  }
}

const LEVEL2_CACHE_KEY = '@battle4gmp/level2-puzzle-cache';

interface StoredPersonnelPuzzle {
  pairs: { term: string; definition: string }[];
}

function isStoredPersonnelPuzzle(value: unknown): value is StoredPersonnelPuzzle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { pairs?: unknown };
  return Array.isArray(v.pairs);
}

async function cachePersonnelPuzzleLocally(puzzle: StoredPersonnelPuzzle): Promise<void> {
  try {
    await AsyncStorage.setItem(LEVEL2_CACHE_KEY, JSON.stringify(puzzle));
  } catch {
    // best-effort only — never block gameplay on a cache write failure
  }
}

async function cachePersonnelPuzzleRemotely(puzzle: StoredPersonnelPuzzle): Promise<void> {
  try {
    await supabase.from('cached_questions').insert({
      level: 2,
      topic: 'personnel',
      question_set: puzzle,
      source: 'deepseek',
    });
  } catch {
    // best-effort only
  }
}

async function readLocalPersonnelCache(): Promise<StoredPersonnelPuzzle | null> {
  try {
    const raw = await AsyncStorage.getItem(LEVEL2_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredPersonnelPuzzle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readSupabasePersonnelCache(): Promise<StoredPersonnelPuzzle | null> {
  try {
    const { data, error } = await supabase
      .from('cached_questions')
      .select('question_set')
      .eq('level', 2)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return isStoredPersonnelPuzzle(data.question_set) ? data.question_set : null;
  } catch {
    return null;
  }
}

/** Same 4-tier fallback chain as loadLevel1Puzzle: DeepSeek → local cache → Supabase cache → static notes-sourced fallback → QuestionsUnavailableError. */
export async function loadLevel2Puzzle(): Promise<PersonnelPuzzle> {
  const sessionTerms = selectPersonnelTerms();
  const sessionTermNames = sessionTerms.map((t) => t.term);

  try {
    const definitions = await generateDefinitions(sessionTermNames);
    const pairs = definitions.map((d) => ({ term: d.term, definition: d.definition }));
    const puzzle: StoredPersonnelPuzzle = { pairs };
    void cachePersonnelPuzzleLocally(puzzle);
    void cachePersonnelPuzzleRemotely(puzzle);
    return { ...puzzle, source: 'deepseek' };
  } catch (err) {
    if (!(err instanceof DeepSeekError)) throw err; // an unexpected bug, not a fallback-worthy failure
  }

  const local = await readLocalPersonnelCache();
  if (local) {
    return { ...local, source: 'cache' };
  }

  const remote = await readSupabasePersonnelCache();
  if (remote) {
    return { ...remote, source: 'supabase_cache' };
  }

  const pairs = sessionTerms.map((t) => ({ term: t.term, definition: t.fallbackDefinition }));
  return { pairs, source: 'static_fallback' };
}

const LEVEL3_CACHE_KEY = '@battle4gmp/level3-puzzle-cache';

interface StoredWordSearchPuzzle {
  pairs: { term: string; clue: string }[];
  grid: WordSearchGrid;
}

function isStoredWordSearchPuzzle(value: unknown): value is StoredWordSearchPuzzle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { pairs?: unknown; grid?: unknown };
  return Array.isArray(v.pairs) && typeof v.grid === 'object' && v.grid !== null;
}

async function cacheWordSearchPuzzleLocally(puzzle: StoredWordSearchPuzzle): Promise<void> {
  try {
    await AsyncStorage.setItem(LEVEL3_CACHE_KEY, JSON.stringify(puzzle));
  } catch {
    // best-effort only — never block gameplay on a cache write failure
  }
}

async function cacheWordSearchPuzzleRemotely(puzzle: StoredWordSearchPuzzle): Promise<void> {
  try {
    await supabase.from('cached_questions').insert({
      level: 3,
      topic: 'sterility',
      question_set: puzzle,
      source: 'deepseek',
    });
  } catch {
    // best-effort only
  }
}

async function readLocalWordSearchCache(): Promise<StoredWordSearchPuzzle | null> {
  try {
    const raw = await AsyncStorage.getItem(LEVEL3_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredWordSearchPuzzle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readSupabaseWordSearchCache(): Promise<StoredWordSearchPuzzle | null> {
  try {
    const { data, error } = await supabase
      .from('cached_questions')
      .select('question_set')
      .eq('level', 3)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return isStoredWordSearchPuzzle(data.question_set) ? data.question_set : null;
  } catch {
    return null;
  }
}

/** Same 4-tier fallback chain as loadLevel1Puzzle: DeepSeek → local cache → Supabase cache → static notes-sourced fallback → QuestionsUnavailableError. */
export async function loadLevel3Puzzle(): Promise<WordSearchPuzzle> {
  const sessionTerms = selectSterilityTerms();
  const sessionTermNames = sessionTerms.map((t) => t.term);

  try {
    const scenarios = await generateScenarios(sessionTermNames);
    const pairs = scenarios.map((s) => ({ term: s.term, clue: s.clue }));
    const grid = layoutWordSearch(pairs.map((p) => ({ word: p.term, clue: p.clue })));
    const puzzle: StoredWordSearchPuzzle = { pairs, grid };
    void cacheWordSearchPuzzleLocally(puzzle);
    void cacheWordSearchPuzzleRemotely(puzzle);
    return { ...puzzle, source: 'deepseek' };
  } catch (err) {
    if (!(err instanceof DeepSeekError)) throw err; // an unexpected bug, not a fallback-worthy failure
  }

  const local = await readLocalWordSearchCache();
  if (local) {
    return { ...local, source: 'cache' };
  }

  const remote = await readSupabaseWordSearchCache();
  if (remote) {
    return { ...remote, source: 'supabase_cache' };
  }

  try {
    const pairs = sessionTerms.map((t) => ({ term: t.term, clue: t.fallbackClue }));
    const grid = layoutWordSearch(pairs.map((p) => ({ word: p.term, clue: p.clue })));
    return { pairs, grid, source: 'static_fallback' };
  } catch {
    throw new QuestionsUnavailableError();
  }
}
