import './style.css';
import csvText from '../kinnisvara_hinnad_korteriomand.csv?raw';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { parseCsv, aggregate, finalizeRow, SIZE_RANGES, TOTAL_KEY } from './data.js';
import { createBubbleMap, radiusFor } from './map.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const data = parseCsv(csvText);
const state = { county: 'all', size: 'all', hideIncomplete: false, sort: null };

// ---------- Formatting ----------

const nf0 = new Intl.NumberFormat('et-EE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('et-EE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('et-EE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DASH = '—';
const fmtCount = (v) => (v == null ? DASH : nf0.format(v));
const fmtArea = (v) => (v == null ? DASH : `${nf1.format(v)} m²`);
const fmtEuro = (v) => (v == null ? DASH : `${nf0.format(v)} €`);
// Unit prices below 10 €/m² occur (symbolic deals), so keep cents for those
const fmtUnit = (v) => (v == null ? DASH : `${(Math.abs(v) < 10 ? nf2 : nf0).format(v)} €/m²`);

const sizeLabel = (key) =>
  key === TOTAL_KEY ? 'Kõik suurused' : (SIZE_RANGES.find((s) => s.key === key)?.label ?? key);
const shortCounty = (name) => name.replace(/ maakond$/, '');

// ---------- Metrics ----------

const METRICS = [
  {
    key: 'unitMedian',
    label: 'Ühiku hind mediaan',
    short: 'Mediaan €/m²',
    fmt: fmtUnit,
    primary: true,
    tip: 'Ühiku hind mediaan = mediaanhind €/m² tehingute lõikes. Pooled tehingud on sellest odavamad ja pooled kallimad, seega mõjutavad erandlikud tehingud seda vähe.',
  },
  {
    key: 'unitMean',
    label: 'Ühiku hind keskmine',
    short: 'Keskmine €/m²',
    fmt: fmtUnit,
    tip: 'Ühiku hind keskmine = tehingute ruutmeetrihindade aritmeetiline keskmine (€/m²). Üksikud väga kallid või odavad tehingud mõjutavad seda rohkem kui mediaani.',
  },
  {
    key: 'count',
    label: 'Tehingute arv',
    short: 'Arv',
    fmt: fmtCount,
    tip: 'Arv = korteriomandite tehingute arv valitud maakonnas ja pindalavahemikus vaadeldava perioodi jooksul.',
  },
  {
    key: 'avgArea',
    label: 'Pindala keskmine',
    short: 'Pindala kesk.',
    fmt: fmtArea,
    tip: 'Pindala keskmine = tehingutes müüdud korterite keskmine pindala ruutmeetrites.',
  },
  {
    key: 'sumTotal',
    label: 'Tehingute summa kokku',
    short: 'Summa kokku',
    fmt: fmtEuro,
    tip: 'Tehingu summa kokku = kõigi valiku tehingute summa eurodes.',
  },
  {
    key: 'sumMin',
    label: 'Tehingu summa min',
    short: 'Summa min',
    fmt: fmtEuro,
    tip: 'Tehingu summa min = väikseim üksiku tehingu summa eurodes.',
  },
  {
    key: 'sumMax',
    label: 'Tehingu summa max',
    short: 'Summa max',
    fmt: fmtEuro,
    tip: 'Tehingu summa max = suurim üksiku tehingu summa eurodes.',
  },
  {
    key: 'unitMin',
    label: 'Ühiku hind min',
    short: 'Min €/m²',
    fmt: fmtUnit,
    tip: 'Ühiku hind min = madalaim ruutmeetri hind (€/m²) üksikute tehingute seas.',
  },
  {
    key: 'unitMax',
    label: 'Ühiku hind max',
    short: 'Max €/m²',
    fmt: fmtUnit,
    tip: 'Ühiku hind max = kõrgeim ruutmeetri hind (€/m²) üksikute tehingute seas.',
  },
  {
    key: 'unitStd',
    label: 'Ühiku hind standardhälve',
    short: 'Std €/m²',
    fmt: fmtUnit,
    tip: 'Ühiku hind standardhälve = näitab, kui palju ruutmeetrihinnad keskmisest hajuvad. Suurem väärtus tähendab ebaühtlasemat hinnataset.',
  },
];

// Extra explanation when several counties are combined into one figure
const AGGREGATE_NOTES = {
  unitMedian: 'Mitme maakonna koondmediaani ei saa avaldatud andmetest arvutada – vaata maakondade võrdlust.',
  unitMean: 'Koondis on maakondade keskmiste tehingute arvuga kaalutud keskmine.',
  avgArea: 'Koondis on tehingute arvuga kaalutud keskmine.',
  unitStd: 'Koondis on maakondade andmetest arvutatud ühendatud standardhälve.',
};

// ---------- Selection ----------

const activeSizeKey = () => (state.size === 'all' ? TOTAL_KEY : state.size);
const inCounty = (r) => state.county === 'all' || r.county === state.county;
const keep = (r) => !(state.hideIncomplete && r.incomplete);

// Size-range rows that make up the current selection (never the KOKKU rows)
function componentRows() {
  return data.rows.filter(
    (r) => !r.isTotal && inCounty(r) && (state.size === 'all' || r.size === state.size),
  );
}

function summary() {
  const rows = data.rows.filter((r) => r.size === activeSizeKey() && inCounty(r)).filter(keep);
  if (state.county !== 'all') return rows[0] ?? null;
  return rows.length ? aggregate(rows) : null;
}

// Counties ranked by median €/m² in the active size range
function ranking() {
  const rows = data.rows.filter((r) => r.size === activeSizeKey()).filter(keep);
  const ranked = rows.filter((r) => r.unitMedian != null).sort((a, b) => b.unitMedian - a.unitMedian);
  const unranked = rows.filter((r) => r.unitMedian == null);
  return { ranked, unranked };
}

// ---------- DOM helpers ----------

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const infoButton = (label, tip) =>
  `<button type="button" class="info" data-tip="${escapeHtml(tip)}" aria-label="Selgitus: ${escapeHtml(label)}" aria-expanded="false">i</button>`;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function animateIn(el) {
  if (reduceMotion.matches || !el.animate) return;
  el.animate(
    [
      { opacity: 0.35, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
}

// ---------- Filters ----------

function initFilters() {
  const countySelect = $('county-select');
  countySelect.innerHTML =
    `<option value="all">Kõik maakonnad</option>` +
    data.counties.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  const sizeSelect = $('size-select');
  sizeSelect.innerHTML =
    `<option value="all">Kõik suurused</option>` +
    SIZE_RANGES.map((s) => `<option value="${s.key}">${s.label}</option>`).join('');

  countySelect.addEventListener('change', () => {
    state.county = countySelect.value;
    render();
  });
  sizeSelect.addEventListener('change', () => {
    state.size = sizeSelect.value;
    render();
  });
  $('hide-incomplete').addEventListener('change', (e) => {
    state.hideIncomplete = e.target.checked;
    render();
  });
  $('filters').addEventListener('submit', (e) => e.preventDefault());
}

// ---------- Notices ----------

function renderNotices() {
  const notices = [];
  const parts = componentRows();
  const incomplete = parts.filter((r) => r.incomplete);
  const describe = (r) => `${state.county === 'all' ? shortCounty(r.county) + ' ' : ''}${sizeLabel(r.size)}`;

  if (incomplete.length && !state.hideIncomplete) {
    const list = incomplete.map(describe).join(', ');
    const effect =
      state.county !== 'all' && state.size !== 'all'
        ? 'Selle rea hinnanäitajad puuduvad.'
        : 'Hinnanäitajad on mittetäielike ridadeta, tehingute arv sisaldab neid.';
    notices.push({
      type: 'warn',
      icon: '!',
      html: `<strong>Valik sisaldab mittetäielikke andmeid (${incomplete.length} ${incomplete.length === 1 ? 'rida' : 'rida'}):</strong> ${escapeHtml(list)}. Allikas ei avalda väikese tehingute arvu korral summasid ja hindu (***). ${effect}`,
    });
  } else if (incomplete.length && state.hideIncomplete) {
    const totalsNote =
      state.size === 'all'
        ? ' Maakondade KOKKU-read sisaldavad siiski ka peidetud ridade tehinguid.'
        : '';
    notices.push({
      type: 'info',
      icon: 'i',
      html: `<strong>${incomplete.length} mittetäielik${incomplete.length === 1 ? '' : 'ku'} rida on peidetud:</strong> ${escapeHtml(incomplete.map(describe).join(', '))}.${totalsNote}`,
    });
  }

  if (state.county !== 'all' && state.size !== 'all' && parts.length === 0) {
    notices.push({
      type: 'info',
      icon: 'i',
      html: `<strong>Tehinguid ei olnud:</strong> ${escapeHtml(state.county)} – ${escapeHtml(sizeLabel(state.size))} kohta andmestikus rida puudub.`,
    });
  }

  $('notices').innerHTML = notices
    .map(
      (n) =>
        `<div class="notice notice-${n.type}" role="${n.type === 'warn' ? 'alert' : 'status'}"><span class="notice-icon" aria-hidden="true">${n.icon}</span><div>${n.html}</div></div>`,
    )
    .join('');
}

// ---------- Highlights ----------

function renderHighlights() {
  const { ranked, unranked } = ranking();
  const el = $('highlights');
  const scope = `mediaan, ${sizeLabel(activeSizeKey()).toLowerCase()}`;
  const medianTip = METRICS[0].tip;

  if (!ranked.length) {
    el.innerHTML = `<div class="empty-state">Valitud pindalavahemiku kohta pole võrreldavaid mediaanhindu.</div>`;
    return;
  }

  const top = ranked[0];
  const low = ranked[ranked.length - 1];
  const skipped = unranked.length
    ? ` · ${unranked.length} maakond${unranked.length === 1 ? '' : 'a'} andmeteta`
    : '';

  const card = (cls, label, row, meta) => `
    <article class="highlight ${cls}">
      <p class="highlight-label">${label} ${infoButton(label, medianTip)}</p>
      <p class="highlight-name">${escapeHtml(row.county)}</p>
      <p class="highlight-value">${fmtUnit(row.unitMedian)}</p>
      <p class="highlight-meta">${meta}</p>
    </article>`;

  let html =
    card('is-top', 'Kalleim maakond', top, `${scope} · ${fmtCount(top.count)} tehingut`) +
    card('is-cheap', 'Soodsaim maakond', low, `${scope} · ${fmtCount(low.count)} tehingut${skipped}`);

  if (state.county !== 'all') {
    const pos = ranked.findIndex((r) => r.county === state.county);
    const value = pos === -1 ? 'Pole järjestatud' : `${pos + 1}. koht ${ranked.length}-st`;
    const meta =
      pos === -1
        ? 'Mediaanhind selles vahemikus puudub'
        : `${fmtUnit(ranked[pos].unitMedian)} · ${Math.round((ranked[pos].unitMedian / top.unitMedian) * 100)}% kalleimast`;
    html += `
      <article class="highlight is-rank">
        <p class="highlight-label">Valitud maakond</p>
        <p class="highlight-name">${escapeHtml(state.county)}</p>
        <p class="highlight-value">${value}</p>
        <p class="highlight-meta">${meta}</p>
      </article>`;
  }

  el.innerHTML = html;
  el.querySelectorAll('.highlight').forEach(animateIn);
}

// ---------- KPIs ----------

function renderKpis() {
  const s = summary();
  const countyLabel = state.county === 'all' ? 'Kõik maakonnad' : state.county;
  $('kpi-sub').textContent = `${countyLabel} · ${sizeLabel(activeSizeKey())}`;

  if (!s) {
    $('kpis').innerHTML = `<div class="empty-state">Selle valiku kohta andmed puuduvad.</div>`;
    return;
  }

  $('kpis').innerHTML = METRICS.map((m) => {
    const aggNote = s.aggregated ? AGGREGATE_NOTES[m.key] : null;
    const tip = aggNote ? `${m.tip} ${aggNote}` : m.tip;
    let note = '';
    if (s.aggregated && m.key === 'unitMedian') note = 'koondis puudub';
    else if (s.aggregated && (m.key === 'unitMean' || m.key === 'avgArea')) note = 'kaalutud keskmine';
    else if (s.aggregated && m.key === 'unitStd') note = 'ühendatud';
    else if (s[m.key] == null && s.incomplete) note = 'allikas ei avalda';
    return `
      <div class="kpi${m.primary ? ' is-primary' : ''}">
        <p class="kpi-label">${m.label} ${infoButton(m.label, tip)}</p>
        <p class="kpi-value">${m.fmt(s[m.key])}</p>
        ${note ? `<p class="kpi-note">${note}</p>` : ''}
      </div>`;
  }).join('');
  $('kpis').querySelectorAll('.kpi-value').forEach(animateIn);
}

// ---------- Charts ----------

const COLORS = {
  bar: '#9cc0ec',
  barStrong: '#1d4ed8',
  mean: '#eb6834',
  grid: '#eef2f7',
  axis: '#6b7a90',
  text: '#0f1b2d',
};

Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.font.size = 12;
Chart.defaults.color = COLORS.axis;
Chart.defaults.animation.duration = 450;
Chart.defaults.animation.easing = 'easeOutCubic';
Chart.defaults.plugins.tooltip.backgroundColor = '#0f1b2d';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.boxHeight = 12;
Chart.defaults.plugins.legend.labels.color = COLORS.text;
if (reduceMotion.matches) Chart.defaults.animation = false;

const valueScale = (title) => ({
  beginAtZero: true,
  grid: { color: COLORS.grid },
  border: { display: false },
  ticks: { callback: (v) => nf0.format(v) },
  title: { display: true, text: title, color: COLORS.axis },
});

const categoryScale = { grid: { display: false }, border: { color: '#d5dde8' } };

let rankChart;
let sizeChart;
let countChart;

function createCharts() {
  rankChart = new Chart($('rank-chart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Mediaan €/m²', data: [], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 }] },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: { padding: { left: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Mediaan: ${fmtUnit(ctx.raw)}`,
            afterLabel: (ctx) => ` Tehinguid: ${fmtCount(rankChart.$rows[ctx.dataIndex].count)}`,
          },
        },
      },
      scales: { x: valueScale('€/m²'), y: { ...categoryScale, ticks: { color: COLORS.text, autoSkip: false } } },
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const row = rankChart.$rows[elements[0].index];
        state.county = state.county === row.county ? 'all' : row.county;
        $('county-select').value = state.county;
        render();
      },
      onHover: (e, elements) => {
        e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    },
  });

  sizeChart = new Chart($('size-chart'), {
    type: 'bar',
    data: {
      labels: SIZE_RANGES.map((s) => s.label),
      datasets: [
        { type: 'bar', label: 'Mediaan', data: [], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 48, order: 2 },
        {
          type: 'line',
          label: 'Keskmine',
          data: [],
          borderColor: COLORS.mean,
          backgroundColor: COLORS.mean,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          spanGaps: false,
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtUnit(ctx.raw)}` } },
      },
      scales: { x: categoryScale, y: valueScale('€/m²') },
    },
  });

  countChart = new Chart($('count-chart'), {
    type: 'bar',
    data: {
      labels: SIZE_RANGES.map((s) => s.label),
      datasets: [{ label: 'Tehinguid', data: [], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 48 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Tehinguid: ${fmtCount(ctx.raw)}`,
            afterLabel: (ctx) => {
              const share = countChart.$total ? (ctx.raw / countChart.$total) * 100 : 0;
              return ` Osakaal: ${nf1.format(share)}%`;
            },
          },
        },
      },
      scales: { x: categoryScale, y: valueScale('Tehingute arv') },
    },
  });
}

// Per-size rows for the chosen county, or all counties combined
function rowsBySize() {
  return SIZE_RANGES.map((s) => {
    const rows = data.rows.filter((r) => r.size === s.key && inCounty(r)).filter(keep);
    if (!rows.length) return null;
    return state.county === 'all' ? aggregate(rows) : rows[0];
  });
}

function renderCharts() {
  const { ranked, unranked } = ranking();
  const rows = [...ranked, ...(state.hideIncomplete ? [] : unranked)];
  const top = ranked[0]?.county;
  const low = ranked[ranked.length - 1]?.county;
  rankChart.$rows = rows;
  rankChart.data.labels = rows.map((r) => {
    let name = shortCounty(r.county);
    if (r.county === top) name = `▲ ${name}`;
    else if (r.county === low) name = `▼ ${name}`;
    if (r.unitMedian == null) name += ' (***)';
    return name;
  });
  rankChart.data.datasets[0].data = rows.map((r) => r.unitMedian);
  rankChart.data.datasets[0].backgroundColor = rows.map((r) =>
    r.county === state.county ? COLORS.barStrong : COLORS.bar,
  );
  rankChart.data.datasets[0].hoverBackgroundColor = rows.map((r) =>
    r.county === state.county ? COLORS.barStrong : '#6fa0e3',
  );
  rankChart.update();
  $('rank-sub').textContent = `${sizeLabel(activeSizeKey())} · ▲ kalleim, ▼ soodsaim · klõpsa tulbal maakonna valimiseks`;
  $('rank-chart').setAttribute(
    'aria-label',
    `Maakonnad mediaanhinna järgi: ${ranked.map((r) => `${r.county} ${fmtUnit(r.unitMedian)}`).join(', ')}`,
  );

  const bySize = rowsBySize();
  const isAll = state.county === 'all';
  const highlight = (i) => state.size === 'all' || SIZE_RANGES[i].key === state.size;
  const barColors = SIZE_RANGES.map((_, i) => (highlight(i) ? COLORS.barStrong : COLORS.bar));

  // A combined median does not exist, so "all counties" shows only the weighted mean as bars
  const [barSet, meanSet] = sizeChart.data.datasets;
  barSet.data = bySize.map((r) => (isAll ? r?.unitMean : r?.unitMedian) ?? null);
  barSet.label = isAll ? 'Kaalutud keskmine' : 'Mediaan';
  barSet.backgroundColor = barColors;
  meanSet.data = bySize.map((r) => (isAll ? null : (r?.unitMean ?? null)));
  meanSet.hidden = isAll;
  sizeChart.options.plugins.legend.display = !isAll;
  sizeChart.update();
  $('size-sub').textContent = isAll
    ? 'Kõik maakonnad · tehingute arvuga kaalutud keskmine €/m²'
    : `${state.county} · mediaan ja keskmine €/m²`;

  countChart.data.datasets[0].data = bySize.map((r) => r?.count ?? null);
  countChart.data.datasets[0].backgroundColor = barColors;
  countChart.$total = bySize.reduce((sum, r) => sum + (r?.count ?? 0), 0);
  countChart.update();
  $('count-sub').textContent = `${isAll ? 'Kõik maakonnad' : state.county} · kokku ${fmtCount(countChart.$total)} tehingut`;
}

// ---------- Bubble map ----------

let updateMap;

// Transactions per county for the selected size range (size rows only, so hidden rows drop out)
function countyCounts() {
  return data.counties.map((county) => {
    const rows = data.rows
      .filter((r) => r.county === county && !r.isTotal && (state.size === 'all' || r.size === state.size))
      .filter(keep);
    const median = data.rows.find((r) => r.county === county && r.size === activeSizeKey())?.unitMedian ?? null;
    return { county, count: rows.reduce((s, r) => s + r.count, 0), median };
  });
}

// 1, 2 or 5 times a power of ten, not above v
function niceFloor(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

function renderMapLegend(max) {
  const legend = $('map-legend');
  const values = [...new Set([niceFloor(max), niceFloor(max / 5), niceFloor(max / 40)])].filter((v) => v >= 1);
  // Draw the legend at the same scale as the map, with text ~12px on screen
  const mapSvg = $('map').querySelector('svg');
  const scale = mapSvg?.getBoundingClientRect().width / 1000 || 1;
  const font = 12 / scale;
  const big = radiusFor(values[0], max);
  const base = big * 2 + font / 2;
  const textX = big * 2 + 18;
  const width = textX + font * 4.5;
  // Labels sit level with each circle's top, pushed apart when circles are close
  let labelY = -Infinity;
  legend.innerHTML = values
    .map((v) => {
      const r = radiusFor(v, max);
      const top = base - 2 * r;
      labelY = Math.max(top, labelY + font * 1.2);
      return `<circle cx="${big + 2}" cy="${base - r}" r="${r}"></circle><line x1="${big + 2}" x2="${textX - 4}" y1="${top}" y2="${labelY}"></line><text x="${textX}" y="${labelY + font / 3}" style="font-size:${font}px">${nf0.format(v)}</text>`;
    })
    .join('');
  const height = Math.max(base, labelY + font / 2) + 4;
  legend.setAttribute('viewBox', `0 0 ${width} ${height}`);
  legend.style.width = `${Math.round(width * scale)}px`;
}

function renderMap() {
  const items = countyCounts();
  const total = items.reduce((s, i) => s + i.count, 0);
  const max = Math.max(1, ...items.map((i) => i.count));
  updateMap.items = items;
  updateMap.total = total;
  updateMap(items, state.county, max);
  renderMapLegend(max);

  $('map-sub').textContent = `${sizeLabel(activeSizeKey())} · kokku ${fmtCount(total)} tehingut${
    state.hideIncomplete ? ' · mittetäielikud read välja jäetud' : ''
  }`;

  const top = [...items].sort((a, b) => b.count - a.count).slice(0, 5);
  $('map-top').innerHTML = top
    .map((i) => {
      const share = total ? (i.count / total) * 100 : 0;
      return `<li><span>${escapeHtml(shortCounty(i.county))}</span><span><strong>${fmtCount(i.count)}</strong> <span class="share">${nf1.format(share)}%</span></span><span class="bar"><span style="width:${(i.count / max) * 100}%"></span></span></li>`;
    })
    .join('');
}

function initMap() {
  updateMap = createBubbleMap($('map'), {
    onSelect: (county) => {
      hideTooltip();
      state.county = state.county === county ? 'all' : county;
      $('county-select').value = state.county;
      render();
    },
    describe: (county) => {
      const item = updateMap.items.find((i) => i.county === county);
      const share = updateMap.total ? (item.count / updateMap.total) * 100 : 0;
      return [
        county,
        `Tehinguid: ${fmtCount(item.count)} (${nf1.format(share)}% valikust)`,
        `Mediaan: ${fmtUnit(item.median)}`,
        sizeLabel(activeSizeKey()),
      ].join('\n');
    },
    showTip: placeTooltip,
    hideTip: hideTooltip,
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderMap, 150);
  });
}

// ---------- Table ----------

const TABLE_COLUMNS = [
  { key: 'county', label: 'Maakond', text: true },
  { key: 'size', label: 'Pindala', text: true },
  ...['count', 'avgArea', 'sumTotal', 'sumMin', 'sumMax', 'unitMin', 'unitMax', 'unitMedian', 'unitMean', 'unitStd'].map(
    (k) => METRICS.find((m) => m.key === k),
  ),
];

const SORT_VALUE = {
  county: (r) => r.county,
  size: (r) => SIZE_RANGES.findIndex((s) => s.key === r.size),
};

function renderTableHead() {
  $('data-table').querySelector('thead').innerHTML = `<tr>${TABLE_COLUMNS.map((c) => {
    const active = state.sort?.key === c.key;
    const mark = active ? (state.sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    const aria = active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const label = c.short ?? c.label;
    const info = c.tip ? infoButton(c.label, c.tip) : '';
    return `<th scope="col" aria-sort="${aria}"><span class="th-inner"><button type="button" class="sort" data-sort="${c.key}">${label}<span class="sort-mark">${mark}</span></button>${info}</span></th>`;
  }).join('')}</tr>`;
}

function renderTable() {
  const { ranked } = ranking();
  const top = ranked[0]?.county;
  const low = ranked[ranked.length - 1]?.county;

  let rows = data.rows.filter(inCounty).filter(keep);
  if (state.size !== 'all') rows = rows.filter((r) => r.size === state.size);

  if (state.sort) {
    // Totals would mix with size ranges in a sorted list, so leave them out
    const { key, dir } = state.sort;
    const get = SORT_VALUE[key] ?? ((r) => r[key]);
    const sign = dir === 'asc' ? 1 : -1;
    rows = rows
      .filter((r) => !r.isTotal)
      .sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === 'string' ? va.localeCompare(vb, 'et') : va - vb) * sign;
      });
  }

  renderTableHead();
  const body = $('data-table').querySelector('tbody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}" style="text-align:center;color:var(--text-muted)">Selle valiku kohta ridu pole.</td></tr>`;
  } else {
    body.innerHTML = rows
      .map((r) => {
        const isRankedRow = r.size === activeSizeKey();
        let tags = '';
        if (isRankedRow && r.county === top) tags += '<span class="tag tag-top">kalleim</span>';
        if (isRankedRow && r.county === low) tags += '<span class="tag tag-low">soodsaim</span>';
        if (r.incomplete) tags += '<span class="tag tag-warn" title="Allikas ei avalda selle rea summasid ja hindu">***</span>';
        const cells = TABLE_COLUMNS.map((c) => {
          if (c.key === 'county') return `<td>${escapeHtml(r.county)}${tags}</td>`;
          if (c.key === 'size') return `<td>${escapeHtml(sizeLabel(r.size))}</td>`;
          const v = r[c.key];
          const cls = [v == null ? 'is-hidden-value' : '', c.key === 'unitMedian' ? 'is-median' : '']
            .filter(Boolean)
            .join(' ');
          return `<td${cls ? ` class="${cls}"` : ''}>${v == null ? '***' : c.fmt(v)}</td>`;
        });
        const cls = [r.isTotal ? 'is-total' : '', r.incomplete ? 'is-incomplete' : ''].filter(Boolean).join(' ');
        return `<tr${cls ? ` class="${cls}"` : ''}>${cells.join('')}</tr>`;
      })
      .join('');
  }

  const sortNote = state.sort ? ' · sorteeritud, KOKKU-read peidetud' : ' · klõpsa veeru pealkirjal sorteerimiseks';
  $('table-sub').textContent = `${rows.length} rida${sortNote}`;
}

function initTableSort() {
  $('data-table').querySelector('thead').addEventListener('click', (e) => {
    const btn = e.target.closest('button.sort');
    if (!btn) return;
    const key = btn.dataset.sort;
    const textCol = key === 'county' || key === 'size';
    if (state.sort?.key !== key) state.sort = { key, dir: textCol ? 'asc' : 'desc' };
    else if (state.sort.dir === (textCol ? 'asc' : 'desc')) state.sort = { key, dir: textCol ? 'desc' : 'asc' };
    else state.sort = null;
    renderTable();
    $('data-table').querySelector(`button.sort[data-sort="${key}"]`)?.focus();
  });
}

// ---------- Info tooltips ----------

// Shows the shared tooltip above (or below) a rectangle, kept inside the viewport
function placeTooltip(r, text) {
  const tip = $('tooltip');
  tip.textContent = text;
  tip.hidden = false;
  const t = tip.getBoundingClientRect();
  const margin = 16;
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - t.width - margin));
  let top = r.top - t.height - 8;
  if (top < margin) top = r.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

const hideTooltip = () => {
  $('tooltip').hidden = true;
};

function initTooltips() {
  let current = null;

  const show = (btn) => {
    if (current && current !== btn) current.setAttribute('aria-expanded', 'false');
    current = btn;
    btn.setAttribute('aria-expanded', 'true');
    placeTooltip(btn.getBoundingClientRect(), btn.dataset.tip);
  };
  const hide = () => {
    current?.setAttribute('aria-expanded', 'false');
    current = null;
    hideTooltip();
  };

  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest?.('.info');
    if (btn) show(btn);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('.info') && !e.relatedTarget?.closest?.('.info')) hide();
  });
  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.('.info')) show(e.target);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.matches?.('.info')) hide();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.info');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      if (current === btn && !btn.matches(':hover')) hide();
      else show(btn);
    } else if (current) {
      hide();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
}

