export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
      'Vary': 'Origin', // Important for caching with dynamic CORS
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
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
    if (url.pathname === '/api/huggingface' && request.method === 'POST') {
      try {
        const body = await request.json();
        const llmApiUrl = env.LLM_API_URL || 'https://llm-api-1097587800570.us-central1.run.app';
        
        // Convert messages array to prompt string
        const messages = body.messages || [];
        const manuscriptContext = body.manuscriptContext || '';
        
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
        
        console.log('HuggingFace endpoint - proxying to Cloud Run');
        console.log('Prompt length:', fullPrompt.length);
        
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
          // This often happens when Cloud Run is cold starting
          return new Response(JSON.stringify({ 
            error: 'The AI service is warming up. Please wait 30-60 seconds and try again.',
            details: 'Cloud Run cold start timeout'
          }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        let data;
        try {
          data = await llmResponse.json();
        } catch (jsonError) {
          console.error('JSON parse error:', jsonError);
          const text = await llmResponse.text();
          console.error('Response text:', text);
          return new Response(JSON.stringify({ 
            error: 'Invalid response from AI service. It may be warming up.',
            details: text.substring(0, 100)
          }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (!llmResponse.ok) {
          console.error('Cloud Run error:', data);
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
        
        // Return in format frontend expects
        return new Response(JSON.stringify({
          text: responseText,
          model: body.model || data.model
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('HuggingFace endpoint error:', error);
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

    // Root endpoint
    if (url.pathname === '/' || url.pathname === '/api') {
      return new Response(JSON.stringify({
        name: 'EthicalAIditor API',
        endpoints: ['/api/health', '/api/generate', '/api/chat', '/api/huggingface', '/api/models', '/api/usage']
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
