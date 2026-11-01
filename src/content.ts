// All website copy lives here so the founders can edit it without touching layout code.
// Anything in [brackets] is a placeholder that must be replaced before launch.

export type SectionId = 'top' | 'solutions' | 'approach' | 'research' | 'partners' | 'about' | 'contact';

export const nav: { label: string; target: SectionId }[] = [
  { label: 'Home', target: 'top' },
  { label: 'Research', target: 'research' },
  { label: 'Solutions & Products', target: 'solutions' },
  { label: 'Partnerships', target: 'partners' },
  { label: 'About', target: 'about' },
];

// Set to a real, monitored address before launch. While empty, the contact button is hidden.
export const CONTACT_EMAIL = '';

export const hero = {
  eyebrow: 'APPLIED AI RESEARCH & COMMERCIALIZATION',
  title: 'Bridging AI research and real-world innovation.',
  body: 'Oivuni AI turns applied AI research into validated products that solve measurable problems. We seek to collaborate with researchers, academic institutions and industry partners to get there.',
};

export const pillars = [
  {
    number: '01',
    title: 'Oivuni Research',
    body: 'Original applied research, experimentation, benchmarking and scientific validation.',
    link: { label: 'Research programs →', target: 'research' as SectionId },
  },
  {
    number: '02',
    title: 'Oivuni Applied Solutions',
    body: 'Collaborative R&D, prototyping, validation and industry pilots that lead to commercial technologies.',
    link: { label: 'Partnerships →', target: 'partners' as SectionId },
  },
  {
    number: '03',
    title: 'Oivuni Products',
    body: 'Proprietary technologies that emerge from validated research. Our first product candidate is entering feasibility research and customer discovery.',
    link: { label: 'See what we are building →', target: 'research' as SectionId },
    dark: true,
  },
];

export const approach = {
  title: 'From research to production, with evidence at every step.',
  body: 'Turning research into working technology takes experimentation, independent validation and practical engineering. We test promising methods against existing approaches before developing them into products.',
  steps: [
    { number: '01', title: 'Research', body: 'Original methods and evaluation designs.' },
    { number: '02', title: 'Validation', body: 'Tested against real alternatives.' },
    { number: '03', title: 'Product', body: 'Built for one clear problem and buyer.' },
    { number: '04', title: 'Scale', body: 'Proven methods applied to new domains.' },
  ],
};

// Status labels must stay accurate: Proposed → Exploratory research → Feasibility research → In development → Available.
export const programs = {
  title: 'Trustworthy AI for critical systems.',
  body: 'We investigate methods that make AI-assisted decisions more reliable, explainable and verifiable where errors have significant consequences. Our first programs focus on security; new programs will join as our research grows.',
  items: [
    {
      status: 'Feasibility research',
      title: 'AI risk intelligence for communications infrastructure',
      body: 'Evidence-backed security and supply-chain risk prioritization for small and regional broadband providers, combining exploitation forecasts with network and equipment context.',
      link: 'Join as a design partner →',
      featured: true,
    },
    {
      status: 'In research',
      title: 'Execution-verified AI security remediation',
      body: 'Methods that test AI-generated security fixes for correctness and regressions before they reach production.',
      link: 'Discuss this research →',
    },
    {
      status: 'Proposed',
      title: 'Research reproducibility agents',
      body: 'Agents that reproduce published experiments and flag discrepancies, helping researchers trust and build on results.',
      link: 'Collaborate with us →',
    },
  ],
};

export const partners = {
  title: 'Research that deserves to leave the lab.',
  items: [
    { icon: 'book', title: 'AI researchers', body: 'Take a validated method beyond publication, with engineering, evaluation and a path to real users.' },
    { icon: 'institution', title: 'Academic institutions', body: 'Joint research, sponsored studies and licensing arrangements that keep academic rigor intact.' },
    { icon: 'briefcase', title: 'Industry partners', body: 'Design-partner pilots that test new AI methods against your real problems and existing tools.' },
  ] as const,
};

export const about = {
  title: 'The founding team',
  body: "Oivuni is founded by researchers and engineers with backgrounds in [fields]. The credentials below are the founders' own; work done by Oivuni as a company appears under Research.",
  founders: [1, 2, 3].map(() => ({
    name: '[Founder name]',
    role: '[Role]',
    education: '[Degrees and institutions]',
    research: '[Selected publications, citations, research interests]',
    experience: '[Engineering and industry background]',
    profileLabel: '[LinkedIn or Google Scholar]',
    profileUrl: '',
  })),
};

export const principles = [
  { title: 'Evidence over claims', body: 'Every result is measured against real alternatives, and the method is documented so others can check it.' },
  { title: 'People stay in control', body: 'Our systems recommend and explain. Changes to critical systems happen only with human approval.' },
  { title: 'Built to be useful', body: 'We start from a measurable problem and a real buyer, not from a model looking for a use.' },
];

export const contact = {
  title: 'Have research that should reach the real world?',
  body: 'Talk to us about collaboration, pilots or licensing.',
  button: 'Start a conversation',
};
