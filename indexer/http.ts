export type FetchJson = <T = unknown>(url: string, init?: { headers?: Record<string, string> }) => Promise<T>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFetchJson(
  opts: {
    retries?: number;
    minIntervalMs?: number;
    timeoutMs?: number;
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    sleepImpl?: (ms: number) => Promise<void>;
  } = {},
): FetchJson {
  const retries = opts.retries ?? 4;
  const minInterval = opts.minIntervalMs ?? 250;
  const doFetch = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const sleep = opts.sleepImpl ?? realSleep;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  let lastRequest = 0;

  return async <T>(url: string, init?: { headers?: Record<string, string> }): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const gap = lastRequest + minInterval - Date.now();
      if (gap > 0) await sleep(gap);
      lastRequest = Date.now();

      let res: Response;
      try {
        res = await doFetch(url, { headers: { accept: 'application/json', ...init?.headers }, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return (await res.json()) as T;
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new HttpError(res.status, url);
    }
  };
}
