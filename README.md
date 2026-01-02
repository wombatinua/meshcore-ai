# MeshCore AI Bot

Framework for MeshCore bots with a built‑in AI gateway that handles adverts, messages, and channel replies.

## Prerequisites
- Node.js >= 25 and access to a MeshCore device (serial path in `MESHCORE_DEVICE`).
- An OpenAI-compatible API key (`AI_API_KEY`).

## Setup
1) Install dependencies: `npm install`
2) Copy `.env.example` to `.env` and set values (notably `MESHCORE_DEVICE`, `AI_API_KEY`, `SQLITE_DB` defaults to `data/sqlite.db`).
3) Run locally: `npm start`

## Docker / Compose
- Build/run: `docker compose up --build`
- Compose injects env vars from `.env` and mounts `./src/data` for SQLite persistence.
- The container uses `npm run start:docker` (no env-file flag); adjust `MESHCORE_DEVICE` to the mapped device (e.g., `/dev/ttyUSB0`) and update `group_add` if your dialout GID differs.

## HTTP API
The server listens on `HTTP_HOST:HTTP_PORT` (default `0.0.0.0:8080`) under `HTTP_API` (default `/api`) and exposes actions for device control, AI relay, channel management, and data retrieval. See `src/index.js` for endpoints.
