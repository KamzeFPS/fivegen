type LandingBrand = { accentHex: string; backgroundHex: string; theme: 'dark' | 'light' };
type LandingTokens = Record<`--landing-${string}`, string>;

function rgb(hex: string): number[] {
  const value = /^#[\da-f]{6}$/i.test(hex) ? hex : '#111214';
  return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
}

export function relativeLuminance(hex: string): number {
  const values = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground), b = relativeLuminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

function readableColor(preferred: string, background: string, minimum = 4.5): string {
  if (contrastRatio(preferred, background) >= minimum) return preferred;
  return contrastRatio('#ffffff', background) > contrastRatio('#000000', background) ? '#ffffff' : '#000000';
}

/** Derive readable page surfaces from the actual background, including custom colors. */
export function landingThemeTokens(brand: LandingBrand): LandingTokens {
  const background = /^#[\da-f]{6}$/i.test(brand.backgroundHex) ? brand.backgroundHex : brand.theme === 'light' ? '#FAF8F3' : '#111214';
  const accent = /^#[\da-f]{6}$/i.test(brand.accentHex) ? brand.accentHex : '#FF804A';
  const dark = relativeLuminance(background) < .18;
  const card = dark ? '#191c20' : '#ffffff';
  const text = readableColor(dark ? '#f4f4f5' : '#282922', background);
  const muted = readableColor(dark ? '#b8bec8' : '#555b51', background);
  return {
    '--landing-accent': accent,
    '--landing-bg': background,
    '--landing-text': text,
    '--landing-muted': muted,
    '--landing-line': dark ? '#ffffff38' : '#272b2245',
    '--landing-card': card,
    '--landing-card-text': readableColor(dark ? '#f4f4f5' : '#282922', card),
    '--landing-card-muted': readableColor(dark ? '#b8bec8' : '#555b51', card),
    '--landing-button-ink': readableColor('#17181b', accent),
    '--landing-accent-text': readableColor(accent, background),
    '--landing-card-accent': readableColor(accent, card),
    '--landing-focus': readableColor(accent, background, 3),
    '--landing-hero-text': '#ffffff',
    '--landing-hero-muted': '#ede8e3',
  };
}
