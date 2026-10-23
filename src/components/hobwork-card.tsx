import { useEffect, useState } from 'react';
import { useHobwork, useSaveHobwork } from '@/lib/api-hooks';
import { testHobwork } from '@/lib/api';

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';
const BUTTON =
  'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * The connection to Hobwork: where notifications and Live Activities are sent besides Pushover.
 * Each person chooses in the Hobwork app which ones they get; these switches are for Frame Shift.
 */
export function HobworkCard() {
  const { data: state, isLoading, error } = useHobwork();
  const save = useSaveHobwork();
  const [address, setAddress] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [testing, setTesting] = useState(false);

  // Links in a notification need an address a phone can reach; this page's own is the best guess.
  useEffect(() => {
    if (state) setPublicUrl(state.publicUrl ?? window.location.origin);
  }, [state]);

  const change = (changes: Parameters<typeof save.mutate>[0]) => {
    setMessage(null);
    save.mutate(changes, {
      onError: (e) => setMessage({ ok: false, text: e.message }),
    });
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await testHobwork();
      setMessage({ ok: true, text: result.message });
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : 'The test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Hobwork
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Send notifications and Live Activities (the Lock Screen and Dynamic
          Island) through Hobwork, as well as Pushover. Each person chooses in
          the Hobwork app which ones they get.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {isLoading && (
          <p className="text-gray-600 dark:text-gray-400">Loading…</p>
        )}
        {error && (
          <p className="text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Could not load'}
          </p>
        )}
        {state && (
          <>
            {state.connected ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                  Connected to {state.host}
                </span>
                <button
                  type="button"
                  className={`${BUTTON} bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600`}
                  disabled={save.isPending}
                  onClick={() => change({ url: null })}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  change({ url: address.trim() });
                  setAddress('');
                }}
              >
                <label className="block text-sm text-gray-700 dark:text-gray-300">
                  The events address from Hobwork
                  <input
                    className={`${INPUT} mt-1`}
                    type="password"
                    autoComplete="off"
                    value={address}
                    placeholder="https://frame-shift.…/_hobwork/hooks/events/…"
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  It is a secret: anyone with it can send notifications to the
                  people who turned them on. It is saved on the server and never
                  shown again.
                </p>
                <button
                  type="submit"
                  className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}
                  disabled={save.isPending || !address.trim()}
                >
                  Connect
                </button>
              </form>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                <input
                  type="checkbox"
                  checked={state.notifications}
                  disabled={save.isPending}
                  onChange={(event) =>
                    change({ notifications: event.target.checked })
                  }
                />
                Send notifications through Hobwork
              </label>
              <label className="flex items-center gap-2 text-gray-900 dark:text-white">
                <input
                  type="checkbox"
                  checked={state.liveActivities}
                  disabled={save.isPending}
                  onChange={(event) =>
                    change({ liveActivities: event.target.checked })
                  }
                />
                Show Live Activities through Hobwork (a disc being ripped,
                conversions with progress)
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-gray-700 dark:text-gray-300">
                Address of Frame Shift for links in notifications
                <input
                  className={`${INPUT} mt-1`}
                  value={publicUrl}
                  disabled={state.publicUrlFromEnvironment}
                  placeholder="http://frame-shift.example"
                  onChange={(event) => setPublicUrl(event.target.value)}
                />
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {state.publicUrlFromEnvironment
                  ? 'Set by the server (FRAME_SHIFT_URL).'
                  : 'A notification that needs you to fix something links to the page that does it, on Pushover and in Hobwork. Use an address your phone can reach.'}
              </p>
              {!state.publicUrlFromEnvironment && (
                <button
                  type="button"
                  className={`${BUTTON} bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600`}
                  disabled={
                    save.isPending ||
                    publicUrl.trim() === (state.publicUrl ?? '')
                  }
                  onClick={() => change({ publicUrl: publicUrl.trim() })}
                >
                  Save address
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}
                disabled={!state.connected || testing}
                onClick={test}
              >
                {testing ? 'Sending…' : 'Send a test'}
              </button>
              {!state.connected && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Connect first
                </span>
              )}
            </div>
            {message && (
              <p
                className={`text-sm ${message.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {message.text}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
