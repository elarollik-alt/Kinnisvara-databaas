// Parses the Maa- ja Ruumiamet CSV export of apartment ownership transactions.

export const SIZE_RANGES = [
  { key: '10-29,99', label: '10–29,99 m²' },
  { key: '30-40,99', label: '30–40,99 m²' },
  { key: '41-54,99', label: '41–54,99 m²' },
  { key: '55-69,99', label: '55–69,99 m²' },
  { key: '70-249,99', label: '70–249,99 m²' },
];

export const TOTAL_KEY = 'KOKKU';

const FIELDS = [
  'count',
  'avgArea',
  'sumTotal',
  'sumMin',
  'sumMax',
  'unitMin',
  'unitMax',
  'unitMedian',
  'unitMean',
  'unitStd',
];

// "1 234,56" -> 1234.56; "***" (hidden by the source) -> null
function parseNumber(raw) {
  const s = (raw ?? '').trim();
  if (s === '' || s.includes('*')) return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Adds the derived flags to a row that has county, size and the metric fields
export function finalizeRow(row) {
  return {
    ...row,
    isTotal: row.size === TOTAL_KEY,
    incomplete: FIELDS.some((f) => row[f] === null || row[f] === undefined),
  };
}

export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith('Piirkond;'));
  if (headerIdx === -1) throw new Error('CSV päist ei leitud');

  const periodMatch = lines
    .slice(0, headerIdx)
    .map((l) => l.match(/ajavahemikul\s+(.+?)\s*$/))
    .find(Boolean);
  const rows = [];
  let county = null;
  let i = headerIdx + 1;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(';')) break;
    const cells = line.split(';');
    if (cells[0].trim()) county = cells[0].trim();
    const size = cells[1].trim();
    const row = { county, size };
    FIELDS.forEach((field, idx) => {
      row[field] = parseNumber(cells[idx + 2]);
    });
    rows.push(finalizeRow(row));
  }

  const notes = lines
    .slice(i)
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    rows,
    counties: [...new Set(rows.map((r) => r.county))],
    period: periodMatch ? periodMatch[1] : null,
    source: notes.find((n) => n.startsWith('Allikas:'))?.replace('Allikas:', '').trim() ?? null,
    notes: notes.filter((n) => !n.startsWith('Allikas:') && n !== 'Märkused:'),
  };
}

// Combines several rows (e.g. one size range across all counties) into one.
// Count includes every row; price metrics use complete rows only. The median
// cannot be derived from group medians, so it is left empty.
export function aggregate(rows) {
  const complete = rows.filter((r) => !r.incomplete);
  const n = complete.reduce((s, r) => s + r.count, 0);
  const weighted = (f) => (n ? complete.reduce((s, r) => s + r[f] * r.count, 0) / n : null);
  const mean = weighted('unitMean');
  // Pooled standard deviation of all transactions from group means and deviations
  const pooledVar = n
    ? complete.reduce((s, r) => s + r.count * (r.unitStd ** 2 + r.unitMean ** 2), 0) / n - mean ** 2
    : null;
  const minOf = (f) => (complete.length ? Math.min(...complete.map((r) => r[f])) : null);
  const maxOf = (f) => (complete.length ? Math.max(...complete.map((r) => r[f])) : null);

  return {
    count: rows.reduce((s, r) => s + (r.count ?? 0), 0),
    avgArea: weighted('avgArea'),
    sumTotal: complete.length ? complete.reduce((s, r) => s + r.sumTotal, 0) : null,
    sumMin: minOf('sumMin'),
    sumMax: maxOf('sumMax'),
    unitMin: minOf('unitMin'),
    unitMax: maxOf('unitMax'),
    unitMedian: null,
    unitMean: mean,
    unitStd: pooledVar !== null && pooledVar >= 0 ? Math.sqrt(pooledVar) : null,
    aggregated: true,
    excludedCount: rows.length - complete.length,
  };
}
