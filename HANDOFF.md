# EthicalAIditor - Agent Handoff Document

## Current Status (January 10, 2026)

| Component | Status | URL |
|-----------|--------|-----|
| 🔄 Cloud Run LLM API | Ready to Deploy | https://llm-api-1097587800570.us-central1.run.app |
| ✅ Cloudflare Worker | Working | https://ethicalaiditor-api.valueape.workers.dev |
| ✅ Netlify Frontend | Deployed | https://ethicalaiditor.netlify.app |
| 🔄 Baked Model | Ready to Build | Will reduce cold start by 30-40s |

## NEXT STEPS (Resume Here)

### Step 1: Set up HF_TOKEN in Secret Manager (one-time)
```bash
# Create the secret in Google Cloud Secret Manager
echo -n "YOUR_HUGGINGFACE_TOKEN" | gcloud secrets create HF_TOKEN --data-file=-

# Grant Cloud Build access to the secret
gcloud secrets add-iam-policy-binding HF_TOKEN \
  --member="serviceAccount:1097587800570@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 2: Build and Deploy with Baked Model
```bash
cd /Users/jamesbeach/Documents/visual-studio-code/github-copilot/EthicalAIditor/llm-api

# Build image with model baked in (~10-15 min first time)
gcloud builds submit --config=cloudbuild.yaml

# Deploy to Cloud Run
gcloud run deploy llm-api \
  --image gcr.io/ethicalaiditorv2/llm-api:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

### Step 3: Test
```bash
# Wait for deploy, then test (should be 30-45s cold start now)
curl -s -X POST https://llm-api-1097587800570.us-central1.run.app/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}' --max-time 120
```

---

## What Changed (January 10, 2026)

### Baked Model into Docker Image
- **llm-api/Dockerfile** - Downloads model at build time
- **llm-api/download_model.py** - Script to pre-download model
- **llm-api/cloudbuild.yaml** - Passes HF_TOKEN from Secret Manager
- **llm-api/app.py** - Uses baked model cache, supports EAGER_LOAD option

### Expected Cold Start Times
| Setup | Cold Start |
|-------|------------|
| Previous (download at runtime) | 60-90+ sec |
| **New (baked model)** | **30-45 sec** |
| With min-instances=1 | 0 sec (always warm) |

---

## Future: Enable min-instances=1 (No Cold Start)

When you want to pay ~$15-25/month for instant responses:

```bash
# Enable always-on instance
gcloud run services update llm-api \
  --min-instances=1 \
  --region=us-central1

# Optional: Enable eager model loading (loads during container startup)
gcloud run services update llm-api \
  --set-env-vars="EAGER_LOAD=true" \
  --region=us-central1
```

To revert back to scale-to-zero:
```bash
gcloud run services update llm-api --min-instances=0 --region=us-central1
```

---

## Previous Status (January 9, 2026)
  - "AI Model Warming Up..." (amber) - Cold start in progress
  - "AI service is ready!" (green) - Ready to chat
  - "Service unavailable" (red) - Error with retry button
- Frontend now warms up Cloud Run before user tries to chat

### Previous Fix: Endpoint Mismatch
**Issue:** Chat feature was returning `{"error":"Not found"}` because the frontend was calling `/api/huggingface` but the worker only handled `/api/generate` and `/api/chat`.

**Solution:** Updated `worker/index.js` to add:
- `/api/huggingface` - Main chat endpoint that converts messages array to prompt format
- `/api/models` - Returns available PleIAs models
- `/api/usage` - Returns usage statistics

## Note on Cold Starts

The Cloud Run LLM API uses lazy model loading. First request after cold start may timeout (~30-60 seconds) while the model loads. The new warmup feature handles this by:
1. Sending a warmup ping immediately on page load
2. Showing status to user so they know to wait
3. Automatically retrying if initial warmup fails

## Current Issue

None - all features working. Test at https://ethicalaiditor.netlify.app

### To Debug
```bash
cd /Users/jamesbeach/Documents/visual-studio-code/github-copilot/EthicalAIditor
npx wrangler tail
```
Then trigger the chat in the browser to see what endpoint is being called.

## Project Structure

```
EthicalAIditor/
├── llm-api/                    # Python Flask API (deployed to Cloud Run)
│   ├── app.py                  # Main API - /health, /generate, /debug/env
│   ├── requirements.txt
│   ├── Dockerfile
│   └── venv/                   # Local only, not in git
├── worker/
│   └── index.js                # Cloudflare Worker - proxies to Cloud Run
├── src/                        # React/Vite frontend
├── wrangler.toml               # Cloudflare Worker config
├── netlify.toml                # Netlify config
├── .env                        # VITE_CLOUDFLARE_WORKER_URL
└── DEPLOYMENT.md               # Full deployment guide
```

## Key URLs & Credentials

### Cloud Run (Google Cloud)
- Project: `ethicalaiditorv2`
- Service: `llm-api`
- Region: `us-central1`
- URL: `https://llm-api-1097587800570.us-central1.run.app`
- Env var: `HF_TOKEN` (HuggingFace token)

### Cloudflare Worker
- Name: `ethicalaiditor-api`
- URL: `https://ethicalaiditor-api.valueape.workers.dev`
- D1 Database: `ethicalaiditor-db` (ID: `0b5f486e-728d-4ba8-88d3-013feeefc064`)
- Secret: `LLM_API_URL` should be set to Cloud Run URL

### Netlify
- Connected to GitHub repo
- Build: `npm run build`
- Publish: `dist`
- Env var: `VITE_CLOUDFLARE_WORKER_URL`

## Common Commands

```bash
# Deploy worker
cd /Users/jamesbeach/Documents/visual-studio-code/github-copilot/EthicalAIditor
npx wrangler deploy

# View worker logs
npx wrangler tail

# Deploy Cloud Run (if app.py changes)
cd llm-api
gcloud builds submit --config=cloudbuild.yaml
gcloud run deploy llm-api --image gcr.io/ethicalaiditorv2/llm-api:latest --region us-central1 --platform managed

# Test endpoints directly
curl https://llm-api-1097587800570.us-central1.run.app/health
curl https://ethicalaiditor-api.valueape.workers.dev/api/health
curl -X POST https://ethicalaiditor-api.valueape.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "max_length": 30}'
```

## Files to Review

1. `worker/index.js` - May need new routes for frontend
2. `src/` - Check what API endpoints the React app calls
3. `llm-api/app.py` - Cloud Run API (currently working)

## Next Steps

1. Run `npx wrangler tail` and identify what endpoint frontend is calling
2. Update `worker/index.js` to handle that endpoint
3. Redeploy worker with `npx wrangler deploy`
4. Test chat in browser

## Future Tasks (from TODO.md)

- Integrate `ColdStartIndicator` component for 30-60s model load times
- Add Stripe for premium payments
- Add bcrypt password hashing
- Set up custom domain
