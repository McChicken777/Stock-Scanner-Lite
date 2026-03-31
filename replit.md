# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, Radix UI, Wouter routing
- **Email**: Nodemailer (SMTP)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── warehouse/          # React + Vite frontend (mobile-first)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Application: Warehouse Stock Management

A mobile-first warehouse stock management system with QR code scanning.

### Features
- **QR Code Scanning**: Browser camera API + jsQR to scan location QR codes
- **Location Management**: Locations with IDs like A1-01-02
- **Product Management**: CRUD with category, buffer stock, alert email
- **Stock Management**: Per-location quantities, add/remove/set with history
- **Low Stock Alerts**: Automatic email via Nodemailer when stock < buffer
- **History Log**: Full audit trail of all stock changes
- **Dashboard**: Summary with low stock alerts, recent activity, category stats

### Email Configuration (optional)
Set these environment variables to enable email alerts:
- `SMTP_HOST` — SMTP server host (default: smtp.gmail.com)
- `SMTP_PORT` — SMTP port (default: 587)
- `SMTP_USER` — SMTP username/email
- `SMTP_PASS` — SMTP password or app password
- `SMTP_FROM` — From address (defaults to SMTP_USER)

### Routes
- `GET /api/locations` — list all locations
- `POST /api/locations` — create location
- `GET /api/locations/:id` — location with stock
- `DELETE /api/locations/:id` — delete location
- `GET /api/products` — list products with total stock
- `POST /api/products` — create product
- `PUT /api/products/:id` — update product
- `DELETE /api/products/:id` — delete product
- `GET /api/stock/:locationId` — stock at location
- `PUT /api/stock/:locationId/:productId` — update stock (quantity or delta)
- `GET /api/history` — change history (filterable)
- `GET /api/dashboard/summary` — dashboard overview

### Database Schema
- `locations` — id (text PK), description, created_at
- `products` — id (serial), name, category, buffer_stock, alert_email, created_at
- `stock` — (location_id, product_id) composite PK, quantity
- `stock_history` — id (serial), location_id, product_id, previous_quantity, new_quantity, delta, changed_by, changed_at

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/warehouse` (`@workspace/warehouse`)

React + Vite mobile-first frontend. Industrial warehouse theme (safety orange, dark slate).

Pages:
- `/` — Dashboard
- `/scan` — QR Scanner (camera + jsQR)
- `/location/:id` — Location stock view and update
- `/products` — Product management
- `/products/new` — Create product
- `/products/:id/edit` — Edit product
- `/history` — Change history
- `/locations` — Location management

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server serving all warehouse management endpoints.

- Entry: `src/index.ts`
- Routes: `src/routes/` — locations, products, stock, history, dashboard
- Email: `src/lib/email.ts` — Nodemailer low stock alerts
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: locations, products, stock, stock_history tables
- `pnpm --filter @workspace/db run push` — push schema changes
