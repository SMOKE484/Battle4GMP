import { generateMcqQuestions } from '../mcqService';
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
