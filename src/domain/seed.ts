import { makeUci } from 'chessops/util';
import { parseSan } from 'chessops/san';
import { chessFromFen, START_FEN } from './chess';
import { foldersRepo, openingsRepo } from '../storage/repository';
import type { Color, Folder, Line, Opening } from './types';

const SEEDED_KEY = 'gambit.seeded';
const FOLDER_NAME = 'Démarrage rapide';

type SeedMove = { san: string };

type SeedLine = {
  moves: SeedMove[];
  /** Index of another line in the same opening's `lines` array; root = no parent. */
  parentIndex?: number;
};

type OpeningSpec = {
  name: string;
  color: Color;
  lines: SeedLine[];
};

const s = (san: string): SeedMove => ({ san });

// --- White repertoire -------------------------------------------------------

const ITALIAN: OpeningSpec = {
  name: 'Italienne',
  color: 'white',
  lines: [
    {
      // Giuoco Pianissimo moderne
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'),
        s('Bc4'),
        s('Bc5'), s('c3'), s('Nf6'), s('d3'), s('a6'), s('O-O'), s('d6'),
        s('Re1'), s('Ba7'), s('h3'), s('O-O'), s('Nbd2'), s('Be6'),
      ],
    },
    {
      // Défense des Deux Cavaliers
      parentIndex: 0,
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'), s('Bc4'),
        s('Nf6'),
        s('Ng5'),
        s('d5'),
        s('exd5'), s('Na5'), s('Bb5+'), s('c6'), s('dxc6'), s('bxc6'), s('Be2'), s('h6'),
      ],
    },
    {
      // Gambit Evans
      parentIndex: 0,
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'), s('Bc4'), s('Bc5'),
        s('b4'),
        s('Bxb4'), s('c3'), s('Ba5'), s('d4'), s('exd4'), s('O-O'), s('Nge7'),
      ],
    },
    {
      // Italienne classique avec c3-d4 (vs Giuoco Pianissimo)
      parentIndex: 0,
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'), s('Bc4'), s('Bc5'), s('c3'), s('Nf6'),
        s('d4'), s('exd4'), s('cxd4'), s('Bb4+'), s('Nc3'), s('Nxe4'),
      ],
    },
  ],
};

const RUY_LOPEZ: OpeningSpec = {
  name: 'Espagnole',
  color: 'white',
  lines: [
    {
      // Espagnole fermée (Closed Spanish)
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'),
        s('Bb5'),
        s('a6'), s('Ba4'), s('Nf6'), s('O-O'), s('Be7'), s('Re1'), s('b5'),
        s('Bb3'), s('d6'),
        s('c3'),
        s('O-O'), s('h3'), s('Nb8'), s('d4'), s('Nbd7'),
      ],
    },
    {
      // Défense Berlin (l'arme de Kramnik vs Kasparov)
      parentIndex: 0,
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'), s('Bb5'),
        s('Nf6'),
        s('O-O'), s('Nxe4'), s('d4'), s('Nd6'), s('Bxc6'), s('dxc6'), s('dxe5'), s('Nf5'),
        s('Qxd8+'), s('Kxd8'),
      ],
    },
    {
      // Variante Ouverte (Open Spanish)
      parentIndex: 0,
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'), s('Bb5'), s('a6'), s('Ba4'), s('Nf6'),
        s('O-O'), s('Nxe4'), s('d4'), s('b5'), s('Bb3'), s('d5'), s('dxe5'), s('Be6'),
        s('c3'), s('Bc5'),
      ],
    },
    {
      // Variante d'Échange
      parentIndex: 0,
      moves: [
        s('e4'), s('e5'), s('Nf3'), s('Nc6'), s('Bb5'), s('a6'),
        s('Bxc6'),
        s('dxc6'), s('O-O'), s('f6'), s('d4'), s('exd4'), s('Nxd4'), s('c5'),
      ],
    },
  ],
};

