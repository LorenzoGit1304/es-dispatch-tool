#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f "package.json" ]; then
  echo "Error: this script must be run from the repository root."
  exit 1
fi

function check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is not installed or not on PATH."
    exit 1
  fi
}

check_command node
check_command npm
check_command psql
check_command sudo

NODE_VERSION="$(node -v | sed 's/^v//')"
if ! node -e 'const [maj, min] = process.version.slice(1).split(".").map(Number); if (maj < 20 || (maj === 20 && min < 19)) process.exit(1)' >/dev/null 2>&1; then
  echo "Error: Node.js 20.19.0 or newer is required."
  node -v
  exit 1
fi

function ask() {
  local prompt="$1"
  local default="$2"
  local result
  read -rp "$prompt [$default]: " result
  if [ -z "$result" ]; then
    result="$default"
  fi
  echo "$result"
}

echo "\n=== ES Dispatch Tool local setup ===\n"

DB_HOST="$(ask 'Database host' 'localhost')"
DB_PORT="$(ask 'Database port' '5432')"
DB_USER="$(ask 'Database user' 'dispatch_user')"
read -rsp "Database password: " DB_PASSWORD
printf '\n'
if [ -z "$DB_PASSWORD" ]; then
  echo "Error: database password cannot be empty."
  exit 1
fi
DB_NAME="$(ask 'Database name' 'es_dispatch')"
BACKEND_PORT="$(ask 'Backend port' '4000')"
FRONTEND_URL="$(ask 'Frontend URL' 'http://localhost:5173')"
CLERK_SECRET_KEY="$(ask 'Clerk secret key' 'sk_test_your_secret_key')"
CLERK_PUBLISHABLE_KEY="$(ask 'Clerk publishable key' 'pk_test_your_publishable_key')"
VITE_API_BASE_URL="$(ask 'Frontend API base URL' 'http://localhost:4000')"

echo "\nChecking environment files..."

if [ ! -f backend/.env ]; then
  cat > backend/.env <<EOF
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
PORT=${BACKEND_PORT}
CLERK_SECRET_KEY=${CLERK_SECRET_KEY}
CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY}
FRONTEND_URL=${FRONTEND_URL}
NODE_ENV=development
EOF
  echo "Created backend/.env"
else
  echo "backend/.env already exists, skipping creation."
fi

if [ ! -f frontend/.env ]; then
  cat > frontend/.env <<EOF
VITE_CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY}
VITE_API_BASE_URL=${VITE_API_BASE_URL}
EOF
  echo "Created frontend/.env"
else
  echo "frontend/.env already exists, skipping creation."
fi

echo "\nEnsuring PostgreSQL role and database exist..."

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
  echo "Created role ${DB_USER}."
else
  echo "Role ${DB_USER} already exists."
fi

if ! sudo -u postgres psql -lqt | cut -d '|' -f 1 | grep -qw "${DB_NAME}"; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  echo "Created database ${DB_NAME}."
else
  echo "Database ${DB_NAME} already exists."
fi

echo "\nInstalling backend dependencies..."
cd backend
npm install

echo "\nRunning backend migrations..."
npm run migrate:up

echo "\nInstalling frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install

cat <<EOF

=== Setup complete ===

Next steps:

1. Start the backend in one terminal:
   cd backend
   npm run dev

2. Start the frontend in another terminal:
   cd frontend
   npm run dev

3. Open the frontend URL shown by Vite in your browser.

If you need to rerun only the migrations later, use:
   cd backend
   npm run migrate:up

EOF
