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
- **Annotations** indexées par `positionKey(fen)` (4 premiers champs FEN) →
  partagées entre transpositions.
- **Cartes SRS** : ID `${openingId}::${positionKey}::${expectedUci}`. Deux
  transpositions = une seule carte.
- Repos `localStorage` (`openingsRepo`, `cardsRepo`, `foldersRepo`) avec
  cache + invalidation au write.
- **Engine** (`src/domain/engine.ts`) : Worker Stockfish singleton, boot
  lazy au premier `analyze()`. Mutex Promise pour sérialiser : chaque
  analyse attend le bestmove de la précédente avant d'envoyer ses commandes.
  Watchdog 5 s qui terminate + reboot transparent en cas d'enlisement.
  Asset wasm copié par `vite-plugin-static-copy` dans `dist/engine/`.

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
- **Stats / progression** : taux de réussite par ouverture, courbe de cartes
  mûres, heatmap des positions plantées.
- **Thèmes de board**.
