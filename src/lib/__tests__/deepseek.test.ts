import { validateClueResponse, validateDefinitionResponse, validateScenarioResponse } from '../deepseek';

describe('validateClueResponse', () => {
  const expectedTerms = ['ACCURATE', 'LEGIBLE'];

  it('accepts a well-formed response matching the expected terms exactly', () => {
    const raw = {
      clues: [
        { term: 'ACCURATE', clue: 'Free from errors and truthful.' },
        { term: 'legible', clue: 'Readable and permanent.' },
      ],
    };
    const result = validateClueResponse(raw, expectedTerms);
    expect(result).toEqual([
      { term: 'ACCURATE', clue: 'Free from errors and truthful.' },
      { term: 'LEGIBLE', clue: 'Readable and permanent.' },
    ]);
  });

  it('rejects a response missing a required term', () => {
    const raw = { clues: [{ term: 'ACCURATE', clue: 'Free from errors.' }] };
    expect(validateClueResponse(raw, expectedTerms)).toBeNull();
  });

  it('rejects a response with an extra, unrequested term', () => {
    const raw = {
      clues: [
        { term: 'ACCURATE', clue: 'Free from errors.' },
        { term: 'LEGIBLE', clue: 'Readable.' },
        { term: 'ORIGINAL', clue: 'Not a copy.' },
      ],
    };
    expect(validateClueResponse(raw, expectedTerms)).toBeNull();
  });

  it('rejects a duplicate term', () => {
    const raw = {
      clues: [
        { term: 'ACCURATE', clue: 'Free from errors.' },
        { term: 'ACCURATE', clue: 'Correct and truthful.' },
      ],
    };
    expect(validateClueResponse(raw, ['ACCURATE'])).toBeNull();
  });

  it('rejects an empty clue', () => {
    const raw = { clues: [{ term: 'ACCURATE', clue: '   ' }] };
    expect(validateClueResponse(raw, ['ACCURATE'])).toBeNull();
  });

  it('rejects a clue that leaks the answer term', () => {
    const raw = { clues: [{ term: 'ACCURATE', clue: 'Being ACCURATE means being correct.' }] };
    expect(validateClueResponse(raw, ['ACCURATE'])).toBeNull();
  });

  it('rejects a malformed shape (clues not an array)', () => {
    expect(validateClueResponse({ clues: 'nope' }, expectedTerms)).toBeNull();
    expect(validateClueResponse(null, expectedTerms)).toBeNull();
    expect(validateClueResponse('a string', expectedTerms)).toBeNull();
  });

  it('rejects an entry with a non-string term or clue', () => {
    const raw = { clues: [{ term: 123, clue: 'x' }] };
    expect(validateClueResponse(raw, expectedTerms)).toBeNull();
  });
});

describe('validateDefinitionResponse', () => {
  const expectedTerms = ['GRADE B GOWNING', 'DISQUALIFICATION'];

  it('accepts a well-formed response matching the expected terms exactly', () => {
    const raw = {
      definitions: [
        { term: 'GRADE B GOWNING', definition: 'Full sterile coverage including headgear, mask and gloves.' },
        { term: 'disqualification', definition: 'Removal from aseptic duties pending retraining.' },
      ],
    };
    const result = validateDefinitionResponse(raw, expectedTerms);
    expect(result).toEqual([
      { term: 'GRADE B GOWNING', definition: 'Full sterile coverage including headgear, mask and gloves.' },
      { term: 'DISQUALIFICATION', definition: 'Removal from aseptic duties pending retraining.' },
    ]);
  });

  it('rejects a response missing a required term', () => {
    const raw = { definitions: [{ term: 'GRADE B GOWNING', definition: 'Sterile coverage.' }] };
    expect(validateDefinitionResponse(raw, expectedTerms)).toBeNull();
  });

  it('rejects a response with an extra, unrequested term', () => {
    const raw = {
      definitions: [
        { term: 'GRADE B GOWNING', definition: 'Sterile coverage.' },
        { term: 'DISQUALIFICATION', definition: 'Removal from duties.' },
        { term: 'GRADE C GOWNING', definition: 'A trouser suit.' },
      ],
    };
    expect(validateDefinitionResponse(raw, expectedTerms)).toBeNull();
  });

  it('rejects a duplicate term', () => {
    const raw = {
      definitions: [
        { term: 'DISQUALIFICATION', definition: 'Removal from duties.' },
        { term: 'DISQUALIFICATION', definition: 'Barred from aseptic work.' },
      ],
    };
    expect(validateDefinitionResponse(raw, ['DISQUALIFICATION'])).toBeNull();
  });

  it('rejects an empty definition', () => {
    const raw = { definitions: [{ term: 'DISQUALIFICATION', definition: '   ' }] };
    expect(validateDefinitionResponse(raw, ['DISQUALIFICATION'])).toBeNull();
  });

  it('rejects a definition that leaks the answer term', () => {
    const raw = { definitions: [{ term: 'DISQUALIFICATION', definition: 'DISQUALIFICATION means being barred.' }] };
    expect(validateDefinitionResponse(raw, ['DISQUALIFICATION'])).toBeNull();
  });

  it('rejects a malformed shape (definitions not an array)', () => {
    expect(validateDefinitionResponse({ definitions: 'nope' }, expectedTerms)).toBeNull();
    expect(validateDefinitionResponse(null, expectedTerms)).toBeNull();
    expect(validateDefinitionResponse('a string', expectedTerms)).toBeNull();
  });

  it('rejects an entry with a non-string term or definition', () => {
    const raw = { definitions: [{ term: 123, definition: 'x' }] };
    expect(validateDefinitionResponse(raw, expectedTerms)).toBeNull();
  });
});

