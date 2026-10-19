# LingoLearn: Multilingual Literacy & Language Learning Platform

[![Vue 3](https://img.shields.io/badge/Frontend-Vue%203%20%7C%20TypeScript%20%7C%20Pinia-42b883?logo=vuedotjs)](https://vuejs.org/)
[![Express](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20TypeScript-black?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-336791?logo=postgresql)](https://www.postgresql.org/)
[![Vitest](https://img.shields.io/badge/Tested%20With-Vitest%20%7C%20Integration-fcc72b?logo=vitest)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Containers-Docker%20Compose-2496ed?logo=docker)](https://www.docker.com/)
[![Project](https://img.shields.io/badge/Academic-Software%20Engineering%20Capstone-blue)](#academic-context--privacy-notice)

> **LingoLearn** is a full-stack, multilingual literacy platform built to teach South African languages (English and isiZulu) through interactive stories, audio practice, placement testing and progressive mastery evaluations. The platform features an end-to-end localised interface, modular content authoring tools, an editorial moderation workflow and child safety compliance mechanisms.

### Academic Context & Privacy Notice
This platform was engineered as a project for a university software engineering module by a team of 6 student engineers.

To safeguard the personal privacy of all group members, all details have been completely removed from this public repo. Each of the 6 team members is identified throughout the codebase and documentation using the following pseudonyms:

| Contributor | Pseudonym | Subsystem Owned | Full-Stack Scope & Responsibilities |
|---|:---:|---|---|
| **Member 1** | **TS** | **Subsystem A: Identity & Access** | JWT authentication, server-side session revocation, role-based access control (RBAC), cryptographic parent-child link code engine, and administrator user management. |
| **Member 2** | **TK** | **Subsystem B: Onboarding & Placement** | Learner preferences setup, under-13 COPPA-style access lock gate, adaptive placement test engine, and dynamic question difficulty ladders. |
| **Member 3** | **TD** | **Subsystem C: Content Builder** | Google Forms-style drag-and-drop block builder, unified multi-modal JSON content schema, authoring WYSIWYG preview canvas, and draft lifecycle management. |
| **Member 4** | **MO** | **Subsystem D: Media & Taxonomy** | Binary magic-byte media validation pipeline, multi-format audio/image storage, hierarchical tags and level rules, localized form validation, and AST SQL-safety test harness. |
| **Member 5** | **NS** | **Subsystem E: Learner Experience** | Interactive story player with synchronized audio narration, forward-only test execution engine, filterable Explore catalog, and "My Learning" progress analytics. |
| **Member 6** | **TC** | **Subsystem F: Moderation & Progression** | Editorial review queue with race-condition claim locks, audit-trailed review decisions (approve/reject/request changes), and level-up progression challenge engine. |

---

## Table of Contents
1. [Academic Context & Privacy Notice](#academic-context--privacy-notice)
2. [Key Features](#key-features)
3. [User Roles & Permissions](#user-roles--permissions)
4. [System Architecture & Engineering Slices](#system-architecture--engineering-slices)
5. [Technology Stack](#technology-stack)
6. [Getting Started & Local Setup](#getting-started--local-setup)
7. [Seed Demo Accounts](#seed-demo-accounts)
8. [Testing & Quality Assurance](#testing--quality-assurance)
9. [Security & Resilience Engineering](#security--resilience-engineering)
10. [Future Roadmap & Opportunities for Improvement](#future-roadmap--opportunities-for-improvement)
11. [Repository Structure](#repository-structure)

---

## Key Features

- **Full Bilingual Interface (English & isiZulu):** Seamless runtime locale switching across every user role, persisting preference to the database and synchronizing across devices.
- **Adaptive Placement Ladder:** Dynamically assesses incoming learners through randomized question ladders, placing them at the appropriate reading level without learner fatigue.
- **Dynamic Content Authoring Canvas:** Google Forms-style drag-and-drop block builder enabling authors to construct multi-page lessons and assessments with headings, text, media, and interactive question blocks.
- **Interactive Learner Reader & Assessment Player:** Audio-accompanied story reader with synchronized playback, self-paced forward-only assessment engine, and instant feedback.
- **Child-Friendly Mode & COPPA Compliance:** Automatic under-13 detection, playful UI theming, and an account lock gate requiring guardian verification via temporary link codes before activation.
- **Editorial Moderation Pipeline:** Multi-tenant review queue with concurrency claiming, editorial rejection/approval with mandatory audit notes, and draft versioning.
- **Learner Mastery & Progression Challenges:** Daily goal tracking, reading history analytics, and gated level-up challenges with cooldown enforcement.

---

## User Roles & Permissions

| Role | Core Capabilities |
|---|---|
| **Learner (Adult)** | Target language onboarding, placement testing, content discovery, lesson player with audio, knowledge checks, progress tracking ("My Learning"), and level-up challenges. |
| **Learner (Child <13)** | Child-safe curated content, colorful child theme, age-gated until unlocked via Guardian Link Code. |
| **Guardian / Parent** | Account-linking via 6-character redemption tokens, real-time child learning progress monitoring, and date-of-birth management. |
| **Author** | Multi-page content builder (text, audio, image, quizzes), draft management, learner-view preview canvas, media library uploads, taxonomy tagging, and submission for review. |
| **Moderator** | Editorial review queue with race-condition claim locks, content taxonomy validation, and decision engine (Approve, Reject, Request Changes with audit feedback). |
| **Administrator** | System governance: user access management, role delegation, account deactivation, taxonomy & theme configuration, and level progression rules. |

---

## System Architecture & Engineering Slices

The platform was architected using a decoupled, domain-driven full-stack slice pattern. Each engineering slice owns its dedicated database tables, Express REST routing layer, Pinia state stores, and Vue 3 frontend components:

```
                            ┌────────────────────────────────────────┐
                            │           Client Applications          │
                            │   Vue 3 + TypeScript + Pinia + Vite    │
                            └───────────────────┬────────────────────┘
                                                │ REST / JSON (JWT)
                                                ▼
                            ┌────────────────────────────────────────┐
                            │          Express REST API Gateway      │
                            │      Middleware: Auth, RBAC, Linter    │
                            └───────┬────────────────────────┬───────┘
                                    │                        │
         ┌──────────────────────────┼────────────────────────┼──────────────────────────┐
         ▼                          ▼                        ▼                          ▼
   [Subsystem A]              [Subsystem B]            [Subsystem C]              [Subsystem D]
 Identity & Access        Onboarding & Placement      Content Builder           Media & Taxonomy
       (TS)                       (TK)                     (TD)                       (MO)
         │                          │                        │                          │
         └──────────────────────────┼────────────────────────┼──────────────────────────┘
                                    │                        │
         ┌──────────────────────────┴────────────────────────┴──────────────────────────┐
         ▼                                                                              ▼
   [Subsystem E]                                                                  [Subsystem F]
 Learner Experience                                                          Moderation & Progression
       (NS)                                                                           (TC)
                                                │
                                                ▼
                            ┌────────────────────────────────────────┐
                            │          PostgreSQL 16 Database        │
                            │   Multi-Schema Relational Persistence  │
                            └────────────────────────────────────────┘
```

### Subsystem Breakdown:

1. **Subsystem A: Identity & Access (TS)**
   - Schema & user lifecycle management (Learner, Guardian, Author, Moderator, Admin).
   - Session authentication with secure HTTP-only cookies and server-side token revocation.
   - Dual-layer access control: Express RBAC middleware and Vue Router navigation guards.
   - Cryptographic parent-child link code generator and redemption state machine.
   - Administrator user management console with search, filtering, and role elevation.

2. **Subsystem B: Onboarding & Placement (TK)**
   - Per-language level model and exclusive database write ownership for learner levels.
   - Learner setup experience (target language, birth year, daily goals).
   - Under-13 age safety gate and lock screen.
   - Dynamic placement test engine evaluating response difficulty ladders to assign baseline levels.

3. **Subsystem C: Content Builder (TD)**
   - Modular JSON schema defining the unified content contract for lessons and assessments.
   - Authoring block library: Headings, Text, Image, Audio, Multiple Choice, Fill-in-the-Blank, and Listen-and-Choose.
   - Draft lifecycle: draft creation, incremental auto-saving, preview rendering, and review submission gate.

4. **Subsystem D: Media & Taxonomy (MO)**
   - Secure media pipeline: Multi-format file uploads (MP3, WAV, PNG, JPEG) with magic-byte validation and sidecar metadata storage.
   - Taxonomy engine: Hierarchical themes, categories, tag filtering, and configurable reading level promotion rules.
   - Author dashboard and media asset management.
   - Cross-cutting system defense: Localized HTML5 form validity architecture and AST-based SQL injection safety test harness.

5. **Subsystem E: Learner Experience (NS)**
   - Shared Block Renderer: Reusable component engine parsing content JSON schemas across the application.
   - Content Discovery: Filterable Explore catalog segmented by level, audience (General/Child), and theme.
   - Interactive Lesson Delivery: Synchronized audio playback, forward-only test execution, and real-time score calculation.
   - "My Learning" progress dashboard tracking mastery, reading history, and completion metrics.

6. **Subsystem F: Moderation & Progression (TC)**
   - Content state machine: Strict status lifecycle (`draft` → `pending` → `approved` / `rejected`).
   - Moderator Review Queue with FIFO ordering and atomic claiming mechanisms to prevent duplicate reviews.
   - Editorial review decisions with mandatory rejection rationale.
   - Progression engine: Level-up challenge eligibility checking, test execution, and retry cooldown timers.

---

## Technology Stack

### Frontend
- **Framework:** [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- **Language:** [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **State Management:** [Pinia](https://pinia.vuejs.org/) (Modular domain stores)
- **Routing:** [Vue Router 4](https://router.vuejs.org/) (With authentication & role-based route guards)
- **Internationalization:** Custom reactive i18n engine with complete English & isiZulu dictionaries
- **Styling:** Modern CSS3 design tokens, CSS variables, dark/light theme switching, and responsive layouts
- **Build Tool:** [Vite](https://vitejs.dev/)

### Backend
- **Runtime & Framework:** [Node.js](https://nodejs.org/) (v22 LTS) & [Express](https://expressjs.com/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Database:** [PostgreSQL 16](https://www.postgresql.org/)
- **Data Access:** Parameterized SQL queries using `pg` / `pg-pool` with transaction isolation
- **Authentication:** JWT (`jsonwebtoken`) with salted hashing (`bcrypt` / `argon2`)
- **File & Media Handling:** Multer with custom magic-byte header sniffers
- **API Documentation:** OpenAPI 3.0 (`openapi.yaml`) served interactively via Swagger UI

### Testing & Tooling
- **Unit & Component Testing:** [Vitest](https://vitest.dev/) & [@vue/test-utils](https://test-utils.vuejs.org/)
- **Integration Testing:** Supertest against live PostgreSQL test databases
- **AST Static Analysis:** Custom AST parsers verifying 100% parameterization of SQL queries
- **Containerization:** Docker & Docker Compose
- **Automation:** Comprehensive Bash test suite orchestrator (`runTests.sh`)

---

## Getting Started & Local Setup

### Prerequisites
- **Node.js:** v22.x or later
- **npm:** v10.x or later
- **Docker Desktop / Docker Engine:** (for PostgreSQL 16)
- **Git**

### 1. Clone the Repository
```bash
git clone git@github.com:SUDO-V0RT3X/LingoLearn.git
cd LingoLearn
```

### 2. Backend Setup
```bash
cd backend
npm install

# Configure environment variables
cp .env.example .env
# Open .env and set AUTH_SECRET to any secure random string

# Launch PostgreSQL container
docker compose up -d

# Execute schema migrations
npm run migrate

# Seed staff accounts and demo curriculum
npm run seed:staff
npm run seed:demo

# Start backend API (runs on http://localhost:4000)
npm run dev
```
*API documentation is accessible at: `http://localhost:4000/api/docs`*

### 3. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm install

# Start Vite development server (runs on http://localhost:5173)
npm run dev
```

Open your browser and navigate to `http://localhost:5173`.

---

## Seed Demo Accounts

The database seed scripts populate realistic demo profiles for every role. All accounts share the demo password: `Password123!`

| Role | Email / Username | Password | Features to Explore |
|---|---|---|---|
| **Administrator** | `one@admin.test` | `Password123!` | User management, taxonomy/theme administration, level rules |
| **Author** | `one@author.test` | `Password123!` | Content builder, block editor, media uploads, draft submission |
| **Moderator** | `one@moderator.test` | `Password123!` | Review queue, content audit, claim lock, approval/rejection |
| **Learner (Adult)** | `one_learner` | `Password123!` | Explore catalog, story reader, tests, level-up challenge |
| **Guardian** | `one@guardian.test` | `Password123!` | Linked child overview, progress reports, age verification |
| **Child Learner** | `young_learner` | `Password123!` | Child-friendly theme, curated stories, parent linking flow |

---

## Testing & Quality Assurance

The codebase maintains extensive test coverage across unit, integration, UI component, and security boundaries.

### Running All Tests
```bash
# From repository root:
./runTests.sh -all
```

### Running Tests by Subsystem
Use the subsystem flags to execute both backend and frontend tests for an individual slice:
```bash
./runTests.sh -MO    # Media & Taxonomy (MO)
./runTests.sh -TS    # Identity & Access (TS)
./runTests.sh -TK    # Onboarding & Placement (TK)
./runTests.sh -TD    # Content Builder (TD)
./runTests.sh -NS    # Learner Experience (NS)
./runTests.sh -TC    # Moderation & Progression (TC)
```

### Target-Specific Commands
| Scope | Directory | Command |
|---|---|---|
| **Backend Unit Tests** | `backend/` | `npm test` |
| **Backend Integration Tests** | `backend/` | `npm run test:integration` |
| **Frontend Unit & Component Tests** | `frontend/` | `npx vitest run` |
| **Frontend Coverage** | `frontend/` | `npx vitest run --coverage` |

---

## Security & Resilience Engineering

- **100% SQL Injection Immunity:** All database queries utilize strict parameterized placeholders (`$1, $2, ...`). Stored procedures and raw concatenation are strictly forbidden; verified via automated AST linter test suites.
- **MIME & Magic-Byte Validation:** Uploaded media files are inspected at the binary level for valid file headers (e.g., ID3 tags for MP3, RIFF for WAV, PNG/JPEG headers) preventing malicious file upload attacks regardless of file extension tampering.
- **Strict Role-Based Access Control (RBAC):** API endpoints validate session claims on the server side using Express middleware, ensuring unauthorized actions cannot be triggered via forged requests.
- **COPPA & Child Safety:** Child accounts are strictly partitioned. Under-13 accounts cannot view general audience or unverified content and remain locked until verified by an authenticated guardian.
- **Audit Trails:** Content review actions (approvals, rejections, change requests) enforce immutable audit records with timestamps and reviewer IDs.

---

## Places to Improve

While the platform is fully functional, robustly tested and complete, the following changes and additions may be beneficial:

1. Creating a way for people to apply to be authors and moderators, perhaps an entry-test for them (similar to placement tests). This will allow the app to scale, since manually adding authors and moderators to the DB is a tedious and unnecessary step.
2. More functionality for learners should be added. While the current setup will definitely enable users to learn more about phonetics, grammar and pronounciation (provided there is sufficient content), more functionality will increase the learners exposure to the language from different perspectives, which will boost their understanding and retention.
3. Creating an automatic comparer between the author's recording and the user's recording. At the moment, a manual comparison has to occur from the user. It would be more efficient for this to be done automatically, either with some sort of neural network or audio comparison algorithm.---

## Repository Structure

```
LingoLearn/
├── backend/                       # Express + PostgreSQL API Service
│   ├── migrations/                # Versioned SQL migrations (001_..., 101_..., etc.)
│   ├── scripts/                   # Database seeding scripts (seedStaff, seedDemo)
│   ├── src/
│   │   ├── middleware/            # Auth, RBAC, error handling, upload middleware
│   │   ├── routes/                # Domain route handlers organized by slice
│   │   ├── shared/                # Shared utilities, database pools, level rules
│   │   └── types/                 # Express and domain TypeScript types
│   ├── test/                      # Unit, integration, and security test suites
│   ├── openapi.yaml               # OpenAPI 3.0 specification
│   └── docker-compose.yml         # Containerized PostgreSQL service
│
├── frontend/                      # Vue 3 Single Page Application
│   ├── src/
│   │   ├── assets/                # Design tokens, CSS custom properties, global styles
│   │   ├── core/                  # Core HTTP clients, base types, global stores
│   │   ├── features/              # Feature slices (identity, onboarding, builder, etc.)
│   │   │   ├── <feature>/datasources/    # Feature-specific API clients
│   │   │   ├── <feature>/models/         # TypeScript interfaces & types
│   │   │   ├── <feature>/presentation/   # Vue components, screens, Pinia stores
│   │   │   └── <feature>/functions/      # Pure business logic & unit helpers
│   │   ├── locales/               # Reactive i18n dictionaries (en, zu)
│   │   └── router/                # Vue Router configuration & guards
│   └── test/                      # Component, store, and end-to-end spec tests
│
├── docs/                          # Architectural documentation, handover specs, scopes
├── runTests.sh                    # Automated multi-suite test runner CLI
└── README.md                      # Project documentation
```

---

## Academic Notice & License

This project was developed for academic assessment in a university software engineering module. All rights and academic integrity policies apply. Software is distributed for demonstration and portfolio review purposes.
