// ui/stars.js
// MCSM Rating stars: 5 stars, halves allowed, from the share of ranked drivers who are better.
// Top 11.1% → 5, then −0.5 per further 11.1%, never below 1. Star shape from Red_star.svg.
const D = 'M0,449h1235l-999,726 382-1175 382,1175z';
const NS = 'http://www.w3.org/2000/svg';
export function starsFor(pctBetter) {
  if (pctBetter == null) return null;
  const steps = [11.1, 22.2, 33.3, 44.4, 55.5, 66.6, 77.7, 88.8];
  const i = steps.findIndex((s) => pctBetter < s);
  return i < 0 ? 1 : 5 - i * 0.5;
}
let uid = 0;
function star(fill) {   // fill: 1 full, 0.5 half, 0 empty
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 1235 1175'); s.setAttribute('class', 'star'); s.setAttribute('aria-hidden', 'true');
  const id = 'sc' + (++uid);
  s.innerHTML = `<defs><clipPath id="${id}"><rect x="0" y="0" width="${fill >= 1 ? 1235 : fill > 0 ? 617.5 : 0}" height="1175"/></clipPath></defs>`
    + `<path d="${D}" fill="var(--star-empty)"/><path d="${D}" fill="var(--star)" clip-path="url(#${id})"/>`;
  return s;
}
export function starRow(value, size = 'md') {
  const el = document.createElement('span');
  el.className = 'stars stars-' + size;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', String(value).replace('.', ',') + ' / 5');
  for (let i = 1; i <= 5; i++) el.append(star(value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0));
  return el;
}
