# Project Migration Guide

This guide is written for someone with very little coding experience. It explains how to move this project to a new computer or a new terminal, install the required tools, and start both the backend and frontend without guesswork.

---

## 1. What this guide covers

- Clone the project from GitHub onto a new machine.
- Install the required tools: Git, Node.js, and PostgreSQL.
- Set up the backend and frontend correctly.
- Run the database migrations in the right order.
- Start the app locally and verify it works.

> If you only need to move this project from one terminal to another on the same machine, start at section 2.

---

## 2. Required tools

You need these installed on the new machine or terminal:

- Git
- Node.js version 20.19.0 or newer
- PostgreSQL

If any of these are missing, install them before continuing.

### 2.1 Install Git

On Linux, open a terminal and run:

```bash
sudo apt update
sudo apt install git -y
```

### 2.2 Install Node.js

Use the official Node.js installer or a version manager. The simplest way is:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Check the version:

```bash
node -v
```

It must be `v20.19.0` or newer.

### 2.3 Install PostgreSQL

On Linux, run:

```bash
sudo apt install postgresql postgresql-contrib -y
```

Confirm PostgreSQL is running:

```bash
sudo systemctl status postgresql
```

If it is not running, start it:

```bash
sudo systemctl start postgresql
```

---

## 3. Clone the repository

In the terminal, run:

```bash
git clone https://github.com/LorenzoGit1304/es-dispatch-tool.git
cd es-dispatch-tool
```

If you already have the project folder, just open the terminal there.

---

## 4. Create the database user and database

This step is important. The backend needs a PostgreSQL user and a database.

1. Open a terminal.
2. Run the PostgreSQL command-line tool as the default database user:

```bash
sudo -u postgres psql
```

3. Run these commands inside `psql`, one line at a time:

```sql
CREATE ROLE dispatch_user WITH LOGIN PASSWORD 'yourpassword';
ALTER ROLE dispatch_user CREATEDB;
CREATE DATABASE es_dispatch OWNER dispatch_user;
\q
```

Replace `yourpassword` with a password you choose.

---

## 5. Backend setup

### 5.1 Go to the backend folder

```bash
cd backend
```

### 5.2 Copy the environment file

```bash
cp .env.example .env
```

### 5.3 Open `backend/.env` and edit values

Use a text editor or terminal editor to set the values exactly like this:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=dispatch_user
DB_PASSWORD=yourpassword
DB_NAME=es_dispatch
PORT=4000
CLERK_SECRET_KEY=sk_test_your_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

- Replace `yourpassword` with the same password from step 4.
- Replace `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` with your Clerk test keys.

### 5.4 Install backend dependencies

```bash
npm install
```

### 5.5 Run database migrations

```bash
npm run migrate:up
```

If migration succeeds, the database schema is now ready.

### 5.6 Start the backend server

```bash
npm run dev
```

Leave this terminal open. The backend will run at:

- `http://localhost:4000`

---

## 6. Frontend setup

Open a new terminal window or tab so the backend can keep running.

### 6.1 Go to the frontend folder

```bash
cd /home/lorenzo/Documents/es-dispatch-tool/frontend
```

If you are already in the project folder, use:

```bash
cd frontend
```

### 6.2 Copy the frontend environment file

```bash
cp .env.example .env
```

### 6.3 Open `frontend/.env` and edit values

Set the values like this:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_BASE_URL=http://localhost:4000
```

Replace `pk_test_your_key_here` with your Clerk publishable key.

### 6.4 Install frontend dependencies

```bash
npm install
```

### 6.5 Start the frontend server

```bash
npm run dev
```

The app will start at a local address such as:

- `http://localhost:5173`

---

## 7. Verify the application works

1. Open a browser.
2. Go to the URL shown by the frontend terminal, usually `http://localhost:5173`.
3. Sign in using Clerk.
4. The app should reach the backend at `http://localhost:4000`.

If the browser shows the app and no errors appear, the migration is successful.

## 8. Automated setup script

If you want to automate the initial setup, run the script from the repository root:

```bash
./setup-local.sh
```

The script will:

- check Node.js and PostgreSQL availability
- create `backend/.env` and `frontend/.env` if they are missing
- create the database role and database if needed
- install backend and frontend dependencies
- run backend migrations

After the script completes, start the app manually in two terminals:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

---

## 8. Useful commands for future terminal sessions

### Backend

```bash
cd backend
npm install
npm run migrate:up
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Check migration status

```bash
cd backend
npm run migrate:status
```

### Build for production

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```

---

## 9. Common problems and fixes

### Problem: `node: command not found`

- Node.js is not installed or the terminal cannot find it.
- Install Node.js again and verify with `node -v`.

### Problem: `psql: command not found`

- PostgreSQL is not installed or the terminal cannot find it.
- Install PostgreSQL again and verify with `psql --version`.

### Problem: migrations fail

- Make sure `backend/.env` has the correct database values.
- Make sure the database `es_dispatch` exists and the user `dispatch_user` can access it.

### Problem: frontend cannot reach backend

- Make sure backend is running at `http://localhost:4000`.
- Make sure `frontend/.env` has `VITE_API_BASE_URL=http://localhost:4000`.

---

## 10. If you need to move the project again later

You only need to repeat these simple steps:

1. Clone the repository.
2. Create or copy `backend/.env` and `frontend/.env`.
3. Install dependencies in both folders.
4. Run `npm run migrate:up` from `backend`.
5. Start the backend and frontend servers.

This guide is the complete, step-by-step process to migrate this project safely.
