# EthicalAIditor - Agent Handoff Document

## Current Status

| Component | Status | URL |
|-----------|--------|-----|
| ✅ Cloud Run LLM API | Working | https://llm-api-1097587800570.us-central1.run.app |
| ✅ Cloudflare Worker | Working | https://ethicalaiditor-api.valueape.workers.dev |
| ✅ Netlify Frontend | Deployed | (check Netlify dashboard for URL) |
| ✅ Chat Feature | Fixed | Endpoint mismatch resolved |

## Latest Fix (January 9, 2026)

**Issue:** Chat feature was returning `{"error":"Not found"}` because the frontend was calling `/api/huggingface` but the worker only handled `/api/generate` and `/api/chat`.

**Solution:** Updated `worker/index.js` to add:
- `/api/huggingface` - Main chat endpoint that converts messages array to prompt format
- `/api/models` - Returns available PleIAs models
- `/api/usage` - Returns usage statistics

**Deployed:** Worker version `0ec2d235-e9e2-471c-b475-0ed8dd78e349`

## Note on Cold Starts

The Cloud Run LLM API uses lazy model loading. First request after cold start may timeout (524 error) while the model loads (~30-60 seconds). Subsequent requests are fast.

## Current Issue

None - chat feature should now be working. Test it at the Netlify frontend URL.

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
