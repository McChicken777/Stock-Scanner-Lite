## Overview

This project is a pnpm monorepo for a mobile-first warehouse stock management system. Its primary purpose is to streamline inventory control, work order management, and production processes within a warehouse environment. Key capabilities include QR code scanning for location tracking, comprehensive stock management with audit trails, user role-based access control, and advanced work order features with AI assistance for template generation and editing. The system aims to enhance operational efficiency, reduce stockouts through automated alerts, and improve communication across production teams.

## User Preferences

- The agent should prioritize user authentication and authorization, ensuring robust security measures are in place.
- The agent should ensure the system is mobile-first, with a strong focus on intuitive UI/UX for warehouse workers.
- The agent should implement a modular and scalable architecture that allows for easy addition of new features and integrations.
- The agent should use modern TypeScript practices and maintain a clear, well-documented codebase.
- The agent should provide clear and concise explanations for any proposed changes or solutions.
- The agent should focus on delivering a high-quality, performant application.

## System Architecture

The project is structured as a pnpm monorepo, utilizing TypeScript across all packages.

**Core Technologies:**
- **Monorepo Tool:** pnpm workspaces
- **Backend:** Express 5 (Node.js 24)
- **Database:** PostgreSQL with Drizzle ORM
- **Frontend:** React + Vite, Tailwind CSS, Radix UI, Wouter for routing (mobile-first design)
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build System:** esbuild (CJS bundle)
- **Email:** Nodemailer (SMTP) for alerts

**Project Structure:**
- `artifacts/`: Contains deployable applications (`api-server`, `warehouse` frontend).
- `lib/`: Houses shared libraries (`api-spec`, `api-client-react`, `api-zod`, `db`).
- `scripts/`: Utility scripts.

**UI/UX Decisions:**
The frontend (`@workspace/warehouse`) is a React + Vite application designed with a mobile-first approach. It features an industrial warehouse theme with a color palette of safety orange and dark slate. Key UI libraries include Tailwind CSS for utility-first styling and Radix UI for accessible components.

**Feature Specifications & System Design Choices:**

**Authentication & Authorization:**
- Session-based authentication with bcrypt hashing.
- Role-Based Access Control (RBAC) with `owner`, `admin`, and `worker` roles.
- `is_supervisor` flag for workers to grant access to supervisor-specific tools.
- Backend middleware enforces permissions; frontend conditionally renders UI elements.
- **Worker route guard:** Plain workers (non-supervisor) are redirected to `/tasks` and only see Tasks, Inbound, Orders, Attendance in nav. Admins and supervisors see all sections.

**Warehouse Management:**
- **QR Code Scanning:** Integrates browser camera API and jsQR for scanning location QR codes.
- **Stock Management:** CRUD operations for products and locations, with per-location quantity tracking.
- **Low Stock Alerts:** Automated email notifications via Nodemailer when product stock falls below a defined buffer.
- **History Log:** Comprehensive audit trail for all stock changes.
- **Dashboard:** Provides an overview of low stock alerts, recent activity, and category statistics.