// ---------- Header & footer ----------

function renderStatic() {
  $('period').textContent = data.period
    ? `Tehingud ajavahemikul ${data.period} · ${data.counties.length} maakonda`
    : `${data.counties.length} maakonda`;
  $('footer').innerHTML = [
    data.source ? `<p>Allikas: ${escapeHtml(data.source)}</p>` : '',
    ...data.notes.map((n) => `<p>${escapeHtml(n)}</p>`),
    '<p>*** – allikas ei avalda selle rea summasid ja hindu.</p>',
    '<p id="data-source">Andmed: CSV-fail</p>',
  ].join('');
}

// Swaps in the rows from the server's database; the embedded CSV stays as fallback
async function loadFromDatabase() {
  if (location.protocol === 'file:') return;
  try {
    const res = await fetch('/api/transactions', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { rows } = await res.json();
    if (!rows?.length) throw new Error('andmebaas on tühi');
    data.rows = rows.map(finalizeRow);
    data.counties = [...new Set(data.rows.map((r) => r.county))];
    const countySelect = $('county-select');
    const selected = countySelect.value;
    countySelect.innerHTML =
      `<option value="all">Kõik maakonnad</option>` +
      data.counties.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    countySelect.value = data.counties.includes(selected) ? selected : 'all';
    state.county = countySelect.value;
    $('data-source').textContent = 'Andmed: PostgreSQL andmebaas';
    render();
  } catch (err) {
    console.warn('Andmebaasi andmed pole kättesaadavad, kasutan CSV-faili:', err);
  }
}

// ---------- Render ----------

function render() {
  renderNotices();
  renderHighlights();
  renderKpis();
  renderMap();
  renderCharts();
  renderTable();
}

renderStatic();
initFilters();
initTooltips();
initTableSort();
initMap();
createCharts();
render();
loadFromDatabase();
