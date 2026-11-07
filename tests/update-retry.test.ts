import { describe, expect, it } from 'vitest';
import { downloadWithRetry, type AppUpdateStatus, type Downloadable, type DownloadProgress } from '../src/platform/platform';

/** A fake Tauri Update: each try either finishes or fails with `errors[try]`. */
function fake(errors: (string | null)[]) {
  const timeouts: (number | undefined)[] = [];
  const update: Downloadable = {
    async download(onEvent: (e: DownloadProgress) => void, options?: { timeout?: number }) {
      timeouts.push(options?.timeout);
      const err = errors[timeouts.length - 1];
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 40 } });
      if (err) throw new Error(err);
      onEvent({ event: 'Progress', data: { chunkLength: 60 } });
      onEvent({ event: 'Finished' });
    },
  };
  return { update, timeouts };
}

describe('desktop update download', () => {
  it('starts over on a fresh connection when a try times out', async () => {
    const { update, timeouts } = fake(['error sending request: operation timed out', null]);
    const seen: AppUpdateStatus[] = [];
    await downloadWithRetry(update, (s) => seen.push(s), [90_000, 240_000, 0]);
    expect(timeouts).toEqual([90_000, 240_000]);
    const last = seen[seen.length - 1];
    expect(last).toEqual({ phase: 'downloading', fraction: 1, attempt: 2 });
  });

  it('the last try has no limit, and gives up after it', async () => {
    const { update, timeouts } = fake(['timed out', 'timed out', 'timed out']);
    await expect(downloadWithRetry(update, () => {}, [90_000, 240_000, 0])).rejects.toThrow('timed out');
    expect(timeouts).toEqual([90_000, 240_000, undefined]);
  });

  it('does not retry a file that fails its signature', async () => {
    const { update, timeouts } = fake(['signature verification failed']);
    await expect(downloadWithRetry(update, () => {}, [90_000, 240_000, 0])).rejects.toThrow('signature');
    expect(timeouts).toHaveLength(1);
  });
});
