# Mapa Papin

A small web app to put stickers on a world map: take a photo, drop it on the map, done.

Built with TypeScript, Preact and MapLibre on Cloudflare Workers (D1 database, R2 file storage).

## Run it locally

Requires Node 22.

```bash
npm ci
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply stickermap --local
npm run dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Notes

- Deployment values (account ids, e-mails, access settings) are not stored in this repository; they are provided at deploy time.
- Backups and data are not stored here either.
