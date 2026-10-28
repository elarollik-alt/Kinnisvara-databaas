// Production server for Railway: serves the single-file build from dist/ and,
// when DATABASE_URL is set, the transaction rows from the Render PostgreSQL database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from './src/data.js';

const port = Number(process.env.PORT) || 3000;
const fromRoot = (p) => fileURLToPath(new URL(p, import.meta.url));
const html = await readFile(fromRoot('./dist/index.html'));

const prisma = process.env.DATABASE_URL ? new PrismaClient() : null;
let dbReady = false;
let dbError = prisma ? 'starting' : 'DATABASE_URL is not set';

// Applies pending migrations, then loads the CSV into an empty table
async function initDatabase() {
  await promisify(execFile)(process.execPath, [fromRoot('./node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: process.env,
  });

  if ((await prisma.transaction.count()) === 0) {
    const { rows } = parseCsv(await readFile(fromRoot('./kinnisvara_hinnad_korteriomand.csv'), 'utf8'));
    const { count } = await prisma.transaction.createMany({
      data: rows.map((r) => ({
        county: r.county,
        sizeRange: r.size,
        count: r.count,
        avgArea: r.avgArea,
        sumTotal: r.sumTotal,
        sumMin: r.sumMin,
        sumMax: r.sumMax,
        unitMin: r.unitMin,
        unitMax: r.unitMax,
        unitMedian: r.unitMedian,
        unitMean: r.unitMean,
        unitStd: r.unitStd,
      })),
      skipDuplicates: true,
    });
    console.log(`Seeded ${count} rows from CSV`);
  }
}

if (prisma) {
  initDatabase()
    .then(() => {
      dbReady = true;
      dbError = null;
      console.log('Database ready');
    })
    .catch((err) => {
      dbError = err.message;
      console.error('Database setup failed, serving CSV data only:', err);
    });
} else {
  console.warn('DATABASE_URL is not set, serving CSV data only');
}

async function transactionsJson() {
  const rows = await prisma.transaction.findMany({ orderBy: { id: 'asc' } });
  return JSON.stringify({
    source: 'database',
    rows: rows.map(({ id, createdAt, sizeRange, ...r }) => ({ ...r, size: sizeRange })),
  });
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (path === '/health') {
    send(res, 200, JSON.stringify({ ok: true, database: dbReady ? 'connected' : dbError }), 'application/json');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  if (path === '/api/transactions') {
    if (!dbReady) {
      send(res, 503, JSON.stringify({ error: 'Database unavailable' }), 'application/json');
      return;
    }
    try {
      send(res, 200, await transactionsJson(), 'application/json');
    } catch (err) {
      console.error('Query failed:', err);
      send(res, 500, JSON.stringify({ error: 'Query failed' }), 'application/json');
    }
    return;
  }
  send(res, 200, req.method === 'HEAD' ? undefined : html, 'text/html; charset=utf-8');
}).listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});

const shutdown = async () => {
  await prisma?.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
