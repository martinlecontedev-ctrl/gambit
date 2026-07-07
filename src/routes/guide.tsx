import { createFileRoute, Link } from '@tanstack/react-router';
import { useCommon } from '../i18n/common';
import { useGuideStrings } from '../i18n/guide';

export const Route = createFileRoute('/guide')({ component: Guide });

function Guide() {
  const common = useCommon();
  const tr = useGuideStrings();
  const s = tr.sections;

  const toc = [
    { id: 'g-var', label: tr.toc.var },
    { id: 'g-chap', label: tr.toc.chap },
    { id: 'g-arrows', label: tr.toc.arrows },
    { id: 'g-nag', label: tr.toc.nag },
    { id: 'g-trans', label: tr.toc.trans },
    { id: 'g-engine', label: tr.toc.engine },
    { id: 'g-explorer', label: tr.toc.explorer },
    { id: 'g-lichess', label: tr.toc.lichess },
    { id: 'g-study', label: tr.toc.study },
    { id: 'g-folders', label: tr.toc.folders },
    { id: 'g-io', label: tr.toc.io },
    { id: 'g-backup', label: tr.toc.backup },
  ];

  return (
    <main className="mx-auto max-w-260 px-10 pb-22.5 pt-8.5">
      <Link
        to="/"
        className="mb-3.5 inline-flex items-center gap-2 text-[14.5px] font-semibold text-on-muted transition hover:text-on-ink"
      >
        {common.back}
      </Link>
      <h1 className="text-[40px] font-extrabold tracking-[-0.02em] text-on-ink">{tr.title}</h1>
      <p className="mt-2.5 text-[15.5px] text-on-muted">{tr.intro}</p>

      <div className="mt-8.5 grid grid-cols-[180px_1fr] items-start gap-12">
        <nav className="sticky top-22 flex flex-col gap-1">
          {toc.map(t => (
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
          <Section id="g-var" title={s.variants.title}>
            {s.variants.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-chap" title={s.chapters.title}>
            {s.chapters.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-arrows" title={s.arrows.title}>
            <Item>{s.arrows.draw}</Item>
            <Item>
              <span className="flex flex-wrap gap-2.5">
                <ModPill tone="success" dot="#15781B">
                  {s.arrows.pills.default}
                </ModPill>
                <ModPill tone="danger" dot="#882020">
                  {s.arrows.pills.shift}
                </ModPill>
                <ModPill tone="info" dot="#003088">
                  {s.arrows.pills.alt}
                </ModPill>
                <ModPill tone="warning" dot="#e68f00">
                  {s.arrows.pills.shiftAlt}
                </ModPill>
              </span>
            </Item>
            <Item>{s.arrows.attached}</Item>
          </Section>

          <Section id="g-nag" title={s.nag.title}>
            <ul className="grid grid-cols-2 gap-x-7 gap-y-3">
              <NagRow symbol="!" color="text-nag-good" label={s.nag.rows.good} />
              <NagRow symbol="!?" color="text-nag-interesting" label={s.nag.rows.interesting} />
              <NagRow symbol="!!" color="text-nag-brilliant" label={s.nag.rows.brilliant} />
              <NagRow symbol="?!" color="text-nag-dubious" label={s.nag.rows.dubious} />
              <NagRow symbol="?" color="text-nag-mistake" label={s.nag.rows.mistake} />
              <NagRow symbol="??" color="text-nag-blunder" label={s.nag.rows.blunder} />
            </ul>
            <Item>{s.nag.note}</Item>
          </Section>

          <Section id="g-trans" title={s.transpositions.title}>
            {s.transpositions.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-engine" title={s.engine.title}>
            {s.engine.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-explorer" title={s.explorer.title}>
            {s.explorer.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-lichess" title={s.lichess.title}>
            {s.lichess.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-study" title={s.study.title}>
            {s.study.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-folders" title={s.folders.title}>
            {s.folders.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-io" title={s.io.title}>
            {s.io.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
          </Section>

          <Section id="g-backup" title={s.backup.title}>
            {s.backup.items.map((node, i) => (
              <Item key={i}>{node}</Item>
            ))}
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