const QGD: OpeningSpec = {
  name: 'Gambit dame refusé',
  color: 'white',
  lines: [
    {
      // Orthodoxe
      moves: [
        s('d4'), s('d5'),
        s('c4'),
        s('e6'), s('Nc3'), s('Nf6'),
        s('Bg5'),
        s('Be7'), s('e3'), s('O-O'), s('Nf3'), s('Nbd7'), s('Rc1'), s('c6'), s('Bd3'),
        s('dxc4'), s('Bxc4'), s('Nd5'),
      ],
    },
    {
      // Défense Slave
      parentIndex: 0,
      moves: [
        s('d4'), s('d5'), s('c4'),
        s('c6'),
        s('Nf3'), s('Nf6'), s('Nc3'), s('dxc4'), s('a4'), s('Bf5'), s('e3'), s('e6'),
        s('Bxc4'), s('Bb4'),
      ],
    },
    {
      // Défense Lasker
      parentIndex: 0,
      moves: [
        s('d4'), s('d5'), s('c4'), s('e6'), s('Nc3'), s('Nf6'), s('Bg5'), s('Be7'),
        s('e3'), s('O-O'), s('Nf3'), s('h6'), s('Bh4'), s('Ne4'),
      ],
    },
    {
      // Défense Tartakower
      parentIndex: 0,
      moves: [
        s('d4'), s('d5'), s('c4'), s('e6'), s('Nc3'), s('Nf6'), s('Bg5'), s('Be7'),
        s('e3'), s('O-O'), s('Nf3'), s('h6'), s('Bh4'), s('b6'), s('cxd5'), s('Nxd5'),
        s('Bxe7'), s('Qxe7'),
      ],
    },
  ],
};

const ENGLISH: OpeningSpec = {
  name: 'Anglaise',
  color: 'white',
  lines: [
    {
      // Sicilienne inversée (1...e5)
      moves: [
        s('c4'),
        s('e5'), s('Nc3'), s('Nf6'), s('Nf3'), s('Nc6'),
        s('g3'),
        s('Bb4'), s('Bg2'), s('O-O'), s('O-O'), s('e4'), s('Ne1'), s('Bxc3'), s('dxc3'),
      ],
    },
    {
      // Symétrique avec Maroczy inversé
      parentIndex: 0,
      moves: [
        s('c4'), s('c5'), s('Nf3'), s('Nc6'), s('d4'), s('cxd4'), s('Nxd4'), s('g6'),
        s('e4'), s('Nf6'), s('Nc3'), s('Nxd4'), s('Qxd4'), s('d6'),
      ],
    },
    {
      // Réversée vs setup royale indienne (1...Nf6)
      parentIndex: 0,
      moves: [
        s('c4'), s('Nf6'), s('Nc3'), s('e6'), s('Nf3'), s('d5'), s('d4'),
      ],
    },
    {
      // Anglaise hedgehog
      parentIndex: 0,
      moves: [
        s('c4'), s('c5'), s('Nf3'), s('Nf6'), s('Nc3'), s('e6'), s('g3'), s('b6'),
        s('Bg2'), s('Bb7'), s('O-O'), s('Be7'), s('d4'), s('cxd4'), s('Qxd4'), s('d6'),
      ],
    },
  ],
};

