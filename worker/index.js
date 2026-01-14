// ============================================================
// JWT UTILITIES (Simple HMAC-SHA256 signing for tenant sessions)
// ============================================================

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Base64URL encode
 */
function base64UrlEncode(str) {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

/**
 * Sign a JWT using HMAC-SHA256
 */
async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureB64 = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}.${signatureB64}`;
}

/**
 * Verify and decode a JWT
 */
async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Decode signature
  const signatureStr = base64UrlDecode(signatureB64);
  const signature = new Uint8Array(signatureStr.length);
  for (let i = 0; i < signatureStr.length; i++) {
    signature[i] = signatureStr.charCodeAt(i);
  }

  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(data));
  if (!valid) return null;

  const payload = JSON.parse(base64UrlDecode(payloadB64));

  // Check expiration
  if (payload.exp && Date.now() > payload.exp * 1000) {
    return null;
  }

  return payload;
}

/**
 * Hash a string using SHA-256 (for prompt hashing in logs)
 */
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// QUOTA CONFIGURATION
// ============================================================

const QUOTA_LIMITS = {
  anonymous: 5,
  free: 30,
  premium: 200
};

const SESSION_EXPIRY_DAYS = 30;

// ============================================================
// MAIN WORKER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // JWT secret from environment (set via: wrangler secret put JWT_SECRET)
    const JWT_SECRET = env.JWT_SECRET || 'ethicalaiditor-dev-secret-change-in-production';

    // VM URL (try HTTPS with self-signed cert first)
    const VM_URL = 'https://34.30.2.20';
    const VM_URL_HTTP = 'http://34.30.2.20:8080';
    // Cloud Run URL (HTTPS fallback)
    const CLOUD_RUN_URL = env.LLM_API_URL || 'https://llm-api-1097587800570.us-central1.run.app';

    // Smart CORS - allow production and localhost for development
    const ALLOWED_ORIGINS = [
      'https://ethicalaiditor.netlify.app',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ];

    const origin = request.headers.get('Origin');
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Tenant-Id',
      'Vary': 'Origin', // Important for caching with dynamic CORS
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ============================================================
    // TENANT SESSION ENDPOINT
    // ============================================================

    // Create or refresh anonymous tenant session
    if (url.pathname === '/api/session' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const existingToken = body.token || request.headers.get('Authorization')?.replace('Bearer ', '');

        // Try to refresh existing session
        if (existingToken) {
          const payload = await verifyJWT(existingToken, JWT_SECRET);
          if (payload && payload.tenant_id) {
            // Update last_active_at in database
            if (env.DB) {
              await env.DB.prepare(
                'UPDATE tenant_sessions SET last_active_at = datetime("now") WHERE id = ?'
              ).bind(payload.tenant_id).run();
            }

            // Return refreshed token with extended expiration
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

            const newPayload = {
              tenant_id: payload.tenant_id,
              quota_tier: payload.quota_tier || 'anonymous',
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(expiresAt.getTime() / 1000)
            };

            const newToken = await signJWT(newPayload, JWT_SECRET);

            return new Response(JSON.stringify({
              tenant_id: payload.tenant_id,
              token: newToken,
              quota_tier: newPayload.quota_tier,
              quota_limit: QUOTA_LIMITS[newPayload.quota_tier],
              expires_at: expiresAt.toISOString(),
              refreshed: true
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // Create new tenant session
        const tenantId = generateUUID();
        const quotaTier = 'anonymous';
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

        // Store in D1 database if available
        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO tenant_sessions (id, quota_tier, expires_at, metadata)
             VALUES (?, ?, ?, ?)`
          ).bind(
            tenantId,
            quotaTier,
            expiresAt.toISOString(),
            JSON.stringify({ created_from: origin || 'unknown' })
          ).run();
        }

        // Generate JWT
        const payload = {
          tenant_id: tenantId,
          quota_tier: quotaTier,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(expiresAt.getTime() / 1000)
        };

        const token = await signJWT(payload, JWT_SECRET);

        return new Response(JSON.stringify({
          tenant_id: tenantId,
          token: token,
          quota_tier: quotaTier,
          quota_limit: QUOTA_LIMITS[quotaTier],
          expires_at: expiresAt.toISOString(),
          refreshed: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('Session creation error:', error);
        return new Response(JSON.stringify({
          error: 'Failed to create session',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get tenant session info
    if (url.pathname === '/api/session' && request.method === 'GET') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return new Response(JSON.stringify({
          error: 'No session token provided',
          hint: 'Call POST /api/session to create a new session'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const payload = await verifyJWT(token, JWT_SECRET);
      if (!payload) {
        return new Response(JSON.stringify({
          error: 'Invalid or expired session',
          hint: 'Call POST /api/session to create a new session'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get usage stats from D1
      let usageToday = 0;
      if (env.DB) {
        const today = new Date().toISOString().split('T')[0];
        const usage = await env.DB.prepare(
          'SELECT calls_today FROM tenant_rate_limits WHERE tenant_id = ? AND date = ?'
        ).bind(payload.tenant_id, today).first();
        usageToday = usage?.calls_today || 0;
      }

      return new Response(JSON.stringify({
        tenant_id: payload.tenant_id,
        quota_tier: payload.quota_tier,
        quota_limit: QUOTA_LIMITS[payload.quota_tier],
        usage_today: usageToday,
        remaining: QUOTA_LIMITS[payload.quota_tier] - usageToday,
        expires_at: new Date(payload.exp * 1000).toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Link tenant session to authenticated user
    if (url.pathname === '/api/session/link' && request.method === 'POST') {
      const tenantToken = request.headers.get('Authorization')?.replace('Bearer ', '');
      const body = await request.json().catch(() => ({}));
      const userToken = body.user_token;

      if (!tenantToken || !userToken) {
        return new Response(JSON.stringify({
          error: 'Both tenant token and user token required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const tenantPayload = await verifyJWT(tenantToken, JWT_SECRET);
      if (!tenantPayload) {
        return new Response(JSON.stringify({ error: 'Invalid tenant session' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // TODO: Verify user token and link tenant to user
      // This upgrades quota from anonymous to user's tier

      return new Response(JSON.stringify({
        message: 'Session linking not yet implemented',
        tenant_id: tenantPayload.tenant_id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // HELPER: Extract and verify tenant from request
    // ============================================================

    async function getTenantFromRequest(req) {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!token) return null;
      return await verifyJWT(token, JWT_SECRET);
    }

    async function checkTenantRateLimit(tenantId, quotaTier) {
      if (!env.DB) return { allowed: true, remaining: QUOTA_LIMITS[quotaTier] };

      const today = new Date().toISOString().split('T')[0];
      const limit = QUOTA_LIMITS[quotaTier] || QUOTA_LIMITS.anonymous;

      // Get or create rate limit record
      let record = await env.DB.prepare(
        'SELECT calls_today FROM tenant_rate_limits WHERE tenant_id = ? AND date = ?'
      ).bind(tenantId, today).first();

      if (!record) {
        await env.DB.prepare(
          'INSERT INTO tenant_rate_limits (tenant_id, date, calls_today, quota_limit) VALUES (?, ?, 0, ?)'
        ).bind(tenantId, today, limit).run();
        record = { calls_today: 0 };
      }

      if (record.calls_today >= limit) {
        return { allowed: false, remaining: 0, limit };
      }

      return { allowed: true, remaining: limit - record.calls_today, limit };
    }

    async function incrementTenantUsage(tenantId) {
      if (!env.DB) return;
      const today = new Date().toISOString().split('T')[0];
      await env.DB.prepare(
        'UPDATE tenant_rate_limits SET calls_today = calls_today + 1 WHERE tenant_id = ? AND date = ?'
      ).bind(tenantId, today).run();
    }

    async function logInference(tenantId, modelName, intent, promptHash, tokensInput, tokensOutput, latencyMs, success, errorMessage) {
      if (!env.DB) return;
      await env.DB.prepare(
        `INSERT INTO inference_logs (tenant_id, model_name, intent, prompt_hash, tokens_input, tokens_output, latency_ms, success, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(tenantId, modelName, intent, promptHash, tokensInput, tokensOutput, latencyMs, success ? 1 : 0, errorMessage).run();
    }

    // Health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Debug endpoint - test VM connectivity
    if (url.pathname === '/api/debug/vm') {
      const results = {};
      
      // Test HTTP with timeout using AbortController
      const controller1 = new AbortController();
      const timeout1 = setTimeout(() => controller1.abort(), 5000);
      try {
        const start1 = Date.now();
        const r1 = await fetch('http://34.30.2.20:8080/health', { signal: controller1.signal });
        clearTimeout(timeout1);
        const text = await r1.text();
        results.http_8080 = { ok: r1.ok, status: r1.status, time: Date.now() - start1, body: text.slice(0, 100) };
      } catch (e) {
        clearTimeout(timeout1);
        results.http_8080 = { error: e.message, name: e.name };
      }
      
      // Test HTTPS to Cloud Run (known working)
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 5000);
      try {
        const start2 = Date.now();
        const r2 = await fetch(CLOUD_RUN_URL + '/health', { signal: controller2.signal });
        clearTimeout(timeout2);
        const text = await r2.text();
        results.cloud_run = { ok: r2.ok, status: r2.status, time: Date.now() - start2, body: text.slice(0, 100) };
      } catch (e) {
        clearTimeout(timeout2);
        results.cloud_run = { error: e.message, name: e.name };
      }
      
      // Test external HTTP to verify HTTP works at all
      const controller3 = new AbortController();
      const timeout3 = setTimeout(() => controller3.abort(), 5000);
      try {
        const start3 = Date.now();
        const r3 = await fetch('http://httpbin.org/get', { signal: controller3.signal });
        clearTimeout(timeout3);
        results.httpbin = { ok: r3.ok, status: r3.status, time: Date.now() - start3 };
      } catch (e) {
        clearTimeout(timeout3);
        results.httpbin = { error: e.message, name: e.name };
      }
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Models endpoint - return available models
    if (url.pathname === '/api/models' && request.method === 'GET') {
      return new Response(JSON.stringify({
        models: {
          'PleIAs/Pleias-1.2b-Preview': { name: 'Pleias 1.2B', description: 'More nuanced writing suggestions' },
          'PleIAs/Pleias-350m-Preview': { name: 'Pleias 350M', description: 'Faster responses, lighter footprint' },
        },
        default: 'PleIAs/Pleias-350m-Preview'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Usage endpoint - return placeholder usage stats
    if (url.pathname === '/api/usage' && request.method === 'GET') {
      return new Response(JSON.stringify({
        usage: {
          requests_today: 0,
          requests_limit: 100,
          requests_remaining: 100
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // VM proxy endpoint - since Workers can't reach IPs directly, just use Cloud Run
    // (kept for backwards compatibility with frontend)
    if (url.pathname === '/api/vm/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        console.log('[VM Proxy] Using Cloud Run (VM blocked by Cloudflare IP restrictions)');
        
        const cloudResponse = await fetch(`${CLOUD_RUN_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        
        const data = await cloudResponse.json();
        return new Response(JSON.stringify({
          text: data.text || data.response || '',
          source: 'cloud_run'
        }), {
          status: cloudResponse.ok ? 200 : cloudResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[VM Proxy] Error:', error);
        return new Response(JSON.stringify({ 
          error: 'AI service temporarily unavailable',
          details: error.message
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // HuggingFace endpoint - main chat endpoint used by frontend
    // Now with tenant-based rate limiting and inference logging
    if (url.pathname === '/api/huggingface' && request.method === 'POST') {
      const startTime = Date.now();
      let tenantId = null;
      let quotaTier = 'anonymous';
      let body;

      try {
        // Parse body first (can only be read once)
        console.log('[HuggingFace] Attempting to parse body, bodyUsed:', request.bodyUsed);
        body = await request.json();
        console.log('[HuggingFace] Body parsed successfully');

        // Extract tenant from Authorization header
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (token) {
          const tenant = await verifyJWT(token, JWT_SECRET);
          if (tenant) {
            tenantId = tenant.tenant_id;
            quotaTier = tenant.quota_tier || 'anonymous';

            // Check rate limit
            const rateLimit = await checkTenantRateLimit(tenantId, quotaTier);
            if (!rateLimit.allowed) {
              return new Response(JSON.stringify({
                error: 'Rate limit exceeded',
                quota_tier: quotaTier,
                quota_limit: rateLimit.limit,
                remaining: 0,
                hint: 'Sign up or upgrade to increase your quota'
              }), {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }
        }
        const llmApiUrl = env.LLM_API_URL || 'https://llm-api-1097587800570.us-central1.run.app';

        // Convert messages array to prompt string
        const messages = body.messages || [];
        const manuscriptContext = body.manuscriptContext || '';
        const intent = body.intent || 'chat'; // Intent for logging (e.g., 'rewrite_clarity', 'answer_question')
        const selectedModel = body.model || 'PleIAs/Pleias-350m-Preview';

        // Build system prompt
        let systemPrompt = 'You are an ethical AI writing assistant trained on legally licensed materials.';
        if (manuscriptContext) {
          systemPrompt += `\n\nManuscript context:\n${manuscriptContext.substring(0, 2000)}`;
        }

        // Convert messages to prompt format
        const messagePrompt = messages.map(m =>
          `${m.role === 'user' ? '[INST]' : ''} ${m.content} ${m.role === 'user' ? '[/INST]' : ''}`
        ).join('\n');

        const fullPrompt = `${systemPrompt}\n\n${messagePrompt}`;
        const promptHash = await sha256(fullPrompt);

        console.log('HuggingFace endpoint - proxying to Cloud Run');
        console.log('Prompt length:', fullPrompt.length, 'Tenant:', tenantId || 'anonymous');

        let llmResponse;
        try {
          llmResponse = await fetch(`${llmApiUrl}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: fullPrompt,
              max_length: 500,
              temperature: 0.7
            })
          });
        } catch (fetchError) {
          console.error('Fetch error:', fetchError);
          const latency = Date.now() - startTime;

          // Log failed inference attempt
          if (tenantId) {
            await logInference(tenantId, selectedModel, intent, promptHash, fullPrompt.length, 0, latency, false, 'Cloud Run timeout');
          }

          return new Response(JSON.stringify({
            error: 'The AI service is warming up. Please wait 30-60 seconds and try again.',
            details: 'Cloud Run cold start timeout'
          }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let data;
        const llmResponseText = await llmResponse.text();
        try {
          data = JSON.parse(llmResponseText);
        } catch (jsonError) {
          console.error('JSON parse error:', jsonError);
          console.error('Response text:', llmResponseText.substring(0, 200));
          const latency = Date.now() - startTime;

          if (tenantId) {
            await logInference(tenantId, selectedModel, intent, promptHash, fullPrompt.length, 0, latency, false, 'Invalid JSON response');
          }

          return new Response(JSON.stringify({
            error: 'Invalid response from AI service. It may be warming up.',
            details: llmResponseText.substring(0, 100)
          }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!llmResponse.ok) {
          console.error('Cloud Run error:', data);
          const latency = Date.now() - startTime;

          if (tenantId) {
            await logInference(tenantId, selectedModel, intent, promptHash, fullPrompt.length, 0, latency, false, data.error || 'LLM API error');
          }

          return new Response(JSON.stringify({ error: data.error || 'LLM API error' }), {
            status: llmResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Extract just the generated response (remove the original prompt if included)
        let responseText = data.generated_text || '';
        if (responseText.startsWith(fullPrompt)) {
          responseText = responseText.substring(fullPrompt.length).trim();
        }

        const latency = Date.now() - startTime;

        // Log successful inference and increment usage
        if (tenantId) {
          await incrementTenantUsage(tenantId);
          await logInference(tenantId, selectedModel, intent, promptHash, fullPrompt.length, responseText.length, latency, true, null);
        }

        // Return in format frontend expects
        return new Response(JSON.stringify({
          text: responseText,
          model: selectedModel,
          tenant_id: tenantId,
          latency_ms: latency
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('HuggingFace endpoint error:', error);
        const latency = Date.now() - startTime;

        if (tenantId) {
          await logInference(tenantId, 'unknown', 'chat', 'error', 0, 0, latency, false, error.message);
        }

        return new Response(JSON.stringify({
          error: error.message || 'Internal server error',
          hint: 'If this persists, the AI service may be starting up. Please try again in 30 seconds.'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Proxy to Cloud Run LLM API - generate endpoint (legacy/direct)
    if ((url.pathname === '/api/generate' || url.pathname === '/api/chat') && request.method === 'POST') {
      try {
        const body = await request.json();
        const llmApiUrl = env.LLM_API_URL || 'https://llm-api-1097587800570.us-central1.run.app';
        
        // Transform chat request to generate request if needed
        const generateBody = {
          prompt: body.prompt || body.message || body.content,
          max_length: body.max_length || body.maxTokens || 200,
          temperature: body.temperature || 0.7
        };
        
        console.log('Proxying to:', `${llmApiUrl}/generate`, generateBody);
        
        const llmResponse = await fetch(`${llmApiUrl}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(generateBody)
        });
        
        const data = await llmResponse.json();
        
        // Return in format frontend expects
        return new Response(JSON.stringify({
          ...data,
          message: data.generated_text,
          response: data.generated_text
        }), {
          status: llmResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // PHASE 2: RAG FOUNDATION - Document Embedding & Retrieval
    // ============================================================

    // Embed document chunks and store in Vectorize
    if (url.pathname === '/api/rag/embed' && request.method === 'POST') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const { content, manuscript_id, chunk_size = 500, overlap = 50 } = body;

        if (!content || content.length === 0) {
          return new Response(JSON.stringify({ error: 'Content is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Chunk the document
        const chunks = [];
        let position = 0;
        while (position < content.length) {
          const end = Math.min(position + chunk_size, content.length);
          chunks.push({
            text: content.substring(position, end),
            char_start: position,
            char_end: end,
          });
          position += chunk_size - overlap;
          if (position >= content.length - overlap) break;
        }

        console.log(`[RAG] Processing ${chunks.length} chunks for tenant ${tenant.tenant_id}`);

        // Generate embeddings using Cloudflare AI
        const embeddedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkId = generateUUID();

          // Generate embedding using Workers AI
          let embedding = null;
          if (env.AI) {
            try {
              const embeddingResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
                text: chunk.text
              });
              embedding = embeddingResponse.data?.[0] || null;
            } catch (aiError) {
              console.error(`[RAG] AI embedding error for chunk ${i}:`, aiError);
            }
          }

          // Store in Vectorize if available and embedding succeeded
          if (env.VECTORIZE && embedding) {
            try {
              await env.VECTORIZE.upsert([{
                id: chunkId,
                values: embedding,
                metadata: {
                  tenant_id: tenant.tenant_id,
                  manuscript_id: manuscript_id || 'unknown',
                  chunk_index: i,
                  char_start: chunk.char_start,
                  char_end: chunk.char_end,
                }
              }]);
            } catch (vectorError) {
              console.error(`[RAG] Vectorize error for chunk ${i}:`, vectorError);
            }
          }

          // Store chunk metadata in D1
          if (env.DB) {
            await env.DB.prepare(
              `INSERT INTO document_chunks (id, tenant_id, manuscript_id, chunk_index, content, char_start, char_end, embedding_id, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              chunkId,
              tenant.tenant_id,
              manuscript_id || null,
              i,
              chunk.text,
              chunk.char_start,
              chunk.char_end,
              embedding ? chunkId : null,
              JSON.stringify({ length: chunk.text.length })
            ).run();
          }

          embeddedChunks.push({
            id: chunkId,
            index: i,
            char_start: chunk.char_start,
            char_end: chunk.char_end,
            has_embedding: !!embedding,
          });
        }

        return new Response(JSON.stringify({
          success: true,
          tenant_id: tenant.tenant_id,
          manuscript_id,
          chunks_processed: embeddedChunks.length,
          chunks: embeddedChunks,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[RAG] Embed error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Retrieve relevant chunks using semantic search
    if (url.pathname === '/api/rag/retrieve' && request.method === 'POST') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const { query, manuscript_id, top_k = 5 } = body;

        if (!query) {
          return new Response(JSON.stringify({ error: 'Query is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let results = [];

        // Generate query embedding
        if (env.AI && env.VECTORIZE) {
          try {
            const embeddingResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
              text: query
            });
            const queryEmbedding = embeddingResponse.data?.[0];

            if (queryEmbedding) {
              // Search Vectorize with tenant filter
              const searchResults = await env.VECTORIZE.query(queryEmbedding, {
                topK: top_k * 2, // Over-fetch to account for filtering
                filter: {
                  tenant_id: tenant.tenant_id,
                  ...(manuscript_id && { manuscript_id })
                },
                returnMetadata: true,
              });

              // Get chunk content from D1
              if (env.DB && searchResults.matches) {
                for (const match of searchResults.matches.slice(0, top_k)) {
                  const chunk = await env.DB.prepare(
                    'SELECT content, char_start, char_end, chunk_index FROM document_chunks WHERE id = ? AND tenant_id = ?'
                  ).bind(match.id, tenant.tenant_id).first();

                  if (chunk) {
                    results.push({
                      id: match.id,
                      score: match.score,
                      content: chunk.content,
                      char_start: chunk.char_start,
                      char_end: chunk.char_end,
                      chunk_index: chunk.chunk_index,
                    });
                  }
                }
              }
            }
          } catch (searchError) {
            console.error('[RAG] Search error:', searchError);
          }
        }

        // Fallback: keyword search in D1 if vector search fails or unavailable
        if (results.length === 0 && env.DB) {
          const keywordResults = await env.DB.prepare(
            `SELECT id, content, char_start, char_end, chunk_index 
             FROM document_chunks 
             WHERE tenant_id = ? AND content LIKE ?
             ${manuscript_id ? 'AND manuscript_id = ?' : ''}
             LIMIT ?`
          ).bind(
            tenant.tenant_id,
            `%${query.split(' ').slice(0, 3).join('%')}%`,
            ...(manuscript_id ? [manuscript_id] : []),
            top_k
          ).all();

          results = keywordResults.results?.map(r => ({
            id: r.id,
            score: 0.5, // Keyword match gets lower score
            content: r.content,
            char_start: r.char_start,
            char_end: r.char_end,
            chunk_index: r.chunk_index,
          })) || [];
        }

        return new Response(JSON.stringify({
          query,
          tenant_id: tenant.tenant_id,
          manuscript_id,
          results,
          result_count: results.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[RAG] Retrieve error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Delete chunks for a manuscript
    if (url.pathname === '/api/rag/chunks' && request.method === 'DELETE') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const { manuscript_id } = body;

        if (!manuscript_id) {
          return new Response(JSON.stringify({ error: 'manuscript_id is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get chunk IDs to delete from Vectorize
        let deletedCount = 0;
        if (env.DB) {
          const chunks = await env.DB.prepare(
            'SELECT id, embedding_id FROM document_chunks WHERE tenant_id = ? AND manuscript_id = ?'
          ).bind(tenant.tenant_id, manuscript_id).all();

          // Delete from Vectorize
          if (env.VECTORIZE && chunks.results) {
            const vectorIds = chunks.results.filter(c => c.embedding_id).map(c => c.embedding_id);
            if (vectorIds.length > 0) {
              try {
                await env.VECTORIZE.deleteByIds(vectorIds);
              } catch (e) {
                console.error('[RAG] Vectorize delete error:', e);
              }
            }
          }

          // Delete from D1
          const result = await env.DB.prepare(
            'DELETE FROM document_chunks WHERE tenant_id = ? AND manuscript_id = ?'
          ).bind(tenant.tenant_id, manuscript_id).run();
          deletedCount = result.meta?.changes || 0;
        }

        return new Response(JSON.stringify({
          success: true,
          manuscript_id,
          deleted_count: deletedCount,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[RAG] Delete error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // PHASE 3: STYLE ASSETS API - CRUD for style guides, glossary, rules
    // ============================================================

    // List style assets for tenant
    if (url.pathname === '/api/styles' && request.method === 'GET') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const assetType = url.searchParams.get('type');
        let assets = [];

        if (env.DB) {
          const query = assetType
            ? 'SELECT * FROM style_assets WHERE tenant_id = ? AND asset_type = ? ORDER BY priority DESC'
            : 'SELECT * FROM style_assets WHERE tenant_id = ? ORDER BY asset_type, priority DESC';

          const params = assetType
            ? [tenant.tenant_id, assetType]
            : [tenant.tenant_id];

          const result = await env.DB.prepare(query).bind(...params).all();
          assets = result.results?.map(a => ({
            ...a,
            content: JSON.parse(a.content || '{}'),
          })) || [];
        }

        return new Response(JSON.stringify({
          tenant_id: tenant.tenant_id,
          assets,
          count: assets.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Styles] List error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Create or update style asset
    if (url.pathname === '/api/styles' && request.method === 'POST') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const { id, asset_type, name, content, priority = 0, active = true } = body;

        if (!asset_type || !name || !content) {
          return new Response(JSON.stringify({
            error: 'asset_type, name, and content are required'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const validTypes = ['style_guide', 'glossary', 'rule', 'character', 'world'];
        if (!validTypes.includes(asset_type)) {
          return new Response(JSON.stringify({
            error: `asset_type must be one of: ${validTypes.join(', ')}`
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const assetId = id || generateUUID();
        const contentJson = typeof content === 'string' ? content : JSON.stringify(content);

        if (env.DB) {
          if (id) {
            // Update existing
            await env.DB.prepare(
              `UPDATE style_assets SET name = ?, content = ?, priority = ?, active = ?, updated_at = datetime('now')
               WHERE id = ? AND tenant_id = ?`
            ).bind(name, contentJson, priority, active ? 1 : 0, id, tenant.tenant_id).run();
          } else {
            // Create new
            await env.DB.prepare(
              `INSERT INTO style_assets (id, tenant_id, asset_type, name, content, priority, active)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(assetId, tenant.tenant_id, asset_type, name, contentJson, priority, active ? 1 : 0).run();
          }
        }

        return new Response(JSON.stringify({
          success: true,
          id: assetId,
          asset_type,
          name,
          updated: !!id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Styles] Create/Update error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Delete style asset
    if (url.pathname.startsWith('/api/styles/') && request.method === 'DELETE') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const assetId = url.pathname.split('/api/styles/')[1];
        if (!assetId) {
          return new Response(JSON.stringify({ error: 'Asset ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let deleted = false;
        if (env.DB) {
          const result = await env.DB.prepare(
            'DELETE FROM style_assets WHERE id = ? AND tenant_id = ?'
          ).bind(assetId, tenant.tenant_id).run();
          deleted = (result.meta?.changes || 0) > 0;
        }

        return new Response(JSON.stringify({
          success: deleted,
          id: assetId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Styles] Delete error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get active style context for LLM prompts
    if (url.pathname === '/api/styles/context' && request.method === 'GET') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let context = {
          style_guides: [],
          glossary: [],
          rules: [],
          characters: [],
          world: [],
        };

        if (env.DB) {
          const assets = await env.DB.prepare(
            'SELECT asset_type, name, content FROM style_assets WHERE tenant_id = ? AND active = 1 ORDER BY priority DESC'
          ).bind(tenant.tenant_id).all();

          for (const asset of assets.results || []) {
            const parsed = JSON.parse(asset.content || '{}');
            const entry = { name: asset.name, ...parsed };

            switch (asset.asset_type) {
              case 'style_guide': context.style_guides.push(entry); break;
              case 'glossary': context.glossary.push(entry); break;
              case 'rule': context.rules.push(entry); break;
              case 'character': context.characters.push(entry); break;
              case 'world': context.world.push(entry); break;
            }
          }
        }

        // Format as prompt-ready context
        const promptContext = [];
        if (context.style_guides.length > 0) {
          promptContext.push(`Style Guides:\n${context.style_guides.map(s => `- ${s.name}: ${s.description || ''}`).join('\n')}`);
        }
        if (context.glossary.length > 0) {
          promptContext.push(`Glossary:\n${context.glossary.map(g => `- ${g.term || g.name}: ${g.definition || ''}`).join('\n')}`);
        }
        if (context.rules.length > 0) {
          promptContext.push(`Writing Rules:\n${context.rules.map(r => `- ${r.name}: ${r.rule || r.description || ''}`).join('\n')}`);
        }
        if (context.characters.length > 0) {
          promptContext.push(`Characters:\n${context.characters.map(c => `- ${c.name}: ${c.description || ''}`).join('\n')}`);
        }
        if (context.world.length > 0) {
          promptContext.push(`World/Setting:\n${context.world.map(w => `- ${w.name}: ${w.description || ''}`).join('\n')}`);
        }

        return new Response(JSON.stringify({
          tenant_id: tenant.tenant_id,
          context,
          prompt_context: promptContext.join('\n\n'),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Styles] Context error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // PHASE 5: AUDIT JOBS - Background job queue for whole-book audits
    // ============================================================

    // Create audit job
    if (url.pathname === '/api/audit/jobs' && request.method === 'POST') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const { manuscript_id, job_type = 'full_audit', content } = body;

        if (!manuscript_id) {
          return new Response(JSON.stringify({ error: 'manuscript_id is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const jobId = generateUUID();

        // Count chunks for this manuscript
        let totalChunks = 0;
        if (env.DB && content) {
          // If content provided, count potential chunks
          totalChunks = Math.ceil(content.length / 500);
        } else if (env.DB) {
          const countResult = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM document_chunks WHERE tenant_id = ? AND manuscript_id = ?'
          ).bind(tenant.tenant_id, manuscript_id).first();
          totalChunks = countResult?.count || 0;
        }

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO audit_jobs (id, tenant_id, manuscript_id, job_type, status, total_chunks)
             VALUES (?, ?, ?, ?, 'pending', ?)`
          ).bind(jobId, tenant.tenant_id, manuscript_id, job_type, totalChunks).run();
        }

        return new Response(JSON.stringify({
          success: true,
          job_id: jobId,
          manuscript_id,
          job_type,
          status: 'pending',
          total_chunks: totalChunks,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Audit] Create job error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get audit job status
    if (url.pathname.startsWith('/api/audit/jobs/') && request.method === 'GET') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const jobId = url.pathname.split('/api/audit/jobs/')[1];
        if (!jobId) {
          return new Response(JSON.stringify({ error: 'Job ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let job = null;
        if (env.DB) {
          job = await env.DB.prepare(
            'SELECT * FROM audit_jobs WHERE id = ? AND tenant_id = ?'
          ).bind(jobId, tenant.tenant_id).first();
        }

        if (!job) {
          return new Response(JSON.stringify({ error: 'Job not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          ...job,
          results: job.results ? JSON.parse(job.results) : null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Audit] Get job error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // List audit jobs for tenant
    if (url.pathname === '/api/audit/jobs' && request.method === 'GET') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let jobs = [];
        if (env.DB) {
          const result = await env.DB.prepare(
            'SELECT id, manuscript_id, job_type, status, progress, total_chunks, processed_chunks, created_at, completed_at FROM audit_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50'
          ).bind(tenant.tenant_id).all();
          jobs = result.results || [];
        }

        return new Response(JSON.stringify({
          tenant_id: tenant.tenant_id,
          jobs,
          count: jobs.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Audit] List jobs error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Cancel audit job
    if (url.pathname.startsWith('/api/audit/jobs/') && url.pathname.endsWith('/cancel') && request.method === 'POST') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const jobId = url.pathname.replace('/api/audit/jobs/', '').replace('/cancel', '');
        if (!jobId) {
          return new Response(JSON.stringify({ error: 'Job ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (env.DB) {
          await env.DB.prepare(
            `UPDATE audit_jobs SET status = 'cancelled', updated_at = datetime('now')
             WHERE id = ? AND tenant_id = ? AND status IN ('pending', 'processing')`
          ).bind(jobId, tenant.tenant_id).run();
        }

        return new Response(JSON.stringify({
          success: true,
          job_id: jobId,
          status: 'cancelled',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Audit] Cancel job error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // PHASE 6: PROGRESSIVE AUDIT UX - SSE streaming for job progress
    // ============================================================

    // SSE stream for audit job progress
    if (url.pathname.startsWith('/api/audit/jobs/') && url.pathname.endsWith('/stream') && request.method === 'GET') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const jobId = url.pathname.replace('/api/audit/jobs/', '').replace('/stream', '');
        if (!jobId) {
          return new Response(JSON.stringify({ error: 'Job ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Create SSE stream
        const encoder = new TextEncoder();
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        // Helper to send SSE event
        const sendEvent = async (event, data) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          await writer.write(encoder.encode(message));
        };

        // Poll job status and stream updates
        const pollAndStream = async () => {
          let lastStatus = null;
          let lastProgress = -1;
          let iterations = 0;
          const maxIterations = 300; // 5 minutes max (1s intervals)

          try {
            while (iterations < maxIterations) {
              if (env.DB) {
                const job = await env.DB.prepare(
                  'SELECT * FROM audit_jobs WHERE id = ? AND tenant_id = ?'
                ).bind(jobId, tenant.tenant_id).first();

                if (!job) {
                  await sendEvent('error', { message: 'Job not found' });
                  break;
                }

                // Send update if status or progress changed
                if (job.status !== lastStatus || job.progress !== lastProgress) {
                  lastStatus = job.status;
                  lastProgress = job.progress;

                  await sendEvent('progress', {
                    job_id: job.id,
                    status: job.status,
                    progress: job.progress || 0,
                    processed_chunks: job.processed_chunks || 0,
                    total_chunks: job.total_chunks || 0,
                    updated_at: job.updated_at,
                  });

                  // If job is complete, send results and close
                  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                    if (job.status === 'completed' && job.results) {
                      await sendEvent('complete', {
                        job_id: job.id,
                        status: job.status,
                        results: JSON.parse(job.results || '[]'),
                      });
                    } else if (job.status === 'failed') {
                      await sendEvent('error', {
                        job_id: job.id,
                        message: job.error_message || 'Job failed',
                      });
                    } else {
                      await sendEvent('cancelled', { job_id: job.id });
                    }
                    break;
                  }
                }
              }

              // Wait 1 second before next poll
              await new Promise(resolve => setTimeout(resolve, 1000));
              iterations++;
            }

            // Timeout
            if (iterations >= maxIterations) {
              await sendEvent('timeout', { message: 'Stream timeout' });
            }
          } catch (e) {
            await sendEvent('error', { message: e.message });
          } finally {
            await writer.close();
          }
        };

        // Start polling in background
        pollAndStream();

        return new Response(readable, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          }
        });

      } catch (error) {
        console.error('[Audit] Stream error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Process audit job (called internally or by scheduled trigger)
    if (url.pathname.startsWith('/api/audit/jobs/') && url.pathname.endsWith('/process') && request.method === 'POST') {
      try {
        const tenant = await getTenantFromRequest(request);
        if (!tenant) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const jobId = url.pathname.replace('/api/audit/jobs/', '').replace('/process', '');
        const body = await request.json().catch(() => ({}));
        const { content, batch_size = 5 } = body;

        if (!jobId) {
          return new Response(JSON.stringify({ error: 'Job ID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get job
        let job = null;
        if (env.DB) {
          job = await env.DB.prepare(
            'SELECT * FROM audit_jobs WHERE id = ? AND tenant_id = ?'
          ).bind(jobId, tenant.tenant_id).first();
        }

        if (!job) {
          return new Response(JSON.stringify({ error: 'Job not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (job.status !== 'pending' && job.status !== 'processing') {
          return new Response(JSON.stringify({ error: 'Job is not in a processable state' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Update to processing
        if (job.status === 'pending') {
          await env.DB.prepare(
            `UPDATE audit_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?`
          ).bind(jobId).run();
        }

        // Get chunks to process
        let chunks = [];
        if (env.DB) {
          const result = await env.DB.prepare(
            `SELECT id, content, chunk_index, char_start, char_end 
             FROM document_chunks 
             WHERE tenant_id = ? AND manuscript_id = ?
             ORDER BY chunk_index
             LIMIT ? OFFSET ?`
          ).bind(tenant.tenant_id, job.manuscript_id, batch_size, job.processed_chunks || 0).all();
          chunks = result.results || [];
        }

        // If no chunks found but content provided, chunk it
        if (chunks.length === 0 && content) {
          const chunkSize = 500;
          let position = 0;
          let index = job.processed_chunks || 0;
          while (position < content.length && chunks.length < batch_size) {
            const end = Math.min(position + chunkSize, content.length);
            chunks.push({
              id: `temp-${index}`,
              content: content.substring(position, end),
              chunk_index: index,
              char_start: position,
              char_end: end,
            });
            position = end;
            index++;
          }
        }

        // Process chunks (simplified audit - just identify potential issues)
        const findings = [];
        const CLOUD_RUN_URL = env.LLM_API_URL || 'https://llm-api-1097587800570.us-central1.run.app';

        for (const chunk of chunks) {
          try {
            // Call LLM for audit
            const auditPrompt = `Analyze the following text for ${job.job_type === 'grammar' ? 'grammar and spelling' : 
              job.job_type === 'style_check' ? 'style consistency' :
              job.job_type === 'consistency' ? 'internal consistency issues' :
              'writing quality'} issues.

Text:
---
${chunk.content}
---

Respond with a JSON array of issues found. Each issue should have:
- "type": the type of issue
- "message": description of the issue
- "position": {"start": number, "end": number} relative to this chunk
- "suggestion": optional fix suggestion

If no issues found, respond with: []`;

            const response = await fetch(`${CLOUD_RUN_URL}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: auditPrompt }],
                intent: job.job_type,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const text = data.text || data.response || '';
              
              // Try to parse findings
              const jsonMatch = text.match(/\[[\s\S]*?\]/);
              if (jsonMatch) {
                try {
                  const chunkFindings = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(chunkFindings)) {
                    // Adjust positions to be document-relative
                    for (const finding of chunkFindings) {
                      findings.push({
                        ...finding,
                        chunk_index: chunk.chunk_index,
                        position: finding.position ? {
                          start: chunk.char_start + (finding.position.start || 0),
                          end: chunk.char_start + (finding.position.end || 0),
                        } : null,
                      });
                    }
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          } catch (e) {
            console.error(`[Audit] Error processing chunk ${chunk.chunk_index}:`, e);
          }

          // Update progress
          const newProcessed = (job.processed_chunks || 0) + chunks.indexOf(chunk) + 1;
          const progress = Math.round((newProcessed / (job.total_chunks || 1)) * 100);
          
          await env.DB.prepare(
            `UPDATE audit_jobs SET processed_chunks = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(newProcessed, progress, jobId).run();
        }

        // Check if complete
        const newProcessed = (job.processed_chunks || 0) + chunks.length;
        const isComplete = newProcessed >= (job.total_chunks || 0) || chunks.length < batch_size;

        if (isComplete) {
          // Get all existing findings and add new ones
          let allFindings = findings;
          if (job.results) {
            try {
              const existing = JSON.parse(job.results);
              if (Array.isArray(existing)) {
                allFindings = [...existing, ...findings];
              }
            } catch (e) {}
          }

          await env.DB.prepare(
            `UPDATE audit_jobs SET status = 'completed', progress = 100, results = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
          ).bind(JSON.stringify(allFindings), jobId).run();
        } else {
          // Store partial findings
          let allFindings = findings;
          if (job.results) {
            try {
              const existing = JSON.parse(job.results);
              if (Array.isArray(existing)) {
                allFindings = [...existing, ...findings];
              }
            } catch (e) {}
          }

          await env.DB.prepare(
            `UPDATE audit_jobs SET results = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(JSON.stringify(allFindings), jobId).run();
        }

        return new Response(JSON.stringify({
          success: true,
          job_id: jobId,
          processed: chunks.length,
          total_processed: newProcessed,
          is_complete: isComplete,
          findings_count: findings.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Audit] Process error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // PHASE 7: CACHING LAYER - Retrieval + completion caching
    // ============================================================

    // Get or set cache entry
    if (url.pathname === '/api/cache' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { cache_type, input, output, tenant_id, ttl_seconds } = body;

        if (!cache_type || !input) {
          return new Response(JSON.stringify({ error: 'cache_type and input required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const inputHash = await sha256(typeof input === 'string' ? input : JSON.stringify(input));
        const cacheId = `${cache_type}:${inputHash}`;

        // If output provided, this is a SET operation
        if (output !== undefined) {
          if (env.DB) {
            const expiresAt = ttl_seconds
              ? new Date(Date.now() + ttl_seconds * 1000).toISOString()
              : null;

            await env.DB.prepare(
              `INSERT OR REPLACE INTO cache_entries (id, cache_type, tenant_id, input_hash, output, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
              cacheId,
              cache_type,
              tenant_id || null,
              inputHash,
              typeof output === 'string' ? output : JSON.stringify(output),
              expiresAt
            ).run();
          }

          return new Response(JSON.stringify({
            cached: true,
            cache_id: cacheId,
            expires_at: ttl_seconds ? new Date(Date.now() + ttl_seconds * 1000).toISOString() : null,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // GET operation - check cache
        let cached = null;
        if (env.DB) {
          cached = await env.DB.prepare(
            `SELECT output, expires_at, hit_count FROM cache_entries
             WHERE id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
          ).bind(cacheId).first();

          if (cached) {
            // Increment hit count
            await env.DB.prepare(
              'UPDATE cache_entries SET hit_count = hit_count + 1 WHERE id = ?'
            ).bind(cacheId).run();
          }
        }

        if (cached) {
          let parsedOutput;
          try {
            parsedOutput = JSON.parse(cached.output);
          } catch {
            parsedOutput = cached.output;
          }

          return new Response(JSON.stringify({
            hit: true,
            cache_id: cacheId,
            output: parsedOutput,
            hit_count: cached.hit_count + 1,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          hit: false,
          cache_id: cacheId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[Cache] Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Root endpoint
    if (url.pathname === '/' || url.pathname === '/api') {
      return new Response(JSON.stringify({
        name: 'EthicalAIditor API',
        version: '3.0.0',
        features: ['tenant-sessions', 'inference-logging', 'ethical-provenance', 'rag-retrieval', 'style-assets', 'audit-jobs', 'caching'],
        endpoints: {
          session: {
            'POST /api/session': 'Create or refresh anonymous tenant session',
            'GET /api/session': 'Get current session info and usage',
            'POST /api/session/link': 'Link tenant session to authenticated user'
          },
          inference: {
            'POST /api/huggingface': 'Chat with LLM (tenant-aware rate limiting)',
            'POST /api/generate': 'Generate text (legacy)',
            'POST /api/chat': 'Chat endpoint (legacy)'
          },
          rag: {
            'POST /api/rag/embed': 'Embed document chunks for RAG retrieval',
            'POST /api/rag/retrieve': 'Semantic search for relevant chunks',
            'DELETE /api/rag/chunks': 'Delete chunks for a manuscript'
          },
          styles: {
            'GET /api/styles': 'List style assets (query: ?type=style_guide|glossary|rule|character|world)',
            'POST /api/styles': 'Create or update style asset',
            'DELETE /api/styles/:id': 'Delete style asset',
            'GET /api/styles/context': 'Get active style context for LLM prompts'
          },
          audit: {
            'POST /api/audit/jobs': 'Create audit job for manuscript',
            'GET /api/audit/jobs': 'List audit jobs',
            'GET /api/audit/jobs/:id': 'Get audit job status',
            'POST /api/audit/jobs/:id/cancel': 'Cancel audit job'
          },
          cache: {
            'POST /api/cache': 'Get or set cache entry'
          },
          info: {
            'GET /api/health': 'Service health check',
            'GET /api/models': 'List available models',
            'GET /api/usage': 'Get usage statistics'
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 404 for unknown routes - include path for debugging
    return new Response(JSON.stringify({ error: 'Not found', path: url.pathname, method: request.method }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
