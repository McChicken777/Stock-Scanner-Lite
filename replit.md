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
- **Authentication**: Session-based login with bcrypt password hashing; default admin: `admin`/`admin123`
- **User Roles**: `admin` (full access) and `worker` (stock operations only, no product management)
- **Role-Based Access**: Backend middleware enforces permissions; frontend hides admin-only UI
- **User Management**: Admin-only page at `/admin/users` to create/delete users and assign roles
- **QR Code Scanning**: Browser camera API + jsQR to scan location QR codes
- **Location Management**: Locations with IDs like A1-01-02
- **Product Management**: CRUD with category, buffer stock, alert email (admin only)
- **Stock Management**: Per-location quantities, add/remove/set with history (all users)
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

### Auth Routes
- `POST /api/auth/login` — login with username + password
- `POST /api/auth/logout` — clear session
- `GET /api/auth/me` — get current user info
- `GET /api/auth/users` — list users (admin only)
- `POST /api/auth/users` — create user (admin only)
- `DELETE /api/auth/users/:id` — delete user (admin only)

### Database Schema
- `locations` — id (text PK), description, created_at
- `products` — id (serial), name, category, buffer_stock, alert_email, created_at
- `stock` — (location_id, product_id) composite PK, quantity
- `stock_history` — id (serial), location_id, product_id, previous_quantity, new_quantity, delta, changed_by, changed_at
- `users` — id (serial), username (unique), password_hash, role (admin|worker), created_at

### Permissions
- **Admin**: full CRUD on products, locations, stock, users, work projects, templates
- **Worker**: can view and update stock, scan QR codes, view history and dashboard, view/start/stop work order procedures; cannot manage products or users

### Work Orders Module
- **Templates**: admin-configurable item blueprints with predefined procedures (Welding, Painting, CNC, etc.); each procedure can optionally have `requiresInbound` flag
- **Projects**: work orders with name, deadline, priority, status, RAL paint color, `requiresExternalParts` flag. Created by copying templates.
- **Items**: project items (copied from templates), each with procedures, per-item paint color override
- **Procedures**: individual tasks with start/stop timer, status tracking (not_started/in_progress/completed); procedures with `requiresInbound=true` are blocked until inbound status is arrived/stored/in_production
- **Progress**: item progress = completed procedures / total; project progress = total across all items
- **Urgency**: < 2 days = red (critical), < 5 days = orange (warning), else green
- **Timer**: one active timer per user at a time; server enforces this
- **Inbound Banner**: project detail shows linked inbound status and blocks procedures if parts not yet arrived

### Inbound Module (workflow, not inventory tracking)
- **Purpose**: track pallet arrivals for projects that require external parts
- **Auto-creation**: creating a project with `requiresExternalParts=true` auto-creates an inbound record (status="expected")
- **Arrival Flow**: any user can "Unload Pallet" → changes status to "arrived", stamps receivedAt
- **Routing Flow** (admin): arrived pallets can be routed to "Store" (select location → status=stored) or "Production" (enter procedure → status=in_production)
- **Procedure Blocking**: if a procedure has `requiresInbound=true` and the project's inbound is still "expected", the Start button is disabled with "Waiting" label both in UI and enforced server-side
- **Manual Records**: admins can create inbound records not linked to a project (standalone pallets)
- **Role**: all users can view and Unload; only admins can Route and Delete

### Work Order DB Tables
- `work_templates` — id, name, company_id, created_at
- `work_template_procedures` — id, template_id, name, sort_order, requires_inbound (bool)
- `work_projects` — id, name, deadline, priority, status, paint_color, requires_external_parts (bool), company_id, created_at
- `work_project_items` — id, project_id, name, paint_color, sort_order
- `work_item_procedures` — id, item_id, name, status, sort_order, total_time_seconds, requires_inbound (bool)
- `work_time_logs` — id, procedure_id, user_id, start_time, end_time, duration_seconds
- `inbound` — id, project_id (nullable FK), status (expected/arrived/stored/in_production), location_id (nullable FK), assigned_procedure, received_at, notes, company_id, created_at

### Item Type System
Three distinct item types replacing the old purchase/production binary:
- **`purchased_part`** — sourced from suppliers; has supplier fields (supplierId, supplierProductName, supplierSku); stock tracked
- **`manufactured_part`** — produced in-house as sub-components; no supplier fields; auto-created when a work template is created
- **`final_product`** — finished goods; no supplier fields; stock tracked

Old enum values `purchase` and `production` still exist in DB for backward compat; frontend normalises them on load.
`category` column kept in DB but no longer required in forms (defaults to "").

### Flexible Tasks System
- **Roles**: Company-scoped production roles (Welding, CNC, Sandblasting, etc.). Users can have multiple roles with priority (primary/secondary/substitution).
- **Procedures**: Admin-defined production procedures assigned to a role. Each has two blocking flags:
  - `requires_inbound` — blocked until linked inbound pallet arrives
  - `requires_components` — blocked until all procedure_inputs stock is available
- **Item Procedures**: Link procedures to project items. Each item can have different procedures in different orders.
- **Tasks**: Generated when project is created. Each task = (item, procedure) pair with status tracking.
- **Task Flow**: User sees only tasks for their assigned roles, sorted by role priority (primary first).
- **Ready/Blocked Status**: Each task computes READY or BLOCKED status:
  - **READY**: all previous procedures completed AND (requires_components=false OR all component stock satisfied)
  - **BLOCKED**: waiting for previous procedures OR missing component stock (shows reason)
- **Procedure Inputs**: Define what each procedure needs (purchased_part or manufactured_part items)
  - `purchased_part`: blocks task if stock < required quantity
  - `manufactured_part`: blocks task if related production task not completed
- **Inbound Block**: If procedure.requires_inbound = true, task is blocked until inbound status != "expected".

### Inbound Updates
- Routing to Production now uses a **procedure dropdown** (from company procedures list) instead of free text
- `procedure_id` FK column added to inbound table; `assigned_procedure` text kept for display fallback
- Create dialog now shows a **work order (project) selector** to link the inbound record

### Template Auto-Product
- Creating a work template now automatically creates a matching `manufactured_part` product
- `work_templates.product_id` FK links template to its product
- This allows stock tracking for in-house manufactured items

### Tasks DB Tables
- `roles` — id, name, company_id, created_at
- `user_roles` — user_id, role_id, priority (primary/secondary/substitution)
- `procedures` — id, name, role_id (FK), order_index, requires_inbound (bool), requires_components (bool), company_id, created_at
- `item_procedures` — item_id, procedure_id, order_index, company_id
- `tasks` — id, project_id, item_id, procedure_id, status (not_started/in_progress/completed), company_id, created_at
- `procedure_inputs` — id, procedure_id, item_id (FK to products), quantity_required, company_id, created_at
- `inbound` — now has `procedure_id` integer FK to procedures

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
- `/work/projects` — Work orders project list
- `/work/projects/new` — Create work order (with requiresExternalParts toggle)
- `/work/projects/:id` — Project detail with items + procedures + inbound status banner
- `/work/templates` — Item template management (admin); toggle requiresInbound per procedure
- `/work/inbound` — Inbound pallet management (Expected / Arrived / Stored+InProduction)

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
