import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import {
  useDiscs,
  useSetDiscEject,
  useSetDiscNext,
  useDismissDiscAttention,
  useDiscCommand,
} from '@/lib/api-hooks';
import type {
  DiscCommand,
  DiscCommandResult,
  DiscNext,
  DiscParked,
  DiscsState,
} from '@/types/discs';

export const Route = createFileRoute('/discs/')({
  component: DiscsPage,
});

/** What a person fills in to say what a disc is. */
interface Details {
  mode: 'movie' | 'tv';
  name: string;
  show: string;
  season: string;
  episode: string;
}

const EMPTY_DETAILS: Details = {
  mode: 'movie',
  name: '',
  show: '',
  season: '1',
  episode: '1',
};

/** Why the details are not enough yet, or null. */
function detailsProblem(details: Details): string | null {
  if (details.mode === 'movie') return null;
  if (!details.show.trim()) {
    return 'Type the show name, with its year, like The Show (2001).';
  }
  if (!/^\d+$/.test(details.season) || Number(details.season) < 1) {
    return 'The season must be a number, like 2.';
  }
  if (
    details.episode &&
    (!/^\d+$/.test(details.episode) || Number(details.episode) < 1)
  ) {
    return 'The first episode must be a number, like 1.';
  }
  return null;
}

function toNote(details: Details): DiscNext {
  if (details.mode === 'tv') {
    return {
      mode: 'tv',
      show: details.show.trim(),
      season: Number(details.season),
      episode: Number(details.episode || 1),
    };
  }
  const name = details.name.trim();
  return name ? { mode: 'movie', name } : { mode: 'movie' };
}

function toRip(details: Details, image?: string): DiscCommand {
  const note = toNote(details);
  const base = image ? { image } : {};
  if (note.mode === 'tv') {
    return {
      action: 'rip',
      mode: 'tv',
      show: note.show!,
      season: note.season!,
      episode: note.episode,
      ...base,
    };
  }
  return {
    action: 'rip',
    mode: 'movie',
    ...(note.name ? { name: note.name } : {}),
    ...base,
  };
}

function describeNote(note: DiscNext): string {
  if (note.mode === 'tv') {
    return `episodes of ${note.show}, season ${note.season}, from episode ${note.episode}`;
  }
  return note.name ? `the movie ${note.name}` : 'a movie';
}

function secondsAgo(epochSeconds: number | null): string {
  if (!epochSeconds) return 'never';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (seconds < 5) return 'just now';
  if (seconds < 90) return `${seconds} seconds ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes ago`;
  return `${Math.round(seconds / 3600)} hours ago`;
}

const CARD =
  'bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-6 shadow-sm';
const INPUT =
  'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';
const BUTTON =
  'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-700`;
const SECONDARY = `${BUTTON} bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600`;

