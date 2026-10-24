export type GenCloudAnchor = { left: number; top: number; width: number; height: number };

/** Keep Gen's conversation beside its launcher, including at the edges of a phone. */
export function genCloudLayout(anchor: GenCloudAnchor, viewportWidth: number, viewportHeight: number, viewportLeft = 0, viewportTop = 0) {
  const margin = 12, gap = 12;
  const width = Math.min(330, Math.max(0, viewportWidth - margin * 2));
  const above = Math.max(0, anchor.top - viewportTop - gap - margin);
  const below = Math.max(0, viewportTop + viewportHeight - anchor.top - anchor.height - gap - margin);
  const side = above >= 210 || above >= below ? 'above' : 'below';
  const height = Math.min(380, Math.max(100, side === 'above' ? above : below), Math.max(0, viewportHeight - margin * 2));
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
  const left = clamp(anchor.left + anchor.width / 2 - width + 40, viewportLeft + margin, viewportLeft + viewportWidth - width - margin);
  const top = clamp(side === 'above' ? anchor.top - gap - height : anchor.top + anchor.height + gap, viewportTop + margin, viewportTop + viewportHeight - height - margin);
  return { left, top, width, height, side, tailLeft: clamp(anchor.left + anchor.width / 2 - left, 22, width - 22) };
}
