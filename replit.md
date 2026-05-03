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

A mobile-first warehouse stock management system with QR code scanning and work order management.

### Features
- **Authentication**: Session-based login with bcrypt password hashing; default admin: `admin`/`admin123`
- **User Roles**: `owner` (owner panel only), `admin` (full access), `worker` (stock & work tasks)
- **Supervisor Flag**: Workers can be granted supervisor access (`is_supervisor` boolean on users) — admins toggle via Manage Users page; supervisors see the Supervisor View menu item
- **Role-Based Access**: Backend middleware enforces permissions; frontend hides admin-only UI
- **User Management**: Admin-only page at `/admin/users` — create/delete users, assign production roles, toggle supervisor flag
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
- `POST /api/auth/login` — login; returns `isSupervisor` flag
- `POST /api/auth/logout` — clear session
- `GET /api/auth/me` — get current user info (includes `isSupervisor`)
- `GET /api/auth/users` — list users (admin only); includes `isSupervisor`
- `POST /api/auth/users` — create user (admin only)
- `DELETE /api/auth/users/:id` — delete user (admin only)
- `PATCH /api/auth/users/:id/supervisor` — toggle supervisor flag (admin only)

### Database Schema
- `locations` — id (text PK), description, created_at
- `products` — id (serial), name, category, buffer_stock, alert_email, created_at
- `stock` — (location_id, product_id) composite PK, quantity
- `stock_history` — id (serial), location_id, product_id, previous_quantity, new_quantity, delta, changed_by, changed_at
- `users` — id (serial), username (unique), password_hash, role (admin|worker), **is_supervisor** (bool, default false), created_at

### Permissions
- **Admin**: full CRUD on products, locations, stock, users, work projects, templates, production zones
- **Worker**: can view and update stock, scan QR codes, view history and dashboard, view/start/stop work order procedures; cannot manage products or users
- **Supervisor (worker flag)**: access to `/supervisor` page (daily plan + bottleneck alerts)

### Work Orders Module
- **Templates**: item blueprints with free-text production steps; each step has role, batchMode, and durationEstimate; when created, automatically generates a `final_product` with matching name
- **Projects**: work orders with name, deadline, priority (low/normal/high/urgent), status, RAL paint color, `requiresExternalParts` flag
- **Quick Job Mode**: create a one-off work order with custom inline steps (no template needed); pass `quickJob:true` + `quickSteps` array to POST /api/work/projects
- **Items**: project items created from templates; procedures copied from template steps with roleId/batchMode/durationEstimate
- **Progress**: item progress = completed procedures / total; project progress = total across all items
- **Urgency**: < 2 days = red (critical), < 5 days = orange (warning), else green
- **Timer**: one active timer per user at a time; server enforces this
- **Inbound Banner**: project detail shows linked inbound status and blocks procedures if parts not yet arrived
- **Worker Task Dashboard** (`/tasks`): shows ONLY READY steps (blocked steps are hidden entirely). After completing a step, prompts worker to log where the part is now (WIP location)
- **WIP Location Tracking**: after step completion, worker can log part location (warehouse / production zone / with worker). Stored in `wip_locations` table; supervisors can query per step.
- **Batch Queue**: Batch/type-batch steps appear in the Batch Queue tab with group start/finish.
- **Template Clone**: POST /api/work/templates/:id/clone — duplicates template, product, all procedures and BOM
- **AI Templates**: POST /api/work/templates/generate — describe what you're making, AI generates template with steps; PUT /api/work/templates/:id/ai-edit — edit steps by instruction; POST /api/work/templates/:id/undo — revert last AI edit (snapshots in ai_snapshots table)
- **Step Presets**: save a set of steps as a reusable preset (step_presets table); apply to any template (append or replace)
- **Starter Pack**: POST /api/work/templates/seed-starter-pack — seeds 6 generic fabrication templates

### Production Zones
- Admin-managed list of named physical areas (e.g. "CNC Bay", "Paint Booth") at `/admin/zones`
- GET/POST /api/work/production-zones — list + create (admin only)
- DELETE /api/work/production-zones/:id — delete (admin only)
- Used in WIP location tracking to let workers log exactly which zone a part is in

