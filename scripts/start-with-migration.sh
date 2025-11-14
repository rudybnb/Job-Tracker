#!/bin/bash
set -e

echo "🚀 Starting Job Tracker with database migration..."

# Run database migration
echo "📊 Running database migration..."
npx tsx scripts/migrate-work-sessions.ts

# Start the server
echo "🌐 Starting server..."
node dist/index.js