const LONDON: OpeningSpec = {
  name: 'Système Londres',
  color: 'white',
  lines: [
    {
      // Londres moderne vs ...d5
      moves: [
        s('d4'), s('d5'), s('Nf3'), s('Nf6'),
        s('Bf4'),
        s('c5'), s('e3'), s('Nc6'), s('Nbd2'), s('e6'), s('c3'), s('Bd6'),
        s('Bg3'),
        s('O-O'), s('Bd3'), s('b6'), s('O-O'), s('Bb7'),
      ],
    },
    {
      // vs Indienne du roi noire
      parentIndex: 0,
      moves: [
        s('d4'),
        s('Nf6'),
        s('Nf3'), s('g6'), s('Bf4'), s('Bg7'), s('e3'), s('O-O'), s('Be2'), s('d6'),
        s('O-O'), s('Nbd7'),
      ],
    },
    {
      // vs ...c5 précoce
      parentIndex: 0,
      moves: [
        s('d4'), s('d5'), s('Nf3'),
        s('c5'),
        s('Bf4'), s('Nc6'), s('e3'), s('Nf6'), s('c3'), s('Bf5'),
        // Bd3 doit venir AVANT Nbd2, sinon le cavalier bloque la dame et
        // l'échange ...Bxd3 ne peut plus être repris.
        s('Bd3'), s('Bxd3'), s('Qxd3'), s('e6'), s('Nbd2'),
      ],
    },
  ],
};

// --- Black repertoire -------------------------------------------------------

const NAJDORF: OpeningSpec = {
  name: 'Sicilienne Najdorf',
  color: 'black',
  lines: [
    {
      // 6.Be2 Classique (Opocensky)
      moves: [
        s('e4'), s('c5'), s('Nf3'), s('d6'), s('d4'), s('cxd4'), s('Nxd4'), s('Nf6'),
        s('Nc3'),
        s('a6'),
        s('Be2'), s('e5'), s('Nb3'), s('Be7'), s('O-O'), s('O-O'), s('Be3'), s('Be6'),
      ],
    },
    {
      // 6.Be3 Attaque Anglaise
      parentIndex: 0,
      moves: [
        s('e4'), s('c5'), s('Nf3'), s('d6'), s('d4'), s('cxd4'), s('Nxd4'), s('Nf6'),
        s('Nc3'), s('a6'),
        s('Be3'),
        s('e5'), s('Nb3'), s('Be6'), s('f3'), s('Be7'), s('Qd2'), s('Nbd7'),
        s('O-O-O'),
      ],
    },
    {
      // 6.Bg5 Variante Principale
      parentIndex: 0,
      moves: [
        s('e4'), s('c5'), s('Nf3'), s('d6'), s('d4'), s('cxd4'), s('Nxd4'), s('Nf6'),
        s('Nc3'), s('a6'),
        s('Bg5'),
        s('e6'), s('f4'), s('Be7'), s('Qf3'), s('Qc7'), s('O-O-O'), s('Nbd7'),
      ],
    },
    {
      // Variante Dragon (5...g6 au lieu de a6)
      parentIndex: 0,
      moves: [
        s('e4'), s('c5'), s('Nf3'), s('d6'), s('d4'), s('cxd4'), s('Nxd4'), s('Nf6'),
        s('Nc3'),
        s('g6'),
        s('Be3'),
        s('Bg7'), s('f3'), s('O-O'), s('Qd2'), s('Nc6'), s('Bc4'), s('Bd7'),
      ],
    },
  ],
};

const FRENCH: OpeningSpec = {
  name: 'Française Winawer',
  color: 'black',
  lines: [
    {
      // Winawer Variante Principale Empoisonnée
      moves: [
        s('e4'), s('e6'), s('d4'), s('d5'), s('Nc3'),
        s('Bb4'),
        s('e5'), s('c5'), s('a3'),
        s('Bxc3+'),
        s('bxc3'), s('Ne7'), s('Qg4'), s('Qc7'), s('Qxg7'), s('Rg8'), s('Qxh7'),
        s('cxd4'),
      ],
    },
    {
      // Variante Tarrasch
      parentIndex: 0,
      moves: [
        s('e4'), s('e6'), s('d4'), s('d5'),
        s('Nd2'),
        s('c5'), s('exd5'), s('exd5'), s('Ngf3'), s('Nc6'), s('Bb5'), s('Bd6'),
        s('O-O'), s('Nge7'),
      ],
    },
    {
      // Variante Classique (Steinitz)
      parentIndex: 0,
      moves: [
        s('e4'), s('e6'), s('d4'), s('d5'), s('Nc3'),
        s('Nf6'),
        s('e5'), s('Nfd7'), s('f4'), s('c5'), s('Nf3'), s('Nc6'), s('Be3'), s('cxd4'),
        s('Nxd4'),
      ],
    },
    {
      // Variante d'Avance
      parentIndex: 0,
      moves: [
        s('e4'), s('e6'), s('d4'), s('d5'),
        s('e5'),
        s('c5'), s('c3'), s('Nc6'), s('Nf3'), s('Bd7'), s('Be2'), s('Nge7'),
      ],
    },
  ],
};

