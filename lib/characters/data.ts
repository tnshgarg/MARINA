/**
 * Pixel-art hero roster. Each character is a 16x16 grid drawn with single-char
 * codes; the per-character palette maps codes to hex colors. The `CharacterAvatar`
 * component renders these as crisp pixel-art SVGs.
 *
 * Grid conventions per row (16 chars exactly):
 *   '.'  = transparent
 *   other ASCII char  = a palette entry
 */

export type CharacterKey =
  | 'iron_man'
  | 'spider_man'
  | 'captain'
  | 'thor'
  | 'hulk'
  | 'widow'
  | 'strange'
  | 'wolverine'
  | 'panther'
  | 'deadpool'

export type Character = {
  key: CharacterKey
  name: string
  codename: string
  tagline: string
  /** Primary brand color for accents */
  color: string
  /** Soft glow / aura color used on cards + badges */
  glow: string
  palette: Record<string, string>
  grid: string[]
}

const GRID_SIZE = 16

function check(grid: string[]): string[] {
  if (grid.length !== GRID_SIZE) {
    throw new Error(`grid must be ${GRID_SIZE} rows, got ${grid.length}`)
  }
  grid.forEach((row, i) => {
    if (row.length !== GRID_SIZE) {
      throw new Error(`grid row ${i} must be ${GRID_SIZE} chars: "${row}" (${row.length})`)
    }
  })
  return grid
}

