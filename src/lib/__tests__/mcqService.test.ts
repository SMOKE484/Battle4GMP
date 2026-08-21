import { generateMcqQuestions, generateMixedMcqQuestions } from '../mcqService';
import { generateClues, generateDefinitions, generateScenarios, DeepSeekError } from '../deepseek';
import { ALCOA_PLUS_TERMS } from '../crosswordTerms';
import { PERSONNEL_TERMS } from '../personnelTerms';
import { STERILITY_TERMS } from '../sterilityTerms';
import { mulberry32 } from '../../testHelpers/mulberry32';

jest.mock('../deepseek', () => {
  const actual = jest.requireActual('../deepseek');
  return { ...actual, generateClues: jest.fn(), generateDefinitions: jest.fn(), generateScenarios: jest.fn() };
});

const mockedGenerateClues = generateClues as jest.MockedFunction<typeof generateClues>;
const mockedGenerateDefinitions = generateDefinitions as jest.MockedFunction<typeof generateDefinitions>;
const mockedGenerateScenarios = generateScenarios as jest.MockedFunction<typeof generateScenarios>;

describe('generateMcqQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('dispatches data_integrity to generateClues and uses its wording as the prompt', async () => {
    mockedGenerateClues.mockImplementation(async (terms) => terms.map((term) => ({ term, clue: `fresh clue for ${term}` })));

    const questions = await generateMcqQuestions('data_integrity', 3, mulberry32(1));

    expect(mockedGenerateClues).toHaveBeenCalled();
    expect(mockedGenerateDefinitions).not.toHaveBeenCalled();
    expect(mockedGenerateScenarios).not.toHaveBeenCalled();
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.prompt).toMatch(/^fresh clue for /);
    }
  });

  it('dispatches personnel to generateDefinitions', async () => {
    mockedGenerateDefinitions.mockImplementation(async (terms) =>
      terms.map((term) => ({ term, definition: `fresh definition for ${term}` }))
    );

    const questions = await generateMcqQuestions('personnel', 2, mulberry32(2));

    expect(mockedGenerateDefinitions).toHaveBeenCalled();
    expect(questions).toHaveLength(2);
  });

  it('dispatches sterility to generateScenarios', async () => {
    mockedGenerateScenarios.mockImplementation(async (terms) => terms.map((term) => ({ term, clue: `fresh scenario for ${term}` })));

    const questions = await generateMcqQuestions('sterility', 2, mulberry32(3));

    expect(mockedGenerateScenarios).toHaveBeenCalled();
    expect(questions).toHaveLength(2);
  });

  it('falls back to static pool text when DeepSeek fails', async () => {
    mockedGenerateClues.mockRejectedValue(new DeepSeekError('network', 'offline'));

    const questions = await generateMcqQuestions('data_integrity', 3, mulberry32(4));

    expect(questions).toHaveLength(3);
    for (const q of questions) {
      const correctTerm = q.options[q.correctIndex];
      const poolEntry = ALCOA_PLUS_TERMS.find((t) => t.term === correctTerm);
      expect(poolEntry).toBeDefined();
      expect(q.prompt).toBe(poolEntry?.fallbackClue);
    }
  });

  it('propagates an unexpected (non-DeepSeekError) failure rather than silently falling back', async () => {
    mockedGenerateClues.mockRejectedValue(new Error('unexpected bug'));

    await expect(generateMcqQuestions('data_integrity', 3, mulberry32(5))).rejects.toThrow('unexpected bug');
  });

  it('gives every question exactly 4 unique options including the correct term', async () => {
    mockedGenerateDefinitions.mockImplementation(async (terms) =>
      terms.map((term) => ({ term, definition: `fresh definition for ${term}` }))
    );

    const questions = await generateMcqQuestions('personnel', PERSONNEL_TERMS.length, mulberry32(6));

    for (const q of questions) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBeDefined();
    }
  });

  it('caps the question count at the pool size rather than repeating terms', async () => {
    mockedGenerateScenarios.mockImplementation(async (terms) => terms.map((term) => ({ term, clue: `scenario for ${term}` })));

    const questions = await generateMcqQuestions('sterility', STERILITY_TERMS.length + 50, mulberry32(7));

    expect(questions).toHaveLength(STERILITY_TERMS.length);
  });
});

function poolOf(term: string): 'data_integrity' | 'personnel' | 'sterility' {
  if (ALCOA_PLUS_TERMS.some((t) => t.term === term)) return 'data_integrity';
  if (PERSONNEL_TERMS.some((t) => t.term === term)) return 'personnel';
  return 'sterility';
}

