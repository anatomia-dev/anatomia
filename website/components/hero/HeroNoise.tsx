/**
 * HeroNoise — full-bleed SVG fractal grain background.
 * Server component. Pure markup, no interactivity.
 * Styled by .hero-noise in globals.css (needs global scope for mask).
 */
export function HeroNoise() {
  return (
    <svg
      className="hero-noise"
      aria-hidden="true"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="grainFilterLight">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves={2}
          stitchTiles="stitch"
          seed={5}
        />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" />
      </filter>
      <filter id="grainFilterDark">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.72"
          numOctaves={2}
          stitchTiles="stitch"
          seed={9}
        />
        <feColorMatrix values="0 0 0 0 0.96  0 0 0 0 0.92  0 0 0 0 0.82  0 0 0 0.95 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grainFilterLight)" />
    </svg>
  );
}
