export interface SterilityTerm {
  term: string;
  fallbackClue: string;
}

// Grounded in four source PDFs (level3notes/):
// - Annex 1: manufacture of sterile products.pdf (EU/PIC/S Annex 1, 2022/2023 revision)
//   — Glossary section, plus §7.13-7.15 for gowning.
// - sterile_product.pdf (Nelson Mandela University course slides) — biofilm and
//   cleanroom attire slides.
// - Sterility Assurance The Fundamentals.pdf (Pharmaceutical Online guest column) —
//   sterility assurance / SAL framing (informs several clues' wording, no new terms).
// - principles of sterity.pdf (Aulton's Pharmaceutics, "Principles of sterilization" /
//   "Sterilization in practice" chapters) — sterilization methods, validation and
//   process-indicator terms (AUTOCLAVE onward below).
// fallbackClue is a paraphrase, not a verbatim quote, grounded in a specific
// glossary entry/slide/section so DeepSeek has real regulatory meaning to reword
// rather than general LLM knowledge of sterility. Extend this table as more Level 3
// source material arrives — no other file needs to change. Terms must be a single
// unbroken word (no spaces) since each is spelled out letter-by-letter in one word
// search grid row — see src/lib/wordSearchLayout.ts.
export const STERILITY_TERMS: SterilityTerm[] = [
  {
    term: 'CLEANROOM',
    fallbackClue:
      'A room designed, maintained and controlled to reproducibly meet an appropriate air cleanliness level and prevent contamination of drug products.',
  },
  {
    term: 'AIRLOCK',
    fallbackClue:
      'An enclosed space with interlocked doors that controls air pressure between two adjoining rooms of different cleanliness.',
  },
  {
    term: 'BIOBURDEN',
    fallbackClue:
      'The total number of microorganisms associated with an item such as personnel, equipment, packaging or raw materials.',
  },
  {
    term: 'ISOLATOR',
    fallbackClue:
      'An enclosure with an internal grade A work zone that stays continuously isolated from the surrounding cleanroom air and personnel.',
  },
  {
    term: 'ENDOTOXIN',
    fallbackClue:
      'A pyrogenic substance in the cell wall of Gram-negative bacteria that can cause reactions in patients ranging from fever to death.',
  },
  {
    term: 'ASEPTIC',
    fallbackClue:
      'The handling of sterile product in a controlled environment where air, materials and personnel are regulated to prevent contamination.',
  },
  {
    term: 'BIOFILM',
    fallbackClue:
      'A community of microorganisms embedded in a protective matrix that sticks to a surface, is hard to eradicate, and can slough off in clumps.',
  },
  {
    term: 'GOWNING',
    fallbackClue:
      'Dressing in sterile protective garments appropriate to the grade of the working area before entering a clean area.',
  },
  {
    term: 'AUTOCLAVE',
    fallbackClue:
      'A pressure vessel that generates steam to sterilise a load, typically holding it at 121°C for 15 minutes.',
  },
  {
    term: 'DEPYROGENATION',
    fallbackClue:
      'A dry-heat process, run above 220°C, that reduces heat-resistant endotoxin on glassware by at least a thousandfold.',
  },
  {
    term: 'STERILANT',
    fallbackClue:
      'A chemical agent capable of destroying all forms of microbial life, including bacterial spores, given enough concentration and contact time.',
  },
  {
    term: 'SPORICIDAL',
    fallbackClue:
      'Describes an agent able to destroy bacterial and fungal spores, among the most heat- and chemical-resistant forms of microbial life.',
  },
  {
    term: 'DOSIMETER',
    fallbackClue:
      'A device that changes colour in proportion to the radiation dose it receives, used to confirm a load was sterilised correctly.',
  },
  {
    term: 'LETHALITY',
    fallbackClue:
      "A measure of a heat sterilisation process's total killing power, calculated to compare the effectiveness of different cycles.",
  },
  {
    term: 'PYROGEN',
    fallbackClue:
      'A substance that can trigger a fever in a patient after being introduced into the body, most often via an injection.',
  },
  {
    term: 'RABS',
    fallbackClue:
      'A rigid-walled barrier system with integrated gloves that separates its interior from the surrounding cleanroom without being fully sealed.',
  },
  {
    term: 'PARISON',
    fallbackClue:
      'The tube of molten polymer extruded by a Blow-Fill-Seal machine before it is formed, filled and sealed into a container.',
  },
  {
    term: 'OVERKILL',
    fallbackClue:
      'A heat sterilisation approach deliberately more aggressive than the minimum needed, reducing microorganisms by at least twelve logs for a wide safety margin.',
  },
  {
    term: 'THERMOLABILE',
    fallbackClue:
      'Describes a material that is damaged by heat, so it must be sterilised by filtration or gas rather than steam or dry heat.',
  },
  {
    term: 'DEIONISED',
    fallbackClue:
      'Water passed through ion-exchange resin beds to remove dissolved ions, though this alone does not remove bacteria.',
  },
  {
    term: 'FILTRATION',
    fallbackClue:
      'A nonterminal sterilising method that physically removes microorganisms from a liquid or gas by passing it through a fine membrane.',
  },
  {
    term: 'INTEGRITY',
    fallbackClue:
      'A post-use check, such as a bubble-point or diffusive-flow test, that confirms a sterilising filter was not damaged during use.',
  },
  // +9 more mined from the Annex 1 Glossary (section 11) and Aulton's "Alternative
  // means for heat delivery and control" section, added to grow pool variety
  // without duplicating a concept already above.
  {
    term: 'BARRIER',
    fallbackClue:
      'A physical partition that separates a grade A aseptic processing zone from the surrounding background environment, often built as a RABS or isolator system.',
  },
  {
    term: 'DISINFECTION',
    fallbackClue:
      'The process by which the number of microorganisms is reduced, through an irreversible action on their structure or metabolism, to a level appropriate for a defined purpose.',
  },
  {
    term: 'DECONTAMINATION',
    fallbackClue:
      'The overall process of removing or reducing any contaminant — chemical, waste, residue or microbial — from an area, object or person.',
  },
  {
    term: 'LEACHABLES',
    fallbackClue:
      'Chemical entities that migrate into a product from its container or process-equipment contact surface under normal conditions of use or storage.',
  },
  {
    term: 'EXTRACTABLES',
    fallbackClue:
      'Chemical entities that migrate from process-equipment surfaces into a product only when exposed to an aggressive solvent under extreme test conditions.',
  },
  {
    term: 'HEPA',
    fallbackClue:
      'A high-efficiency particulate air filter, specified to a recognised international standard, used to supply clean filtered air to controlled areas.',
  },
  {
    term: 'DECOMMISSION',
    fallbackClue:
      'What happens to a process, item of equipment, or cleanroom once it is permanently taken out of use and will not operate again.',
  },
  {
    term: 'CONTAMINATION',
    fallbackClue:
      'The undesired introduction of microbial or foreign particulate impurities into a material or product during manufacture, sampling, storage or transport.',
  },
  {
    term: 'IRRADIATION',
    fallbackClue:
      'A sterilization method using ionizing radiation that kills microorganisms without causing a significant rise in temperature.',
  },
];