function mockAllTopicsSucceed() {
  mockedGenerateClues.mockImplementation(async (terms) => terms.map((term) => ({ term, clue: `fresh clue for ${term}` })));
  mockedGenerateDefinitions.mockImplementation(async (terms) => terms.map((term) => ({ term, definition: `fresh definition for ${term}` })));
  mockedGenerateScenarios.mockImplementation(async (terms) => terms.map((term) => ({ term, clue: `fresh scenario for ${term}` })));
}

describe('generateMixedMcqQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('splits the count as evenly as possible across all 3 topics', async () => {
    mockAllTopicsSucceed();

    const questions = await generateMixedMcqQuestions(9, mulberry32(1));

    expect(questions).toHaveLength(9);
    const byTopic = { data_integrity: 0, personnel: 0, sterility: 0 };
    for (const q of questions) byTopic[poolOf(q.options[q.correctIndex])] += 1;
    expect(byTopic).toEqual({ data_integrity: 3, personnel: 3, sterility: 3 });
  });

  it('distributes an uneven remainder across topics rather than always the same one', async () => {
    mockAllTopicsSucceed();

    const countsBySeed = [1, 2, 3, 4, 5].map(async (seed) => {
      const questions = await generateMixedMcqQuestions(10, mulberry32(seed));
      const byTopic = { data_integrity: 0, personnel: 0, sterility: 0 };
      for (const q of questions) byTopic[poolOf(q.options[q.correctIndex])] += 1;
      return byTopic;
    });

    const results = await Promise.all(countsBySeed);
    for (const byTopic of results) {
      expect(Object.values(byTopic).sort()).toEqual([3, 3, 4]);
    }
    // Not every seed should hand the extra question to the same topic.
    const topicsThatGotFour = new Set(results.map((r) => Object.entries(r).find(([, count]) => count === 4)?.[0]));
    expect(topicsThatGotFour.size).toBeGreaterThan(1);
  });

  it('falls back only for the topic whose DeepSeek call fails, keeping the other two fresh', async () => {
    mockedGenerateClues.mockRejectedValue(new DeepSeekError('network', 'offline'));
    mockedGenerateDefinitions.mockImplementation(async (terms) => terms.map((term) => ({ term, definition: `fresh definition for ${term}` })));
    mockedGenerateScenarios.mockImplementation(async (terms) => terms.map((term) => ({ term, clue: `fresh scenario for ${term}` })));

    const questions = await generateMixedMcqQuestions(9, mulberry32(2));

    for (const q of questions) {
      const topic = poolOf(q.options[q.correctIndex]);
      if (topic === 'data_integrity') {
        const poolEntry = ALCOA_PLUS_TERMS.find((t) => t.term === q.options[q.correctIndex]);
        expect(q.prompt).toBe(poolEntry?.fallbackClue);
      } else {
        expect(q.prompt).toMatch(/^fresh (definition|scenario) for /);
      }
    }
  });

  it('propagates an unexpected (non-DeepSeekError) failure rather than silently falling back', async () => {
    mockAllTopicsSucceed();
    mockedGenerateDefinitions.mockRejectedValue(new Error('unexpected bug'));

    await expect(generateMixedMcqQuestions(9, mulberry32(3))).rejects.toThrow('unexpected bug');
  });

  it('keeps every question\'s 4 options within its own topic pool', async () => {
    mockAllTopicsSucceed();

    const questions = await generateMixedMcqQuestions(10, mulberry32(4));

    for (const q of questions) {
      const topics = new Set(q.options.map(poolOf));
      expect(topics.size).toBe(1);
    }
  });

  it('shuffles the final question order rather than grouping questions by topic', async () => {
    mockAllTopicsSucceed();

    const questions = await generateMixedMcqQuestions(9, mulberry32(1));
    const topicSequence = questions.map((q) => poolOf(q.options[q.correctIndex]));

    // A grouped-by-topic result would look like 3 identical values, then 3 of
    // another, then 3 of the last — i.e. exactly 2 "switch points" across the
    // whole sequence. A shuffled sequence should switch topics more than that.
    let switches = 0;
    for (let i = 1; i < topicSequence.length; i++) {
      if (topicSequence[i] !== topicSequence[i - 1]) switches++;
    }
    expect(switches).toBeGreaterThan(2);
  });
});
