/**
 * Cloudflare Worker API Proxy for EthicalAIditor
 * 
 * Handles: auth, rate limiting, usage tracking, HuggingFace model inference
 * with support for PleIAs ethical AI models and MCP integration.
 */

export interface Env {
  DB: D1Database;
  HUGGINGFACE_API_KEY: string;
}

// Available models via HuggingFace Inference Providers
// Note: PleIAs Common Corpus models are not yet available via Inference Providers
// Using open-weight alternatives that support the new API
const AVAILABLE_MODELS: Record<string, { name: string; description: string; maxTokens: number }> = {
  'meta-llama/Llama-3.3-70B-Instruct': {
    name: 'Llama 3.3 70B',
    description: 'High quality writing assistance (recommended)',
    maxTokens: 1024,
  },
  'Qwen/Qwen2.5-72B-Instruct': {
    name: 'Qwen 2.5 72B',
    description: 'Strong multilingual support',
    maxTokens: 1024,
  },
  'mistralai/Mistral-Nemo-Instruct-2407': {
    name: 'Mistral Nemo 12B', 
    description: 'Faster responses, good for quick edits',
    maxTokens: 512,
  },
};

const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';

// Rate limits for EthicalAIditor (writing sessions need fewer but longer calls)
const RATE_LIMITS: Record<string, number> = {
  anonymous: 5,   // Light trial, encourages signup
  free: 30,       // ~3-4 editing sessions of 8-10 queries each
  premium: 200,   // Heavy professional use, longer manuscripts
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === '/api/health') {
        return json({ status: 'ok', timestamp: new Date().toISOString() });
      }
      
      // Auth endpoints
      if (path === '/api/auth/login') {
        return handleLogin(request, env);
      }
      if (path === '/api/auth/signup') {
        return handleSignup(request, env);
      }
      if (path === '/api/auth/me') {
        return handleGetUser(request, env);
      }
      
      // Main AI inference endpoint
      if (path === '/api/huggingface') {
        return handleHuggingFaceRequest(request, env, ctx);
      }
      
      // Usage stats
      if (path === '/api/usage') {
        return handleUsageRequest(request, env);
      }
      
      // Available models
      if (path === '/api/models') {
        return json({ models: AVAILABLE_MODELS, default: DEFAULT_MODEL });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Worker error:', error);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

// ============================================================
// USER & AUTH HELPERS
// ============================================================

async function getUserFromRequest(request: Request, env: Env): Promise<{ id: string; tier: string } | null> {
  const userId = request.headers.get('X-User-Id');
  if (!userId) return null;
  return env.DB.prepare('SELECT id, tier FROM users WHERE id = ?').bind(userId).first();
}

async function checkRateLimit(env: Env, userId: string, tier: string): Promise<{ allowed: boolean; remaining: number; limit: number; used: number }> {
  const today = new Date().toISOString().split('T')[0];
  const limit = RATE_LIMITS[tier] || RATE_LIMITS.free;

  // For anonymous users, just return default limits without DB tracking
  if (userId === 'anonymous') {
    return { allowed: true, remaining: limit, limit, used: 0 };
  }

  let record = await env.DB.prepare(
    'SELECT calls_today FROM rate_limits WHERE user_id = ? AND date = ?'
  ).bind(userId, today).first<{ calls_today: number }>();

  if (!record) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (user_id, date, calls_today, quota_limit) VALUES (?, ?, 0, ?)'
    ).bind(userId, today, limit).run();
    record = { calls_today: 0 };
  }

  // Track usage but don't block (rate limiting disabled for now)
  const used = record.calls_today;
  await env.DB.prepare(
    'UPDATE rate_limits SET calls_today = calls_today + 1 WHERE user_id = ? AND date = ?'
  ).bind(userId, today).run();

  // Always allow, just track usage
  return { allowed: true, remaining: Math.max(0, limit - used - 1), limit, used: used + 1 };
}

