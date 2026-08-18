import { generateClues, getHint, DeepSeekError } from '../deepseek';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function chatCompletion(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

describe('generateClues / getHint (network layer)', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY;
  const originalApiUrl = process.env.EXPO_PUBLIC_DEEPSEEK_API_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY = 'test-key';
    process.env.EXPO_PUBLIC_DEEPSEEK_API_URL = 'https://fake.deepseek.test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Mutate the specific keys rather than reassigning process.env wholesale —
    // whole-object reassignment doesn't reliably stick across tests here.
    if (originalApiKey === undefined) delete process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY;
    else process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY = originalApiKey;
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_DEEPSEEK_API_URL;
    else process.env.EXPO_PUBLIC_DEEPSEEK_API_URL = originalApiUrl;
    jest.restoreAllMocks();
  });

  it('returns validated clues on a successful call', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(
        chatCompletion({ clues: [{ term: 'ACCURATE', clue: 'Correct and truthful.' }] })
      )
    ) as unknown as typeof fetch;

    const result = await generateClues(['ACCURATE']);
    expect(result).toEqual([{ term: 'ACCURATE', clue: 'Correct and truthful.' }]);
  });

  it('throws api_error when the API key is missing', async () => {
    delete process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(generateClues(['ACCURATE'])).rejects.toMatchObject({ kind: 'api_error' });
  });

  it('throws api_error on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 500)) as unknown as typeof fetch;

    await expect(generateClues(['ACCURATE'])).rejects.toMatchObject({ kind: 'api_error' });
  });

  it('throws network on a fetch rejection', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    await expect(generateClues(['ACCURATE'])).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws timeout when the request is aborted', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    await expect(generateClues(['ACCURATE'])).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('throws invalid_response when the message content is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'not json' } }] })
    ) as unknown as typeof fetch;

    await expect(generateClues(['ACCURATE'])).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('throws invalid_response when the validated shape check fails', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(chatCompletion({ clues: [{ term: 'WRONG_TERM', clue: 'x' }] }))
    ) as unknown as typeof fetch;

    await expect(generateClues(['ACCURATE'])).rejects.toBeInstanceOf(DeepSeekError);
    await expect(generateClues(['ACCURATE'])).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('getHint returns the trimmed hint string on success', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(chatCompletion({ hint: '  Because it means being correct.  ' }))
    ) as unknown as typeof fetch;

    await expect(getHint('ACCURATE', 'Correct and truthful.')).resolves.toBe('Because it means being correct.');
  });

  it('getHint throws invalid_response on an empty hint', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(chatCompletion({ hint: '   ' }))
    ) as unknown as typeof fetch;

    await expect(getHint('ACCURATE', 'clue')).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
