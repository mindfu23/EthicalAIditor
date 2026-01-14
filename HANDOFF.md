# EthicalAIditor - Agent Handoff Document

## Current Status (Updated: Implementation Complete)

| Component | Status | URL |
|-----------|--------|-----|
| ✅ Cloud Run | Primary API | https://llm-api-1097587800570.us-central1.run.app |
| ✅ Cloudflare Worker | API v3.0.0 | https://ethicalaiditor-api.valueape.workers.dev |
| ✅ Netlify Frontend | Live | https://ethicalaiditor.netlify.app |
| ✅ Netlify Function | VM Proxy | /.netlify/functions/vm-chat |
| ⚠️ Compute Engine VM | HTTP only | http://34.30.2.20:8080 |

### Current Model
**PleIAs/Pleias-350m-Preview** - Ethical AI model trained on legally licensed materials (Common Corpus).
- Size: ~700MB
- Context window: ~2048 tokens
- Response time: 4-18 seconds depending on output length

---

## Implementation Status (Phases 1-8)

| Phase | Feature | Status | Files |
|-------|---------|--------|-------|
| ✅ 1 | Tenant Sessions | Complete | worker/index.js, src/services/session.js |
| ✅ 2 | RAG Foundation | Complete | schema.sql, wrangler.toml, src/services/rag.js |
| ✅ 3 | Style Assets API | Complete | worker/index.js, src/services/styles.js, StyleAssetsPanel.jsx |
| ✅ 4 | Structured Edits | Complete | src/services/structured-edit.js, EditPreview.jsx |
| ✅ 5 | Audit Jobs | Complete | worker/index.js, src/services/audit.js, AuditJobsPanel.jsx |
| ✅ 6 | Progressive UX | Complete | SSE streaming in worker, audit.js |
| ✅ 7 | Caching Layer | Complete | worker/index.js, src/services/cache.js |
| ✅ 8 | LoRA Modes | Complete | WritingModeSelector.jsx |

### New API Endpoints (v3.0.0)

**RAG:**
- `POST /api/rag/embed` - Embed document chunks for retrieval
- `POST /api/rag/retrieve` - Semantic search for relevant chunks
- `DELETE /api/rag/chunks` - Delete chunks for a manuscript

**Styles:**
- `GET /api/styles` - List style assets (filter by type)
- `POST /api/styles` - Create/update style asset
- `DELETE /api/styles/:id` - Delete style asset
- `GET /api/styles/context` - Get active style context for prompts

**Audit Jobs:**
- `POST /api/audit/jobs` - Create audit job
- `GET /api/audit/jobs` - List jobs
- `GET /api/audit/jobs/:id` - Get job status
- `GET /api/audit/jobs/:id/stream` - SSE stream for progress
- `POST /api/audit/jobs/:id/cancel` - Cancel job

**Cache:**
- `POST /api/cache` - Get or set cache entry

### Deployment Commands (Post-Implementation)

```bash
# 1. Create Vectorize index (one-time)
npx wrangler vectorize create ethicalaiditor-vectors --dimensions=384 --metric=cosine

# 2. Apply schema updates
npx wrangler d1 execute ethicalaiditor-db --file=schema.sql --remote

# 3. Deploy worker
npx wrangler deploy

# 4. Deploy frontend (auto via GitHub push)
git add -A && git commit -m "Phase 2-8 implementation" && git push
```

### New Frontend Components

| Component | Purpose |
|-----------|---------|
| `StyleAssetsPanel.jsx` | Manage style guides, glossaries, rules |
| `EditPreview.jsx` | Diff visualization for structured edits |
| `AuditJobsPanel.jsx` | Audit job management with SSE progress |
| `WritingModeSelector.jsx` | LoRA mode selection (6 writing modes) |

### New Services

