import { useState } from 'react';
import { useDeleteDiscPreset, useSaveDiscPreset } from '@/lib/api-hooks';
import type { DiscConvert, DiscPreset, DiscPresetInput } from '@/types/discs';

const INPUT =
  'min-h-[44px] w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white disabled:opacity-50';
const BUTTON =
  'min-h-[44px] px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-700`;
const SECONDARY = `${BUTTON} bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600`;
const DANGER = `${BUTTON} bg-red-600 text-white hover:bg-red-700`;
const LABEL = 'block text-sm text-gray-700 dark:text-gray-300';
const NOTE = 'mt-1 text-sm text-gray-600 dark:text-gray-400';

const CONTAINERS = [
  ['mkv', 'MKV (keeps the subtitles)'],
  ['mp4', 'MP4 (plays on the most devices, no subtitles)'],
];
const VIDEOS = [
  ['libx265', 'HEVC (H.265): small files'],
  ['libx264', 'H.264: plays on almost anything'],
  ['libsvtav1', 'AV1: smallest files, takes the longest'],
  ['copy', 'Keep the picture as it is: no conversion, big files'],
];
const SPEEDS = [
  ['ultrafast', 'Fastest, biggest files'],
  ['superfast', 'Very fast'],
  ['veryfast', 'Faster'],
  ['faster', 'Fast (the usual choice)'],
  ['fast', 'A little slower'],
  ['medium', 'Medium'],
  ['slow', 'Slow, smaller files'],
  ['slower', 'Slower, smaller files'],
  ['veryslow', 'Slowest, smallest files'],
];
const AUDIOS = [
  ['copy', 'Keep the sound as it is'],
  ['aac', 'AAC: plays on anything'],
  ['ac3', 'AC-3 (Dolby Digital)'],
];

/** What the form starts with for a new preset: the way discs were always made. */
const NEW_PRESET: DiscPresetInput = {
  name: '',
  container: 'mkv',
  video: 'libx265',
  quality: 22,
  speed: 'faster',
  tenBit: true,
  audio: 'copy',
  deinterlace: true,
  subtitles: 'keep',
};

