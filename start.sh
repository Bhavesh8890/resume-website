#!/bin/bash

# Function to handle script termination (CTRL+C)
cleanup() {
    echo ""
    echo "🛑 Stopping Antigravity Resume Builder..."
    # Kill all child processes (background jobs)
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap SIGINT (CTRL+C) and call cleanup
trap cleanup SIGINT SIGTERM

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Antigravity Resume Builder..."

# Start Backend
echo "   -> Starting Backend (FastAPI) on port 8000..."
cd "$SCRIPT_DIR/backend"
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ Error: Virtual environment 'venv' not found in backend/."
    exit 1
fi
uvicorn main:app --reload --port 8000 &
# Actually, keeping logs visible is better for debugging, maybe prefix or just let them interleave?
# Let's let them interleave but maybe clearer to just run.
# Re-running command without silencing to allow user to see logs
# uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Brief pause to let backend init (optional)
sleep 2

# Start Frontend
echo "   -> Starting Frontend (Next.js) on port 3000..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers are running!"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend:  http://localhost:8000"
echo "   (Press CTRL+C to stop both)"
echo ""

# Wait for processes to finish (this keeps the script running)
wait
