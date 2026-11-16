/**
 * Buffers made off the main thread (v0.15.4). The modelled instruments compute their notes in JavaScript (a drum take
 * 5–40 ms, a plucked string 1–5, the engine's noise beds ~20 each): made in the moment they were a stutter in the
 * frame, so live they are made in a worker (audioWorker.ts), starting while the game loads, and handed back as
 * AudioBuffers (which need no context to exist).
 *
 * A buffer is named by a key whose first part says who makes it (`drum|…`, `plucked|…`, `noise|…`: audioWorker.ts)
 * and by the sample rate. `askWorker` queues it (false when there is no worker: tests, offline renders, an engine
 * that refuses one; the caller then makes it itself, as before); `workerMade` returns it once it is back.
 * No imports here on purpose: the engine and every voice family use it.
 */
const made = new Map<string, AudioBuffer>();
const waiting = new Map<string, (() => void)[]>();
let worker: Worker | null | undefined;

function theWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof AudioBuffer === 'undefined') return null;
    const w = new Worker(new URL('./audioWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ key: string; sr: number; ch: Float32Array[] | null }>) => {
      const { key, sr, ch } = e.data;
      const k = `${sr}|${key}`;
      if (ch?.length && (!keptRate || sr === keptRate))
        try {
          const b = new AudioBuffer({ numberOfChannels: ch.length, length: Math.max(1, ch[0].length), sampleRate: sr });
          ch.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
          made.set(k, b);
        } catch {
          // its instrument makes it itself when it is played
        }
      const fns = waiting.get(k);
      waiting.delete(k);
      fns?.forEach((f) => f());
    };
    w.onerror = () => {
      // a worker that can't run: everyone makes their own again, and whoever waits stops waiting
      worker = null;
      w.terminate();
      const fns = [...waiting.values()].flat();
      waiting.clear();
      fns.forEach((f) => f());
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** Queue `key` at `sr` in the worker (`soon`: ahead of the warm-up). False when there is no worker. */
export function askWorker(sr: number, key: string, soon = false): boolean {
  const w = theWorker();
  if (!w) return false;
  const k = `${sr}|${key}`;
  if (made.has(k) || waiting.has(k)) return true;
  waiting.set(k, []);
  w.postMessage({ key, sr, soon });
  return true;
}

/** The buffer the worker made for `key` at `sr`, if it is back. */
export function workerMade(sr: number, key: string): AudioBuffer | undefined {
  return made.get(`${sr}|${key}`);
}

/** True while `key` at `sr` is queued in the worker. */
export function workerHas(sr: number, key: string): boolean {
  return waiting.has(`${sr}|${key}`);
}

/** Resolves when nothing asked of the worker at `sr` (with a key starting `prefix`) is still being made. */
export function workerDone(sr: number, prefix = ''): Promise<void> {
  const head = `${sr}|${prefix}`;
  const keys = [...waiting.keys()].filter((k) => k.startsWith(head));
  return Promise.all(
    keys.map(
      (k) =>
        new Promise<void>((done) => {
          const fns = waiting.get(k);
          if (fns) fns.push(done);
          else done();
        }),
    ),
  ).then(() => undefined);
}

/**
 * Keep only what was made at `sr` (the rate the audio really runs at): a warm-up at a guessed rate that turned out
 * wrong would otherwise hold its buffers for good. What is still queued at another rate is made and dropped.
 */
export function keepRate(sr: number): void {
  keptRate = sr;
  for (const k of [...made.keys()]) if (!k.startsWith(`${sr}|`)) made.delete(k);
}
let keptRate = 0;

/** Bytes held in worker-made buffers (the lab and QA). */
export function workerBytes(): number {
  let n = 0;
  for (const b of made.values()) n += b.length * b.numberOfChannels * 4;
  return n;
}

/** QA: every key the worker has made (`${sr}|${key}`). */
export const __keys = () => [...made.keys()];