| Service | Purpose |
|---------|---------|
| `src/services/rag.js` | RAG embedding and retrieval |
| `src/services/styles.js` | Style assets CRUD |
| `src/services/audit.js` | Audit jobs with SSE streaming |
| `src/services/cache.js` | Caching with TTL support |
| `src/services/structured-edit.js` | Structured edit parsing and preview |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                │
│                     https://ethicalaiditor.netlify.app                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │         FRONTEND              │
                    │  - React/Vite (Netlify)       │
                    │  - IndexedDB (local storage)  │
                    │  - mammoth.js (.docx parsing) │
                    │  - pdf.js (.pdf parsing)      │
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │   CLOUD RUN     │   │ NETLIFY FUNCTION │   │ CLOUDFLARE      │
    │   (Primary)     │   │   (VM Proxy)     │   │ WORKER          │
    │                 │   │                  │   │ (Fallback)      │
    │ HTTPS endpoint  │   │ Can call HTTP    │   │ Rate limiting   │
    │ 30-45s cold     │   │ 10s timeout      │   │ Usage tracking  │
    │ start           │   │ (free tier)      │   │ D1 database     │
    └────────┬────────┘   └────────┬─────────┘   └────────┬────────┘
             │                     │                      │
             │                     ▼                      │
             │           ┌─────────────────┐              │
             │           │  COMPUTE ENGINE │              │
             │           │  VM (Backup)    │              │
             │           │                 │              │
             │           │ HTTP only       │              │
             │           │ Always-on       │              │
             │           │ No cold start   │              │
             │           └─────────────────┘              │
             │                                            │
             └─────────────────┬──────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   PleIAs/Pleias-    │
                    │   350m-Preview      │
                    │                     │
                    │   Ethical AI Model  │
                    │   ~700MB            │
                    └─────────────────────┘
```

---

## Request Flow (Priority Order)

The frontend (`src/services/huggingface.js`) tries endpoints in this order:

### 1. Cloud Run (Primary)
```
Frontend → https://llm-api-1097587800570.us-central1.run.app/chat
```
- HTTPS ✅ (no mixed content issues)
- Cold start: 30-45 seconds if not warmed up
- Scales automatically

### 2. Netlify Function → VM (Fallback #1)
```
Frontend → /.netlify/functions/vm-chat → http://34.30.2.20:8080/chat
```
- Netlify can call HTTP (unlike Cloudflare Workers)
- VM has no cold start (always on)
- **Limitation:** 10-second timeout on Netlify free tier

### 3. Cloudflare Worker → Cloud Run (Fallback #2)
```
Frontend → https://ethicalaiditor-api.valueape.workers.dev/api/huggingface → Cloud Run
```
- Provides rate limiting and usage tracking
- Has D1 database for user data
- Falls back to Cloud Run (not VM, due to Worker IP restriction)

---

## Data Storage

### Browser (IndexedDB)
- **Manuscripts:** Full text content, auto-saved every 2 seconds
- **Chat history:** Messages per manuscript
- **Settings:** Selected model, API key (if user-provided)
- **Location:** User's browser only, never sent to server

### Cloudflare D1 Database
- **Users:** Email, password hash, signup date
- **Usage stats:** Requests per day per user/IP
- **Database ID:** `0b5f486e-728d-4ba8-88d3-013feeefc064`

### AI Context (per request)
- **Manuscript excerpt:** Up to 2,000 characters sent to model
- **Chat messages:** Recent conversation history
- **Selected text:** If user selects text, only that portion is sent

---

## Frontend Features (January 10, 2026)

### File Upload
- **Supported formats:** `.txt`, `.md`, `.docx`, `.pdf`
- **Libraries:** mammoth.js (Word), pdfjs-dist (PDF)
- **Accept attribute:** `.txt,.md,.docx,.pdf`

### Recent Documents
- Stored in IndexedDB
- Shows title, date, size
- Can load or delete previous manuscripts

### Download/Export
- Downloads current manuscript as `.txt`
- Uses current title as filename

### Editable Title
- Click title to edit
- Enter to save, Escape to cancel
- Stored with manuscript in IndexedDB

### Text Selection for AI
- Select text in editor → only that text sent as context
- Blue indicator shows when selection is active
- Clear with X button

### Word Count
- Displayed in toolbar
- Updates as you type

### Response Cleanup
- Removes `[INST]`, `[/INST]`, `<<SYS>>` tokens
- Trims to complete sentences (no mid-sentence cutoff)

### Timing Indicator
- Shows elapsed time during generation
- Estimates total time based on history
- "Still processing..." after 30 seconds

### Model Selector (Settings)
- **Active:** PleIAs 350M (shown as selected)
- **Coming Soon:** Llama 3.3 70B, Qwen 2.5 72B, Mistral Nemo (grayed out)

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `src/components/Editor.jsx` | Main UI, file upload, chat, title editing |
| `src/components/ModelSelector.jsx` | Model selection UI (PleIAs active, others grayed) |
| `src/services/huggingface.js` | API calls, fallback logic, response cleanup |
| `src/services/warmup.js` | Service warmup and status tracking |
| `src/lib/file-parser.js` | Parse .docx, .pdf, .txt, .md files |
| `src/lib/storage/manuscript-store.js` | IndexedDB operations |

### Backend
| File | Purpose |
|------|---------|
| `llm-api/app.py` | Cloud Run Flask API (Docker) |
| `llm-api/vm-setup/app.py` | VM Flask API (systemd service) |
| `worker/index.js` | Cloudflare Worker (proxy, rate limiting) |
| `netlify/functions/vm-chat.js` | Netlify Function (VM proxy) |

### Configuration
| File | Purpose |
|------|---------|
| `wrangler.toml` | Cloudflare Worker config |
| `netlify.toml` | Netlify build & functions config |
| `.env` | `VITE_CLOUDFLARE_WORKER_URL` |
| `llm-api/Dockerfile` | Cloud Run container |

---

## Services & Credentials

### Google Cloud Platform
- **Project:** `ethicalaiditorv2`
- **Region:** `us-central1`
- **Cloud Run Service:** `llm-api`
- **Compute Engine VM:** `llm-api-vm` (zone: us-central1-a)
- **VM IP:** `34.30.2.20`
- **Secret:** `HF_TOKEN` in Secret Manager

### Cloudflare
- **Worker:** `ethicalaiditor-api`
- **Worker URL:** `https://ethicalaiditor-api.valueape.workers.dev`
- **D1 Database:** `ethicalaiditor-db`
- **Secret:** `LLM_API_URL` (Cloud Run URL)

