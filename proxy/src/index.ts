export interface Env {
  BACKEND_HOST: string;
  FRONTEND_HOST: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Route API requests to Azure Function App
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(url.pathname + url.search, env.BACKEND_HOST);

      const headers = new Headers(request.headers);
      const backendHostname = new URL(env.BACKEND_HOST).host;

      // Crucial: Set Host header to match Azure's expected hostname
      headers.set('Host', backendHostname);

      const modifiedRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : request.body,
        redirect: 'follow',
      });

      const response = await fetch(modifiedRequest);

      // Clone response and ensure CORS headers match the calling client
      const responseHeaders = new Headers(response.headers);
      const clientOrigin = request.headers.get('Origin');
      if (clientOrigin) {
        responseHeaders.set('Access-Control-Allow-Origin', clientOrigin);
        responseHeaders.set('Access-Control-Allow-Credentials', 'true');
        responseHeaders.set(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, x-functions-key',
        );
        responseHeaders.set(
          'Access-Control-Allow-Methods',
          'GET, POST, DELETE, PUT, OPTIONS',
        );
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // Handle OPTIONS preflight directly in Worker to bypass Azure delays
    if (request.method === 'OPTIONS') {
      const clientOrigin = request.headers.get('Origin') || '*';
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': clientOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-functions-key',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    // 2. Route all other traffic to Azure Static Web Apps
    const targetUrl = new URL(url.pathname + url.search, env.FRONTEND_HOST);
    const headers = new Headers(request.headers);
    headers.set('Host', new URL(env.FRONTEND_HOST).host);

    const modifiedRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    });

    return fetch(modifiedRequest);
  },
};
