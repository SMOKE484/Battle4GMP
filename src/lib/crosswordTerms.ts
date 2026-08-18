export interface AlcoaTerm {
  term: string;
  fallbackClue: string;
}

// ALCOA+ principles for data integrity. CONTEMPORANEOUS is excluded from the
// selectable pool — at 15 letters it dwarfs the others and tends to dominate
// the grid as a single sprawling entry rather than intersecting cleanly.
//
// The 9 terms below (+ CONTEMPORANEOUS) are the complete ALCOA+ acronym, so
// broader data-integrity concepts from level1notes/ (the WHO draft data
// integrity guideline and the Scilife "Data Integrity and Data Governance"
// study guide) are added after them to grow the pool without duplicating a
// concept already covered. A further 5 terms after that are grounded in the
// MHRA "GxP Data Integrity Guidance and Definitions" (Revision 1, March 2018)
// — a source not in level1notes/, pulled in via web search since it covers
// computerised-system concepts (validation, transactions, admin access) the
// uploaded PDFs don't. Extend this table as more source material arrives —
// no other file needs to change.
export const ALCOA_PLUS_TERMS: AlcoaTerm[] = [
  { term: 'ATTRIBUTABLE', fallbackClue: 'It must be clear who recorded the data and when.' },
  { term: 'LEGIBLE', fallbackClue: 'Records must be readable, unambiguous, and traceable by anyone reviewing them later.' },
  { term: 'ORIGINAL', fallbackClue: 'The first recording of data, or a verified true copy of it.' },
  { term: 'ACCURATE', fallbackClue: 'Data must be correct, truthful, and free from errors.' },
  { term: 'COMPLETE', fallbackClue: 'Nothing may be deleted or omitted without a documented, valid reason.' },
  { term: 'CONSISTENT', fallbackClue: 'Data must be in a logical sequence, dated in the expected order.' },
  { term: 'ENDURING', fallbackClue: 'Records must remain intact for as long as required by regulation.' },
  { term: 'AVAILABLE', fallbackClue: 'Data must be accessible for review or inspection whenever needed.' },
  {
    term: 'METADATA',
    fallbackClue:
      'The contextual information that describes other data and gives it meaning — for example, a date stamp, a unit, or a user ID.',
  },
  {
    term: 'GOVERNANCE',
    fallbackClue:
      'The arrangements a company puts in place to ensure data is recorded, processed, retained and used correctly throughout its life cycle.',
  },
  {
    term: 'ARCHIVING',
    fallbackClue:
      'Storing and protecting records under independent, controlled custody so they cannot be accessed, altered or deleted improperly.',
  },
  {
    term: 'FALSIFICATION',
    fallbackClue:
      'The deliberate alteration of records to misrepresent what actually happened — one of the most serious data integrity violations.',
  },
  {
    term: 'BACKDATING',
    fallbackClue:
      'Recording a date earlier than when the entry was actually made — explicitly prohibited, since data must be recorded at the time it occurs.',
  },
  {
    term: 'RETENTION',
    fallbackClue:
      'The defined period for which records must be kept and remain available before they may be destroyed.',
  },
  {
    term: 'STATIC',
    fallbackClue:
      'Describes a fixed record format, such as a printed balance readout, that offers no interaction between the user and the content.',
  },
  {
    term: 'DYNAMIC',
    fallbackClue:
      'Describes a record, such as a database or spreadsheet, that lets the user interact with, query or reprocess its content.',
  },
  {
    term: 'INDELIBLE',
    fallbackClue: 'The required quality of the ink used for paper records — permanent and never erasable.',
  },
  {
    term: 'CRITICALITY',
    fallbackClue:
      'How much a piece of data matters to a quality, safety or efficacy decision — used to decide how much scrutiny and control it needs.',
  },
  {
    term: 'TRANSACTION',
    fallbackClue:
      'A single operation, or sequence of operations, that a computerised system treats as one unit of work and only writes to permanent storage once it is deliberately saved.',
  },
  {
    term: 'VALIDATION',
    fallbackClue:
      'Confirming that a computerised system performs as intended for its specific process and users, not just that the vendor tested its raw functionality.',
  },
  {
    term: 'RECONSTRUCTION',
    fallbackClue:
      "The ability to rebuild the full \"who, what, when and why\" of a past event purely from the retained record and its metadata.",
  },
  {
    term: 'ADMINISTRATOR',
    fallbackClue:
      'The restricted system role able to delete data, amend a database or change configuration — access to it must be limited and never given to someone with a direct interest in the data.',
  },
];
