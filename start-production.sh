#!/bin/bash

# Production startup script for The Meta-Broker
# Sets up environment for themetabroker.org hosting

echo "🚀 Starting The Meta-Broker in Production Mode..."

# Set production environment variables
export NODE_ENV=production
export DOMAIN=themetabroker.org

# Use port from environment if available (for hosting providers like Heroku, Vercel, etc.)
# Otherwise default to 80 for production
if [ -z "$PORT" ]; then
    export PORT=80
fi

echo "Environment: $NODE_ENV"
echo "Domain: $DOMAIN"
echo "Port: $PORT"

# Start the Node.js server
node server.js 