// Netlify Function to proxy chat requests to VM
// Netlify Functions CAN call HTTP endpoints (unlike Cloudflare Workers)

const VM_URL = 'http://34.30.2.20:8080';
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    console.log('[VM Proxy] Trying VM first...');

    // Try VM first (always on, no cold start)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

      const vmResponse = await fetch(`${VM_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (vmResponse.ok) {
        const data = await vmResponse.json();
        console.log('[VM Proxy] VM responded successfully');
        return new Response(JSON.stringify({
          text: data.response || data.text || '',
          source: 'vm',
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (vmError) {
      console.log('[VM Proxy] VM failed:', vmError.message);
    }

    // Fallback to Cloud Run
    console.log('[VM Proxy] Falling back to Cloud Run...');
    const cloudResponse = await fetch(`${CLOUD_RUN_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await cloudResponse.json();
    return new Response(JSON.stringify({
      text: data.text || data.response || '',
      source: 'cloud_run',
    }), {
      status: cloudResponse.ok ? 200 : cloudResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[VM Proxy] Error:', error);
    return new Response(JSON.stringify({
      error: 'AI service temporarily unavailable',
      details: error.message,
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

export const config = {
  path: '/api/vm-chat',
};
