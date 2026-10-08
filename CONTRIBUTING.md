# Contributing to RelayPoint

Thanks for your interest in improving RelayPoint! This document covers
everything you need to get a development environment running and submit a
change.

## Development environment

### Prerequisites

- Node.js v22 or later
- Docker (for the local Postgres, MinIO, and Gotenberg services)

### Setup

1. Clone the repository and install dependencies:

   ```sh
   git clone https://github.com/willuhmjs/relaypoint.git
   cd relaypoint
   npm install
   ```

2. Create your environment file:

   ```sh
   cp .env.example .env
   ```

   Fill in at least `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
   and `AUTH_SECRET`. For local development you can enable the built-in
   email/password login by setting
   `PUBLIC_AUTH_PROVIDER_LOCAL_ENABLED="true"` instead of configuring an
   OAuth provider.

3. Start the backing services:

   ```sh
   docker compose up -d postgres s3 gotenberg
   ```

4. Apply database migrations and start the dev server (from the repository
   root):

   ```sh
   npx prisma migrate dev
   npm run dev
   ```

5. Promote your user to admin so you can access the dashboard admin pages:

   ```sh
   npx tsx scripts/promote-admin.ts
   ```

## The basics

- All `npm` / `npx` commands must be run from the repository root.
- Database schema changes go in `prisma/schema.prisma`. After changing it:
  ```sh
  npx prisma migrate dev --name <migration_name>
  npx prisma generate
  ```
- UI code uses **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — please
  follow that style in new components.
- Reusable UI primitives live in `src/lib/components/ui/` (shadcn-svelte).
  Prefer reusing them, and avoid hand-editing them unless you're intentionally
  updating a primitive.
- Shared option lists (e.g. slide transitions in
  `src/lib/transitions.ts`) should be data-driven — add new options to the
  central module rather than hardcoding them into components.
- Changes that affect display content or settings usually need a WebSocket
  broadcast so connected display clients update in real time. See
  `src/lib/server/webSocketHandler.ts`.

## Before opening a pull request

From the repository root:

```sh
npm run lint      # ESLint + Prettier
npm run check     # svelte-check type checking
npm run test      # Playwright end-to-end tests
```

All three must pass — CI runs the same commands.

## Pull requests

- Fork the repo and branch from `main` (`git checkout -b feature/my-feature`).
- Keep PRs focused; describe _what_ and _why_ in the description.
- Add or update tests when practical.
- Run `npm run format` if prettier complains about your changes.

## Reporting bugs / requesting features

Open a [GitHub issue](https://github.com/willuhmjs/relaypoint/issues). For
security issues, see [SECURITY.md](./SECURITY.md) instead.
