// Bubble map of Estonia: one circle per county, area proportional to the transaction count.
import estonia from './estonia.json';

// Approximate geographic centres of the counties (lat, lon)
const COUNTY_CENTERS = {
  'Harju maakond': [59.33, 24.85],
  'Hiiu maakond': [58.88, 22.65],
  'Ida-Viru maakond': [59.2, 27.4],
  'Jõgeva maakond': [58.75, 26.4],
  'Järva maakond': [58.88, 25.57],
  'Lääne maakond': [58.95, 23.78],
  'Lääne-Viru maakond': [59.22, 26.35],
  'Põlva maakond': [58.05, 27.07],
  'Pärnu maakond': [58.38, 24.4],
  'Rapla maakond': [58.95, 24.75],
  'Saare maakond': [58.35, 22.55],
  'Tartu maakond': [58.4, 26.72],
  'Valga maakond': [57.9, 26.05],
  'Viljandi maakond': [58.33, 25.55],
  'Võru maakond': [57.75, 27.0],
};

const WIDTH = 1000;
const PAD = 24;
const MAX_R = 72;
const MIN_R = 5;
const LABEL_INSIDE_R = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Equirectangular projection with longitude scaled for Estonia's latitude
const K = Math.cos((58.6 * Math.PI) / 180);
const points = estonia.coordinates.flat(2);
const minX = Math.min(...points.map((p) => p[0] * K));
const maxX = Math.max(...points.map((p) => p[0] * K));
const minY = Math.min(...points.map((p) => -p[1]));
const maxY = Math.max(...points.map((p) => -p[1]));
const SCALE = (WIDTH - 2 * PAD) / (maxX - minX);
const HEIGHT = Math.round((maxY - minY) * SCALE + 2 * PAD);

const project = ([lon, lat]) => [(lon * K - minX) * SCALE + PAD, (-lat - minY) * SCALE + PAD];

const outlinePath = estonia.coordinates
  .flatMap((polygon) =>
    polygon.map(
      (ring) =>
        ring.map((pt, i) => `${i ? 'L' : 'M'}${project(pt).map((v) => v.toFixed(1)).join(' ')}`).join('') + 'Z',
    ),
  )
  .join('');

const el = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
};

export const radiusFor = (count, max) => (count > 0 ? Math.max(MIN_R, Math.sqrt(count / max) * MAX_R) : 0);

export function createBubbleMap(container, { onSelect, describe, showTip, hideTip }) {
  const svg = el('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'map-svg', role: 'group' });
  svg.append(el('path', { d: outlinePath, class: 'map-land' }));
  const bubbleLayer = el('g');
  svg.append(bubbleLayer);
  container.append(svg);

  const nodes = new Map();
  for (const [county, center] of Object.entries(COUNTY_CENTERS)) {
    const [x, y] = project([center[1], center[0]]);
    const g = el('g', { class: 'bubble', tabindex: '0', role: 'button' });
    const hit = el('circle', { cx: x, cy: y, r: 16, class: 'bubble-hit' });
    const circle = el('circle', { cx: x, cy: y, r: 0, class: 'bubble-dot' });
    const name = el('text', { x, y, class: 'bubble-name' });
    const value = el('text', { x, y, class: 'bubble-value' });
    name.textContent = county.replace(/ maakond$/, '');
    g.append(hit, circle, name, value);
    bubbleLayer.append(g);
    nodes.set(county, { g, hit, circle, name, value, x, y });

    const tip = () => showTip(circle.getBoundingClientRect(), describe(county));
    g.addEventListener('mouseenter', tip);
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('focus', tip);
    g.addEventListener('blur', hideTip);
    g.addEventListener('click', () => onSelect(county));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(county);
      }
    });
  }

  // items: [{ county, count }]; counties without a count get no bubble
  return function update(items, selectedCounty, max) {
    // Keep labels readable when the map is drawn small (viewBox units shrink with it)
    const width = svg.getBoundingClientRect().width || WIDTH;
    const ts = Math.min(2, Math.max(1, 760 / width));
    const byCounty = new Map(items.map((i) => [i.county, i]));
    const order = [];
    for (const [county, n] of nodes) {
      const count = byCounty.get(county)?.count ?? 0;
      const r = radiusFor(count, max);
      const selected = county === selectedCounty;
      n.circle.style.r = `${r}px`;
      n.hit.setAttribute('r', Math.max(r, 16));
      n.g.classList.toggle('is-selected', selected);
      n.g.classList.toggle('is-dimmed', selectedCounty !== 'all' && !selected);
      n.g.classList.toggle('is-empty', count === 0);
      n.g.setAttribute('aria-pressed', String(selected));
      n.g.setAttribute('aria-label', `${county}: ${count} tehingut`);

      // Large bubbles carry their label inside, small ones below the circle
      const inside = r >= LABEL_INSIDE_R * ts;
      n.g.classList.toggle('label-inside', inside);
      n.value.textContent = count ? new Intl.NumberFormat('et-EE').format(count) : '–';
      const nameY = inside ? n.y - 3 * ts : n.y + r + 14 * ts;
      n.name.style.fontSize = `${15 * ts}px`;
      n.value.style.fontSize = `${14 * ts}px`;
      n.name.style.transform = `translateY(${nameY - n.y}px)`;
      n.value.style.transform = `translateY(${(inside ? n.y + 15 * ts : nameY + 15 * ts) - n.y}px)`;
      order.push([r, n.g]);
    }
    // Paint large bubbles first so small ones stay on top and clickable
    const focused = document.activeElement;
    order.sort((a, b) => b[0] - a[0]).forEach(([, g]) => bubbleLayer.append(g));
    if (focused?.classList?.contains('bubble')) focused.focus({ preventScroll: true });
  };
}
