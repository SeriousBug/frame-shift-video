import { useState } from 'react';
import { CollapsibleCard } from '@/components/collapsible-card';
import { useDiscExtras, useRenameDiscExtra } from '@/lib/api-hooks';
import type { ExtraItem } from '@/types/discs';

const FOLDERS = [
  'Trailers',
  'Featurettes',
  'Behind The Scenes',
  'Deleted Scenes',
  'Interviews',
  'Scenes',
  'Shorts',
  'Other',
];

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';
const SMALL =
  'min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 bg-blue-600 text-white hover:bg-blue-700';

function ExtraRow({ item, movie }: { item: ExtraItem; movie: string }) {
  const rename = useRenameDiscExtra();
  const [name, setName] = useState(item.name);
  const [folder, setFolder] = useState(item.folder);
  const changed = name.trim() !== item.name || folder !== item.folder;
  const id = `${item.path}`;

  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      <label
        htmlFor={`name-${id}`}
        className="block text-sm text-gray-700 dark:text-gray-300"
      >
        {item.unnamed
          ? 'Not named yet. What is this one?'
          : 'Name of this extra'}
      </label>
      <input
        id={`name-${id}`}
        className={`${INPUT} mt-1`}
        aria-label={`Name of the extra ${item.name} in ${movie}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Kind{' '}
          <select
            className={`${INPUT} inline-block w-auto`}
            aria-label={`Kind of the extra ${item.name} in ${movie}`}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
          >
            {FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={SMALL}
          disabled={!changed || rename.isPending}
          onClick={() =>
            rename.mutate({
              path: item.path,
              name,
              ...(folder !== item.folder ? { folder } : {}),
            })
          }
        >
          Save
        </button>
      </div>
      {rename.error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {rename.error.message}
        </p>
      )}
      {rename.isSuccess && !changed && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">
          Saved.
        </p>
      )}
    </li>
  );
}

/**
 * Names the extras of ripped movies. A disc stores no names for them, so the ripper only sorts them
 * by length; Plex shows what is typed here.
 */
export function ExtrasSection() {
  const { data } = useDiscExtras();
  if (!data || data.length === 0) return null;
  const unnamed = data.reduce(
    (sum, movie) => sum + movie.items.filter((i) => i.unnamed).length,
    0,
  );

  return (
    <CollapsibleCard
      title="Name the extras"
      help="A DVD does not store names for its bonus features, so they are sorted by length and called Trailer 01, Featurette 01 and so on. Type the real name and press Save. Plex shows that name, and sorts each into the kind you pick."
      hint="Bonus features of movies that are ready to watch."
      badge={unnamed > 0 ? `${unnamed} not named` : undefined}
    >
      <div className="space-y-6">
        {data.map((movie) => (
          <section key={movie.movie}>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {movie.movie}
            </h3>
            <ul className="mt-2 space-y-3">
              {movie.items.map((item) => (
                <ExtraRow key={item.path} item={item} movie={movie.movie} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CollapsibleCard>
  );
}
