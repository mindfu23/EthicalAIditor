# EthicalAIditor Deployment Guide

Complete guide to deploying EthicalAIditor on Netlify with Cloudflare Workers for API proxy.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Netlify        │     │  Cloudflare Worker   │     │  Google Cloud    │
│  (Frontend)     │────▶│  (API Proxy)         │────▶│  Run (llm-api)   │
│                 │     │  + D1 Database       │     │  PleIAs Model    │
└─────────────────┘     └──────────────────────┘     └──────────────────┘
```

- **Netlify**: Hosts the Vite/React frontend
- **Cloudflare Worker**: Handles auth, rate limiting, proxies to LLM API
- **Cloudflare D1**: SQLite database for users, usage tracking
- **Google Cloud Run**: Hosts the Python LLM API with PleIAs model

---

## Prerequisites

- Node.js 18+
- npm or yarn
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (optional but recommended)
- Cloudflare account (free tier works)
- HuggingFace account for API token
- Google Cloud account with billing enabled

---

## Step 1: Install Dependencies

```bash
cd EthicalAIditor
npm install
```

---

## Step 2: Deploy LLM API to Google Cloud Run

### 2.0 Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- A Google Cloud project with billing enabled

### 2.1 Setup Google Cloud

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create ethicalaiditor --name="EthicalAIditor"
gcloud config set project ethicalaiditor

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 2.2 Get HuggingFace Token

1. Go to https://huggingface.co/settings/tokens
2. Create a new token with "Read" permissions
3. Save it for the next step

### 2.3 Build and Deploy

```bash
cd llm-api

# Build the container
gcloud builds submit --tag gcr.io/ethicalaiditor/llm-api

# Deploy to Cloud Run
gcloud run deploy llm-api \
  --image gcr.io/ethicalaiditor/llm-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars HF_TOKEN=your_huggingface_token_here \
  --cpu-boost
```

Note the Service URL (e.g., `https://llm-api-xxxxx.us-central1.run.app`)

### 2.4 Verify LLM API

```bash
# Health check
curl https://llm-api-xxxxx.us-central1.run.app/health

# Test generation (first call loads model, may take 30-60s)
curl -X POST https://llm-api-xxxxx.us-central1.run.app/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "The ethical implications of AI are", "max_length": 50}'
```

---

## Step 3: Set Up Cloudflare Worker

### 3.1 Login to Cloudflare

```bash
npx wrangler login
```

### 3.2 Create D1 Database

```bash
npx wrangler d1 create ethicalaiditor-db
```

This outputs something like:
```
✅ Created database 'ethicalaiditor-db'
database_id = "abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3.3 Update wrangler.toml

Open `wrangler.toml` and paste your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ethicalaiditor-db"
database_id = "abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # <-- Your ID here
```

### 3.4 Initialize Database Schema

```bash
npx wrangler d1 execute ethicalaiditor-db --file=schema.sql
```

### 3.5 Set API Secrets

```bash
# HuggingFace token (for fallback)
npx wrangler secret put HUGGINGFACE_API_KEY

# Cloud Run LLM API URL
npx wrangler secret put LLM_API_URL
# Paste: https://llm-api-xxxxx.us-central1.run.app
```

### 3.6 Deploy Worker

```bash
npx wrangler deploy
```

Note the URL output (e.g., `https://ethicalaiditor-api.username.workers.dev`)

---

## Step 4: Configure Frontend Environment

### 4.1 Create .env file

```bash
cp .env.example .env
```

### 4.2 Update with your Worker URL

```env
VITE_CLOUDFLARE_WORKER_URL=https://ethicalaiditor-api.username.workers.dev
```

---

## Step 5: Deploy to Netlify

### Option A: Via Netlify CLI

```bash
# Install Netlify CLI if needed
npm install -g netlify-cli

# Login
netlify login

# Initialize and link to site
netlify init

# Deploy
netlify deploy --prod
```

### Option B: Via Git Integration

1. Push your code to GitHub
2. Go to [Netlify Dashboard](https://app.netlify.com/)
3. Click "Add new site" → "Import an existing project"
4. Connect your GitHub repo
5. Build settings (auto-detected from netlify.toml):
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Add environment variable:
   - Key: `VITE_CLOUDFLARE_WORKER_URL`
   - Value: Your worker URL

### Option C: Manual Deploy

```bash
# Build locally
npm run build

# Drag & drop the `dist` folder to Netlify
```

---

## Step 6: Verify Deployment

### Check Worker Health

```bash
curl https://ethicalaiditor-api.username.workers.dev/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Check Available Models

```bash
curl https://ethicalaiditor-api.username.workers.dev/api/models
# Returns available PleIAs models
```

### Test the App

1. Open your Netlify URL
2. Upload or paste some text
3. Ask a question in the chat
4. Should receive AI response

---

## Rate Limits

| Tier | Requests/Day | Use Case |
|------|--------------|----------|
| Anonymous | 5 | Trial users |
| Free | 30 | Registered users |
| Premium | 200 | Power users |

---

## Local Development

### Frontend Only

```bash
npm run dev
```

### LLM API (Python)

```bash
cd llm-api
source venv/bin/activate  # Activate virtual environment
python app.py             # Starts on http://localhost:8080
```

### Full Stack Local

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: LLM API
cd llm-api && source venv/bin/activate && python app.py

# Terminal 3: Cloudflare Worker (optional)
npx wrangler dev
```

For local development without the Worker, the app falls back to direct HuggingFace API calls (requires API key in Settings).

---

## Troubleshooting

### "Rate limit exceeded"

- Anonymous users get 5 requests/day
- Sign up for 30 requests/day
- Rate limits reset at midnight UTC

### "API not configured"

- Check `.env` has `VITE_CLOUDFLARE_WORKER_URL`
- Verify the Worker is deployed: `wrangler tail`

### "Invalid credentials" on login

- Database might not be initialized
- Run: `npx wrangler d1 execute ethicalaiditor-db --file=schema.sql`

### HuggingFace errors

- Check your API token is valid
- Verify with: `wrangler secret list`
- PleIAs models may take ~30s on first request (cold start)

---

## Updating

### Update Worker

```bash
npx wrangler deploy
```

### Update Frontend

```bash
git push origin main
# Netlify auto-deploys from main branch
```

### Update Database Schema

```bash
# Add new migrations to schema.sql, then:
npx wrangler d1 execute ethicalaiditor-db --file=schema.sql
```

---

## Security Notes

- API keys are stored server-side in Cloudflare Secrets
- User passwords are hashed (simple btoa in this version - upgrade to bcrypt for production)
- All API calls proxied through Cloudflare Worker
- Manuscripts stored locally in browser IndexedDB until user opts to sync

---

## Next Steps

- [ ] Add Stripe for premium tier payments
- [ ] Implement manuscript cloud sync
- [ ] Add bcrypt password hashing
- [ ] Set up custom domain
- [ ] Configure Cloudflare Analytics

---

## CI/CD with GitHub Actions (Optional)

You can automate deployments with GitHub Actions:

### .github/workflows/deploy-llm-api.yml

```yaml
name: Deploy LLM API

on:
  push:
    branches: [main]
    paths:
      - 'llm-api/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v2
      
      - name: Deploy to Cloud Run
        run: |
          cd llm-api
          gcloud builds submit --tag gcr.io/${{ secrets.GCP_PROJECT }}/llm-api
          gcloud run deploy llm-api \
            --image gcr.io/${{ secrets.GCP_PROJECT }}/llm-api \
            --region us-central1 \
            --platform managed
```

This auto-deploys the LLM API when you push changes to `llm-api/`.
