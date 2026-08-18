export interface PersonnelTerm {
  term: string;
  fallbackDefinition: string;
}

// Grounded in two source PDFs (level2notes/):
// - PIC/S Annex 1 §7 (Personnel.pdf) — sterile-manufacturing gowning/qualification rules.
// - PIC/S GMP Guide Part I, Chapter 2 (pe-009-17-...part-i...pdf) — general personnel
//   roles/responsibilities (Key Personnel section, 2.5-2.9).
// fallbackDefinition is a paraphrase, not a verbatim quote, grounded in a specific
// paragraph so DeepSeek has real regulatory meaning to reword rather than general
// LLM knowledge of GMP. Extend this table as more Level 2 source material arrives —
// no other file needs to change.
export const PERSONNEL_TERMS: PersonnelTerm[] = [
  {
    term: 'GRADE B GOWNING',
    fallbackDefinition:
      'Sterile headgear enclosing all hair, sterile facemask and eye coverings, and a second pair of sterile gloves over tucked sleeves and sterilised over-boots.',
  },
  {
    term: 'GRADE C GOWNING',
    fallbackDefinition:
      'A single or two-piece trouser suit gathered at the wrists with a high neck, worn with disinfected shoes or overshoes.',
  },
  {
    term: 'GRADE D GOWNING',
    fallbackDefinition:
      'A general protective suit covering hair, beards and moustaches, worn with disinfected shoes or overshoes.',
  },
  {
    term: 'GOWNING QUALIFICATION',
    fallbackDefinition:
      'Confirmed by assessment and reassessment at least annually, covering both visual inspection and microbial sampling of the gown.',
  },
  {
    term: 'DISQUALIFICATION',
    fallbackDefinition:
      'Triggered by an adverse monitoring trend or a failed aseptic process simulation; requires retraining and requalification before further aseptic work.',
  },
  {
    term: 'UNQUALIFIED PERSONNEL',
    fallbackDefinition:
      'Barred from grade B or grade A-in-operation areas unless supervised under a written procedure by an authorised person.',
  },
  {
    term: 'PERSONAL ITEMS POLICY',
    fallbackDefinition:
      'Wristwatches, make-up, jewellery, mobile phones and other non-essential items are not allowed in clean areas.',
  },
  {
    term: 'CLEANROOM MOVEMENT',
    fallbackDefinition:
      'Should be slow, controlled and methodical, avoiding obstruction of the unidirectional airflow into the critical zone.',
  },
  {
    term: 'AUTHORISED PERSON',
    fallbackDefinition:
      'Certifies that each batch has been manufactured and checked in compliance with the law and the Marketing Authorisation before it is released for sale.',
  },
  {
    term: 'HEAD OF PRODUCTION',
    fallbackDefinition:
      'Approves production instructions and ensures their strict implementation, and ensures the required training of production department staff.',
  },
  {
    term: 'HEAD OF QUALITY CONTROL',
    fallbackDefinition:
      'Approves or rejects starting materials and finished products, and approves specifications, sampling instructions and test methods.',
  },
  {
    term: 'SENIOR MANAGEMENT',
    fallbackDefinition:
      'Holds ultimate responsibility for an effective Pharmaceutical Quality System, with roles, responsibilities and authorities clearly defined and communicated.',
  },
];
