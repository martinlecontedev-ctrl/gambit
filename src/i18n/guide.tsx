import type { ReactNode } from 'react';
import { Code, Kbd } from '../components/InlineDoc';
import { useStrings } from './index';

/** Guide page prose. Items are ReactNode: inline <em>/<strong>/<Kbd>/<Code>
 * live in the dictionary; the page keeps only the layout. */

const fr = {
  title: 'Guide',
  intro: "Les comportements non évidents, en bref. À compléter au fil de l'eau.",
  toc: {
    var: 'Variantes',
    chap: 'Chapitres',
    arrows: 'Flèches',
    nag: 'Glyphes NAG',
    trans: 'Transpositions',
    engine: 'Moteur',
    explorer: 'Explorateur',
    lichess: 'Compte Lichess',
    study: 'Étude',
    folders: 'Dossiers',
    io: 'Import / Export',
    backup: 'Sauvegarde',
  },
  sections: {
    variants: {
      title: 'Variantes',
      items: [
        <>
          Une variante se crée <em>uniquement</em> en jouant un coup divergent depuis l'échiquier —
          sur un coup de l'<strong>adversaire</strong>. Pas de bouton dédié.
        </>,
        <>
          Si tu joues un coup à un endroit où une ligne soeur existe déjà, tu bascules dessus au
          lieu de créer un doublon.
        </>,
        <>
          <Kbd>Supprimer la suite</Kbd> tronque la ligne courante à la position du curseur.{' '}
          <Kbd>Supprimer la variante</Kbd> retire la ligne en cours et ré-attache ses enfants au
          parent.
        </>,
      ] as ReactNode[],
    },
    chapters: {
      title: 'Chapitres',
      items: [
        <>
          Un coup divergent sur <strong>ta couleur</strong> crée un nouveau chapitre (nom suggéré
          depuis l'ouverture ECO reconnue) : deux choix de répertoire pour la même position ne
          peuvent pas cohabiter dans un même chapitre sans contredire la révision.
        </>,
        <>
          Chaque chapitre est drillé séparément : ses cartes de révision lui appartiennent, même si
          une position apparaît aussi ailleurs.
        </>,
        <>
          Import d'une étude Lichess : un chapitre d'étude = un chapitre Gambit, position de départ
          personnalisée comprise.
        </>,
      ] as ReactNode[],
    },
    arrows: {
      title: "Flèches sur l'échiquier",
      draw: (
        <>
          <strong>Clic-droit-glisser</strong> pour tracer une flèche d'une case à l'autre, ou un
          cercle si tu lâches sur la case de départ.
        </>
      ) as ReactNode,
      pills: {
        default: 'défaut · vert',
        shift: 'Shift · rouge',
        alt: 'Alt · bleu',
        shiftAlt: 'Shift+Alt · jaune',
      },
      attached: (
        <>
          Les flèches sont attachées à la position. Elles disparaissent quand tu joues un coup mais
          réapparaissent dès que tu reviens dessus.
        </>
      ) as ReactNode,
    },
    nag: {
      title: 'Glyphes NAG (qualité de coup)',
      rows: {
        good: 'Bon coup',
        interesting: 'Intéressant',
        brilliant: 'Brillant',
        dubious: 'Douteux',
        mistake: 'Coup faible',
        blunder: 'Gaffe',
      },
      note: (
        <>
          Le glyphe apparaît dans la scoresheet à côté du coup et comme pilule colorée sur la case
          d'arrivée du dernier coup joué.
        </>
      ) as ReactNode,
    },
    transpositions: {
      title: 'Transpositions',
      items: [
        <>
          Une position est identifiée par son <em>setup</em> (placement, trait, roque, en passant),
          pas par l'ordre des coups qui y a mené.
        </>,
        <>
          Conséquence : les annotations sont partagées entre toutes les lignes qui mènent à la même
          position. Les cartes de révision le sont aussi, mais <em>au sein d'un même chapitre</em> —
          deux chapitres gardent des cartes distinctes pour la même position.
        </>,
      ] as ReactNode[],
    },
    engine: {
      title: 'Moteur (Stockfish)',
      items: [
        <>
          Le bouton <Kbd>Engine</Kbd> dans l'éditeur active Stockfish : barre d'évaluation à gauche
          du plateau, score chiffré, et flèches suggérées (bleu pâle = meilleur coup, gris =
          alternatives).
        </>,
        <>
          Le réglage persiste d'une session à l'autre. Le moteur tourne en local (WebAssembly),
          rien ne sort du navigateur.
        </>,
      ] as ReactNode[],
    },
    explorer: {
      title: "Explorateur d'ouvertures",
      items: [
        <>
          Panneau <Kbd>Explorateur</Kbd> dans l'éditeur : pour la position affichée, les coups les
          plus joués avec leur part de parties et la barre victoires blancs / nulles / victoires
          noirs. Deux bases : parties Lichess (1800+, blitz à classique) ou parties de maîtres.
        </>,
        <>
          Cliquer un coup le joue sur l'échiquier — mêmes règles que d'habitude (bascule, variante
          ou nouveau chapitre selon le cas).
        </>,
        <>
          Opt-in : tant que le panneau est <Kbd>OFF</Kbd>, aucune requête ne part vers Lichess. Les
          positions déjà consultées sont mises en cache pour la session.
        </>,
        <>
          L'explorateur passe par ton <strong>compte Lichess connecté</strong> (onglet LICHESS, ou
          bouton dans le panneau) — gratuit, aucun scope demandé. Tout reste stocké en local.
        </>,
      ] as ReactNode[],
    },
    lichess: {
      title: 'Compte Lichess',
      items: [
        <>
          Onglet <Kbd>LICHESS</Kbd> dans la barre du haut : <Kbd>Connecter Lichess</Kbd> lance
          l'OAuth officiel (PKCE), sans mot de passe partagé — tu autorises Gambit depuis Lichess,
          aucun scope demandé. <Kbd>Déconnecter</Kbd> pour révoquer côté app.
        </>,
        <>
          Une fois connecté : tes <strong>parties récentes</strong> sont comparées à ton
          répertoire. Une déviation n'est signalée qu'à partir du <strong>4ᵉ coup</strong>, et pour
          tes propres coups, seulement s'il s'agit d'un coup <strong>rare</strong> (moins de 10 %
          dans la base Lichess) — un coup populaire, c'est une autre ouverture assumée, pas un
          raté. Clique l'étiquette pour déplier la <strong>position de bifurcation</strong> : coup
          joué en rouge, répertoire en vert.
        </>,
        <>
          Si <em>tu</em> as dévié : <Kbd>Réviser ce coup</Kbd> lance une session exercice sur cette
          seule position (même hors échéance et hors fenêtre de révision). Si l'<em>adversaire</em>{' '}
          est sorti de ta théorie : <Kbd>Ajouter au répertoire</Kbd> crée la variante avec son coup
          et t'ouvre l'éditeur dessus, prêt pour ta réponse — proposé à partir du{' '}
          <strong>5ᵉ coup</strong>.
        </>,
        <>
          <Kbd>↗</Kbd> ouvre la partie sur Lichess, directement à la position de sortie de théorie.
          L'explorateur utilise aussi cette session — plus de jeton à coller.
        </>,
        <>
          <strong>Ouvertures jouées</strong> : tes parties regroupées par famille d'ouverture
          (blancs / noirs), avec score V-N-D et l'ouverture préférée. Celles que ton répertoire ne
          couvre pas proposent <Kbd>Créer un répertoire</Kbd>, pré-rempli avec les coups que tu
          joues réellement — et du même coup, le Coach cesse de compter ces parties comme des
          « ratés » de ton autre théorie.
        </>,
        <>
          Dans l'<strong>éditeur</strong>, le bloc <strong>Fidélité au répertoire</strong> juge par
          comportement : chaque partie n'est comptée que pour l'ouverture qu'elle a suivie le plus
          profondément, et chaque coup manqué est lu contre ta propre régularité. Un même coup
          répété qui mène à une ouverture
          <em> nommée</em> (ex. l'Écossaise face à ton Italienne) est classé{' '}
          <strong>autre ouverture</strong> et sort du calcul ; « joué ♗b5 1× sur 7 passages » =
          trou de mémoire à réviser ; un coup hors-théorie répété = désaccord répertoire/pratique,
          à toi de trancher. Boutons <Kbd>Réviser</Kbd> ou renvoi vers Ouvertures jouées selon le
          cas.
        </>,
        <>
          <strong>Sauvegarde du répertoire</strong> : chaque ouverture peut être poussée vers une
          étude <em>privée</em> de ton compte (créée automatiquement, un chapitre Gambit = un
          chapitre d'étude). Sens unique — Gambit n'écrit que dans ses propres études, ne lit rien
          d'autre. L'état SRS reste local. Nécessite la permission d'écriture d'études (demandée à
          la connexion).
        </>,
      ] as ReactNode[],
    },
    study: {
      title: 'Étude',
      items: [
        <>
          Joue le coup attendu à la souris. Si correct, évalue ton rappel (Difficile · Bien ·
          Facile). Si raté, la carte revient dans 1 jour.
        </>,
        <>
          <Kbd>Révéler</Kbd> compte comme un oubli : même effet SRS qu'une erreur, mais tracé à
          part dans les compteurs de session.
        </>,
        <>
          La révision est <strong>opt-in</strong> : chaque ouverture a un interrupteur sur sa carte
          (home) et chaque chapitre le sien (overview), <em>désactivés par défaut</em>. Tant que
          rien n'est activé, aucune carte n'est due nulle part. L'interrupteur de l'ouverture
          bascule tous ses chapitres d'un coup ; le progrès d'un chapitre désactivé dort et revient
          intact à la réactivation.
        </>,
        <>
          La révision se fait chapitre par chapitre. Depuis la bannière de la home,{' '}
          <Kbd>Démarrer la révision</Kbd> enchaîne toutes les ouvertures qui ont des cartes dues.
        </>,
        <>
          Au survol d'un chapitre dans l'éditeur, <Kbd>◎</Kbd> ouvre <em>Définir la révision</em> :
          le tronc commun d'abord, puis chaque branche à partir de sa bifurcation. Clique le
          premier et le dernier coup à driller dans chaque bloc (<Kbd>Aucun</Kbd> pour sauter un
          tronc connu par cœur). Hors fenêtre, rien n'est dû ni compté dans la maîtrise ; le
          progrès revient si tu réélargis. Une fenêtre qui va jusqu'au dernier coup reste ouverte :
          les coups ajoutés ensuite sont drillés d'office.
        </>,
        <>
          Après réponse, le commentaire et les flèches associés à la position sortent sous le
          plateau et sur le board.
        </>,
      ] as ReactNode[],
    },
    folders: {
      title: 'Dossiers',
      items: [
        <>
          Sur la home, les ouvertures vivent dans <em>Sans dossier</em> ou dans un dossier que tu
          crées (<Kbd>+ Nouveau dossier</Kbd>). Au survol d'un dossier, <Kbd>✎</Kbd> renomme,{' '}
          <Kbd>✕</Kbd> supprime.
        </>,
        <>
          <strong>Drag-and-drop</strong> une carte d'ouverture sur un dossier (ou sur{' '}
          <em>Sans dossier</em>) pour la déplacer.
        </>,
        <>
          Supprimer un dossier <strong>supprime aussi son contenu</strong> (ouvertures, lignes,
          annotations, cartes de révision). Une confirmation rappelle l'effet exact avant
          validation.
        </>,
      ] as ReactNode[],
    },
    io: {
      title: 'Import / Export',
      items: [
        <>
          Bouton <Kbd>Importer</Kbd> sur la home : trois sources possibles, coller un PGN, coller
          une URL Lichess Study, ou charger un fichier <Code>.pgn</Code>. Un toggle Blancs/Noirs
          fixe le camp joué.
        </>,
        <>
          Lichess Study : l'URL complète <Code>lichess.org/study/STUDYID</Code> importe{' '}
          <em>tous les chapitres</em> ; ajouter <Code>/CHAPTERID</Code> au bout en importe un seul.
          Études publiques uniquement.
        </>,
        <>
          Import multi-chapitres : un écran de confirmation propose de regrouper le tout dans un
          nouveau dossier (pré-rempli avec le nom de l'étude), un dossier existant, ou rien.
        </>,
        <>
          Bouton <Kbd>Exporter</Kbd> dans l'éditeur : copie le PGN de l'ouverture courante — une
          partie par chapitre — avec variantes, commentaires, NAGs et flèches. Compatible Lichess
          Study, ChessBase et tout autre lecteur PGN.
        </>,
      ] as ReactNode[],
    },
    backup: {
      title: 'Sauvegarde et restauration',
      items: [
        <>
          Toutes tes données vivent <strong>dans ce navigateur</strong> (localStorage) : un
          nettoyage des données de navigation, un changement de machine ou de navigateur efface
          tout. La sauvegarde est ta seule protection.
        </>,
        <>
          Bouton utilisateur en haut à droite → <Kbd>Exporter</Kbd> : télécharge un fichier{' '}
          <Code>gambit-sauvegarde-AAAA-MM-JJ.json</Code> contenant l'intégralité de l'état —
          ouvertures (chapitres, variantes, annotations, fenêtres de révision), progrès de révision
          de chaque carte, historique d'un an, dossiers et liens vers tes études Lichess.
        </>,
        <>
          <Kbd>Restaurer…</Kbd> recharge un de ces fichiers.{' '}
          <strong>La restauration remplace tout</strong> (pas de fusion) — une confirmation compare
          d'abord le contenu du fichier à l'état actuel.
        </>,
        <>
          Non inclus : le compte Lichess (reconnecte-toi simplement) et les réglages propres à
          l'appareil (thème, moteur, explorateur).
        </>,
        <>
          Ne confonds pas avec l'export <Code>PGN</Code> : lui ne couvre que la structure d'une
          ouverture et <em>perd tout le progrès de révision</em>. Exporte une sauvegarde
          régulièrement — avant un gros import, c'est deux clics.
        </>,
      ] as ReactNode[],
    },
  },
};

const en: typeof fr = {
  title: 'Guide',
  intro: 'The non-obvious behaviours, in brief. Expanded over time.',
  toc: {
    var: 'Variations',
    chap: 'Chapters',
    arrows: 'Arrows',
    nag: 'NAG glyphs',
    trans: 'Transpositions',
    engine: 'Engine',
    explorer: 'Explorer',
    lichess: 'Lichess account',
    study: 'Study',
    folders: 'Folders',
    io: 'Import / Export',
    backup: 'Backup',
  },
  sections: {
    variants: {
      title: 'Variations',
      items: [
        <>
          A variation is created <em>only</em> by playing a diverging move on the board — on an{' '}
          <strong>opponent</strong> move. No dedicated button.
        </>,
        <>
          If you play a move where a sibling line already exists, you switch to it instead of
          creating a duplicate.
        </>,
        <>
          <Kbd>Delete rest of line</Kbd> truncates the current line at the cursor position.{' '}
          <Kbd>Delete variation</Kbd> removes the current line and re-attaches its children to the
          parent.
        </>,
      ],
    },
    chapters: {
      title: 'Chapters',
      items: [
        <>
          A diverging move on <strong>your colour</strong> creates a new chapter (name suggested
          from the recognised ECO opening): two repertoire choices for the same position cannot
          coexist in one chapter without contradicting review.
        </>,
        <>
          Each chapter is drilled separately: its review cards belong to it, even if a position
          also appears elsewhere.
        </>,
        <>
          Importing a Lichess study: one study chapter = one Gambit chapter, custom starting
          position included.
        </>,
      ],
    },
    arrows: {
      title: 'Arrows on the board',
      draw: (
        <>
          <strong>Right-click and drag</strong> to draw an arrow from one square to another, or a
          circle if you release on the starting square.
        </>
      ),
      pills: {
        default: 'default · green',
        shift: 'Shift · red',
        alt: 'Alt · blue',
        shiftAlt: 'Shift+Alt · yellow',
      },
      attached: (
        <>
          Arrows are attached to the position. They disappear when you play a move but reappear as
          soon as you come back to it.
        </>
      ),
    },
    nag: {
      title: 'NAG glyphs (move quality)',
      rows: {
        good: 'Good move',
        interesting: 'Interesting',
        brilliant: 'Brilliant',
        dubious: 'Dubious',
        mistake: 'Poor move',
        blunder: 'Blunder',
      },
      note: (
        <>
          The glyph appears in the scoresheet next to the move and as a coloured pill on the
          destination square of the last move played.
        </>
      ),
    },
    transpositions: {
      title: 'Transpositions',
      items: [
        <>
          A position is identified by its <em>setup</em> (piece placement, side to move, castling
          rights, en passant), not by the move order that reached it.
        </>,
        <>
          Consequence: annotations are shared across all lines leading to the same position.
          Review cards are too, but <em>within a single chapter</em> — two chapters keep distinct
          cards for the same position.
        </>,
      ],
    },
    engine: {
      title: 'Engine (Stockfish)',
      items: [
        <>
          The <Kbd>Engine</Kbd> button in the editor enables Stockfish: evaluation bar to the left
          of the board, numeric score, and suggested arrows (pale blue = best move, grey =
          alternatives).
        </>,
        <>
          The setting persists across sessions. The engine runs locally (WebAssembly); nothing
          leaves the browser.
        </>,
      ],
    },
    explorer: {
      title: 'Opening explorer',
      items: [
        <>
          <Kbd>Explorer</Kbd> panel in the editor: for the displayed position, the most played
          moves with their share of games and the white wins / draws / black wins bar. Two
          databases: Lichess games (1800+, blitz to classical) or master games.
        </>,
        <>
          Clicking a move plays it on the board — same rules as usual (switch, variation or new
          chapter, as the case may be).
        </>,
        <>
          Opt-in: while the panel is <Kbd>OFF</Kbd>, no request is sent to Lichess. Positions
          already looked up are cached for the session.
        </>,
        <>
          The explorer goes through your <strong>connected Lichess account</strong> (LICHESS tab,
          or the button in the panel) — free, no scope requested. Everything stays stored locally.
        </>,
      ],
    },
    lichess: {
      title: 'Lichess account',
      items: [
        <>
          <Kbd>LICHESS</Kbd> tab in the top bar: <Kbd>Connect Lichess</Kbd> starts the official
          OAuth flow (PKCE), no password shared — you authorise Gambit from Lichess, no scope
          requested. <Kbd>Disconnect</Kbd> revokes it on the app side.
        </>,
        <>
          Once connected: your <strong>recent games</strong> are compared against your repertoire.
          A deviation is only flagged from <strong>move 4</strong> on, and for your own moves,
          only if the move is <strong>rare</strong> (under 10% in the Lichess database) — a
          popular move is another opening played on purpose, not a miss. Click the tag to unfold
          the <strong>bifurcation position</strong>: played move in red, repertoire move in green.
        </>,
        <>
          If <em>you</em> deviated: <Kbd>Review this move</Kbd> starts an exercise session on that
          single position (even when not due, and outside the review window). If your{' '}
          <em>opponent</em> left your theory: <Kbd>Add to repertoire</Kbd> creates the variation
          with their move and opens the editor on it, ready for your reply — offered from{' '}
          <strong>move 5</strong> on.
        </>,
        <>
          <Kbd>↗</Kbd> opens the game on Lichess, right at the position where theory was left. The
          explorer uses this session too — no more token to paste.
        </>,
        <>
          <strong>Played openings</strong>: your games grouped by opening family (White / Black),
          with a W-D-L score and your favourite opening. Families your repertoire does not cover
          offer <Kbd>Create a repertoire</Kbd>, pre-filled with the moves you actually play — and
          in the same stroke, the Coach stops counting those games as “misses” of your other
          theory.
        </>,
        <>
          In the <strong>editor</strong>, the <strong>Repertoire fidelity</strong> block judges by
          behaviour: each game only counts for the opening it followed the deepest, and each
          missed move is read against your own consistency. A repeated move that leads to a
          <em> named</em> opening (e.g. the Scotch against your Italian) is classed as{' '}
          <strong>another opening</strong> and leaves the calculation; “played ♗b5 1 of 7 times” =
          a memory lapse to review; a repeated out-of-theory move = a repertoire/practice
          disagreement, yours to settle. <Kbd>Review</Kbd> buttons or a link to Played openings,
          as the case may be.
        </>,
        <>
          <strong>Repertoire backup</strong>: each opening can be pushed to a <em>private</em>{' '}
          study on your account (created automatically, one Gambit chapter = one study chapter).
          One-way — Gambit writes only to its own studies and reads nothing else. SRS state stays
          local. Requires the study write permission (requested at login).
        </>,
      ],
    },
    study: {
      title: 'Study',
      items: [
        <>
          Play the expected move with the mouse. If correct, grade your recall (Hard · Good ·
          Easy). If missed, the card comes back in 1 day.
        </>,
        <>
          <Kbd>Reveal</Kbd> counts as a lapse: same SRS effect as a mistake, but tracked
          separately in the session counters.
        </>,
        <>
          Review is <strong>opt-in</strong>: each opening has a switch on its card (home) and each
          chapter its own (overview), <em>off by default</em>. As long as nothing is enabled, no
          card is due anywhere. The opening's switch toggles all its chapters at once; a disabled
          chapter's progress sleeps and comes back intact when re-enabled.
        </>,
        <>
          Review runs chapter by chapter. From the home banner, <Kbd>Start review</Kbd> chains all
          openings that have due cards.
        </>,
        <>
          Hovering a chapter in the editor, <Kbd>◎</Kbd> opens <em>Define review</em>: the shared
          trunk first, then each branch from its fork. Click the first and last move to drill in
          each block (<Kbd>None</Kbd> to skip a trunk you know by heart). Outside the window,
          nothing is due nor counted towards mastery; progress comes back if you widen it again. A
          window reaching the last move stays open: moves added later are drilled automatically.
        </>,
        <>
          After you answer, the comment and arrows attached to the position show up below the
          board and on it.
        </>,
      ],
    },
    folders: {
      title: 'Folders',
      items: [
        <>
          On the home page, openings live in <em>No folder</em> or in a folder you create (
          <Kbd>+ New folder</Kbd>). Hovering a folder, <Kbd>✎</Kbd> renames, <Kbd>✕</Kbd> deletes.
        </>,
        <>
          <strong>Drag and drop</strong> an opening card onto a folder (or onto <em>No folder</em>
          ) to move it.
        </>,
        <>
          Deleting a folder <strong>also deletes its contents</strong> (openings, lines,
          annotations, review cards). A confirmation states the exact effect before you commit.
        </>,
      ],
    },
    io: {
      title: 'Import / Export',
      items: [
        <>
          <Kbd>Import</Kbd> button on the home page: three possible sources — paste a PGN, paste a
          Lichess Study URL, or load a <Code>.pgn</Code> file. A White/Black toggle sets the side
          you play.
        </>,
        <>
          Lichess Study: the full URL <Code>lichess.org/study/STUDYID</Code> imports{' '}
          <em>all chapters</em>; appending <Code>/CHAPTERID</Code> imports a single one. Public
          studies only.
        </>,
        <>
          Multi-chapter import: a confirmation screen offers to group everything in a new folder
          (pre-filled with the study name), an existing folder, or none.
        </>,
        <>
          <Kbd>Export</Kbd> button in the editor: copies the PGN of the current opening — one game
          per chapter — with variations, comments, NAGs and arrows. Compatible with Lichess Study,
          ChessBase and any other PGN reader.
        </>,
      ],
    },
    backup: {
      title: 'Backup and restore',
      items: [
        <>
          All your data lives <strong>in this browser</strong> (localStorage): clearing browsing
          data, switching machine or browser wipes everything. The backup is your only protection.
        </>,
        <>
          User button at the top right → <Kbd>Export</Kbd>: downloads a{' '}
          <Code>gambit-backup-YYYY-MM-DD.json</Code> file holding the entire state — openings
          (chapters, variations, annotations, review windows), each card's review progress, one
          year of history, folders, and links to your Lichess studies.
        </>,
        <>
          <Kbd>Restore…</Kbd> loads one of these files back.{' '}
          <strong>Restoring replaces everything</strong> (no merge) — a confirmation first
          compares the file's contents with the current state.
        </>,
        <>
          Not included: the Lichess account (just reconnect) and device-specific settings (theme,
          engine, explorer).
        </>,
        <>
          Do not confuse it with the <Code>PGN</Code> export: that one covers only an opening's
          structure and <em>loses all review progress</em>. Export a backup regularly — before a
          big import, it takes two clicks.
        </>,
      ],
    },
  },
};

export const GUIDE = { fr, en };

export function useGuideStrings() {
  return useStrings(GUIDE);
}
