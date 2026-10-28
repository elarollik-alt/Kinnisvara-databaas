# CLAUDE.md

## Deployment

- This web app runs on Railway, not on the local computer.
- Railway deploys the app automatically from the `main` branch of this GitHub repo (`elarollik-alt/Kinnisvara-databaas`).

## Database

- The database is a Railway PostgreSQL database.
- It is available only through the `DATABASE_URL` environment variable on Railway.

## Project structure

- Vite + vanilla JS + Chart.js. `npm run build` inlines everything (JS, CSS and the CSV data) into `dist/index.html`.
- `npm start` runs `server.js`, which serves `dist/index.html` on Railway's `PORT`.
- Data comes from `kinnisvara_hinnad_korteriomand.csv` (parsed in `src/data.js`); the app does not use the database yet.
- To check the UI without a local server, open `dist/index.html` directly in a browser after building.

## Rules

- Do not set up a local database or a local server.
- Before every push, run `npm run build` to make sure the app builds.
- After each finished task, commit and push to GitHub so that Railway deploys the new version.
