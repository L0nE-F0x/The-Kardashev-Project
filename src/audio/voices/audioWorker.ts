/**
 * The audio's worker (v0.15.4, offthread.ts): makes the modelled instruments' buffers off the main thread with the
 * same code the page would run (drum takes, rings and rooms; plucked strings and their touch noises; the engine's
 * noise beds) and hands the samples back. Requests marked `soon` (an instrument playing now that lacks one) jump the
 * queue; the warm-up at load waits its turn, one buffer per task so a `soon` one is never stuck behind the list.
 */
import { noiseSamples } from '../engine';
import { drumSamples } from './drums';
import { pluckedSamples } from './plucked';
import { bassClick } from './synths';
import { airBuffer, driftBuffer, growlBuffer } from './winds';

interface Req {
  key: string;
  sr: number;
  soon?: boolean;
}

/**
 * A stand-in context for the makers that go through `cachedBuffer` (it only asks for the rate and a buffer to copy
 * into): what they copy is what goes back.
 */
function catcher(sr: number) {
  const ch: Float32Array[] = [];
  const ctx = {
    sampleRate: sr,
    createBuffer: (n: number, length: number) => ({ length, numberOfChannels: n, copyToChannel: (d: Float32Array, i: number) => void (ch[i] = d.slice()) }),
  } as unknown as BaseAudioContext;
  return { ctx, ch };
}

const VIA_CACHE: Record<string, (ctx: BaseAudioContext, key: string) => unknown> = {
  'winds:air': (c) => airBuffer(c),
  'winds:drift2': (c) => driftBuffer(c),
  'winds:growl': (c) => growlBuffer(c),
  'synths:click2': (c, key) => {
    const [, , kind, take] = key.split(':');
    return bassClick(c, kind as Parameters<typeof bassClick>[1], Number(take));
  },
};

function make(key: string, sr: number): Float32Array[] | null {
  const via = VIA_CACHE[key] ?? VIA_CACHE[key.split(':').slice(0, 2).join(':')];
  if (via) {
    const { ctx, ch } = catcher(sr);
    via(ctx, key);
    return ch.length ? ch : null;
  }
  const head = key.slice(0, key.indexOf('|'));
  if (head === 'drum') {
    const at = key.lastIndexOf('|');
    return drumSamples(key.slice(5, at), Number(key.slice(at + 1)), sr);
  }
  if (head === 'plucked') return pluckedSamples(key, sr);
  if (head === 'noise') return noiseSamples(key.slice(6) as 'white' | 'pink' | 'brown', sr);
  return null;
}

const queue: Req[] = [];
let busy = false;

function next(): void {
  const q = queue.shift();
  if (!q) {
    busy = false;
    return;
  }
  let ch: Float32Array[] | null = null;
  try {
    ch = make(q.key, q.sr);
  } catch {
    ch = null;
  }
  const moved = ch ? [...new Set(ch.map((c) => c.buffer as ArrayBuffer))] : [];
  (self as unknown as Worker).postMessage({ key: q.key, sr: q.sr, ch }, moved);
  setTimeout(next, 0);
}

self.onmessage = (e: MessageEvent<Req>) => {
  if (e.data.soon) queue.unshift(e.data);
  else queue.push(e.data);
  if (!busy) {
    busy = true;
    setTimeout(next, 0);
  }
};
