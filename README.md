<div align="center">

  <img src="frontend/public/logo.png" alt="YarnTrace Enterprise Logo" width="280" />

  <h1>YarnTrace</h1>
  <p><strong>Enterprise Yarn Inventory & Production Traceability System</strong></p>
  <p><i>Precision Yarn Stock Accounting • Multi-Team Floor Consumptions • Two-Way Traceability</i></p>

<!-- Dynamic Animated Typing SVG -->
<p align="center">
  <a href="https://github.com/bhumitsoni20/YarnTrace">
    <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&duration=3000&pause=1000&color=EA580C&center=true&vCenter=true&width=750&lines=Precision+Yarn+Inventory+Management;Two-Way+Forward+%26+Backward+Batch+Traceability;Granular+Role-Based+Access+Control+(RBAC);Sub-Milligram+Decimal(12%2C4)+KG+Auditing;Multi-Team+Floor+Allocations+%26+Consumption" alt="Typing SVG" />
  </a>
</p>

<!-- Technology Badges -->
<p align="center">
  <img src="https://img.shields.io/badge/Next.js%2015-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript%205-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NestJS%2011-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Prisma%206-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Tailwind_CSS%203-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Swagger%20OpenAPI-85EA2D?style=for-the-badge&logo=swagger&logoColor=black" alt="Swagger" />
</p>

<p align="center">
  <a href="#-system-architecture">Architecture</a> •
  <a href="#-interactive-traceability-pipeline">Traceability Pipeline</a> •
  <a href="#-core-modules--capabilities">Capabilities</a> •
  <a href="#-role-access-matrix-rbac">RBAC Matrix</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-api-documentation--swagger">API Docs</a>
</p>

---

</div>

## 📌 Executive Summary

**YarnTrace** is an enterprise-grade digital operational core engineered specifically for industrial spinning, warping, weaving, and knitting mills. Replacing fragile manual spreadsheets and legacy accounting tools, YarnTrace delivers mathematical inventory reconciliation, floor accountability, and bidirectional audit lineage across high-throughput textile supply chains.

```
       [ RAW INWARD LOTS ]
                │
                ▼
      ┌──────────────────┐
      │  Stock Master    │───► Real-time KG ledger (Decimal 12,4 precision)
      └──────────────────┘
                │
                ▼
      ┌──────────────────┐
      │  Floor Issuance  │───► Departmental handover with physical bags & lot seals
      └──────────────────┘
                │
                ▼
      ┌──────────────────┐
      │ Team Allocation  │───► Spinning, Warping, Weaving & Knitting teams
      └──────────────────┘
                │
                ▼
      ┌──────────────────┐
      │   Consumption    │───► Actual machine weight vs standard loss variances
      └──────────────────┘
                │
                ▼
      ┌──────────────────┐
      │ Finished Product │───► Finished rolls, cones & fabric batches
      └──────────────────┘
                │
                ▼
      [ DISPATCH / CLIENT ]
```

---

## ✨ Core Pillars & Platform Highlights

<table>
  <tr>
    <td width="50%">
      <h3>⚖️ Sub-Milligram Mathematical Ledger</h3>
      <p>Tracks yarn quantities strictly with <code>Decimal(12, 4)</code> database precision. Eliminates rounding drift across bag splits, floor returns, tare calculations, and moisture variances.</p>
    </td>
    <td width="50%">
      <h3>🔄 Bidirectional Traceability Engine</h3>
      <p><b>Forward Lineage:</b> Raw supplier lot &rarr; Issuance voucher &rarr; Work order &rarr; Team consumption &rarr; Finished garment roll &rarr; Customer delivery invoice.<br/><b>Backward Lineage:</b> Dispatched piece inspection &rarr; Exact machines &rarr; Operator shifts &rarr; Original raw yarn lots.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🛡️ Dynamic Enterprise RBAC</h3>
      <p>Granular capability-based access control. Configurable roles with non-blocking administration, distinct operational domains, and an immutable before/after diff audit trail.</p>
    </td>
    <td width="50%">
      <h3>🌐 Zero-Friction Remote Preview</h3>
      <p>Engineered for instant preview tunneling via Cloudflare Tunnel (<code>trycloudflare.com</code>) or LocalTunnel (<code>loca.lt</code>) with dynamic origin matching, cookie credentials, and automated preflight caching.</p>
    </td>
  </tr>
</table>

---

## 🏛️ System Architecture

