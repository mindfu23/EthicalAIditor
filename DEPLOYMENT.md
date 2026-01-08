# EthicalAIditor Deployment Guide

Complete guide to deploying EthicalAIditor on Netlify with Cloudflare Workers for API proxy.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Netlify        │     │  Cloudflare Worker   │     │  HuggingFace     │
│  (Frontend)     │────▶│  (API Proxy)         │────▶│  Inference API   │
│                 │     │  + D1 Database       │     │                  │
└─────────────────┘     └──────────────────────┘     └──────────────────┘
```

- **Netlify**: Hosts the Vite/React frontend
- **Cloudflare Worker**: Handles auth, rate limiting, proxies HuggingFace API
- **Cloudflare D1**: SQLite database for users, usage tracking
- **HuggingFace**: PleIAs models (ethical AI trained on Common Corpus)

---

## Prerequisites

- Node.js 18+
- npm or yarn
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (optional but recommended)
- Cloudflare account (free tier works)
- HuggingFace account for API token

---

## Step 1: Install Dependencies

```bash
cd EthicalAIditor
npm install
```

---

## Step 2: Set Up Cloudflare

### 2.1 Login to Cloudflare

```bash
npx wrangler login
```

### 2.2 Create D1 Database

```bash
npx wrangler d1 create ethicalaiditor-db
```

This outputs something like:
```
✅ Created database 'ethicalaiditor-db'
database_id = "abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2.3 Update wrangler.toml

Open `wrangler.toml` and paste your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ethicalaiditor-db"
database_id = "abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # <-- Your ID here
```

### 2.4 Initialize Database Schema

```bash
npx wrangler d1 execute ethicalaiditor-db --file=schema.sql
```

### 2.5 Set API Secrets

```bash
npx wrangler secret put HUGGINGFACE_API_KEY
# Paste your HuggingFace token when prompted
```

Get your token from: https://huggingface.co/settings/tokens

### 2.6 Deploy Worker

```bash
npx wrangler deploy
```

Note the URL output (e.g., `https://ethicalaiditor-api.username.workers.dev`)

---

## Step 3: Configure Frontend Environment

### 3.1 Create .env file

```bash
cp .env.example .env
```

### 3.2 Update with your Worker URL

```env
VITE_CLOUDFLARE_WORKER_URL=https://ethicalaiditor-api.username.workers.dev
```

---

## Step 4: Deploy to Netlify

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

## Step 5: Verify Deployment

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

```bash
# Start Vite dev server
npm run dev

# In another terminal, start Worker locally (optional)
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
