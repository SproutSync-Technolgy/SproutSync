# SproutSync: New Machine Setup & Deployment Manual
**Target Audience:** Teammates, Capstone Panelists, Evaluators, and New Developers  
**Target Environment:** Windows 10/11 (with Docker Desktop / PowerShell)  
**System:** SproutSync Monorepo (IoT Automated Mung Bean Sprout Production & Monitoring)

---

## 1. System Overview: What Are We Running?

SproutSync is an IoT capstone monorepo composed of four core running layers:

```text
[ ESP32 IoT Hardware / Firmware ] (iot/esp32)
              │  (Telemetry via MQTT / HTTP)
              ▼
    [ Mosquitto MQTT ] (Port 1883)
              ▲
              │
    [ FastAPI Backend ] (Port 8000) ─── [ PostgreSQL 17 / Supabase ] (Port 5432)
              ▲
              │  (Reverse Proxy /api)
              ▼
[ React + Vite Dashboard ] (Port 5173)
```

1. **Frontend Dashboard (`frontend/dashboard`)**: Web interface built with React 19, TypeScript, Tailwind CSS, and Vite.
2. **Backend API Service (`backend/api`)**: REST API built with FastAPI, SQLAlchemy 2.0, and Alembic for data models, authentication, and device endpoints.
3. **Database Engine (`database` / Docker)**: PostgreSQL 17 container (or cloud-hosted Supabase) managing user accounts, sessions, sensor telemetry, and batch schedules.
4. **Message Broker (`infrastructure/mosquitto`)**: Eclipse Mosquitto MQTT broker for lightweight IoT sensor telemetry ingestion.

---

## 2. Prerequisites Checklist & Rationale

Before pulling the repository, the destination computer must have the following tools installed:

| Tool | Minimum Version | Why Is It Needed? |
| :--- | :--- | :--- |
| **Git** | `2.40+` | Clones the repository, manages branch tracking, and ensures line endings (`.gitattributes`) are handled correctly. |
| **Node.js & npm** | `v22.12.0+` (LTS) | Executes the frontend workspace, runs `npm` package manager, and powers the Vite dev server and build compiler. |
| **Docker Desktop** | Latest with Compose v2 | Runs PostgreSQL, Mosquitto, and the FastAPI container in isolated containers without needing manual database server configuration. |
| **Python** *(Optional)* | `3.12+` | Only needed if running the backend natively **without** Docker, or running local Python verification scripts. |
| **PlatformIO Core** *(Optional)* | `6.1.18+` | Only needed if modifying or compiling firmware for the ESP32 microcontroller (`iot/esp32`). |

> [!IMPORTANT]
> **Docker Desktop Requirement:** Ensure Docker Desktop is configured to use the **WSL 2 backend** (Windows Subsystem for Linux) and that the Docker engine is running before starting backend services.

---

## 3. Step-by-Step Setup Guide

### Step 1: Clone the Repository
Open PowerShell or Terminal and clone the repository:
```powershell
git clone https://github.com/SproutSync-Technolgy/SproutSync.git
cd SproutSync
```
* **Why this is needed:** Pulls the complete monorepo including frontend source, backend API services, IoT firmware, database schemas, and startup automation scripts.

---

### Step 2: Configure Environment Variables (`.env`)
The repository contains `.env.example`. Create the real `.env` file:
```powershell
Copy-Item .env.example .env
```
*(On Command Prompt, use `copy .env.example .env`)*

* **Why this is needed:** Sensitive configurations (database passwords, API secrets, Supabase public anon keys) are **never committed to Git** to prevent credential leaks. The Docker Compose file and frontend will fail immediately if `.env` does not exist because they enforce strict parameter checks.

Inspect `.env` to verify the default local development values:
```env
POSTGRES_DB=sproutsync
POSTGRES_USER=sproutsync
POSTGRES_PASSWORD=local-development-only
DATABASE_URL=postgresql+psycopg://sproutsync:local-development-only@127.0.0.1:5432/sproutsync
SUPABASE_URL=https://egbocohxklbefxcewtlg.supabase.co
SUPABASE_ANON_KEY=
VITE_SUPABASE_URL=https://egbocohxklbefxcewtlg.supabase.co
VITE_SUPABASE_ANON_KEY=
FRONTEND_URL=http://localhost:5173
```

---

### Step 3: Run the System

You have two paths to launch the application:

#### Option A: One-Click Automated Launcher (Recommended for Windows)
In the repository root, double-click **`start.bat`** (or run `.\start.bat` in PowerShell).

```powershell
.\start.bat
```

**What `start.bat` executes automatically:**
1. Checks if `.env` exists (creates from `.env.example` if absent).
2. Syncs static brand assets (`logo.png`, chamber images) into `frontend/dashboard/src/assets/`.
3. Installs frontend dependencies via `npm install`.
4. Starts backend services (FastAPI, Postgres, Mosquitto) via `docker compose up --build -d`.
5. Spawns the Vite development server (`npm run dev`) and automatically launches `http://localhost:5173` in your default browser.

#### Option B: Manual Command-Line Launch (Step-by-Step)
If you prefer running commands manually or are on a non-Windows machine:

