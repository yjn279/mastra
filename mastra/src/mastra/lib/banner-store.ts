/**
 * In-memory store of rendered banners, served over HTTP so the agent can
 * present each result as a markdown image in the Studio chat. Bounded to the
 * most recent entries; the server process is the single source of truth.
 */
const store = new Map<string, Buffer>();
const order: string[] = [];
const MAX = 50;
let seq = 0;

export function putBanner(png: Buffer): string {
  seq += 1;
  const id = String(seq);
  store.set(id, png);
  order.push(id);
  while (order.length > MAX) {
    store.delete(order.shift()!);
  }
  return id;
}

export function getBanner(id: string): Buffer | undefined {
  return store.get(id);
}
