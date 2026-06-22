# Gambit

Trainer SRS d'ouvertures d'échecs, local-first. Vite + React 19 + TanStack
Router + Tailwind v4. Échiquier `@lichess-org/chessground@10`, logique `chessops`,
moteur `stockfish-18-lite-single` (Worker), stockage `localStorage` uniquement.

## Démarrage

```bash
npm install
npm run dev
```

## Tests

Tests unitaires du domaine avec **Vitest** ([vitest.config.ts](vitest.config.ts),
env `node`, sans les plugins Vite de l'app). Ils couvrent les zones à régressions
faciles : normalisation du roque dual-form / position keys / transpositions
(`chess.ts`), arbre de variantes et `parentForNewVariant` (`tree.ts`), échelle
et lapses SM-2 (`srs.ts`).

```bash
npm test          # one-shot (vitest run), exit ≠ 0 si un test casse
npm run test:watch # mode watch pour le dev
```

Les tests vivent à côté du code (`src/**/*.test.ts`) et sont auto-découverts.
Lancer `npm test` avant un commit qui touche `src/domain/`.

### Automatisation (pas encore branchée — pour plus tard)

Aucun déclencheur automatique n'est en place ; `npm test` est manuel. Options
quand le besoin viendra, par robustesse décroissante :

- **GitHub Actions** : `npm test` à chaque push/PR. Indépendant de la machine.
  C'est l'option recommandée.
- **Hook pré-commit** (ex. `husky` ou un `.git/hooks/pre-commit`) : bloque
  localement un commit qui casse le domaine. Garde-fou instantané.
- **Hook Claude Code** (`settings.json`) : `npm test` auto en fin de session
  d'édition.

## Architecture (rappels)

- Lignes en **arbre** via `parentLineId`. Une variante = un coup divergent
  joué depuis l'échiquier (pas de bouton "+ Nouvelle").
- **Chapitres** (`Opening.chapters`) : groupent les lignes pour qu'un
  répertoire à plusieurs branches ne se mélange pas à la révision. Chaque
  `Line` porte un `chapterId`. **Règle dure** : un coup divergent joué sur
  la couleur de l'ouverture force la création d'un nouveau chapitre (modal
  obligatoire) — c'est ce qui évite les contradictions SRS quand deux sous-
  répertoires partagent une position. Divergence côté adverse → simple
  variante dans le chapitre courant. Migration au read (`repository.ts` →
  `migrateOpening`) crée un chapitre `"Principal"` pour les ouvertures
  d'avant.
- **Annotations** indexées par `positionKey(fen)` (4 premiers champs FEN) →
  partagées entre transpositions.
- **Cartes SRS** : ID `${openingId}::${chapterId}::${positionKey}::${expectedUci}`.
  Le chapitre fait partie de la clé pour que deux chapitres avec la même
  position mais des coups attendus différents restent des entrées distinctes.
- Repos `localStorage` (`openingsRepo`, `cardsRepo`, `foldersRepo`) avec
  cache + invalidation au write.
- **Engine** (`src/domain/engine.ts`) : Worker Stockfish singleton, boot
  lazy au premier `analyze()`. Mutex Promise pour sérialiser : chaque
  analyse attend le bestmove de la précédente avant d'envoyer ses commandes.
  Watchdog 5 s qui terminate + reboot transparent en cas d'enlisement.
  Asset wasm copié par `vite-plugin-static-copy` dans `dist/engine/`.
- **Reconnaissance d'ouvertures** (`src/domain/openings-db.ts`) : index
  position-keyé du dataset `lichess-org/chess-openings` (3733 entrées,
  vendoré dans `src/data/eco/`). Pré-compilé en JSON par
  `npm run openings:index` à chaque refresh du snapshot. Lazy-loaded en
  chunk séparé (~60 KB gzip). `recognizeOpening(uciMoves, upTo)` renvoie
  l'entrée ECO la plus profonde atteinte le long de la ligne — chess.com
  style, transpositions naturellement gérées.

## Roadmap

### Out of scope v1 — propositions futures

- **Mode "soft" en étude** : réponse acceptée si dans le top-N eval Stockfish,
  pas seulement match UCI exact. Utile pour transpositions et sous-variantes
  non encore renseignées.
- **"Jouer le meilleur coup"** : bouton qui pré-remplit une variante avec la
  ligne principale de Stockfish.
- **Stockfish multi-thread** (nécessite headers COOP/COEP côté hébergement).
- **FSRS** à la place de SM-2 (gain perçu marginal, à arbitrer plus tard).
- **PWA / mobile** : `vite-plugin-pwa`, manifeste, icônes.
- **Sync cloud sans backend** : Gist GitHub ou push API Lichess Study.
- **Dialog de promotion** (actuellement auto-dame, bloque les lignes
  d'underpromotion).
- **Page Profil + stats** (`/profile`) : trois blocs — *Maîtrise* (coups
  maîtrisés, % du répertoire, en apprentissage, jamais vus), *Performance*
  (réussite globale, asymétrie Blancs/Noirs, podium top 3 / flop 3
  pondéré par `masteryPct × successRate`), *Haut faits* (badges à partir
  du cumul `card.reps` / `card.lapses` / `card.interval`). L'activité
  temporelle (streak, révisions du jour, heatmap) viendra dans un second
  temps : nécessite un `reviewsRepo` qui log `{ts, cardId, grade}` à
  chaque review depuis `study.tsx`. La même route accueillera plus tard
  une section *Options*. Premier draft fonctionnel rollback ; à
  reprendre à froid.
- **Thèmes de board**.