function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={LABEL}>
      {label}
      <select
        className={`${INPUT} mt-1`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Making a preset of your own, or changing one you made. */
function PresetForm({
  preset,
  onClose,
}: {
  preset: DiscPreset | null;
  onClose: () => void;
}) {
  const save = useSaveDiscPreset();
  const remove = useDeleteDiscPreset();
  const [draft, setDraft] = useState<DiscPresetInput>(() => {
    if (!preset) return NEW_PRESET;
    const { builtIn: _builtIn, ...fields } = preset;
    return fields;
  });
  const [quality, setQuality] = useState(String(draft.quality));
  const [problem, setProblem] = useState('');
  const set = (patch: Partial<DiscPresetInput>) =>
    setDraft((current) => ({ ...current, ...patch }));

  // What a choice rules out is shown switched off, and is not sent.
  const copies = draft.video === 'copy';
  const tenBitPossible =
    draft.video === 'libx265' || draft.video === 'libsvtav1';
  const noSubtitles = draft.container === 'mp4';
  const error = problem || save.error?.message || remove.error?.message || '';

  const submit = () => {
    setProblem('');
    const number = Number(quality);
    if (
      quality.trim() === '' ||
      !Number.isInteger(number) ||
      number < 0 ||
      number > 51
    ) {
      setProblem('Quality is a whole number from 0 to 51.');
      return;
    }
    if (!draft.name.trim()) {
      setProblem('Give the preset a name.');
      return;
    }
    save.mutate(
      {
        ...draft,
        quality: number,
        tenBit: draft.tenBit && tenBitPossible,
        deinterlace: draft.deinterlace && !copies,
        subtitles: noSubtitles ? 'none' : draft.subtitles,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-gray-300 p-4 dark:border-gray-600"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="font-medium text-gray-900 dark:text-white">
        {preset ? `Change “${preset.name}”` : 'Make your own'}
      </h3>
      <label className={LABEL}>
        Name
        <input
          className={`${INPUT} mt-1`}
          value={draft.name}
          maxLength={60}
          placeholder="Phone-sized copies"
          onChange={(event) => set({ name: event.target.value })}
        />
      </label>
      <Select
        label="File type"
        value={draft.container}
        options={CONTAINERS}
        onChange={(container) => set({ container })}
      />
      <Select
        label="Picture"
        value={draft.video}
        options={VIDEOS}
        onChange={(video) => set({ video })}
      />
      <div>
        <label className={LABEL}>
          Quality (0 to 51)
          <input
            className={`${INPUT} mt-1`}
            inputMode="numeric"
            value={quality}
            disabled={copies}
            onChange={(event) => setQuality(event.target.value)}
          />
        </label>
        <p className={NOTE}>
          Lower looks better and makes bigger files. 22 is a good middle.
        </p>
      </div>
      <Select
        label="How long to spend on each disc"
        value={draft.speed}
        options={SPEEDS}
        disabled={copies}
        onChange={(speed) => set({ speed })}
      />
      <label className="flex min-h-[44px] items-center gap-2 text-gray-900 dark:text-white">
        <input
          type="checkbox"
          checked={draft.tenBit && tenBitPossible}
          disabled={!tenBitPossible}
          onChange={(event) => set({ tenBit: event.target.checked })}
        />
        10-bit color (smoother shading, for HEVC and AV1)
      </label>
      <Select
        label="Sound"
        value={draft.audio}
        options={AUDIOS}
        onChange={(audio) => set({ audio })}
      />
      <label className="flex min-h-[44px] items-center gap-2 text-gray-900 dark:text-white">
        <input
          type="checkbox"
          checked={draft.deinterlace && !copies}
          disabled={copies}
          onChange={(event) => set({ deinterlace: event.target.checked })}
        />
        Clean up interlaced video (best left on for DVDs)
      </label>
      <Select
        label="Subtitles"
        value={noSubtitles ? 'none' : draft.subtitles}
        options={[
          ['keep', 'Keep them'],
          ['none', 'Leave them out'],
        ]}
        disabled={noSubtitles}
        onChange={(subtitles) => set({ subtitles })}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <p className={NOTE}>
        Saving adds it to the list. Pick it there to use it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={PRIMARY} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={SECONDARY} onClick={onClose}>
          Cancel
        </button>
        {preset && (
          <button
            type="button"
            className={DANGER}
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete “${preset.name}”?`)) {
                remove.mutate(preset.id, { onSuccess: onClose });
              }
            }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </form>
  );
}

/** The choice of how discs are converted, from the list the ripper keeps in its settings file. */
export function ConvertChoice({
  convert,
  folder,
  pending,
  onChoose,
}: {
  convert: DiscConvert;
  folder: string;
  pending: boolean;
  onChoose: (id: string) => void;
}) {
  // null: closed. 'new': making one. A preset: changing it.
  const [editing, setEditing] = useState<DiscPreset | 'new' | null>(null);
  return (
    <fieldset className="mt-4">
      <legend className="font-medium text-gray-900 dark:text-white">
        What to turn discs into
      </legend>
      {convert.presets.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          The choices show up here after the next disc is sent to Frame Shift.
          Until then discs are made as small, sharp HEVC files in MKV.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {convert.presets.map((choice) => (
            <div key={choice.id} className="flex items-center gap-2">
              <label className="flex min-h-[44px] flex-1 items-center gap-2 text-gray-900 dark:text-white">
                <input
                  type="radio"
                  name="convert-preset"
                  checked={choice.id === convert.chosen}
                  disabled={pending}
                  onChange={() => onChoose(choice.id)}
                />
                {choice.name}
              </label>
              {!choice.builtIn && (
                <button
                  type="button"
                  className={SECONDARY}
                  aria-label={`Change ${choice.name}`}
                  onClick={() => setEditing(choice)}
                >
                  Change
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This applies to discs sent to Frame Shift from now on. One that is
        already waiting keeps what it was given. Finished discs are put in the{' '}
        <strong>{folder}</strong> folder. Only MKV files get their subtitles
        turned into text.
      </p>
      {convert.presets.length > 0 && editing === null && (
        <button
          type="button"
          className={`${SECONDARY} mt-3`}
          onClick={() => setEditing('new')}
        >
          Make your own…
        </button>
      )}
      {editing !== null && (
        <PresetForm
          key={editing === 'new' ? 'new' : editing.id}
          preset={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </fieldset>
  );
}
