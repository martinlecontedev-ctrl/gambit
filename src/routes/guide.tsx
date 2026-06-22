import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/guide')({ component: Guide });

const TOC = [
  { id: 'g-var', label: 'Variantes' },
  { id: 'g-arrows', label: 'Flèches' },
  { id: 'g-nag', label: 'Glyphes NAG' },
  { id: 'g-trans', label: 'Transpositions' },
  { id: 'g-study', label: 'Étude' },
  { id: 'g-folders', label: 'Dossiers' },
  { id: 'g-io', label: 'Import / Export' },
];

function Guide() {
  return (
    <main className="mx-auto max-w-260 px-10 pb-22.5 pt-8.5">
      <Link
        to="/"
        className="mb-3.5 inline-flex items-center gap-2 text-[14.5px] font-semibold text-meta transition hover:text-ink"
      >
        ← Retour
      </Link>
      <h1 className="text-[40px] font-extrabold tracking-[-0.02em]">Guide</h1>
      <p className="mt-2.5 text-[15.5px] text-meta">
        Les comportements non évidents, en bref. À compléter au fil de l'eau.
      </p>

      <div className="mt-8.5 grid grid-cols-[180px_1fr] items-start gap-12">
        <nav className="sticky top-22 flex flex-col gap-1">
          {TOC.map(t => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className="rounded-lg border-l-2 border-line px-2.5 py-1.75 text-[13.5px] font-semibold text-ink-soft transition hover:border-accent hover:bg-surface hover:text-accent"
            >
              {t.label}
            </a>
          ))}
        </nav>

        <div className="flex max-w-170 flex-col gap-9">
          <Section id="g-var" title="Variantes">
            <Item>
              Une variante se crée <em>uniquement</em> en jouant un coup divergent
              depuis l'échiquier. Pas de bouton dédié.
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

          <Section id="g-arrows" title="Flèches sur l'échiquier">
            <Item>
              <strong>Clic-droit-glisser</strong> pour tracer une flèche d'une
              case à l'autre, ou un cercle si tu lâches sur la case de départ.
            </Item>
            <Item>
              <span className="flex flex-wrap gap-2.5">
                <ModPill tone="success" dot="#5E9457">
                  défaut · vert
                </ModPill>
                <ModPill tone="danger" dot="#BE5240">
                  Shift · rouge
                </ModPill>
                <ModPill tone="info" dot="#4F6E8F">
                  Alt · bleu
                </ModPill>
                <ModPill tone="warning" dot="#CE9A2F">
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
              Conséquence : annotations <strong>et</strong> cartes de révision
              sont partagées entre toutes les lignes qui mènent à la même
              position. Tu annotes une fois, tu retrouves la note partout.
            </Item>
          </Section>

          <Section id="g-study" title="Étude">
            <Item>
              Joue le coup attendu à la souris. Si correct, évalue ton rappel
              (Difficile · Bien · Facile). Si raté, la carte revient dans 1 jour.
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
              l'ouverture courante avec variantes, commentaires, NAGs et flèches.
              Compatible Lichess Study, ChessBase et tout autre lecteur PGN.
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
      <div className="mb-3.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-accent-soft-text">
        {title}
      </div>
      <ul className="flex flex-col gap-3.5 text-base leading-[1.65] text-ink">{children}</ul>
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
    success: 'border-success-border bg-success-soft text-success',
    danger: 'border-danger-border bg-danger-soft text-danger',
    info: 'border-info-border bg-info-soft text-info',
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
    <li className="flex items-baseline gap-3">
      <span className={`w-7 shrink-0 text-lg font-bold ${color}`}>{symbol}</span>
      <span className="text-ink">{label}</span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line-strong bg-field px-1.5 py-0.5 text-[13px] font-semibold text-ink-soft">
      {children}
    </kbd>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-line bg-track px-1.5 py-0.5 text-[13px] text-ink-soft">
      {children}
    </code>
  );
}