YarnTrace employs a decoupled client-server architecture ensuring performance, strict type safety, and clean horizontal scalability:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENT TIER                            │
│                                                                        │
│   Next.js 15 (App Router) • React 19 • TypeScript • Tailwind CSS       │
│   Stitch Design System ("Industrial Loom & Trace" Light Palette)       │
│                                                                        │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────┐  │
│   │ Redux Toolkit Store  │  │ TanStack React Query │  │ Axios Client│  │
│   │ (Auth, UI, Sessions) │  │ (Server Cache / SWR) │  │ (JWT Queue) │  │
│   └──────────────────────┘  └──────────────────────┘  └─────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ HTTPS / REST JSON API (/api/v1)
                                    │ Authorization: Bearer <JWT>
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICE TIER                            │
│                                                                        │
│   NestJS 11 Core Application • Node.js • Express Adapter • TypeScript  │
│                                                                        │
│   ┌───────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│   │ Auth & JWT Guard  │  │ Permissions Guard  │  │ Validation Pipe  │  │
│   └───────────────────┘  └────────────────────┘  └──────────────────┘  │
│   ┌───────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│   │ Inventory Module  │  │ Production Module  │  │ Traceability Engine│
│   └───────────────────┘  └────────────────────┘  └──────────────────┘  │
│   ┌───────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│   │ Governance Module │  │ Audit Logger (Diff)│  │ Health & Monitor │  │
│   └───────────────────┘  └────────────────────┘  └──────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ Prisma ORM Client (Pooler / Direct)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATABASE STORAGE TIER                           │
│                                                                        │
│   PostgreSQL Relational Engine • Strict Foreign Key Integrity          │
│   17 Relational Entities • Exact Decimal(12,4) Arithmetic              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Interactive Traceability Pipeline

```mermaid
graph TD
    subgraph S1["1. Raw Yarn Inward"]
        PO["Purchase Order (Ceiling: 103%)"] --> YL["Yarn Lot Master (Lot #, Count, Bags, KG)"]
        YL --> OS["Opening Stock Entry"]
        YL --> RC["Inward Reception Receipt"]
    end

    subgraph S2["2. Floor Allocation"]
        OS & RC --> IS["Issuance to Floor Voucher"]
        IS --> TM["Production Team Buffer (Spinning / Warping / Weaving)"]
    end

    subgraph S3["3. Floor Execution & Conversion"]
        TM --> CR["Actual Floor Consumption"]
        CR --> RT["Unused Yarn Returns"]
        RT -.->|Stock Restored| YL
        CR --> OB["Output Finished Goods Batch"]
    end

    subgraph S4["4. Commercial Delivery & Audit"]
        OB --> DL["Party Delivery / Dispatched Manifest"]
        DL --> TR["Traceability Matrix Verification"]
    end

    classDef primary fill:#ea580c,stroke:#9a3412,stroke-width:2px,color:#ffffff;
    classDef secondary fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff;
    classDef success fill:#059669,stroke:#047857,stroke-width:2px,color:#ffffff;
    classDef warning fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff;

    class YL,OB primary;
    class IS,TM secondary;
    class CR,DL success;
    class PO,RT warning;
```

---

## 📦 Core Modules & Capabilities

<details open>
<summary><b>1. Inventory & Stock Master (<code>/inventory</code>)</b></summary>
<br/>

- **Opening Stock Creation:** Seed baseline stock lots with mill origin, yarn count (e.g. `30s Combed`, `40s Carded`), shade, packaging bags, and gross/net weights.
- **Inward Reception:** Record shipments against authorized suppliers with lot verification and discrepancy tolerance.
- **Floor Issuance:** Generate issuance slips with physical seal numbers, target department, and tare subtractions.
- **Stock Adjustments & Retirements:** Handle external sales, quality write-offs, and administrative balance corrections with immutable audit log diffs.
- **Export Manifests:** Real-time Excel exports with customized styling for physical mill dispatch checklists.

</details>

<details open>
<summary><b>2. Production & Shop Floor Tracking (<code>/production</code>)</b></summary>
<br/>

- **Team Management:** Master directory of production units across departments (`SPINNING`, `WARPING`, `WEAVING`, `KNITTING`).
- **Work Orders:** Track orders from `PENDING` through `IN_PROGRESS`, `COMPLETED`, to `CANCELLED`.
- **Yarn Allocation:** Handover issued yarn directly to designated production crews with batch segregation.
- **Consumption Recording:** Log physical scale readings per team to isolate wastage, yield percentages, and floor stock.
- **Floor Returns:** Credit unconsumed cones/bags back into active warehouse inventory automatically.

</details>

<details open>
<summary><b>3. Traceability Engine (<code>/traceability</code>)</b></summary>
<br/>

- **Forward Traceability:** Input any raw lot number to retrieve all associated work orders, operators, dates, output batches, and client deliveries.
- **Backward Traceability:** Input any finished product roll or customer batch to inspect the root yarn shipments, supplier identities, and floor team runs.
- **Visual Genealogies:** Tree visualizers detailing fractional kilograms allocated across child product batches.

</details>

<details open>
<summary><b>4. Governance, Roles & Audit Trails (<code>/roles-permissions</code>, <code>/audit-logs</code>)</b></summary>
<br/>

