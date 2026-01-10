# EthicalAIditor - Agent Handoff Document

## Current Status (January 10, 2026)

| Component | Status | URL |
|-----------|--------|-----|
| ⚠️ Compute Engine VM | Running (needs HTTPS) | http://34.30.2.20:8080 |
| ✅ Cloud Run | Active (primary) | https://llm-api-1097587800570.us-central1.run.app |
| ✅ Cloudflare Worker | Working | https://ethicalaiditor-api.valueape.workers.dev |
| ✅ Netlify Frontend | Deployed | https://ethicalaiditor.netlify.app |

### ⚠️ VM HTTPS Required
The VM is running but browser blocks HTTP calls from HTTPS sites (mixed content).
Frontend currently uses **Cloud Run** as primary (has 30-45s cold start).

**To enable VM (no cold start):** Set up nginx + Let's Encrypt on the VM.
See "Enable HTTPS on VM" section below.

## DEPLOYMENT OPTIONS

### Option 1: Google Compute Engine VM (RECOMMENDED)
**Cost:** ~$25/month (e2-medium) | **Cold Start:** 0 seconds (always on)

### Option 2: Cloud Run with Baked Model (FALLBACK)
**Cost:** $0-5/month (pay per use) | **Cold Start:** 30-45 seconds

---

## OPTION 1: Compute Engine VM Setup (RECOMMENDED)

### Step 1: Create the VM
```bash
# Create e2-medium VM in us-central1 (4GB RAM needed for model)
gcloud compute instances create llm-api-vm \
  --project=ethicalaiditorv2 \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server

# Allow HTTP traffic on port 8080
gcloud compute firewall-rules create allow-llm-api \
  --project=ethicalaiditorv2 \
  --allow=tcp:8080 \
  --target-tags=http-server \
  --description="Allow LLM API traffic"
```

### Step 2: SSH into VM and Install Dependencies
```bash
# Get VM IP
gcloud compute instances describe llm-api-vm \
  --zone=us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# SSH into VM
gcloud compute ssh llm-api-vm --zone=us-central1-a

# Once connected, run setup script (or copy commands manually):
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y python3 python3-pip python3-venv git
sudo mkdir -p /opt/llm-api/app
sudo chown $USER:$USER /opt/llm-api
cd /opt/llm-api
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install flask flask-cors gunicorn transformers torch python-dotenv huggingface_hub
```

### Step 3: Deploy Application Files
```bash
# From your LOCAL machine, copy files to VM:
cd /Users/jamesbeach/Documents/visual-studio-code/github-copilot/EthicalAIditor/llm-api/vm-setup

# Replace YOUR_VM_IP with the IP from Step 2
VM_IP="YOUR_VM_IP"
scp app.py ${USER}@${VM_IP}:/opt/llm-api/app/
scp llm-api.service ${USER}@${VM_IP}:/opt/llm-api/
```

### Step 4: Configure and Start Service
```bash
# SSH back into VM
gcloud compute ssh llm-api-vm --zone=us-central1-a

# Set your HuggingFace token
echo "HF_TOKEN=YOUR_HUGGINGFACE_TOKEN" | sudo tee /opt/llm-api/.env

# Install and start systemd service
sudo cp /opt/llm-api/llm-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable llm-api
sudo systemctl start llm-api

# Watch logs (model takes ~60s to load first time)
sudo journalctl -u llm-api -f
```

### Step 5: Update Frontend to Use VM
```bash
# Get VM's external IP
gcloud compute instances describe llm-api-vm \
  --zone=us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Update src/services/huggingface.js:
# Change CLOUD_RUN_URL to: http://YOUR_VM_IP:8080
```

### Step 6: Test
```bash
curl -X POST http://YOUR_VM_IP:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello, how are you?","max_tokens":50}'
```

### VM Management Commands
```bash
# Check service status
sudo systemctl status llm-api

# View logs
sudo journalctl -u llm-api -f

# Restart service
sudo systemctl restart llm-api

# Stop/Start VM (to save costs when not using)
gcloud compute instances stop llm-api-vm --zone=us-central1-a
gcloud compute instances start llm-api-vm --zone=us-central1-a
```

---

## OPTION 2: Cloud Run with Baked Model (FALLBACK)

Use this if you prefer pay-per-use pricing or want serverless scaling.
Docker files are in `llm-api/` directory.

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

### Added Compute Engine VM Deployment
- **llm-api/vm-setup/** - New directory with VM deployment files
  - `app.py` - Simplified Flask app for VM (loads model once at startup)
  - `llm-api.service` - systemd service configuration
  - `01-install-dependencies.sh` - VM setup script
  - `02-deploy-app.sh` - Deployment helper script

### Baked Model Docker (Fallback Option)
- **llm-api/Dockerfile** - Downloads model at build time
- **llm-api/download_model.py** - Script to pre-download model
- **llm-api/cloudbuild.yaml** - Passes HF_TOKEN from Secret Manager
- **llm-api/app.py** - Uses baked model cache, supports EAGER_LOAD option

### Expected Response Times
| Deployment | First Request | Subsequent |
|------------|---------------|------------|
| **Compute Engine VM** | **0 sec** (always on) | 2-5 sec |
| Cloud Run (baked) | 30-45 sec | 2-5 sec |
| Cloud Run (download) | 60-90 sec | 2-5 sec |

---

## Cost Comparison

| Option | Monthly Cost | Notes |
|--------|-------------|-------|
| Compute Engine e2-medium | ~$25 | Always on, 0 cold start |
| Cloud Run min-instances=1 | ~$15-25 | Always on, needs EAGER_LOAD |
| Cloud Run scale-to-zero | $0-5 | Pay per use, 30-45s cold start |

**Recommendation:** Use Compute Engine VM for consistent, fast responses.

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
├── llm-api/                    # LLM API deployment options
│   ├── vm-setup/               # ← RECOMMENDED: VM deployment
│   │   ├── app.py              # Simplified Flask app for VM
│   │   ├── llm-api.service     # systemd service file
│   │   ├── 01-install-dependencies.sh
│   │   └── 02-deploy-app.sh
│   ├── app.py                  # Docker/Cloud Run version (FALLBACK)
│   ├── Dockerfile              # Docker build for Cloud Run
│   ├── download_model.py       # Pre-download model for Docker
│   ├── cloudbuild.yaml         # Cloud Build config
│   └── requirements.txt
├── worker/
│   └── index.js                # Cloudflare Worker - proxies to API
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
