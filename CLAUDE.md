# CLAUDE.md

## Deployment

- This web app runs on Railway, not on the local computer.
- Railway deploys the app automatically from the `main` branch of this GitHub repo (`elarollik-alt/Kinnisvara-databaas`).

## Database

- The database is a Render PostgreSQL database.
- The app reaches it only through the `DATABASE_URL` environment variable set on Railway (Render's External Database URL, with `?sslmode=require`).
- Prisma 6 is the ORM: schema in `prisma/schema.prisma`, migrations in `prisma/migrations/`.
- There is no local database, so create new migrations offline with `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (or `--from-migrations`) and commit the SQL. On startup `server.js` runs `prisma migrate deploy`.

## Project structure

- Vite + vanilla JS + Chart.js. `npm run build` runs `prisma generate` and inlines everything (JS, CSS and the CSV data) into `dist/index.html`.
- `npm start` runs `server.js`, which serves `dist/index.html` on Railway's `PORT`, `GET /api/transactions` from the database and `GET /health`.
- On first start the server loads `kinnisvara_hinnad_korteriomand.csv` into the empty `transactions` table (parsed with `src/data.js`).
- The page renders the embedded CSV right away and swaps in the database rows when `/api/transactions` answers; without a database it keeps working on the CSV.
- To check the UI without a local server, open `dist/index.html` directly in a browser after building.

## Rules

- Do not set up a local database or a local server.
- Before every push, run `npm run build` to make sure the app builds.
- After each finished task, commit and push to GitHub so that Railway deploys the new version.
