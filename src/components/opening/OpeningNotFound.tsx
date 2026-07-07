import { Link } from '@tanstack/react-router';
import { useComponentStrings } from '../../i18n/components';

/** Fallback for the opening-scoped routes (overview, edit, study) when the
 * `$openingId` param matches nothing in storage. */
export function OpeningNotFound() {
  const tr = useComponentStrings().notFound;
  return (
    <main className="mx-auto max-w-md px-10 py-16 text-center text-on-body">
      {tr.body}{' '}
      <Link to="/" className="font-semibold text-accent-ground underline">
        {tr.back}
      </Link>
    </main>
  );
}
