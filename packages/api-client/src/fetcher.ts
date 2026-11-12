/**
 * The mutator Orval wraps around every generated call (see orval.config.ts).
 *
 * It returns `{ data, status, headers }` for every status, including errors: the generated types
 * are a union over the statuses the API documents, so a caller narrows on `status` and an error
 * body is typed as Problem Details instead of being thrown.
 */

export interface ApiClientConfig {
  /** Where the FormLens API listens, for example `http://localhost:8000`. */
  baseUrl: string;
  /** Sent with every request, for example an `Authorization` header. */
  headers?: HeadersInit;
}

let config: ApiClientConfig | undefined;

export function configureApiClient(next: ApiClientConfig): void {
  config = next;
}

function resolveUrl(path: string): string {
  if (!config) {
    throw new Error("The FormLens API client is not configured: call configureApiClient({ baseUrl }) first.");
  }
  return new URL(path, config.baseUrl).toString();
}

async function readBody(response: Response): Promise<unknown> {
  if ([204, 205, 304].includes(response.status)) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("json") ? JSON.parse(text) : text;
}

export async function customFetch<T>(url: string, options: RequestInit): Promise<T> {
  const headers = new Headers(config?.headers);
  new Headers(options.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  const response = await fetch(resolveUrl(url), { ...options, headers });

  return { data: await readBody(response), headers: response.headers, status: response.status } as T;
}
