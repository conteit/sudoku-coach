/**
 * Google Drive, reduced to the five calls this app makes.
 *
 * `fetch` rather than Google's JavaScript client. The client is a large
 * dependency, it wants a script from a host the CSP does not allow, and it
 * would be carried by every player including the ones who never sign in —
 * against five REST calls that fit on a page. Everything here is scoped to
 * `appDataFolder`, the hidden per-app folder: this code *cannot* see a user's
 * own files, which is a property of the token's scope rather than a promise
 * made by this file.
 *
 * The client is constructed around one access token and does no refreshing.
 * That is deliberate — a token is an hour of validity and refreshing it is an
 * authorisation concern, so an expired token surfaces here as
 * `DriveError.unauthorized` and the layer that owns consent decides what to
 * do about it.
 */

/** The hidden folder Google keeps per app. The only place this code can write. */
export const APP_DATA_FOLDER = 'appDataFolder';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
}

export class DriveError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }

  /**
   * The token is gone or was never good enough. Distinguished from every other
   * failure because it is the only one the player can do something about, and
   * the only one that must not be retried with the same token.
   */
  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface Drive {
  /** Every file in the app folder. Paged through, so a big library is whole. */
  list(): Promise<DriveFile[]>;
  read<T>(id: string): Promise<T>;
  create(name: string, body: unknown): Promise<DriveFile>;
  update(id: string, body: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

export type Fetch = typeof globalThis.fetch;

export function driveFor(token: string, doFetch: Fetch = globalThis.fetch): Drive {
  const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const response = await doFetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new DriveError(response.status, `${init.method ?? 'GET'} ${url} — ${response.status}`);
    }
    return response;
  };

  const json = async (url: string, init: RequestInit = {}): Promise<unknown> =>
    (await call(url, init)).json();

  const sendJson = (url: string, method: string, body: unknown): Promise<Response> =>
    call(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return {
    async list() {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;

      // Paged rather than capped: a player with more saved games than one page
      // holds would otherwise have the overflow look, to the planner, exactly
      // like games the remote has never seen — and be re-uploaded every sync.
      do {
        const params = new URLSearchParams({
          spaces: APP_DATA_FOLDER,
          fields: 'nextPageToken, files(id, name)',
          pageSize: '200',
        });
        if (pageToken !== undefined) params.set('pageToken', pageToken);

        const page = (await json(`${API}/files?${params}`)) as {
          files?: DriveFile[];
          nextPageToken?: string;
        };
        files.push(...(page.files ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken !== undefined);

      return files;
    },

    async read<T>(id: string): Promise<T> {
      return (await json(`${API}/files/${encodeURIComponent(id)}?alt=media`)) as T;
    },

    async create(name, body) {
      // Two calls: the metadata that puts the file in the app folder, then the
      // content. Simpler than assembling a multipart body by hand, and it is
      // the uncommon path — a game is created once and updated many times.
      const created = (await sendJson(`${API}/files`, 'POST', {
        name,
        parents: [APP_DATA_FOLDER],
      }).then((response) => response.json())) as DriveFile;

      await this.update(created.id, body);
      return created;
    },

    async update(id, body) {
      await sendJson(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, 'PATCH', body);
    },

    async remove(id) {
      await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
