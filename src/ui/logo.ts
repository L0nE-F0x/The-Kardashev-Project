/**
 * The logo: a 3D-rendered wordmark, public/logo.png (1452×492, the old pixel logo's 121:41 frame at twelve pixels
 * a unit; made by tools/brand/logo.ts through `npm run gen:assets`). The game page lives in play/, so the file
 * is one folder up, the same address the loading screen uses (play/index.html): its logo flies onto the menu's.
 */
export const LOGO_W = 1452;
export const LOGO_H = 492;

export function logoUrl(): string {
  return '../logo.png';
}
