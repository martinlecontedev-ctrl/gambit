import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/guide')({ component: Guide });

const TOC = [
  { id: 'g-var', label: 'Variantes' },
  { id: 'g-chap', label: 'Chapitres' },
  { id: 'g-arrows', label: 'Flèches' },
  { id: 'g-nag', label: 'Glyphes NAG' },
  { id: 'g-trans', label: 'Transpositions' },
  { id: 'g-engine', label: 'Moteur' },
  { id: 'g-explorer', label: 'Explorateur' },
  { id: 'g-lichess', label: 'Compte Lichess' },
  { id: 'g-study', label: 'Étude' },
  { id: 'g-folders', label: 'Dossiers' },
  { id: 'g-io', label: 'Import / Export' },
  { id: 'g-backup', label: 'Sauvegarde' },
];

function Guide() {
  return (
    <main className="mx-auto max-w-260 px-10 pb-22.5 pt-8.5">
      <Link
        to="/"
        className="mb-3.5 inline-flex items-center gap-2 text-[14.5px] font-semibold text-on-muted transition hover:text-on-ink"
      >
        ← Retour
      </Link>
      <h1 className="text-[40px] font-extrabold tracking-[-0.02em] text-on-ink">Guide</h1>
      <p className="mt-2.5 text-[15.5px] text-on-muted">
        Les comportements non évidents, en bref. À compléter au fil de l'eau.
      </p>

      <div className="mt-8.5 grid grid-cols-[180px_1fr] items-start gap-12">
        <nav className="sticky top-22 flex flex-col gap-1">
          {TOC.map(t => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className="rounded-lg border-l-2 border-ground-line px-2.5 py-1.75 text-[13.5px] font-semibold text-on-idle transition hover:border-accent-ground hover:bg-ground-overlay hover:text-accent-ground"
            >
              {t.label}
            </a>
          ))}
        </nav>

        <div className="flex max-w-170 flex-col gap-9">
          <Section id="g-var" title="Variantes">
            <Item>
              Une variante se crée <em>uniquement</em> en jouant un coup divergent
              depuis l'échiquier — sur un coup de l'<strong>adversaire</strong>.
              Pas de bouton dédié.
            </Item>
            <Item>
              Si tu joues un coup à un endroit où une ligne soeur existe déjà, tu
              bascules dessus au lieu de créer un doublon.
            </Item>
            <Item>
              <Kbd>Supprimer la suite</Kbd> tronque la ligne courante à la
              position du curseur. <Kbd>Supprimer la variante</Kbd> retire la
              ligne en cours et ré-attache ses enfants au parent.
            </Item>
          </Section>

          <Section id="g-chap" title="Chapitres">
            <Item>
              Un coup divergent sur <strong>ta couleur</strong> crée un nouveau
              chapitre (nom suggéré depuis l'ouverture ECO reconnue) : deux choix
              de répertoire pour la même position ne peuvent pas cohabiter dans
              un même chapitre sans contredire la révision.
            </Item>
            <Item>
              Chaque chapitre est drillé séparément : ses cartes de révision lui
              appartiennent, même si une position apparaît aussi ailleurs.
            </Item>
            <Item>
              Import d'une étude Lichess : un chapitre d'étude = un chapitre
              Gambit, position de départ personnalisée comprise.
            </Item>
          </Section>

          <Section id="g-arrows" title="Flèches sur l'échiquier">
            <Item>
              <strong>Clic-droit-glisser</strong> pour tracer une flèche d'une
              case à l'autre, ou un cercle si tu lâches sur la case de départ.
            </Item>
            <Item>
              <span className="flex flex-wrap gap-2.5">
                <ModPill tone="success" dot="#15781B">
                  défaut · vert
                </ModPill>
                <ModPill tone="danger" dot="#882020">
                  Shift · rouge
                </ModPill>
                <ModPill tone="info" dot="#003088">
                  Alt · bleu
                </ModPill>
                <ModPill tone="warning" dot="#e68f00">
                  Shift+Alt · jaune
                </ModPill>
              </span>
            </Item>
            <Item>
              Les flèches sont attachées à la position. Elles disparaissent quand
              tu joues un coup mais réapparaissent dès que tu reviens dessus.
            </Item>
          </Section>

          <Section id="g-nag" title="Glyphes NAG (qualité de coup)">
            <ul className="grid grid-cols-2 gap-x-7 gap-y-3">
              <NagRow symbol="!" color="text-nag-good" label="Bon coup" />
              <NagRow symbol="!?" color="text-nag-interesting" label="Intéressant" />
              <NagRow symbol="!!" color="text-nag-brilliant" label="Brillant" />
              <NagRow symbol="?!" color="text-nag-dubious" label="Douteux" />
              <NagRow symbol="?" color="text-nag-mistake" label="Coup faible" />
              <NagRow symbol="??" color="text-nag-blunder" label="Gaffe" />
            </ul>
            <Item>
              Le glyphe apparaît dans la scoresheet à côté du coup et comme pilule
              colorée sur la case d'arrivée du dernier coup joué.
            </Item>
          </Section>

          <Section id="g-trans" title="Transpositions">
            <Item>
              Une position est identifiée par son <em>setup</em> (placement,
              trait, roque, en passant), pas par l'ordre des coups qui y a mené.
            </Item>
            <Item>
              Conséquence : les annotations sont partagées entre toutes les
              lignes qui mènent à la même position. Les cartes de révision le
              sont aussi, mais <em>au sein d'un même chapitre</em> — deux
              chapitres gardent des cartes distinctes pour la même position.
            </Item>
          </Section>

          <Section id="g-engine" title="Moteur (Stockfish)">
            <Item>
              Le bouton <Kbd>Engine</Kbd> dans l'éditeur active Stockfish :
              barre d'évaluation à gauche du plateau, score chiffré, et flèches
              suggérées (bleu pâle = meilleur coup, gris = alternatives).
            </Item>
            <Item>
              Le réglage persiste d'une session à l'autre. Le moteur tourne en
              local (WebAssembly), rien ne sort du navigateur.
            </Item>
          </Section>

          <Section id="g-explorer" title="Explorateur d'ouvertures">
            <Item>
              Panneau <Kbd>Explorateur</Kbd> dans l'éditeur : pour la position
              affichée, les coups les plus joués avec leur part de parties et la
              barre victoires blancs / nulles / victoires noirs. Deux bases :
              parties Lichess (1800+, blitz à classique) ou parties de maîtres.
            </Item>
            <Item>
              Cliquer un coup le joue sur l'échiquier — mêmes règles que
              d'habitude (bascule, variante ou nouveau chapitre selon le cas).
            </Item>
            <Item>
              Opt-in : tant que le panneau est <Kbd>OFF</Kbd>, aucune requête ne
              part vers Lichess. Les positions déjà consultées sont mises en
              cache pour la session.
            </Item>
            <Item>
              L'explorateur passe par ton <strong>compte Lichess connecté</strong>{' '}
              (onglet LICHESS, ou bouton dans le panneau) — gratuit, aucun scope
              demandé. Tout reste stocké en local.
            </Item>
          </Section>

          <Section id="g-lichess" title="Compte Lichess">
            <Item>
              Onglet <Kbd>LICHESS</Kbd> dans la barre du haut :{' '}
              <Kbd>Connecter Lichess</Kbd> lance l'OAuth officiel (PKCE), sans
              mot de passe partagé — tu autorises Gambit depuis Lichess, aucun
              scope demandé. <Kbd>Déconnecter</Kbd> pour révoquer côté app.
            </Item>
            <Item>
              Une fois connecté : tes <strong>parties récentes</strong> sont
              comparées à ton répertoire. Une déviation n'est signalée qu'à
              partir du <strong>4ᵉ coup</strong>, et pour tes propres coups,
              seulement s'il s'agit d'un coup <strong>rare</strong> (moins de
              10 % dans la base Lichess) — un coup populaire, c'est une autre
              ouverture assumée, pas un raté. Clique l'étiquette pour déplier
              la <strong>position de bifurcation</strong> : coup joué en rouge,
              répertoire en vert.
            </Item>
            <Item>
              Si <em>tu</em> as dévié : <Kbd>Réviser ce coup</Kbd> lance une
              session exercice sur cette seule position (même hors échéance et
              hors fenêtre de révision). Si l'<em>adversaire</em> est sorti de ta
              théorie : <Kbd>Ajouter au répertoire</Kbd> crée la variante avec
              son coup et t'ouvre l'éditeur dessus, prêt pour ta réponse —
              proposé à partir du <strong>5ᵉ coup</strong>.
            </Item>
            <Item>
              <Kbd>↗</Kbd> ouvre la partie sur Lichess, directement à la
              position de sortie de théorie. L'explorateur utilise aussi cette
              session — plus de jeton à coller.
            </Item>
            <Item>
              <strong>Ouvertures jouées</strong> : tes parties regroupées par
              famille d'ouverture (blancs / noirs), avec score V-N-D et
              l'ouverture préférée. Celles que ton répertoire ne couvre pas
              proposent <Kbd>Créer un répertoire</Kbd>, pré-rempli avec les
              coups que tu joues réellement — et du même coup, le Coach cesse
              de compter ces parties comme des « ratés » de ton autre théorie.
            </Item>
            <Item>
              Dans l'<strong>éditeur</strong>, le bloc <strong>Fidélité au
              répertoire</strong> juge par comportement : chaque partie n'est
              comptée que pour l'ouverture qu'elle a suivie le plus
              profondément, et chaque coup manqué est lu contre ta propre
              régularité. Un même coup répété qui mène à une ouverture
              <em> nommée</em> (ex. l'Écossaise face à ton Italienne) est
              classé <strong>autre ouverture</strong> et sort du calcul ;
              « joué ♗b5 1× sur 7 passages » = trou de mémoire à réviser ;
              un coup hors-théorie répété = désaccord répertoire/pratique, à
              toi de trancher. Boutons <Kbd>Réviser</Kbd> ou renvoi vers
              Ouvertures jouées selon le cas.
            </Item>
            <Item>
              <strong>Sauvegarde du répertoire</strong> : chaque ouverture peut
              être poussée vers une étude <em>privée</em> de ton compte (créée
              automatiquement, un chapitre Gambit = un chapitre d'étude).
              Sens unique — Gambit n'écrit que dans ses propres études, ne lit
              rien d'autre. L'état SRS reste local. Nécessite la permission
              d'écriture d'études (demandée à la connexion).
            </Item>
          </Section>

          <Section id="g-study" title="Étude">
            <Item>
              Joue le coup attendu à la souris. Si correct, évalue ton rappel
              (Difficile · Bien · Facile). Si raté, la carte revient dans 1 jour.
            </Item>
            <Item>
              <Kbd>Révéler</Kbd> compte comme un oubli : même effet SRS qu'une
              erreur, mais tracé à part dans les compteurs de session.
            </Item>
            <Item>
              La révision est <strong>opt-in</strong> : chaque ouverture a un
              interrupteur sur sa carte (home) et chaque chapitre le sien
              (overview), <em>désactivés par défaut</em>. Tant que rien n'est
              activé, aucune carte n'est due nulle part. L'interrupteur de
              l'ouverture bascule tous ses chapitres d'un coup ; le progrès
              d'un chapitre désactivé dort et revient intact à la réactivation.
            </Item>
            <Item>
              La révision se fait chapitre par chapitre. Depuis la bannière de la
              home, <Kbd>Démarrer la révision</Kbd> enchaîne toutes les
              ouvertures qui ont des cartes dues.
            </Item>
            <Item>
              Au survol d'un chapitre dans l'éditeur, <Kbd>◎</Kbd> ouvre{' '}
              <em>Définir la révision</em> : le tronc commun d'abord, puis
              chaque branche à partir de sa bifurcation. Clique le premier et
              le dernier coup à driller dans chaque bloc (<Kbd>Aucun</Kbd> pour
              sauter un tronc connu par cœur). Hors fenêtre, rien n'est dû ni
              compté dans la maîtrise ; le progrès revient si tu réélargis. Une
              fenêtre qui va jusqu'au dernier coup reste ouverte : les coups
              ajoutés ensuite sont drillés d'office.
            </Item>
            <Item>
              Après réponse, le commentaire et les flèches associés à la position
              sortent sous le plateau et sur le board.
            </Item>
          </Section>

          <Section id="g-folders" title="Dossiers">
            <Item>
              Sur la home, les ouvertures vivent dans <em>Sans dossier</em> ou
              dans un dossier que tu crées (<Kbd>+ Nouveau dossier</Kbd>). Au
              survol d'un dossier, <Kbd>✎</Kbd> renomme, <Kbd>✕</Kbd> supprime.
            </Item>
            <Item>
              <strong>Drag-and-drop</strong> une carte d'ouverture sur un dossier
              (ou sur <em>Sans dossier</em>) pour la déplacer.
            </Item>
            <Item>
              Supprimer un dossier <strong>supprime aussi son contenu</strong>{' '}
              (ouvertures, lignes, annotations, cartes de révision). Une
              confirmation rappelle l'effet exact avant validation.
            </Item>
          </Section>

          <Section id="g-io" title="Import / Export">
            <Item>
              Bouton <Kbd>Importer</Kbd> sur la home : trois sources possibles,
              coller un PGN, coller une URL Lichess Study, ou charger un fichier{' '}
              <Code>.pgn</Code>. Un toggle Blancs/Noirs fixe le camp joué.
            </Item>
            <Item>
              Lichess Study : l'URL complète <Code>lichess.org/study/STUDYID</Code>{' '}
              importe <em>tous les chapitres</em> ; ajouter <Code>/CHAPTERID</Code>{' '}
              au bout en importe un seul. Études publiques uniquement.
            </Item>
            <Item>
              Import multi-chapitres : un écran de confirmation propose de
              regrouper le tout dans un nouveau dossier (pré-rempli avec le nom
              de l'étude), un dossier existant, ou rien.
            </Item>
            <Item>
              Bouton <Kbd>Exporter</Kbd> dans l'éditeur : copie le PGN de
              l'ouverture courante — une partie par chapitre — avec variantes,
              commentaires, NAGs et flèches. Compatible Lichess Study, ChessBase
              et tout autre lecteur PGN.
            </Item>
          </Section>

          <Section id="g-backup" title="Sauvegarde et restauration">
            <Item>
              Toutes tes données vivent <strong>dans ce navigateur</strong>{' '}
              (localStorage) : un nettoyage des données de navigation, un
              changement de machine ou de navigateur efface tout. La sauvegarde
              est ta seule protection.
            </Item>
            <Item>
              Bouton utilisateur en haut à droite → <Kbd>Exporter</Kbd> :
              télécharge un fichier <Code>gambit-sauvegarde-AAAA-MM-JJ.json</Code>{' '}
              contenant l'intégralité de l'état — ouvertures (chapitres,
              variantes, annotations, fenêtres de révision), progrès de
              révision de chaque carte, historique d'un an, dossiers et liens
              vers tes études Lichess.
            </Item>
            <Item>
              <Kbd>Restaurer…</Kbd> recharge un de ces fichiers.{' '}
              <strong>La restauration remplace tout</strong> (pas de fusion) —
              une confirmation compare d'abord le contenu du fichier à l'état
              actuel.
            </Item>
            <Item>
              Non inclus : le compte Lichess (reconnecte-toi simplement) et les
              réglages propres à l'appareil (thème, moteur, explorateur).
            </Item>
            <Item>
              Ne confonds pas avec l'export <Code>PGN</Code> : lui ne couvre
              que la structure d'une ouverture et{' '}
              <em>perd tout le progrès de révision</em>. Exporte une sauvegarde
              régulièrement — avant un gros import, c'est deux clics.
            </Item>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-22">
      <div className="mb-3.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-accent-ground">
        {title}
      </div>
      <ul className="flex flex-col gap-3.5 text-base leading-[1.65] text-on-body">{children}</ul>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

function ModPill({
  tone,
  dot,
  children,
}: {
  tone: 'success' | 'danger' | 'info' | 'warning';
  dot: string;
  children: React.ReactNode;
}) {
  const tones = {
    success: 'border-success-border bg-success-soft text-success-text',
    danger: 'border-danger-border bg-danger-soft text-danger-text',
    info: 'border-info-border bg-info-soft text-info-text',
    warning: 'border-warning-border bg-warning-soft text-warning-text',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13.5px] font-semibold ${tones[tone]}`}
    >
      <span className="h-2.25 w-2.25 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

function NagRow({
  symbol,
  color,
  label,
}: {
  symbol: string;
  color: string;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3">
      {/* NAG tokens are card-family colors: give the glyph a surface swatch so
          it stays readable on the (possibly dark green) ground. */}
      <span
        className={`flex w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface py-0.5 text-lg font-bold ${color}`}
      >
        {symbol}
      </span>
      <span className="text-on-body">{label}</span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-chip-border bg-chip px-1.5 py-0.5 text-[13px] font-semibold text-chip-text">
      {children}
    </kbd>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-chip-border bg-chip px-1.5 py-0.5 text-[13px] text-chip-text">
      {children}
    </code>
  );
}