### Netlify
- **Site:** `ethicalaiditor`
- **URL:** `https://ethicalaiditor.netlify.app`
- **GitHub:** Auto-deploys from `mindfu23/EthicalAIditor` main branch
- **Build:** `npm run build`
- **Publish:** `dist`
- **Env:** `VITE_CLOUDFLARE_WORKER_URL`

### HuggingFace
- **Model:** `PleIAs/Pleias-350m-Preview`
- **Token:** Stored in GCP Secret Manager as `HF_TOKEN`

---

## Common Commands

### Deploy Frontend (auto via GitHub)
```bash
git add -A && git commit -m "description" && git push
# Netlify auto-builds from GitHub
```

### Deploy Cloudflare Worker
```bash
cd /Users/jamesbeach/Documents/visual-studio-code/github-copilot/EthicalAIditor
npx wrangler deploy
```

### Deploy Cloud Run (if app.py changes)
```bash
cd /Users/jamesbeach/Documents/visual-studio-code/github-copilot/EthicalAIditor/llm-api
gcloud run deploy llm-api --source . --region us-central1 --allow-unauthenticated \
  --memory 4Gi --cpu 2 --timeout 300 --min-instances 0 --max-instances 2
```

### Update VM (if vm-setup/app.py changes)
```bash
# SSH into VM
gcloud compute ssh llm-api-vm --zone=us-central1-a

# Update code
sudo systemctl stop llm-api
# Copy new app.py to /opt/llm-api/app/
sudo systemctl start llm-api
```

### View Logs
```bash
# Cloudflare Worker
npx wrangler tail

# Cloud Run
gcloud run services logs read llm-api --limit=20 --region=us-central1

# VM
gcloud compute ssh llm-api-vm --zone=us-central1-a
sudo journalctl -u llm-api -f
```

