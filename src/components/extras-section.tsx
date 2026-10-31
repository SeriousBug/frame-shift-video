import { useState } from 'react';
import { CollapsibleCard } from '@/components/collapsible-card';
import {
  useDiscExtras,
  useFandomHint,
  useRenameDiscExtra,
} from '@/lib/api-hooks';
import { discExtraFileUrl } from '@/lib/api';
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
  // The ripper's own name ("Trailer 01 (2 min)") is not something to edit into a real one, so a
  // box for an extra with no name yet starts empty; what it is called now is shown above it.
  const [name, setName] = useState(item.unnamed ? '' : item.name);
  const [folder, setFolder] = useState(item.folder);
  const typed = name.trim();
  const changed =
    (typed !== '' && typed !== item.name) || folder !== item.folder;
  const id = `${item.path}`;

  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      <label
        htmlFor={`name-${id}`}
        className="block text-sm text-gray-700 dark:text-gray-300"
      >
        {item.unnamed
          ? `Not named yet (${item.name}). What is this one?`
          : 'Name of this extra'}
      </label>
      <p className="mt-1 text-sm">
        <a
          className="underline text-blue-700 dark:text-blue-300"
          href={discExtraFileUrl(item.path)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Watch the extra ${item.name} in ${movie}`}
        >
          Watch it
        </a>
        {' · '}
        <a
          className="underline text-blue-700 dark:text-blue-300"
          href={discExtraFileUrl(item.path, true)}
          aria-label={`Download the extra ${item.name} in ${movie}`}
        >
          Download
        </a>
      </p>
      <input
        id={`name-${id}`}
        className={`${INPUT} mt-1`}
        aria-label={`Name of the extra ${item.name} in ${movie}`}
        value={name}
        placeholder={item.unnamed ? 'Type its name' : undefined}
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
              name: typed || item.name,
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
 * What DVD Fandom lists as the bonus features of this movie's disc. It gives names only, no lengths,
 * so it is something to read while typing, not something that fills the boxes in.
 */
function FandomHint({ movie, enabled }: { movie: string; enabled: boolean }) {
  const { data, isLoading } = useFandomHint(movie, enabled);
  if (!enabled) return null;
  if (isLoading) {
    return (
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Looking up {movie} on DVD Fandom...
      </p>
    );
  }
  if (!data || !data.found) {
    return (
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        DVD Fandom has no list for this movie.
      </p>
    );
  }
  const features = data.features ?? [];
  return (
    <details className="mt-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
      <summary className="cursor-pointer text-sm font-medium text-blue-900 dark:text-blue-100">
        What DVD Fandom lists on this disc
        {data.runtime ? ` (the movie: ${data.runtime})` : ''}
      </summary>
      {features.length === 0 ? (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          The page has no bonus features listed.
        </p>
      ) : (
        <ul className="mt-2 text-sm text-gray-800 dark:text-gray-200">
          {features.map((line, index) => (
            <li
              key={`${index}-${line.text}`}
              style={{ paddingLeft: `${Math.max(line.depth - 1, 0) * 16}px` }}
              className={line.depth === 0 ? 'mt-2 font-semibold' : undefined}
            >
              {line.text}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        From{' '}
        <a
          className="underline"
          href={data.url}
          target="_blank"
          rel="noreferrer"
        >
          {data.page} on DVD Fandom
        </a>
        . Names only, with no lengths, so match them by what each one is.
      </p>
    </details>
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
      help="A DVD does not store names for its bonus features, so they are sorted by length and called Trailer 01, Featurette 01 and so on. Press Watch it to see what one is (Safari cannot play .mkv files: use Download and open it in VLC or Infuse), then type the real name and press Save. Plex shows that name, and sorts each into the kind you pick."
      hint="Bonus features of movies that are ready to watch."
      badge={unnamed > 0 ? `${unnamed} not named` : undefined}
    >
      <div className="space-y-6">
        {data.map((movie) => (
          <section key={movie.movie}>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {movie.movie}
            </h3>
            <FandomHint
              movie={movie.movie}
              enabled={movie.items.some((i) => i.unnamed)}
            />
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
