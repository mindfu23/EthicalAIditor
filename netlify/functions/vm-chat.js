// Netlify Function to proxy chat requests to VM
// Netlify Functions CAN call HTTP endpoints (unlike Cloudflare Workers)

const VM_URL = 'http://34.30.2.20:8080';
const CLOUD_RUN_URL = 'https://llm-api-1097587800570.us-central1.run.app';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('[VM Proxy] Trying VM first...');

    // Try VM first (always on, no cold start)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

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
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            text: data.response || data.text || '',
            source: 'vm',
          }),
        };
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
    return {
      statusCode: cloudResponse.ok ? 200 : cloudResponse.status,
      headers,
      body: JSON.stringify({
        text: data.text || data.response || '',
        source: 'cloud_run',
      }),
    };

  } catch (error) {
    console.error('[VM Proxy] Error:', error);
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'AI service temporarily unavailable',
        details: error.message,
      }),
    };
  }
}
