/** Sun position for the real clock — drives the map terminator and diorama skies. */

const RAD = Math.PI / 180;

/** Subsolar point (where the sun is directly overhead) at a given time. */
export function subsolar(date: Date): { lat: number; lon: number } {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const B = (2 * Math.PI * (doy - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (hours - 12 + eot / 60);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: decl, lon };
}

/** Solar altitude in degrees at (lat, lon) for a subsolar point. */
export function sunAltitude(lat: number, lon: number, sub: { lat: number; lon: number }): number {
  const s = Math.sin(lat * RAD) * Math.sin(sub.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sub.lat * RAD) * Math.cos((lon - sub.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/** Local solar hour (0..24) at a longitude. */
export function localSolarHour(lon: number, date: Date): number {
  const sub = subsolar(date);
  let h = 12 + (lon - sub.lon) / 15;
  h = ((h % 24) + 24) % 24;
  return h;
}

/** Sun azimuth-ish progress across the sky: −1 (rising, east) … 1 (setting, west). */
export function sunArc(lon: number, date: Date): number {
  return (localSolarHour(lon, date) - 12) / 6;
}