async function logApiUsage(
  env: Env, 
  userId: string, 
  model: string,
  latencyMs: number, 
  success: boolean, 
  tokensConsumed = 0, 
  errorMessage?: string
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO api_usage_logs (user_id, provider, model, endpoint, tokens_consumed, latency_ms, success, error_message)
    VALUES (?, 'huggingface', ?, '/api/huggingface', ?, ?, ?, ?)
  `).bind(userId, model, tokensConsumed, latencyMs, success ? 1 : 0, errorMessage || null).run();

  const today = new Date().toISOString().split('T')[0];
  await env.DB.prepare(`
    INSERT INTO daily_usage (user_id, date, queries) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET queries = queries + 1
  `).bind(userId, today).run();
}

// ============================================================
// HUGGINGFACE INFERENCE
// ============================================================

async function handleHuggingFaceRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const startTime = Date.now();
  let user: { id: string; tier: string } = { id: 'anonymous', tier: 'anonymous' };
  let model = DEFAULT_MODEL;
  
  try {
    // Get user (default to anonymous if not authenticated)
    try {
      user = await getUserFromRequest(request, env) || { id: 'anonymous', tier: 'anonymous' };
    } catch (e) {
      console.error('Error getting user:', e);
      // Keep default anonymous user
    }
    
    // Try to track rate limits (but don't fail if DB has issues)
    let rateLimit = { allowed: true, remaining: 999, limit: 999, used: 0 };
    try {
      rateLimit = await checkRateLimit(env, user.id, user.tier);
    } catch (e) {
      console.error('Error checking rate limit:', e);
      // Continue without rate limiting if DB fails
    }

    const body = await request.json() as {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      manuscriptContext?: string;
      stream?: boolean;
    };

    model = body.model && AVAILABLE_MODELS[body.model as keyof typeof AVAILABLE_MODELS] 
      ? body.model 
      : DEFAULT_MODEL;
    
    const modelConfig = AVAILABLE_MODELS[model as keyof typeof AVAILABLE_MODELS];
    
    // Build prompt with manuscript context if provided
    let systemPrompt = `You are an ethical AI writing assistant. Help writers improve their work with constructive feedback, suggestions for clarity, style improvements, and creative ideas. Be encouraging and specific in your feedback.`;
    
    if (body.manuscriptContext) {
      systemPrompt += `\n\nThe writer is working on the following manuscript:\n\n${body.manuscriptContext.substring(0, 3000)}`;
    }

    // Build messages array for chat completions API
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...body.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    ];

    // If streaming is requested, use streaming endpoint
    if (body.stream) {
      return handleStreamingRequest(env, ctx, user, model, modelConfig, chatMessages, rateLimit, startTime);
    }

    // Use HuggingFace's OpenAI-compatible chat completions API
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages,
        max_tokens: modelConfig.maxTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as { error?: string | { message?: string } };
      const errorMsg = typeof errorData.error === 'string' 
        ? errorData.error 
        : errorData.error?.message || `HuggingFace API error: ${response.status}`;
      throw new Error(errorMsg);
    }

    const result = await response.json() as { 
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };
    const generatedText = result.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - startTime;
    const tokensConsumed = result.usage?.total_tokens || 0;

    ctx.waitUntil(logApiUsage(env, user.id, model, latencyMs, true, tokensConsumed));

    return json({
      text: generatedText,
      model,
      _meta: {
        latencyMs,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        used: rateLimit.used,
        tokensUsed: tokensConsumed,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    ctx.waitUntil(logApiUsage(env, user.id, 'unknown', Date.now() - startTime, false, 0, errorMessage));
    return json({ error: errorMessage }, 500);
  }
}

// Streaming handler (simplified - streams not yet implemented with new API)
async function handleStreamingRequest(
  env: Env,
  ctx: ExecutionContext,
  user: { id: string; tier: string },
  model: string,
  modelConfig: { maxTokens: number },
  chatMessages: Array<{ role: string; content: string }>,
  rateLimit: { remaining: number; limit: number; used: number },
  startTime: number
): Promise<Response> {
  try {
    // For now, fall back to non-streaming and simulate streaming response
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages,
        max_tokens: modelConfig.maxTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as { error?: string | { message?: string } };
      const errorMsg = typeof errorData.error === 'string' 
        ? errorData.error 
        : errorData.error?.message || `HuggingFace API error: ${response.status}`;
      throw new Error(errorMsg);
    }

    const result = await response.json() as { 
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };
    const generatedText = result.choices?.[0]?.message?.content || '';
    
    ctx.waitUntil(logApiUsage(env, user.id, model, Date.now() - startTime, true, result.usage?.total_tokens || 0));

    // Simulate streaming by sending words one at a time
    const encoder = new TextEncoder();
    const words = generatedText.split(' ');
    
    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < words.length; i++) {
          const word = words[i] + (i < words.length - 1 ? ' ' : '');
          const chunk = JSON.stringify({ type: 'text-delta', textDelta: word });
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    ctx.waitUntil(logApiUsage(env, user.id, model, Date.now() - startTime, false, 0, errorMessage));
    
    // Return error as SSE
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorChunk = JSON.stringify({ type: 'error', error: errorMessage });
        controller.enqueue(encoder.encode(`data: ${errorChunk}\n\n`));
        controller.close();
      },
    });
    
    return new Response(errorStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        ...corsHeaders,
      },
    });
  }
}

// ============================================================
// AUTH ENDPOINTS
// ============================================================

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json() as { email: string; password: string };
  
  if (!email || !password) {
    return json({ error: 'Email and password required' }, 400);
  }

  const user = await env.DB.prepare(
    'SELECT id, email, display_name, tier, password_hash FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first<{ 
    id: string; 
    email: string; 
    display_name: string;
    tier: string; 
    password_hash: string;
  }>();

  // Simple password check (in production, use proper bcrypt)
  if (!user || user.password_hash !== btoa(password + 'ethicalaiditor-salt')) {
    return json({ error: 'Invalid credentials' }, 401);
  }

  const token = btoa(JSON.stringify({ 
    userId: user.id, 
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  }));

  return json({ 
    user: { 
      id: user.id, 
      email: user.email, 
      displayName: user.display_name,
      tier: user.tier 
    }, 
    token 
  });
}

async function handleSignup(request: Request, env: Env): Promise<Response> {
  const { email, password, displayName } = await request.json() as { 
    email: string; 
    password: string; 
    displayName?: string;
  };
  
  if (!email || !password) {
    return json({ error: 'Email and password required' }, 400);
  }

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first();
  
  if (existing) {
    return json({ error: 'Email already registered' }, 400);
  }

  const userId = crypto.randomUUID();
  const passwordHash = btoa(password + 'ethicalaiditor-salt');

  await env.DB.prepare(
    'INSERT INTO users (id, email, display_name, password_hash, tier) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email.toLowerCase(), displayName || email.split('@')[0], passwordHash, 'free').run();

  const token = btoa(JSON.stringify({ 
    userId, 
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 
  }));

  return json({ 
    user: { 
      id: userId, 
      email: email.toLowerCase(), 
      displayName: displayName || email.split('@')[0],
      tier: 'free' 
    }, 
    token 
  });
}

async function handleGetUser(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  
  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const fullUser = await env.DB.prepare(
    'SELECT id, email, display_name, tier FROM users WHERE id = ?'
  ).bind(user.id).first<{ id: string; email: string; display_name: string; tier: string }>();

  if (!fullUser) {
    return json({ error: 'User not found' }, 404);
  }

  return json({ 
    user: {
      id: fullUser.id,
      email: fullUser.email,
      displayName: fullUser.display_name,
      tier: fullUser.tier,
    }
  });
}

// ============================================================
// USAGE STATS
// ============================================================

async function handleUsageRequest(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const dailyUsage = await env.DB.prepare(`
    SELECT date, queries FROM daily_usage 
    WHERE user_id = ? AND date >= ? 
    ORDER BY date DESC
  `).bind(user.id, thirtyDaysAgo).all();

  const rateLimit = await env.DB.prepare(
    'SELECT calls_today, quota_limit FROM rate_limits WHERE user_id = ? AND date = ?'
  ).bind(user.id, today).first<{ calls_today: number; quota_limit: number }>();

  const limit = RATE_LIMITS[user.tier] || RATE_LIMITS.free;

  return json({
    usage: {
      daily: dailyUsage.results,
      today: {
        calls: rateLimit?.calls_today || 0,
        limit: limit,
        remaining: limit - (rateLimit?.calls_today || 0),
      },
      tier: user.tier,
    },
  });
}