**Work Order Management:**
- **Templates:** Admin-defined production templates with free-text steps, roles, batch modes, and duration estimates. Auto-generates `final_product`.
- **Projects (Work Orders):** Manages work orders with name, deadline, priority, status, and paint color. Supports "Quick Job Mode" for inline steps.
- **AI Integration:** AI-powered template generation and editing (`/api/work/templates/generate`, `/api/work/templates/:id/ai-edit`), with undo functionality via snapshots.
- **Production Zones:** Admin-managed physical areas for WIP tracking.
- **Supervisor Tools:** Dedicated supervisor page (`/supervisor`) with daily plan and bottleneck analysis for admins and designated supervisors.
- **WIP Location Tracking:** Workers log part locations (warehouse/production zone/with worker) after completing steps. Bug fix (Task #32): dialog now uses controlled `open` prop and hooks called in correct order; state set before query invalidation.
- **Auto Clock-In:** Starting a task step automatically clocks the worker in if they haven't already.
- **Flexible Tasks System:**
    - Company-scoped production roles with priority (primary/secondary/substitution).
    - Procedures with `requires_inbound` (blocked until pallet arrives) and `requires_components` (blocked until inputs are available) flags.
    - Tasks are generated per (item, procedure) pair, with READY/BLOCKED status based on dependencies.
    - `procedure_inputs` define required parts, blocking tasks if stock is insufficient or upstream production tasks are not complete.

**Inbound Module:**
- Tracks pallet arrivals for projects requiring external parts.
- Auto-creates inbound records when a project requires external parts.
- Workflow for "Unload Pallet" and "Route" to storage or production.
- Procedure blocking: tasks requiring inbound are disabled until the inbound pallet status is not "expected."

**Item Type System:**
- Replaces old purchase/production with `purchased_part`, `manufactured_part`, and `final_product`.
- `purchased_part` includes supplier fields and stock tracking.
- `manufactured_part` are in-house sub-components.
- `final_product` are finished goods with stock tracking.

**Attendance & Scheduling (Task #32):**
- Clock in/out with live timer; supports sick and vacation day declarations for today.
- **Weekend Overtime Rules:** Company setting `weekendOvertimeEnabled` (default true) — all hours worked on Sat/Sun count as overtime. Configurable per company.
- **Company Holidays:** Admins manage a custom holiday calendar (`company_holidays` table). Days on this list count all hours as non-overtime. Import 2026 public holidays from presets for 10 countries (US, GB, DE, FR, ES, PT, NL, IT, BR, AU).
- **Overtime Calculation:** `getEffectiveThresholdSeconds()` checks weekend + holidays before applying the standard work-hours threshold.
- **Leave Requests (`leave_requests` table):**
  - Sick leave: submitted immediately, attendance logs written at once.
  - Vacation: submitted as `pending`, requires manager approval.
  - Admin/supervisor sees a "Pending approvals" panel in the Attendance page.
  - Approving vacation writes attendance log entries for the date range.
- **API routes:** `GET/POST /api/attendance/status`, `/api/settings/holidays`, `/api/settings/holidays/presets`, `/api/settings/holidays/bulk`, `/api/settings/company/scheduling`, `GET/POST /api/leave`, `/api/leave/mine`, `/api/leave/pending`, `PATCH /api/leave/:id`.

**Database Schema Highlights:**
- `locations`, `products`, `stock`, `stock_history`
- `users` with `is_supervisor` flag
- `work_templates`, `work_steps`, `work_projects`, `work_project_items`, `work_time_logs`
- `step_presets`, `ai_snapshots`, `inbound`, `production_zones`, `wip_locations`
- `roles`, `user_roles`, `procedures`, `item_procedures`, `tasks`, `procedure_inputs`
- `customers`, `quotes`, `quote_items`, `quote_revisions`
- `attendance_logs` with type enum (work/sick/vacation)
- `company_holidays` — per-company holiday calendar (migration: `0002_scheduling_leave.sql`)
- `leave_requests` with status enum (pending/approved/rejected) and type enum (sick/vacation)
- `companies` extended with `weekend_overtime_enabled` (bool) and `country` (text)
- `attendance_logs` extended with `auto_closed` (bool) and `auto_close_acknowledged_at` (timestamp) — Task #23

**Auto Clock-Out (Task #23):**
- `artifacts/api-server/src/lib/scheduler.ts` runs node-cron daily at 03:15 + once on boot.
- Closes any open work shift older than `work_hours_per_day + 2h` grace; stamps `clockOut = clockIn + work_hours_per_day` and flags `auto_closed=true`.
- Live board (`/api/attendance/live`) returns `autoClosed` and renders an "Auto-closed" badge.
- Workers see a dismissible banner on `/attendance` via `GET /api/attendance/auto-close-notice` + `POST /api/attendance/auto-close-notice/:id/ack`.

**TypeScript & Composite Projects:**
- All packages extend `tsconfig.base.json` with `composite: true`.
- Root `tsconfig.json` lists all packages as project references.

## External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Drizzle ORM:** Used for database interaction and schema definition.
- **Nodemailer:** For sending automated email alerts (e.g., low stock notifications).
- **Orval:** API client code generation from OpenAPI specifications.
- **jsQR:** JavaScript library for QR code scanning via browser camera.
- **Tailwind CSS:** Utility-first CSS framework for styling the frontend.
- **Radix UI:** Headless UI component library for building accessible frontend components.
- **Vite:** Next-generation frontend tooling for React development.