function Section({
  title,
  children,
  hint,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <section className={CARD}>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{hint}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** What the host answered to a request, or what went wrong sending it. */
function Answer({
  result,
  error,
}: {
  result?: DiscCommandResult;
  error?: Error | null;
}) {
  if (error) {
    return (
      <p className="mt-3 text-sm text-red-600 dark:text-red-400">
        {error.message}
      </p>
    );
  }
  if (!result) return null;
  const good = result.done && result.ok;
  return (
    <p
      className={`mt-3 text-sm ${good ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
    >
      {result.message || (result.ok ? 'Done.' : 'That did not work.')}
    </p>
  );
}

/** Movie or TV, and the fields each needs. */
function DetailsFields({
  value,
  onChange,
}: {
  value: Details;
  onChange: (next: Details) => void;
}) {
  const set = (patch: Partial<Details>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-gray-900 dark:text-white">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={value.mode === 'movie'}
            onChange={() => set({ mode: 'movie' })}
          />
          Movie
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={value.mode === 'tv'}
            onChange={() => set({ mode: 'tv' })}
          />
          TV show
        </label>
      </div>
      {value.mode === 'movie' ? (
        <label className="block text-sm text-gray-700 dark:text-gray-300">
          Name, with the year if you know it (optional)
          <input
            className={`${INPUT} mt-1`}
            placeholder="Stellaluna (1996)"
            value={value.name}
            onChange={(event) => set({ name: event.target.value })}
          />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm text-gray-700 dark:text-gray-300 sm:col-span-3">
            Show, with its year
            <input
              className={`${INPUT} mt-1`}
              placeholder="The Fairly OddParents (2001)"
              value={value.show}
              onChange={(event) => set({ show: event.target.value })}
            />
          </label>
          <label className="block text-sm text-gray-700 dark:text-gray-300">
            Season
            <input
              className={`${INPUT} mt-1`}
              inputMode="numeric"
              value={value.season}
              onChange={(event) => set({ season: event.target.value })}
            />
          </label>
          <label className="block text-sm text-gray-700 dark:text-gray-300">
            First episode on the disc
            <input
              className={`${INPUT} mt-1`}
              inputMode="numeric"
              value={value.episode}
              onChange={(event) => set({ episode: event.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function DriveSection({ state }: { state: DiscsState }) {
  const eject = useSetDiscEject();
  const command = useDiscCommand();
  const { drive, run } = state;

  return (
    <Section title="Drive">
      {!drive || !drive.alive ? (
        <p className="text-amber-700 dark:text-amber-400">
          The disc helper on the server has not reported{' '}
          {drive ? secondsAgo(drive.updated) : 'yet'}. Discs still rip on their
          own, but the buttons here will not work until it is running.
        </p>
      ) : (
        <p className="text-gray-900 dark:text-white">
          {drive.media ? (
            <>
              A disc is in the drive:{' '}
              <strong>{drive.label || 'no name'}</strong>
            </>
          ) : (
            'The drive is empty.'
          )}
        </p>
      )}
      <p className="mt-2 text-gray-700 dark:text-gray-300">
        {run?.state === 'running' ? (
          <>
            <strong>Working</strong>
            {run.name ? ` on ${run.name}` : ''}: {run.step}{' '}
            <span className="text-sm text-gray-500">
              ({secondsAgo(run.updated)})
            </span>
          </>
        ) : (
          'The ripper is idle.'
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-gray-900 dark:text-white">
          <input
            type="checkbox"
            checked={state.eject}
            disabled={eject.isPending}
            onChange={(event) => eject.mutate(event.target.checked)}
          />
          Eject a disc when it has been read
        </label>
        <button
          type="button"
          className={SECONDARY}
          disabled={command.isPending || !drive?.media}
          onClick={() => command.mutate({ action: 'eject' })}
        >
          {command.isPending ? 'Ejecting…' : 'Eject now'}
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        With ejecting off, a disc stays in the drive until you eject it, so it
        can be looked at or tried again.
      </p>
      <Answer result={command.data} error={command.error ?? eject.error} />
    </Section>
  );
}

function NextSection({ state }: { state: DiscsState }) {
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const setNext = useSetDiscNext();
  const command = useDiscCommand();
  const problem = detailsProblem(details);
  const diskIn = state.drive?.alive && state.drive.media;

  return (
    <Section
      title="Tell it what the disc is"
      hint="The ripper names a movie from the disc's label and cannot know a TV disc's season. Say it here before the disc goes in, or for the disc that is in the drive."
    >
      {state.next && (
        <p className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3 text-blue-900 dark:text-blue-100">
          The next disc will be treated as {describeNote(state.next)}.{' '}
          <button
            type="button"
            className="underline"
            disabled={setNext.isPending}
            onClick={() => setNext.mutate(null)}
          >
            Take that back
          </button>
        </p>
      )}
      <DetailsFields value={details} onChange={setDetails} />
      {problem && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          {problem}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={PRIMARY}
          disabled={!!problem || setNext.isPending}
          onClick={() => setNext.mutate(toNote(details))}
        >
          For the next disc
        </button>
        <button
          type="button"
          className={SECONDARY}
          disabled={!!problem || command.isPending || !diskIn}
          title={diskIn ? undefined : 'There is no disc in the drive'}
          onClick={() => command.mutate(toRip(details))}
        >
          {command.isPending ? 'Starting…' : 'Rip the disc in the drive now'}
        </button>
      </div>
      <Answer result={command.data} error={command.error ?? setNext.error} />
    </Section>
  );
}

function AttentionSection({ state }: { state: DiscsState }) {
  const dismiss = useDismissDiscAttention();
  if (state.attention.length === 0) return null;
  return (
    <Section title="Needs you">
      <ul className="space-y-4">
        {state.attention.map((note) => (
          <li
            key={note.file}
            className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <strong className="text-gray-900 dark:text-white">
                {note.name}
              </strong>
              <button
                type="button"
                className="text-sm underline text-gray-700 dark:text-gray-300"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(note.file)}
              >
                Dismiss
              </button>
            </div>
            {note.lines.map((line, index) => (
              <p
                key={index}
                className="mt-1 text-sm text-gray-800 dark:text-gray-200"
              >
                {line}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {dismiss.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {dismiss.error.message}
        </p>
      )}
    </Section>
  );
}

function WorkingSection({ state }: { state: DiscsState }) {
  if (state.working.length === 0) return null;
  return (
    <Section
      title="Being copied or converted"
      hint="Conversions show up in the job list on the home page once they are queued."
    >
      <ul className="space-y-4">
        {state.working.map((disc) => (
          <li key={disc.name}>
            <strong className="text-gray-900 dark:text-white">
              {disc.name}
            </strong>{' '}
            <span className="text-sm text-gray-500">
              {disc.queued ? 'queued for conversion' : 'getting ready'}
            </span>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-100 dark:bg-gray-900 p-3 text-xs text-gray-800 dark:text-gray-200">
              {disc.lines.join('\n') || 'No log yet.'}
            </pre>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ParkedDisc({ disc }: { disc: DiscParked }) {
  const { name, suggestion } = disc;
  // What TMDB made of the disc's label, to start from. The first episode is not guessed.
  const [details, setDetails] = useState<Details>({
    ...EMPTY_DETAILS,
    mode: 'tv',
    show: suggestion?.show ?? '',
    season: String(suggestion?.season ?? 1),
  });
  const command = useDiscCommand();
  const problem = detailsProblem(details);
  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-600 p-4">
      <strong className="text-gray-900 dark:text-white">{name}</strong>
      {suggestion?.show && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          TMDB thinks it is {suggestion.show}
          {suggestion.season ? `, season ${suggestion.season}` : ''}
          {suggestion.disc ? `, disc ${suggestion.disc}` : ''}. Check the first
          episode on the disc, then convert it.
        </p>
      )}
      <div className="mt-3">
        <DetailsFields value={details} onChange={setDetails} />
      </div>
      {problem && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          {problem}
        </p>
      )}
      <button
        type="button"
        className={`${PRIMARY} mt-4`}
        disabled={!!problem || command.isPending}
        onClick={() => command.mutate(toRip(details, name))}
      >
        {command.isPending ? 'Starting…' : 'Convert it'}
      </button>
      <Answer result={command.data} error={command.error} />
    </li>
  );
}

function ParkedSection({ state }: { state: DiscsState }) {
  if (state.parked.length === 0) return null;
  return (
    <Section
      title="Copied, waiting to be told what they are"
      hint="These discs were copied but look like TV episodes, whose season and episode numbers are not on the disc."
    >
      <ul className="space-y-4">
        {state.parked.map((disc) => (
          <ParkedDisc key={disc.name} disc={disc} />
        ))}
      </ul>
    </Section>
  );
}

function NeedsYearRow({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const command = useDiscCommand();
  const changed = value.trim() !== '' && value.trim() !== name;
  return (
    <li>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${INPUT} flex-1 min-w-48`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={`New name for ${name}`}
        />
        <button
          type="button"
          className={SECONDARY}
          disabled={!changed || command.isPending}
          onClick={() =>
            command.mutate({ action: 'rename', old: name, new: value })
          }
        >
          Rename
        </button>
        <button
          type="button"
          className={PRIMARY}
          disabled={command.isPending}
          title="Ask TMDB which movie this is, by its name and the length of its file"
          onClick={() => command.mutate({ action: 'match', old: name })}
        >
          Match on TMDB
        </button>
      </div>
      <Answer result={command.data} error={command.error} />
    </li>
  );
}

function NeedsYearSection({ state }: { state: DiscsState }) {
  if (state.needsYear.length === 0) return null;
  return (
    <Section
      title="Finished, but no year yet"
      hint="Plex matches best with the year in the name, like Stellaluna (1996). Match on TMDB finds the movie by its name and the length of its file; Rename lets you type it. Either one renames the files inside too."
    >
      <ul className="space-y-3">
        {state.needsYear.map((name) => (
          <NeedsYearRow key={name} name={name} />
        ))}
      </ul>
    </Section>
  );
}

function DiscsContent() {
  const { data: state, isLoading, error } = useDiscs();

  if (isLoading) {
    return <p className="text-gray-600 dark:text-gray-300">Loading…</p>;
  }
  if (error || !state) {
    return (
      <p className="text-red-600 dark:text-red-400">
        {error?.message ?? 'Could not load the discs.'}
      </p>
    );
  }
  if (!state.available) {
    return (
      <Section title="No DVDs folder">
        <p className="text-gray-700 dark:text-gray-300">
          This server has no DVDs folder yet, so the ripper has nothing to show.
          It is the folder named DVDs inside the folder Frame Shift is allowed
          to browse.
        </p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <DriveSection state={state} />
      <AttentionSection state={state} />
      <NextSection state={state} />
      <WorkingSection state={state} />
      <ParkedSection state={state} />
      <NeedsYearSection state={state} />
      <p className="text-center text-sm text-gray-500">
        {state.finishedCount} finished{' '}
        {state.finishedCount === 1 ? 'folder' : 'folders'} in the DVDs folder.
      </p>
    </div>
  );
}

function DiscsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Discs
        </h1>
      </header>
      <AppErrorBoundary>
        <DiscsContent />
      </AppErrorBoundary>
    </div>
  );
}
