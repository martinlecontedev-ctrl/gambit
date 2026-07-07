import { Link } from '@tanstack/react-router';

/** Fallback for the opening-scoped routes (overview, edit, study) when the
 * `$openingId` param matches nothing in storage. */
export function OpeningNotFound() {
  return (
    <main className="mx-auto max-w-md px-10 py-16 text-center text-on-body">
      Ouverture introuvable.{' '}
      <Link to="/" className="font-semibold text-accent-ground underline">
        Retour
      </Link>
    </main>
  );
}