describe('validateScenarioResponse', () => {
  const expectedTerms = ['AIRLOCK', 'BIOFILM'];

  it('accepts a well-formed response matching the expected terms exactly', () => {
    const raw = {
      scenarios: [
        { term: 'AIRLOCK', clue: 'A doorway that controls pressure between two rooms.' },
        { term: 'biofilm', clue: 'Microbes stuck together on a surface, hard to remove.' },
      ],
    };
    const result = validateScenarioResponse(raw, expectedTerms);
    expect(result).toEqual([
      { term: 'AIRLOCK', clue: 'A doorway that controls pressure between two rooms.' },
      { term: 'BIOFILM', clue: 'Microbes stuck together on a surface, hard to remove.' },
    ]);
  });

  it('rejects a response missing a required term', () => {
    const raw = { scenarios: [{ term: 'AIRLOCK', clue: 'A doorway.' }] };
    expect(validateScenarioResponse(raw, expectedTerms)).toBeNull();
  });

  it('rejects a response with an extra, unrequested term', () => {
    const raw = {
      scenarios: [
        { term: 'AIRLOCK', clue: 'A doorway.' },
        { term: 'BIOFILM', clue: 'Sticky microbes.' },
        { term: 'ISOLATOR', clue: 'An enclosure.' },
      ],
    };
    expect(validateScenarioResponse(raw, expectedTerms)).toBeNull();
  });

  it('rejects a duplicate term', () => {
    const raw = {
      scenarios: [
        { term: 'BIOFILM', clue: 'Sticky microbes.' },
        { term: 'BIOFILM', clue: 'A protective matrix on a surface.' },
      ],
    };
    expect(validateScenarioResponse(raw, ['BIOFILM'])).toBeNull();
  });

  it('rejects an empty clue', () => {
    const raw = { scenarios: [{ term: 'BIOFILM', clue: '   ' }] };
    expect(validateScenarioResponse(raw, ['BIOFILM'])).toBeNull();
  });

  it('rejects a clue that leaks the answer term', () => {
    const raw = { scenarios: [{ term: 'BIOFILM', clue: 'A BIOFILM is sticky microbes on a surface.' }] };
    expect(validateScenarioResponse(raw, ['BIOFILM'])).toBeNull();
  });

  it('rejects a malformed shape (scenarios not an array)', () => {
    expect(validateScenarioResponse({ scenarios: 'nope' }, expectedTerms)).toBeNull();
    expect(validateScenarioResponse(null, expectedTerms)).toBeNull();
    expect(validateScenarioResponse('a string', expectedTerms)).toBeNull();
  });

  it('rejects an entry with a non-string term or clue', () => {
    const raw = { scenarios: [{ term: 123, clue: 'x' }] };
    expect(validateScenarioResponse(raw, expectedTerms)).toBeNull();
  });
});
