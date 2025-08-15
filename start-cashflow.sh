#!/bin/bash
echo "🚀 Starting ERdesignandbuild Cash Flow Management System..."
echo "📊 This is the duplicate version for testing cash flow features"
echo "🔧 Server will run on port 5001 to avoid conflicts with main system"

export PORT=5001
export NODE_ENV=development

# Use cashflow package configuration
npm run dev --prefix . -- --config package-cashflow.json