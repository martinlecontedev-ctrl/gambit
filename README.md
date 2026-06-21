# Gambit

Trainer SRS d'ouvertures d'échecs, local-first. Vite + React 19 + TanStack
Router + Tailwind v4. Échiquier `@lichess-org/chessground@10`, logique `chessops`,
moteur `stockfish-18-lite-single` (Worker), stockage `localStorage` uniquement.

## Démarrage

```bash
npm install
npm run dev
```

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
