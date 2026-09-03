/**
 * Getting — and quietly re-getting — an access token for `drive.appdata`.
 *
 * Firebase Authentication answers "who is this", and that is all slice 2 asked
 * of it. Drive needs a second thing: an OAuth token carrying a scope the
 * sign-in never requested. Asking for the Drive scope at sign-in would be
 * wrong — it would put a Drive consent in front of every player who only
 * wanted their settings to follow them — so consent for sync is incremental
 * and separate, requested the first time sync is switched on.
 *
 * **Why the Google Identity token client rather than a Firebase credential.**
 * `signInWithPopup` can carry the extra scope and hand back an access token,
 * but only through a popup, and a popup needs a user gesture. The token lasts
 * an hour. That combination means a reload an hour later cannot resume syncing
 * without the player clicking something, forever. `initTokenClient` re-issues
 * silently once consent exists (`prompt: ''`), so the click happens once, when
 * they turn sync on, and never again.
 *
 * The client id is public by design — it identifies the app, it authorises
 * nothing on its own, and Google's own documentation ships it in page source.
 * As with the Firebase config, a build without it simply has no sync: not a
 * broken switch, a feature this build does not have.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Refreshed this long before Google's hour is up, so a sync never starts on a dying token. */
export const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export const CLIENT_ID: string | null =
  (import.meta.env as unknown as Record<string, string | undefined>).VITE_GOOGLE_CLIENT_ID ?? null;

/** Whether this build can sync at all. */
export const syncAvailable = (clientId: string | null = CLIENT_ID): boolean => clientId !== null;

export interface Grant {
  token: string;
  /** Wall-clock at which it stops being usable, margin already subtracted. */
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string; hint?: string }) => void;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
        hint?: string;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let script: Promise<GoogleIdentity> | null = null;

/** Loads Google's script once. Never at startup — only when sync is asked for. */
export function loadIdentityServices(): Promise<GoogleIdentity> {
  script ??= new Promise<GoogleIdentity>((resolve, reject) => {
    if (window.google?.accounts?.oauth2 !== undefined) {
      resolve(window.google);
      return;
    }
    const tag = document.createElement('script');
    tag.src = GIS_SRC;
    tag.async = true;
    tag.onload = () => {
      const google = window.google;
      if (google?.accounts?.oauth2 === undefined) reject(new Error('gsi loaded without oauth2'));
      else resolve(google);
    };
    tag.onerror = () => {
      // A failed load must not be remembered as a permanent verdict: the
      // usual cause is the network being down, which is the state this app is
      // built to be usable in and to recover from.
      script = null;
      reject(new Error('gsi failed to load'));
    };
    document.head.append(tag);
  });
  return script;
}

export interface GrantRequest {
  /** `''` re-issues silently when consent already exists; `'consent'` asks. */
  prompt?: string;
  /** The signed-in address, so Google does not ask which account this is. */
  hint?: string;
  clientId?: string | null;
  now?: () => number;
}

/**
 * One access token, or null.
 *
 * Null rather than a thrown error for the ordinary refusals — a closed popup,
 * a silent attempt that finds no existing consent — because they are not
 * faults. They are a player declining, and the caller's response to both is
 * the same: sync is off, say so in Settings, do not retry.
 */
export function requestGrant({
  prompt = '',
  hint,
  clientId = CLIENT_ID,
  now = () => Date.now(),
}: GrantRequest = {}): Promise<Grant | null> {
  if (clientId === null) return Promise.resolve(null);

  return loadIdentityServices().then(
    (google) =>
      new Promise<Grant | null>((resolve) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          hint,
          callback: (response) => {
            if (response.access_token === undefined || response.error !== undefined) {
              resolve(null);
              return;
            }
            const seconds = response.expires_in ?? 3600;
            resolve({
              token: response.access_token,
              expiresAt: now() + seconds * 1000 - EXPIRY_MARGIN_MS,
            });
          },
          error_callback: () => resolve(null),
        });
        client.requestAccessToken({ prompt, hint });
      }),
  );
}

/** True when a held grant can still be used. */
export const usable = (grant: Grant | null, at: number): grant is Grant =>
  grant !== null && grant.expiresAt > at;
