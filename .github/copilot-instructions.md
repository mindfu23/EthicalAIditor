# EthicalAIditor - AI Coding Instructions

AI writing assistant for authors/editors using ethically-sourced LLMs (PleIAs models trained on Common Corpus).

## Architecture (3-Tier with Multi-Platform Frontend)

```
Frontend (Vite/React)     →  API Layer (Cloudflare Worker)  →  LLM Backend (Google Cloud Run)
├─ Web: Netlify                ├─ Auth & rate limiting           └─ Python Flask + transformers
├─ Desktop: Electron           ├─ D1 database                    └─ PleIAs/Pleias-350m-Preview
└─ Mobile: Capacitor           └─ Proxy to Cloud Run
```

**Key insight**: Cloudflare Workers cannot call raw IP addresses (only HTTPS). The Worker (`worker/index.js`) proxies to Cloud Run, while Netlify Functions (`netlify/functions/vm-chat.js`) can call the VM directly over HTTP.

## Critical Files by Domain

| Domain | Key Files |
|--------|-----------|
| Frontend entry | `src/App.jsx` → `src/components/Editor.jsx` (744 lines, main UI) |
| LLM service | `src/services/huggingface.js` - unified API, handles cloud/local switching |
| Local inference | `src/services/local-llm.js` - Electron/mobile llama.cpp integration |
| API proxy | `worker/index.js` - Cloudflare Worker with D1 bindings |
| LLM backend | `llm-api/app.py` - Flask server with lazy model loading |
| Database | `schema.sql` - D1 schema (users, rate_limits, daily_usage) |

## Development Commands

```bash
# Frontend
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build to dist/

# Worker (Cloudflare)
npm run worker:dev   # Local worker (localhost:8787)
npm run worker:deploy
npm run db:init      # Initialize D1 from schema.sql

# Desktop (Mac)
npm run electron:dev   # Dev mode with hot reload
npm run electron:build # Package .dmg

# Mobile
npm run mobile:ios     # Build + sync + open Xcode
npm run mobile:android
```

## Code Patterns

### Platform Detection (multi-platform inference)
```javascript
// src/services/local-llm.js
import { getPlatform, Platform } from './local-llm.js';
if (getPlatform() === Platform.ELECTRON) { /* use node-llama-cpp */ }
if (getPlatform() === Platform.WEB) { /* fallback to cloud API */ }
```

### API Calls (always through Worker)
```javascript
// Never call Cloud Run directly from frontend
const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;
fetch(`${API_BASE}/api/huggingface`, { method: 'POST', body: JSON.stringify({ messages }) });
```

### Auth Context
```jsx
// src/lib/auth provides AuthProvider, useAuth hook, AuthModal
const { user, isAuthenticated, openAuth, logout } = useAuth();
```

### Rate Limits (by tier)
- `anonymous`: 5 queries/day
- `free`: 30 queries/day  
- `premium`: 200 queries/day

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_CLOUDFLARE_WORKER_URL` | Netlify build | Worker API endpoint |
| `HF_TOKEN` | Cloud Run | HuggingFace model access |
| `LLM_API_URL` | Worker (wrangler.toml) | Cloud Run endpoint |

## Deployment Flow

1. **Frontend**: Push to main → Netlify auto-deploys from `dist/`
2. **Worker**: `npm run worker:deploy` → Updates Cloudflare
3. **LLM API**: `gcloud builds submit` in `llm-api/` → Cloud Run

## Cold Start Handling

Cloud Run scales to zero. The frontend implements:
- `src/services/warmup.js` - Pre-warms on page load
- `src/components/ColdStartIndicator.tsx` - Shows warming status
- `/health` endpoint returns `model_loaded: boolean`

## Model Configuration

Primary model: `PleIAs/Pleias-350m-Preview` (ethical, Common Corpus trained)  
Local models (GGUF format): Configured in `AVAILABLE_MODELS` array in `local-llm.js`

## Testing Locally

```bash
# 1. Start frontend
npm run dev

# 2. Start worker (separate terminal)
npm run worker:dev

# 3. LLM API - either use deployed Cloud Run or:
cd llm-api && python app.py  # Requires HF_TOKEN
```
