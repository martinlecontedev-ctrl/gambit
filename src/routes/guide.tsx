import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/guide')({ component: Guide });

function Guide() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Retour
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Guide</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Les comportements non évidents, en bref. À compléter au fil de l'eau.
        </p>
      </header>

      <Section title="Variantes">
        <Item>
          Une variante se crée <em>uniquement</em> en jouant un coup divergent
          depuis l'échiquier. Pas de bouton dédié.
        </Item>
        <Item>
          Si tu joues un coup à un endroit où une ligne soeur existe déjà, tu
          bascules dessus au lieu de créer un doublon.
        </Item>
        <Item>
          <kbd>Supprimer la suite</kbd> tronque la ligne courante à la position
          du curseur. <kbd>Supprimer la variante</kbd> retire la ligne en cours
          et ré-attache ses enfants au parent.
        </Item>
      </Section>

      <Section title="Flèches sur l'échiquier">
        <Item>
          <strong>Clic-droit-glisser</strong> pour tracer une flèche d'une case
          à l'autre, ou un cercle si tu lâches sur la case de départ.
        </Item>
        <Item>
          Modificateurs pendant le glisser :
          <span className="ml-1 inline-flex flex-wrap gap-2 align-baseline">
            <Pill className="bg-emerald-500/30 text-emerald-200">défaut · vert</Pill>
            <Pill className="bg-red-500/30 text-red-200">Shift · rouge</Pill>
            <Pill className="bg-sky-500/30 text-sky-200">Alt · bleu</Pill>
            <Pill className="bg-amber-500/30 text-amber-200">Shift+Alt · jaune</Pill>
          </span>
        </Item>
        <Item>
          Les flèches sont attachées à la position. Elles disparaissent quand tu
          joues un coup mais réapparaissent dès que tu reviens dessus.
        </Item>
      </Section>

      <Section title="Glyphes NAG (qualité de coup)">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
          <NagRow symbol="!" color="text-emerald-400" label="Bon coup" />
          <NagRow symbol="!!" color="text-emerald-300" label="Brillant" />
          <NagRow symbol="?" color="text-red-400" label="Coup faible" />
          <NagRow symbol="??" color="text-red-300" label="Gaffe" />
          <NagRow symbol="!?" color="text-sky-400" label="Intéressant" />
          <NagRow symbol="?!" color="text-amber-400" label="Douteux" />
        </ul>
        <Item>
          Le glyphe apparaît dans la scoresheet à côté du coup et comme pilule
          colorée sur la case d'arrivée du dernier coup joué.
        </Item>
      </Section>

      <Section title="Transpositions">
        <Item>
          Une position est identifiée par son <em>setup</em> (placement, trait,
          roque, en passant) — pas par l'ordre des coups qui y a mené.
        </Item>
        <Item>
          Conséquence : annotations <strong>et</strong> cartes de révision sont
          partagées entre toutes les lignes qui mènent à la même position. Tu
          annotes une fois, tu retrouves la note partout.
        </Item>
      </Section>

      <Section title="Étude">
        <Item>
          Joue le coup attendu à la souris. Si correct, évalue ton rappel
          (Difficile · Bien · Facile). Si raté, la carte revient dans 1 jour.
        </Item>
        <Item>
          Après réponse, le commentaire et les flèches associés à la position
          sortent en panneau et sur le board.
        </Item>
      </Section>

      <Section title="Dossiers">
        <Item>
          Sur la home, les ouvertures vivent dans <em>Sans dossier</em> ou
          dans un dossier que tu crées (<kbd>+ Nouveau dossier</kbd>).
          Hover sur un dossier → <kbd>✎</kbd> renomme,{' '}
          <kbd>✕</kbd> supprime.
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

      <Section title="Import / Export">
        <Item>
          Bouton <kbd>Importer</kbd> sur la home : trois sources possibles —
          coller un PGN, coller une URL Lichess Study, charger un fichier{' '}
          <code>.pgn</code>. Un toggle Blancs/Noirs fixe le camp joué.
        </Item>
        <Item>
          Lichess Study : l'URL complète{' '}
          <code>lichess.org/study/STUDYID</code> importe <em>tous les
          chapitres</em> ; ajouter <code>/CHAPTERID</code> au bout en importe
          un seul. Études publiques uniquement.
        </Item>
        <Item>
          Import multi-chapitres → un écran de confirmation propose de
          regrouper le tout dans un nouveau dossier (pré-rempli avec le nom
          de l'étude), un dossier existant, ou rien.
        </Item>
        <Item>
          Bouton <kbd>Exporter</kbd> dans l'éditeur : copie le PGN de
          l'ouverture courante avec variantes, commentaires, NAGs et
          flèches. Compatible Lichess Study, ChessBase et tout autre lecteur
          PGN.
        </Item>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </h2>
      <ul className="space-y-2 text-sm text-zinc-300">{children}</ul>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
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
    <li className="flex items-baseline gap-2">
      <span className={`w-8 font-bold ${color}`}>{symbol}</span>
      <span className="text-zinc-300">{label}</span>
    </li>
  );
}