### Test Endpoints
```bash
# Cloud Run health
curl https://llm-api-1097587800570.us-central1.run.app/health

# Cloud Run chat
curl -X POST https://llm-api-1097587800570.us-central1.run.app/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello","max_tokens":50}'

# VM (from within GCP or via Netlify function)
curl -X POST http://34.30.2.20:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello","max_tokens":50}'

# Worker
curl https://ethicalaiditor-api.valueape.workers.dev/api/health
```

---

## Known Limitations

### VM HTTPS
The VM only serves HTTP. Browsers block HTTP calls from HTTPS sites (mixed content).
**Current workaround:** Netlify Function proxies to VM.
**Future fix:** Add nginx + Let's Encrypt SSL to VM.

### Netlify Function Timeout
Free tier has 10-second timeout. Model inference takes 4-18 seconds.
**Current workaround:** Use shorter `max_tokens` (100) for Netlify Function path.

### Cloudflare Worker → VM
Cloudflare Workers cannot call raw IP addresses (error 1003).
**Current workaround:** Worker falls back to Cloud Run instead of VM.

### Model Size
PleIAs 350M is small. Larger models (70B) require:
- GPU instances (~$1-3/hour)
- Or HuggingFace Inference API (pay-per-request)

---

## Security

### CORS Policy (Updated January 10, 2026)
The Cloudflare Worker uses **smart CORS** - only allows specific origins:

**Allowed Origins:**
- ✅ `https://ethicalaiditor.netlify.app` (production)
- ✅ `http://localhost:5173` (Vite dev server)
- ✅ `http://localhost:3000` (alternate dev)
- ✅ `http://127.0.0.1:5173`
- ✅ `http://127.0.0.1:3000`

**Blocked:**
- ❌ All other domains (browser CORS error)
- ⚠️ Direct curl/Postman still works (CORS is browser-enforced only)

### API Keys & Secrets
| Secret | Location | Status |
|--------|----------|--------|
| HF_TOKEN | GCP Secret Manager | ✅ Secure |
| LLM_API_URL | Cloudflare Worker Secrets | ✅ Secure |
| User API keys | Browser localStorage | ⚠️ Optional, user-provided |

### Data Privacy
- Manuscripts stored in browser IndexedDB only
- Never uploaded to server (unless cloud sync added later)
- AI sees only 2,000 chars of context per request

---

## Cost Breakdown

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Netlify | Free | Build minutes, bandwidth |
| Cloudflare Worker | Free | 100K requests/day |
| Cloud Run | $0-5 | Scale-to-zero, pay per request |
| Compute Engine VM | ~$25 | e2-medium, always on |
| **Total (with VM)** | **~$25-30** | |
| **Total (Cloud Run only)** | **$0-5** | But has cold start |

---

## Future Improvements

### Planned
- [ ] Enable HTTPS on VM (nginx + Let's Encrypt)
- [ ] Add HuggingFace Inference API for larger models
- [ ] Stripe integration for premium tier
- [ ] Cloud sync for manuscripts (optional)
- [ ] Mobile app with local model inference (offline capable)

### Mobile App Considerations
For future Android/iOS app with local model:
- PleIAs 350M (~700MB) can run on-device
- Convert to ONNX, TensorFlow Lite, or CoreML
- Use llama.cpp for efficient inference
- No API calls needed = works offline
- CORS not relevant for native apps

### Model Selector
Currently shows "Coming Soon" for:
- Llama 3.3 70B
- Qwen 2.5 72B
- Mistral Nemo

These require either:
1. HuggingFace Inference API integration
2. GPU instance deployment

---

## Quick Reference

```
Frontend:     https://ethicalaiditor.netlify.app
Cloud Run:    https://llm-api-1097587800570.us-central1.run.app
Worker:       https://ethicalaiditor-api.valueape.workers.dev
VM:           http://34.30.2.20:8080 (HTTP only)
GitHub:       mindfu23/EthicalAIditor
Model:        PleIAs/Pleias-350m-Preview
```
