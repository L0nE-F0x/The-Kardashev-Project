import { Icon } from './components';
import type { IconName } from './icons';
import { dockIconUrl, hasDockIcon } from './dockIcons';

/**
 * A dock icon (dockIcons.ts): the richer 32-unit drawing of a panel's subject, for the dock's buttons and How to
 * Play's panel list. The box it sits in sets its size (`img.dock-ic` in styles.css). A name the dock has no
 * drawing for falls back to the small icon.
 */
export function DockIcon({ name }: { name: IconName }) {
  if (!hasDockIcon(name)) return <Icon name={name} size="lg" />;
  return <img class="dock-ic" src={dockIconUrl(name)} alt="" aria-hidden="true" draggable={false} />;
}