### Supervisor Tools
- **Supervisor Page** (`/supervisor`): accessible to admins and workers with `isSupervisor=true`
  - **Daily Plan tab**: all READY + in-progress steps for the company, grouped by role with estimated minutes
  - **Bottlenecks tab**: overdue projects, role queue pressure (blocked/ready ratio), all-blocked items
- **Supervisor Routes**:
  - `GET /api/work/supervisor/daily-plan` — grouped ready steps + totals
  - `GET /api/work/supervisor/bottlenecks` — overdue projects, role bottlenecks, all-blocked items

### Inbound Module (workflow, not inventory tracking)
- **Purpose**: track pallet arrivals for projects that require external parts
- **Auto-creation**: creating a project with `requiresExternalParts=true` auto-creates an inbound record (status="expected")
- **Arrival Flow**: any user can "Unload Pallet" → changes status to "arrived", stamps receivedAt
- **Routing Flow** (admin): arrived pallets can be routed to "Store" (select location → status=stored) or "Production" (enter procedure → status=in_production)
- **Procedure Blocking**: if a procedure has `requiresInbound=true` and the project's inbound is still "expected", the Start button is disabled with "Waiting" label both in UI and enforced server-side
- **Manual Records**: admins can create inbound records not linked to a project (standalone pallets)
- **Role**: all users can view and Unload; only admins can Route and Delete

### Work Order DB Tables
- `work_templates` — id, name, product_id (FK to final_product), company_id, created_at
- `work_steps` / `work_item_steps` — procedure steps per template/item (name, sort_order, requires_inbound, role_id, batch_mode, duration_estimate)
- `work_projects` — id, name, deadline, priority (low/normal/high/urgent), status, paint_color, requires_external_parts (bool), company_id, created_at
- `work_project_items` — id, project_id, name, paint_color, sort_order
- `work_time_logs` — id, step_id, user_id, start_time, end_time, duration_seconds
- `step_presets` — id, name, company_id, created_at
- `step_preset_entries` — id, preset_id, name, role_id, batch_mode, duration_estimate, sort_order
- `ai_snapshots` — id, entity_type, entity_id, snapshot (jsonb), company_id, created_at
- `inbound` — id, project_id (nullable FK), status (expected/arrived/stored/in_production), location_id, procedure_id, received_at, notes, company_id, created_at
- **`production_zones`** — id, name, company_id, sort_order, created_at
- **`wip_locations`** — id, step_id (FK), location_type (warehouse/zone/with_worker), location_value, set_by_user_id, set_at

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
- `/tasks` — Worker task dashboard (My Steps: READY only; Batch Queue: batch step groups)
- `/supervisor` — Supervisor view (Daily Plan + Bottlenecks tabs); requires admin or isSupervisor
- `/work/projects` — Work orders project list
- `/work/projects/new` — Create work order; "From Template" or "Quick Job" mode (inline step editor); 4-level priority (low/normal/high/urgent)
- `/work/projects/:id` — Project detail with items + procedures + inbound status banner
- `/work/templates` — Item template management (admin); free-text steps with role/batchMode/duration pickers; AI generate/edit; clone; step presets; BOM editor with role pickers per component step
- `/work/inbound` — Inbound pallet management (Expected / Arrived / Stored+InProduction)
- `/admin/users` — User management (create/delete, role assignment, supervisor flag toggle)
- `/admin/zones` — Production zones management (add/delete named shop floor areas)
- `/admin/roles` — Production role management
- `/admin/procedures` — Procedure management (legacy)
- `/admin/company` — Company & feature flag management
- `/admin/suppliers` — Supplier management
- `/admin/dashboard` — Admin overview

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server serving all warehouse management endpoints.

- Entry: `src/index.ts`
- Routes: `src/routes/` — locations, products, stock, history, dashboard, auth, work, tasks, company, inbound, orders, owner, suppliers
- Email: `src/lib/email.ts` — Nodemailer low stock alerts
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: `lib/db/src/schema/` — companies, users, locations, products, suppliers, stock, history, work, inbound, orders
- `pnpm --filter @workspace/db exec drizzle-kit push` — push schema changes (use raw psql for non-interactive)
