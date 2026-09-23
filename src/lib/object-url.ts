export const OBJECT_URL_REVOKE_DELAY_MS = 60_000;

export function scheduleObjectUrlCleanup(
  url: string,
  schedule: (callback: () => void, delayMs: number) => unknown,
  revoke: (url: string) => void,
) {
  schedule(() => revoke(url), OBJECT_URL_REVOKE_DELAY_MS);
}