const CARO_KANN: OpeningSpec = {
  name: 'Caro-Kann classique',
  color: 'black',
  lines: [
    {
      // Caro-Kann Classique principale
      moves: [
        s('e4'), s('c6'), s('d4'), s('d5'), s('Nc3'), s('dxe4'), s('Nxe4'),
        s('Bf5'),
        s('Ng3'), s('Bg6'), s('h4'),
        s('h6'),
        s('Nf3'), s('Nd7'), s('h5'), s('Bh7'), s('Bd3'), s('Bxd3'), s('Qxd3'),
      ],
    },
    {
      // Variante Karpov (4...Nd7)
      parentIndex: 0,
      moves: [
        s('e4'), s('c6'), s('d4'), s('d5'), s('Nc3'), s('dxe4'), s('Nxe4'),
        s('Nd7'), s('Nf3'), s('Ngf6'), s('Nxf6+'), s('Nxf6'), s('c3'), s('Bf5'),
        s('Ne5'),
      ],
    },
    {
      // Caro-Kann d'Avance
      parentIndex: 0,
      moves: [
        s('e4'), s('c6'), s('d4'), s('d5'),
        s('e5'),
        s('Bf5'),
        s('Nf3'), s('e6'), s('Be2'), s('Nd7'), s('O-O'), s('Ne7'),
      ],
    },
    {
      // Variante d'Échange
      parentIndex: 0,
      moves: [
        s('e4'), s('c6'), s('d4'), s('d5'), s('exd5'), s('cxd5'), s('Bd3'), s('Nc6'),
        s('c3'), s('Nf6'), s('Bf4'),
      ],
    },
  ],
};

const KINGS_INDIAN: OpeningSpec = {
  name: 'Indienne du roi',
  color: 'black',
  lines: [
    {
      // Mar del Plata Classique (Be2)
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('g6'), s('Nc3'), s('Bg7'), s('e4'), s('d6'),
        s('Nf3'), s('O-O'), s('Be2'),
        s('e5'),
        s('O-O'), s('Nc6'),
        s('d5'),
        s('Ne7'), s('b4'), s('Nh5'), s('Re1'), s('f5'),
      ],
    },
    {
      // Défense Grünfeld
      parentIndex: 0,
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('g6'), s('Nc3'),
        s('d5'),
        s('cxd5'), s('Nxd5'), s('e4'), s('Nxc3'), s('bxc3'), s('Bg7'), s('Bc4'),
        s('c5'), s('Ne2'),
      ],
    },
    {
      // Variante Sämisch
      parentIndex: 0,
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('g6'), s('Nc3'), s('Bg7'), s('e4'), s('d6'),
        s('f3'),
        s('O-O'), s('Be3'), s('e5'), s('d5'), s('Nh5'),
      ],
    },
    {
      // Variante Fianchetto
      parentIndex: 0,
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('g6'), s('Nf3'), s('Bg7'), s('g3'), s('O-O'),
        s('Bg2'), s('d6'), s('O-O'), s('Nbd7'),
      ],
    },
  ],
};