1. **Synchronize brand assets:**
   ```powershell
   .\scripts\copy-assets.bat
   ```
   *Why:* Ensures high-resolution chamber models and logos are present in the frontend assets bundle.

2. **Install frontend dependencies:**
   ```powershell
   npm ci
   ```
   *Why:* Installs the exact locked versions of React, Vite, Tailwind CSS, Lucide icons, and Motion from `package-lock.json`.

3. **Start backend containers:**
   ```powershell
   docker compose up --build -d
   ```
   *Why:* Spins up the PostgreSQL 17 database, Mosquitto broker, and builds the FastAPI container. The API container automatically applies Alembic migrations on boot.

4. **Start the frontend development server:**
   ```powershell
   npm run dev
   ```
   *Why:* Boots Vite at `http://127.0.0.1:5173` with Hot Module Replacement (HMR) and proxies `/api` calls directly to the local backend.

---

### Step 4 (Fallback): Running Backend Without Docker
If Docker Desktop is not installed or cannot run on the computer, you can run the FastAPI backend natively using Python:

```powershell
# 1. Create a Python virtual environment
py -3.12 -m venv backend\api\.venv

# 2. Activate virtual environment
.\backend\api\.venv\Scripts\Activate.ps1

# 3. Install backend dependencies in editable development mode
pip install -e ".\backend\api[dev]"

# 4. Start the FastAPI server
python -m uvicorn app.main:app --app-dir backend\api --reload --host 127.0.0.1 --port 8000
```
* **Why this is needed:** Provides an emergency or lightweight developer fallback when hardware virtualization or Docker containers are not available.

---

## 4. System Verification: How Do You Know It Works?

To verify the installation is 100% operational, perform these checks:

### 1. Automated Verification Script
Run the built-in test suite:
```powershell
.\verify.bat
```
*(Runs TypeScript typecheck, production build bundling, and repository standards check).*
- **Expected Result:** `[SUCCESS] All Verifications Passed!`

### 2. Service Endpoints & Health Table

| Service / Component | Address / Command | Expected Behavior | Why It Matters |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | `http://localhost:5173` | Opens the SproutSync landing page with navbar, branding, and role preview dialogs. | Verifies the UI bundle compiles and renders properly. |
| **API Health Indicator** | Top right on `http://localhost:5173` | Badge shows green **"System ready"** (or fallback warning if API stopped). | Confirms frontend-to-backend proxy communication is working. |
| **API Interactive Docs** | `http://localhost:8000/docs` | Swagger UI documentation with endpoints for `/api/v1/health` and `/api/v1/auth`. | Confirms FastAPI routing and OpenAPI schema generator are active. |
| **Raw Health API** | `http://localhost:8000/api/v1/health` | Returns JSON: `{"status": "ok"}`. | Direct probe confirming backend process liveness. |
| **PostgreSQL Database** | `127.0.0.1:5432` | Container status `healthy` in `docker ps`. | Confirms storage engine is accepting relational data queries. |
| **Mosquitto MQTT** | `127.0.0.1:1883` | Container running. | Confirms IoT message gateway is ready for ESP32 telemetry. |

---

## 5. How to Stop the System Cleanly

To stop the background services and release ports:

1. In the terminal running the frontend (`npm run dev`), press **`Ctrl + C`** and type **`Y`**.
2. Run the stop script:
   ```powershell
   .\stop.bat
   ```
   *(Or manually run `docker compose down`)*.

* **Why this is needed:** Stops the running containers gracefully without deleting database volumes. Your database records and configured state persist in the `postgres-data` Docker volume.

---

## 6. Troubleshooting Common Pitfalls

| Problem / Error | Cause | Solution |
| :--- | :--- | :--- |
| **`docker compose could not start containers`** | Docker Desktop is closed or WSL 2 service is not running. | Open Docker Desktop from the Start menu, wait for the whale icon in the taskbar to turn solid green, and re-run `start.bat`. |
| **`failed to bind port 5432: address already in use`** | A local installation of PostgreSQL is already running on port 5432 on the host machine. | Open `services.msc`, find `postgresql-x64`, right-click and select **Stop**, then re-run `docker compose up -d`. |
| **`failed to bind port 8000: address already in use`** | Another web server or prior Python instance is occupying port 8000. | Check running tasks with `netstat -ano \| findstr :8000` and terminate the PID with `taskkill /PID <PID> /F`. |
| **`Scripts cannot be loaded because running scripts is disabled`** | Windows PowerShell execution policy restriction. | Run PowerShell as Administrator and execute: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or use `start.bat` (batch files are unrestricted). |
| **Dashboard logo or chamber image is missing (broken image icon)** | Assets were not copied into the frontend source tree. | Run `.\scripts\copy-assets.bat` or run `.\start.bat`. |
| **`.env.example: Copy .env.example to .env first` error in Docker** | `.env` file does not exist in the root folder. | Run `Copy-Item .env.example .env`. |
| **Google Sign-In fails or says provider disabled** | Supabase project OAuth keys not linked. | For local testing without Google OAuth credentials, use standard mock session or email-based flows documented in `docs/current-status.md`. |

