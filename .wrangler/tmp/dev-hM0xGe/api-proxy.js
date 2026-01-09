var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-jqdXpS/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// workers/api-proxy.ts
var AVAILABLE_MODELS = {
  "PleIAs/Pleias-1.2b-Preview": {
    name: "Pleias 1.2B",
    description: "More nuanced writing suggestions",
    maxTokens: 1024
  },
  "PleIAs/Pleias-350m-Preview": {
    name: "Pleias 350M",
    description: "Faster responses, lighter footprint",
    maxTokens: 512
  }
};
var DEFAULT_MODEL = "PleIAs/Pleias-1.2b-Preview";
var RATE_LIMITS = {
  anonymous: 5,
  // Light trial, encourages signup
  free: 30,
  // ~3-4 editing sessions of 8-10 queries each
  premium: 200
  // Heavy professional use, longer manuscripts
};
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(json, "json");
var api_proxy_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/health") {
        return json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      }
      if (path === "/api/auth/login") {
        return handleLogin(request, env);
      }
      if (path === "/api/auth/signup") {
        return handleSignup(request, env);
      }
      if (path === "/api/auth/me") {
        return handleGetUser(request, env);
      }
      if (path === "/api/huggingface") {
        return handleHuggingFaceRequest(request, env, ctx);
      }
      if (path === "/api/usage") {
        return handleUsageRequest(request, env);
      }
      if (path === "/api/models") {
        return json({ models: AVAILABLE_MODELS, default: DEFAULT_MODEL });
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker error:", error);
      return json({ error: "Internal server error" }, 500);
    }
  }
};
async function getUserFromRequest(request, env) {
  const userId = request.headers.get("X-User-Id");
  if (!userId) return null;
  return env.DB.prepare("SELECT id, tier FROM users WHERE id = ?").bind(userId).first();
}
__name(getUserFromRequest, "getUserFromRequest");
async function checkRateLimit(env, userId, tier) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const limit = RATE_LIMITS[tier] || RATE_LIMITS.free;
  if (userId === "anonymous") {
    return { allowed: true, remaining: limit, limit, used: 0 };
  }
  let record = await env.DB.prepare(
    "SELECT calls_today FROM rate_limits WHERE user_id = ? AND date = ?"
  ).bind(userId, today).first();
  if (!record) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (user_id, date, calls_today, quota_limit) VALUES (?, ?, 0, ?)"
    ).bind(userId, today, limit).run();
    record = { calls_today: 0 };
  }
  const used = record.calls_today;
  await env.DB.prepare(
    "UPDATE rate_limits SET calls_today = calls_today + 1 WHERE user_id = ? AND date = ?"
  ).bind(userId, today).run();
  return { allowed: true, remaining: Math.max(0, limit - used - 1), limit, used: used + 1 };
}
__name(checkRateLimit, "checkRateLimit");
async function logApiUsage(env, userId, model, latencyMs, success, tokensConsumed = 0, errorMessage) {
  await env.DB.prepare(`
    INSERT INTO api_usage_logs (user_id, provider, model, endpoint, tokens_consumed, latency_ms, success, error_message)
    VALUES (?, 'huggingface', ?, '/api/huggingface', ?, ?, ?, ?)
  `).bind(userId, model, tokensConsumed, latencyMs, success ? 1 : 0, errorMessage || null).run();
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  await env.DB.prepare(`
    INSERT INTO daily_usage (user_id, date, queries) VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET queries = queries + 1
  `).bind(userId, today).run();
}
__name(logApiUsage, "logApiUsage");
async function handleHuggingFaceRequest(request, env, ctx) {
  const startTime = Date.now();
  let user = { id: "anonymous", tier: "anonymous" };
  let model = DEFAULT_MODEL;
  try {
    try {
      user = await getUserFromRequest(request, env) || { id: "anonymous", tier: "anonymous" };
    } catch (e) {
      console.error("Error getting user:", e);
    }
    let rateLimit = { allowed: true, remaining: 999, limit: 999, used: 0 };
    try {
      rateLimit = await checkRateLimit(env, user.id, user.tier);
    } catch (e) {
      console.error("Error checking rate limit:", e);
    }
    const body = await request.json();
    model = body.model && AVAILABLE_MODELS[body.model] ? body.model : DEFAULT_MODEL;
    const modelConfig = AVAILABLE_MODELS[model];
    let systemPrompt = `You are an ethical AI writing assistant trained on legally licensed materials. Help writers improve their work while respecting intellectual property.`;
    if (body.manuscriptContext) {
      systemPrompt += `

Manuscript context:
${body.manuscriptContext.substring(0, 3e3)}`;
    }
    const formattedMessages = body.messages.map(
      (m) => `${m.role === "user" ? "[INST]" : ""} ${m.content} ${m.role === "user" ? "[/INST]" : ""}`
    ).join("\n");
    const fullPrompt = `${systemPrompt}

${formattedMessages}`;
    if (body.stream) {
      return handleStreamingRequest(env, ctx, user, model, modelConfig, fullPrompt, rateLimit, startTime);
    }
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: modelConfig.maxTokens,
          temperature: 0.7,
          return_full_text: false
        }
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HuggingFace API error: ${response.status}`);
    }
    const result = await response.json();
    const generatedText = result[0]?.generated_text || "";
    const latencyMs = Date.now() - startTime;
    const tokensConsumed = fullPrompt.length + generatedText.length;
    ctx.waitUntil(logApiUsage(env, user.id, model, latencyMs, true, tokensConsumed));
    return json({
      text: generatedText,
      model,
      _meta: {
        latencyMs,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        used: rateLimit.used,
        tokensUsed: tokensConsumed
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    ctx.waitUntil(logApiUsage(env, user.id, "unknown", Date.now() - startTime, false, 0, errorMessage));
    return json({ error: errorMessage }, 500);
  }
}
__name(handleHuggingFaceRequest, "handleHuggingFaceRequest");
async function handleStreamingRequest(env, ctx, user, model, modelConfig, fullPrompt, rateLimit, startTime) {
  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: modelConfig.maxTokens,
          temperature: 0.7,
          return_full_text: false
        },
        stream: true
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HuggingFace API error: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && response.body) {
      const transformStream = new TransformStream({
        async transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split("\n").filter((line) => line.trim());
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const data = line.slice(5).trim();
              if (data === "[DONE]") {
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              } else {
                try {
                  const parsed = JSON.parse(data);
                  const token = parsed.token?.text || parsed.generated_text || "";
                  if (token) {
                    const aiSdkChunk = JSON.stringify({ type: "text-delta", textDelta: token });
                    controller.enqueue(new TextEncoder().encode(`data: ${aiSdkChunk}

`));
                  }
                } catch {
                }
              }
            }
          }
        }
      });
      const streamedResponse = response.body.pipeThrough(transformStream);
      ctx.waitUntil(logApiUsage(env, user.id, model, Date.now() - startTime, true, fullPrompt.length));
      return new Response(streamedResponse, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...corsHeaders
        }
      });
    }
    const result = await response.json();
    const generatedText = result[0]?.generated_text || "";
    ctx.waitUntil(logApiUsage(env, user.id, model, Date.now() - startTime, true, fullPrompt.length + generatedText.length));
    const encoder = new TextEncoder();
    const words = generatedText.split(" ");
    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < words.length; i++) {
          const word = words[i] + (i < words.length - 1 ? " " : "");
          const chunk = JSON.stringify({ type: "text-delta", textDelta: word });
          controller.enqueue(encoder.encode(`data: ${chunk}

`));
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...corsHeaders
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    ctx.waitUntil(logApiUsage(env, user.id, model, Date.now() - startTime, false, 0, errorMessage));
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorChunk = JSON.stringify({ type: "error", error: errorMessage });
        controller.enqueue(encoder.encode(`data: ${errorChunk}

`));
        controller.close();
      }
    });
    return new Response(errorStream, {
      headers: {
        "Content-Type": "text/event-stream",
        ...corsHeaders
      }
    });
  }
}
__name(handleStreamingRequest, "handleStreamingRequest");
async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return json({ error: "Email and password required" }, 400);
  }
  const user = await env.DB.prepare(
    "SELECT id, email, display_name, tier, password_hash FROM users WHERE email = ?"
  ).bind(email.toLowerCase()).first();
  if (!user || user.password_hash !== btoa(password + "ethicalaiditor-salt")) {
    return json({ error: "Invalid credentials" }, 401);
  }
  const token = btoa(JSON.stringify({
    userId: user.id,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1e3
    // 30 days
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
__name(handleLogin, "handleLogin");
async function handleSignup(request, env) {
  const { email, password, displayName } = await request.json();
  if (!email || !password) {
    return json({ error: "Email and password required" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email.toLowerCase()).first();
  if (existing) {
    return json({ error: "Email already registered" }, 400);
  }
  const userId = crypto.randomUUID();
  const passwordHash = btoa(password + "ethicalaiditor-salt");
  await env.DB.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, tier) VALUES (?, ?, ?, ?, ?)"
  ).bind(userId, email.toLowerCase(), displayName || email.split("@")[0], passwordHash, "free").run();
  const token = btoa(JSON.stringify({
    userId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1e3
  }));
  return json({
    user: {
      id: userId,
      email: email.toLowerCase(),
      displayName: displayName || email.split("@")[0],
      tier: "free"
    },
    token
  });
}
__name(handleSignup, "handleSignup");
async function handleGetUser(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return json({ error: "Not authenticated" }, 401);
  }
  const fullUser = await env.DB.prepare(
    "SELECT id, email, display_name, tier FROM users WHERE id = ?"
  ).bind(user.id).first();
  if (!fullUser) {
    return json({ error: "User not found" }, 404);
  }
  return json({
    user: {
      id: fullUser.id,
      email: fullUser.email,
      displayName: fullUser.display_name,
      tier: fullUser.tier
    }
  });
}
__name(handleGetUser, "handleGetUser");
async function handleUsageRequest(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const dailyUsage = await env.DB.prepare(`
    SELECT date, queries FROM daily_usage 
    WHERE user_id = ? AND date >= ? 
    ORDER BY date DESC
  `).bind(user.id, thirtyDaysAgo).all();
  const rateLimit = await env.DB.prepare(
    "SELECT calls_today, quota_limit FROM rate_limits WHERE user_id = ? AND date = ?"
  ).bind(user.id, today).first();
  const limit = RATE_LIMITS[user.tier] || RATE_LIMITS.free;
  return json({
    usage: {
      daily: dailyUsage.results,
      today: {
        calls: rateLimit?.calls_today || 0,
        limit,
        remaining: limit - (rateLimit?.calls_today || 0)
      },
      tier: user.tier
    }
  });
}
__name(handleUsageRequest, "handleUsageRequest");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-jqdXpS/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = api_proxy_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-jqdXpS/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=api-proxy.js.map