const NIMZO: OpeningSpec = {
  name: 'Nimzo-indienne',
  color: 'black',
  lines: [
    {
      // Variante Rubinstein (4.e3)
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('e6'), s('Nc3'),
        s('Bb4'),
        s('e3'), s('O-O'), s('Bd3'), s('d5'), s('Nf3'), s('c5'), s('O-O'), s('Nc6'),
        s('a3'),
        s('Bxc3'), s('bxc3'), s('dxc4'), s('Bxc4'),
      ],
    },
    {
      // Variante Classique de Capablanca (4.Qc2)
      parentIndex: 0,
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('e6'), s('Nc3'), s('Bb4'),
        s('Qc2'),
        s('O-O'), s('a3'), s('Bxc3+'), s('Qxc3'), s('b6'), s('Nf3'), s('Bb7'),
      ],
    },
    {
      // Variante Sämisch (4.a3)
      parentIndex: 0,
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('e6'), s('Nc3'), s('Bb4'),
        s('a3'),
        s('Bxc3+'), s('bxc3'), s('c5'), s('e3'), s('Nc6'), s('Bd3'),
      ],
    },
    {
      // Défense Bogo-indienne (3.Nf3 Bb4+)
      parentIndex: 0,
      moves: [
        s('d4'), s('Nf6'), s('c4'), s('e6'),
        s('Nf3'),
        s('Bb4+'), s('Bd2'), s('a5'), s('g3'), s('d5'), s('Bg2'),
      ],
    },
  ],
};

const ALL_OPENINGS: OpeningSpec[] = [
  ITALIAN,
  RUY_LOPEZ,
  QGD,
  ENGLISH,
  LONDON,
  NAJDORF,
  FRENCH,
  CARO_KANN,
  KINGS_INDIAN,
  NIMZO,
];

function buildOpening(folderId: string, spec: OpeningSpec): Opening {
  const now = Date.now();
  const lineIds = spec.lines.map(() => crypto.randomUUID());
  const lines: Line[] = [];

  for (let i = 0; i < spec.lines.length; i++) {
    const seedLine = spec.lines[i];
    const chess = chessFromFen(START_FEN);
    const ucis: string[] = [];
    for (let j = 0; j < seedLine.moves.length; j++) {
      const { san } = seedLine.moves[j];
      const move = parseSan(chess, san);
      if (!move) {
        throw new Error(
          `Seed: SAN invalide dans "${spec.name}" ligne ${i} demi-coup ${j} : "${san}"`,
        );
      }
      ucis.push(makeUci(move));
      chess.play(move);
    }
    lines.push({
      id: lineIds[i],
      name: i === 0 ? 'Ligne principale' : 'Variante',
      moves: ucis,
      parentLineId:
        seedLine.parentIndex !== undefined ? lineIds[seedLine.parentIndex] : undefined,
    });
  }

  return {
    id: crypto.randomUUID(),
    name: spec.name,
    color: spec.color,
    lines,
    annotations: {},
    folderId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * On a truly fresh install (no openings, no folders, no prior seed marker),
 * drop a curated folder of typical openings to give new users something to
 * explore immediately. The folder behaves like any other — deleting it (or
 * its contents) won't bring the seed back.
 */
export function seedIfFresh(): void {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    if (foldersRepo.list().length > 0 || openingsRepo.list().length > 0) {
      localStorage.setItem(SEEDED_KEY, '1');
      return;
    }
    const folder: Folder = {
      id: crypto.randomUUID(),
      name: FOLDER_NAME,
      createdAt: Date.now(),
    };
    foldersRepo.save(folder);
    for (const spec of ALL_OPENINGS) {
      try {
        openingsRepo.save(buildOpening(folder.id, spec));
      } catch (err) {
        // Skip a broken spec rather than aborting every opening that
        // follows in the loop.
        console.error(`Seed: échec sur "${spec.name}":`, err);
      }
    }
    localStorage.setItem(SEEDED_KEY, '1');
  } catch (err) {
    // Don't break the app if the seed throws; mark it done so we don't loop.
    console.error('Seed failed:', err);
    try {
      localStorage.setItem(SEEDED_KEY, '1');
    } catch {
      /* ignored */
    }
  }
}
