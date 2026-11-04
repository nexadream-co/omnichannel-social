// Writes app/assets/icons/loader.svg (the brand loader, i-socialz-loader): the bag with its handle holes and three
// typing dots cut out (even-odd), the dots riding a wave by SMIL path interpolation. No <mask>: WebKit rasterises masks
// inside CSS mask images at low resolution. Reduced motion swaps in a still copy. Run: node scripts/gen-loader-icon.mjs
// app/spa-loading-template.html carries a copy of the output; update it after regenerating.
import { writeFileSync } from 'node:fs'

const BODY = 'M18.6 21.5h26.8c1.6 0 3 1.2 3.2 2.8l2.2 19.6a6 6 0 0 1-6 6.6H27.5l-8.2 6.2c-.8.6-1.9-.1-1.6-1.1l1.4-5.6c-3-.6-5.2-3.4-4.8-6.5l2.2-19.2c.2-1.6 1.6-2.8 3.1-2.8z'
const HANDLE = 'M24.5 23.5V20a7.5 7.5 0 0 1 15 0v3.5'
const f = n => +n.toFixed(2)
const circle = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`
const holes = circle(24.5, 27, 1.7) + circle(39.5, 27, 1.7)
const DUR = 1, AMP = 4.5, RISE = 0.6, FRAMES = 16
// Dot height at time t (fraction of the loop): up and back over the first 60 %, then rest.
const lift = (t) => {
  const p = ((t % 1) + 1) % 1
  return p < RISE ? -AMP * Math.sin(Math.PI * p / RISE) : 0
}
const frame = t => BODY + holes + [25, 32, 39].map((x, i) => circle(x, 39 + lift(t - i * 0.15), 3)).join('')
const values = Array.from({ length: FRAMES + 1 }, (_, k) => frame(k / FRAMES)).join(';')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="9 11 46 46"><style>.s{display:none}@media (prefers-reduced-motion:reduce){.a{display:none}.s{display:inline}}</style><path d="${HANDLE}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path class="a" fill="currentColor" fill-rule="evenodd" d="${frame(0)}"><animate attributeName="d" dur="${DUR}s" repeatCount="indefinite" values="${values}"/></path><path class="s" fill="currentColor" fill-rule="evenodd" d="${frame(0.9)}"/></svg>\n`
writeFileSync(new URL('../app/assets/icons/loader.svg', import.meta.url), svg)
