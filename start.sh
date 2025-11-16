#!/bin/bash

export FRONTEND_URL="https://${REPLIT_DOMAINS}"
export PORT=8080

echo "Building backend..."
cd backend
go build -o ../server cmd/server/main.go
cd ..

echo "Starting backend server on port 8080..."
./server &
BACKEND_PID=$!

echo "Waiting for backend to start..."
sleep 3

echo "Starting Express frontend on port 5000..."
cd express-frontend
npm start &
FRONTEND_PID=$!

wait $BACKEND_PID $FRONTEND_PID
