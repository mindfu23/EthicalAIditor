export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // VM URL (HTTP - Worker can call HTTP, browsers can't from HTTPS)
    const VM_URL = 'http://34.30.2.20:8080';
    // Cloud Run URL (HTTPS fallback)
    const CLOUD_RUN_URL = env.LLM_API_URL || 'https://llm-api-1097587800570.us-central1.run.app';
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
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

    // VM proxy endpoint - try VM first, then fallback to Cloud Run
    if (url.pathname === '/api/vm/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        console.log('[VM Proxy] Trying VM first...');
        
        // Try VM first (always on, no cold start)
        try {
          const vmResponse = await fetch(`${VM_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          
          if (vmResponse.ok) {
            const data = await vmResponse.json();
            console.log('[VM Proxy] VM responded successfully');
            return new Response(JSON.stringify({
              text: data.response || data.text || '',
              source: 'vm'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (vmError) {
          console.log('[VM Proxy] VM failed, trying Cloud Run:', vmError.message);
        }
        
        // Fallback to Cloud Run
        console.log('[VM Proxy] Falling back to Cloud Run...');
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