export const CHARACTERS: Character[] = [
  {
    key: 'iron_man',
    name: 'Iron Man',
    codename: 'Tony Stark',
    tagline: 'Genius, billionaire, deploys to prod',
    color: '#dc2626',
    glow: '#fbbf24',
    palette: { A: '#7f1d1d', B: '#dc2626', C: '#fbbf24', D: '#fffbeb' },
    grid: check([
      '................',
      '................',
      '.....AAAAAA.....',
      '....ABBBBBBBA...',
      '...ABBBBBBBBBA..',
      '..ABBCCCCCCBBA..',
      '..ABBBBBBBBBBA..',
      '..ABBDDBBBBDDBA.',
      '..ABBBBBBBBBBA..',
      '..ABBBCCCCBBBBA.',
      '..ABBCCCCCCBBA..',
      '..ABBBBBBBBBBA..',
      '...ABBBBBBBBA...',
      '....AAAAAAAA....',
      '................',
      '................',
    ]),
  },
  {
    key: 'spider_man',
    name: 'Spider-Man',
    codename: 'Peter Parker',
    tagline: 'Friendly neighborhood code reviewer',
    color: '#b91c1c',
    glow: '#fca5a5',
    palette: { A: '#450a0a', B: '#dc2626', C: '#7f1d1d', D: '#ffffff', E: '#000000' },
    grid: check([
      '................',
      '................',
      '.....AAAAAA.....',
      '....ABBBBBBA....',
      '...ABCBBBBCBA...',
      '..ABCBBBBBBCBA..',
      '..ABDDDBBDDDBA..',
      '..ABDDDBBDDDBA..',
      '..ABBBBBBBBBBA..',
      '..ABBEEEEEEBBA..',
      '..ABBEBBBBEBBA..',
      '..ABBBEEEEBBBA..',
      '...ABBBBBBBBA...',
      '....AAAAAAAA....',
      '................',
      '................',
    ]),
  },
  {
    key: 'captain',
    name: 'Captain America',
    codename: 'Steve Rogers',
    tagline: 'I can do this all day',
    color: '#1d4ed8',
    glow: '#93c5fd',
    palette: { A: '#1e3a8a', B: '#2563eb', C: '#ffffff', D: '#fef3c7', E: '#b91c1c' },
    grid: check([
      '................',
      '................',
      '.....AAAAAA.....',
      '....ABBBBBBA....',
      '...ABBBCCBBBA...',
      '..ABBBCCCCBBBA..',
      '..ABBCCCCCCBBA..',
      '..ABBCCCCCCBBA..',
      '..ABBBCCCCBBBA..',
      '..ABBCCBBCCBBA..',
      '..ABBCBBBBCBBA..',
      '..ABBBBBBBBBBA..',
      '...ABBBBBBBBA...',
      '....AAAAAAAA....',
      '................',
      '................',
    ]),
  },
  {
    key: 'thor',
    name: 'Thor',
    codename: 'God of Thunder',
    tagline: 'Always pushing hammers, never to main',
    color: '#94a3b8',
    glow: '#fde047',
    palette: { A: '#1e293b', B: '#94a3b8', C: '#fde047', D: '#fefce8', E: '#3b82f6', F: '#cbd5e1' },
    grid: check([
      '................',
      '..BB........BB..',
      '.BAB........BAB.',
      '.BAABBBBBBBBAAB.',
      '.BBFFFFFFFFFFBB.',
      '..BFCCCCCCCCFB..',
      '..BFCDDDDDDCFB..',
      '..ABCDDEEDDCBA..',
      '..ABCDDDDDDCBA..',
      '..ABBCCCCCCBBA..',
      '..ABBCCCCCCBBA..',
      '..ABBBCCCCBBBA..',
      '...ABBBBBBBBA...',
      '....AAAAAAAA....',
      '................',
      '................',
    ]),
  },
  {
    key: 'hulk',
    name: 'Hulk',
    codename: 'Bruce Banner',
    tagline: 'Smash bugs. Smash deadlines.',
    color: '#15803d',
    glow: '#86efac',
    palette: { A: '#052e16', B: '#16a34a', C: '#22c55e', D: '#ffffff', E: '#000000' },
    grid: check([
      '................',
      '................',
      '...AAACCCAAA....',
      '..ACCCCCCCCCA...',
      '..ACBBBBBBBCA...',
      '.ABBBBBBBBBBBA..',
      '.ABBDDBBBBDDBA..',
      '.ABBDEBBBBEDBA..',
      '.ABBBBBBBBBBBA..',
      '.ABBBEEEEEEBBA..',
      '.ABBBEAAAAEBBA..',
      '.ABBBEAEEAEBBA..',
      '..ABBEEEEEEBA...',
      '..ABBBBBBBBBA...',
      '...AAAAAAAAA....',
      '................',
    ]),
  },
  {
    key: 'widow',
    name: 'Black Widow',
    codename: 'Natasha Romanoff',
    tagline: 'Quiet commits, loud results',
    color: '#9f1239',
    glow: '#fb7185',
    palette: { A: '#1f2937', B: '#7f1d1d', C: '#b91c1c', D: '#fde68a', E: '#0f172a', F: '#fecaca' },
    grid: check([
      '................',
      '.....BBBBBB.....',
      '....BCCCCCCB....',
      '...BCCCCCCCCB...',
      '..BCCFFFFFFCCB..',
      '..BCFFFFFFFFCB..',
      '..BCFEEFFEEFCB..',
      '..BCFFFFFFFFCB..',
      '..BCFFFEEFFFCB..',
      '..BBFFFFFFFFBB..',
      '...ABBBBBBBBA...',
      '...ABBBBBBBBA...',
      '....ABBBBBBA....',
      '.....AAAAAA.....',
      '................',
      '................',
    ]),
  },
  {
    key: 'strange',
    name: 'Doctor Strange',
    codename: 'Stephen Strange',
    tagline: 'Bending time, bending TypeScript',
    color: '#b91c1c',
    glow: '#fbbf24',
    palette: { A: '#7c2d12', B: '#b91c1c', C: '#fbbf24', D: '#0f172a', E: '#fde68a', F: '#9a3412' },
    grid: check([
      '................',
      '.....BBBBBB.....',
      '....BFFFFFFB....',
      '...BFFFFFFFFB...',
      '..BFEEEEEEEEFB..',
      '..BFEDDEEDDEFB..',
      '..BFEEEEEEEEFB..',
      '..BFEECCCCEEFB..',
      '..BFEEEEEEEEFB..',
      '..ABBFEEEEFBBA..',
      '..ABBBCCCCBBBA..',
      '..ABBBBBBBBBBA..',
      '...ABBBBBBBBA...',
      '....ABBBBBBA....',
      '................',
      '................',
    ]),
  },
  {
    key: 'wolverine',
    name: 'Wolverine',
    codename: 'Logan',
    tagline: 'Three claws, ten thousand commits',
    color: '#facc15',
    glow: '#fef9c3',
    palette: { A: '#1c1917', B: '#facc15', C: '#3b82f6', D: '#ffffff', E: '#000000', F: '#b45309' },
    grid: check([
      '................',
      '..BB........BB..',
      '..BAB......BAB..',
      '..BAAB....BAAB..',
      '..BAAABBBBAAAB..',
      '..BAAAABBAAAAB..',
      '..ABBBBBBBBBBA..',
      '..ABDDBBBBDDBA..',
      '..ABEEBBBBEEBA..',
      '..ABBBBBBBBBBA..',
      '..ABBFFFFFFBBA..',
      '..ABBBBBBBBBBA..',
      '...ABBBBBBBBA...',
      '....AAAAAAAA....',
      '................',
      '................',
    ]),
  },
  {
    key: 'panther',
    name: 'Black Panther',
    codename: 'TChalla',
    tagline: 'Wakanda forever, deploys forever',
    color: '#581c87',
    glow: '#c084fc',
    palette: { A: '#1e1b4b', B: '#3b0764', C: '#a855f7', D: '#fde047', E: '#000000' },
    grid: check([
      '................',
      '...AA......AA...',
      '..AAAA....AAAA..',
      '.AAACAA..AACAAA.',
      '.AACCAAAAAACCAA.',
      '.AAAAAAAAAAAAAA.',
      '.AAAAAAAAAAAAAA.',
      '.AAACCAAAACCAAA.',
      '.AAACEAAAAECAAA.',
      '.AAAAAAAAAAAAAA.',
      '.AAAACCCCCCAAAA.',
      '..AAACEEEECAAA..',
      '..AAAAAAAAAAAA..',
      '...AAAAAAAAAA...',
      '....EAAAAAAA....',
      '................',
    ]),
  },
  {
    key: 'deadpool',
    name: 'Deadpool',
    codename: 'Wade Wilson',
    tagline: 'Chaotic neutral. Ships anyway.',
    color: '#b91c1c',
    glow: '#fca5a5',
    palette: { A: '#1c1917', B: '#dc2626', C: '#7f1d1d', D: '#ffffff', E: '#000000' },
    grid: check([
      '................',
      '................',
      '.....AAAAAA.....',
      '....ABBBBBBA....',
      '...ABCBBBBCBA...',
      '..ABCBBBBBBCBA..',
      '..ABEEDDDDEEBA..',
      '..ABEDDBBDDEBA..',
      '..ABEDDBBDDEBA..',
      '..ABBEEDDEEBBA..',
      '..ABBBBBBBBBBA..',
      '..ABBBEEEEBBBA..',
      '..ABBBBBBBBBBA..',
      '...ABBBBBBBBA...',
      '....AAAAAAAA....',
      '................',
    ]),
  },
]

const BY_KEY = new Map(CHARACTERS.map((c) => [c.key, c]))

export function getCharacter(key: string | null | undefined): Character | null {
  if (!key) return null
  return BY_KEY.get(key as CharacterKey) ?? null
}

export function isCharacterKey(key: string): key is CharacterKey {
  return BY_KEY.has(key as CharacterKey)
}