- **Dynamic Role Editing:** Edit role names, descriptions, and assign granular permissions without code recompilation.
- **Safe Role Deletion:** Delete custom or secondary roles with strict safeguard validation preventing accidental orphan user states.
- **Protected Primary Admin:** Hardened root `ADMIN` role safeguard guaranteeing system accessibility.
- **Immutable Audit Logging:** Captures `oldValue` &rarr; `newValue` delta payloads, initiating user, timestamp, and target entity for every write operation.

</details>

---

## 👥 Role Access Matrix (RBAC)

YarnTrace enforces strict separation of duties out-of-the-box:

| Role | Code | Domain | Default Permissions | Editable / Deletable |
| :--- | :--- | :--- | :--- | :---: |
| **Administrator** | `ADMIN` | System-Wide | Unrestricted access across all modules | ✏️ Name/Desc Only |
| **Production Head** | `PRODUCTION_HEAD` | Production & Floor | Work orders, allocations, floor consumption, returns, teams, dashboard | ✅ Full Control |
| **Quality Assurance Head** | `QUALITY_HEAD` | Inspection & QA | Traceability lineage, lot ledger review, inspection reports, dashboard | ✅ Full Control |
| **Stock Head** | `STOCK_HEAD` | Raw Yarn Warehouse | Opening stock, inward receipts, issuance vouchers, party master | ✅ Full Control |
| **Stock Normal User** | `STOCK_NORMAL` | Warehouse Floor | View-only access to lots, balances, and transaction history | ✅ Full Control |
| **Viewer** | `VIEWER` | Executive / Auditor | Read-only access across dashboard, inventory, reports, and traceability | ✅ Full Control |

---

## 🚀 Getting Started

### 📋 Prerequisites

- **Node.js**: `v20.x` or higher *(recommended `v22.x` / `v24.x`)*
- **npm**: `v10.x` or higher
- **PostgreSQL**: Local PostgreSQL or managed database *(v14+)*

---

### 📥 1. Clone & Install

```powershell
# Clone the repository
git clone https://github.com/bhumitsoni20/YarnTrace.git
cd YarnTrace

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

---

### ⚙️ 2. Environment Configuration

#### Backend Setup (`backend/.env`):
Create `backend/.env` based on `backend/.env.example`:

```env
# Application Environment
NODE_ENV=development
PORT=4000

# PostgreSQL Connection (Local or Supabase)
DATABASE_URL="postgresql://postgres:password@localhost:5432/yarntrace?schema=public"

# Authentication & Security Keys (min 32 characters)
JWT_ACCESS_SECRET="yarntrace_super_secure_access_secret_token_2026_key"
JWT_REFRESH_SECRET="yarntrace_super_secure_refresh_secret_token_2026_key"
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS Configuration (comma-separated origins)
CORS_ORIGIN="http://localhost:3000"
ALLOW_TUNNEL_ORIGINS=true
```

#### Frontend Setup (`frontend/.env.local`):
Create `frontend/.env.local` based on `frontend/.env.example`:

```env
# Backend API Base URL
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

---

### 🗄️ 3. Database Migration & Seeding

```powershell
cd backend

# Generate Prisma Client
npx prisma generate

# Apply Database Migrations
npx prisma migrate dev --name init

# Seed Default Roles, Teams & Permissions
npm run prisma:seed
```

---

### 🏃‍♂️ 4. Launching the Services

Open two terminals:

#### Terminal 1 — Backend API (NestJS):
```powershell
cd backend
npm run start:dev
```
- 🚀 **REST API:** `http://localhost:4000/api/v1`
- 🩺 **Health Check:** `http://localhost:4000/api/v1/health`
- 📑 **Interactive Swagger:** `http://localhost:4000/api/docs`

#### Terminal 2 — Frontend App (Next.js):
```powershell
cd frontend
npm run dev
```
- 🌐 **Web Application:** `http://localhost:3000`

---

## 🌐 Remote Preview via Cloudflare Tunnel or LocalTunnel

When presenting or testing remote client devices (mobile, tablet, remote network), YarnTrace includes integrated tunnel compatibility:

```powershell
# Expose backend (port 4000)
cloudflared tunnel --url http://localhost:4000
# or: lt --port 4000
```

1. Copy the resulting public URL (e.g. `https://rapid-fox-jump.trycloudflare.com`).
2. Update `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=https://rapid-fox-jump.trycloudflare.com/api/v1
   ```
3. Restart `npm run dev` in the frontend so the variable is embedded.
4. The backend CORS layer automatically permits `*.trycloudflare.com` and `*.loca.lt` traffic with cookie credentials!

---

## 🧪 Testing & Code Quality

```powershell
# Run backend test suites (Jest)
cd backend
npm test

# Run TypeScript compilation check
npx tsc --noEmit

# Frontend type verification
cd ../frontend
npx tsc --noEmit

# Code styling & linting
npm run lint
```

---

<div align="center">

<!-- Animated Footer Wave -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=30,24,12,1&height=120&section=footer" width="100%" alt="Footer Wave" />

<p align="center">
  <sub>Built with craftsmanship for the global textile industry • <b>YarnTrace</b> © 2026</sub>
</p>

</div>
