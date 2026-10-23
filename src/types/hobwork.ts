/** What the page may know about the connection to Hobwork. The webhook address is never sent. */
export interface HobworkState {
  connected: boolean;
  /** The host the address points at, to show which Hobwork it is */
  host: string | null;
  notifications: boolean;
  liveActivities: boolean;
  /** Where Frame Shift is reached from a phone, used for links in notifications */
  publicUrl: string | null;
  /** True when the server sets it with FRAME_SHIFT_URL, so it cannot be changed here */
  publicUrlFromEnvironment: boolean;
}

/** What can be changed. `url: null` disconnects. */
export interface HobworkChanges {
  url?: string | null;
  notifications?: boolean;
  liveActivities?: boolean;
  publicUrl?: string | null;
}
