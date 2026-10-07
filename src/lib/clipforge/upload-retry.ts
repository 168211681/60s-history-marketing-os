export const uploadRetryDelaysMs = [0, 1000, 3000, 5000, 10000] as const;

export class DirectUploadError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable = status === null || status === 408 || status === 429 || status >= 500) {
    super(message);
    this.name = "DirectUploadError";
    this.status = status;
    this.retryable = retryable;
  }
}

export type UploadedPart = { partNumber: number; etag: string };

function retryable(error: unknown) {
  return error instanceof DirectUploadError ? error.retryable : true;
}

export async function uploadWithRetry<T>(options: {
  sign: () => Promise<string>;
  put: (url: string) => Promise<T>;
  delays?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}): Promise<T> {
  const delays = options.delays ?? uploadRetryDelaysMs;
  const wait = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown = new DirectUploadError("Upload failed.", null, false);
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0;
    if (delay > 0) await wait(delay);
    try {
      const url = await options.sign();
      if (!url) throw new DirectUploadError("Private upload could not continue.", 503);
      return await options.put(url);
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === delays.length - 1) {
        throw error instanceof Error ? error : lastError;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new DirectUploadError("Upload failed.", null, false);
}

export function partProgress(partStart: number, loaded: number, totalBytes: number) {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.round(((partStart + Math.max(0, loaded)) / totalBytes) * 100));
}

export function sequentialSigner(initialUrl: string, refresh: () => Promise<string>) {
  let pending = initialUrl;
  return async () => {
    if (pending) {
      const url = pending;
      pending = "";
      return url;
    }
    return refresh();
  };
}

export async function uploadMasterObject(input: {
  partCount: number;
  signPart: (partNumber: number) => Promise<string>;
  putPart: (url: string, partNumber: number) => Promise<string>;
  complete: (parts: UploadedPart[]) => Promise<void>;
  abort: () => Promise<void>;
  delays?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}) {
  const parts: UploadedPart[] = [];
  let completed = false;
  try {
    for (let partNumber = 1; partNumber <= input.partCount; partNumber += 1) {
      const etag = await uploadWithRetry({
        delays: input.delays,
        sleep: input.sleep,
        sign: () => input.signPart(partNumber),
        put: (url) => input.putPart(url, partNumber),
      });
      parts.push({ partNumber, etag });
    }
    await input.complete(parts);
    completed = true;
    return parts;
  } catch (error) {
    if (!completed) await input.abort().catch(() => undefined);
    throw error;
  }
}

export async function uploadThumbnailObject(input: {
  sign: () => Promise<string>;
  put: (url: string) => Promise<void>;
  delays?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}) {
  await uploadWithRetry({
    delays: input.delays,
    sleep: input.sleep,
    sign: input.sign,
    put: async (url) => {
      await input.put(url);
    },
  });
}