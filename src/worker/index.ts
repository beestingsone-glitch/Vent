export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Set CORS headers
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. API Endpoints
    if (url.pathname.startsWith('/api')) {
      try {
        // Conversations list
        if (url.pathname === '/api/conversations' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }

        // Match conversation messages: /api/conversations/:id/messages
        const msgMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);

        if (msgMatch && request.method === 'GET') {
          const convId = msgMatch[1];
          const { results } = await env.DB.prepare(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
          ).bind(convId).all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }

        if (msgMatch && request.method === 'POST') {
          const convId = msgMatch[1];
          const body: any = await request.json();
          const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const senderId = body.sender_id || 'usr-super-admin-001';
          const content = body.content || '';
          const mediaType = body.media_type || 'none';

          await env.DB.prepare(
            'INSERT INTO messages (id, conversation_id, sender_id, content, media_type, expires_at) VALUES (?, ?, ?, ?, ?, datetime("now", "+3 days"))'
          ).bind(id, convId, senderId, content, mediaType).run();

          const created = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
          return new Response(JSON.stringify(created), { status: 201, headers: corsHeaders });
        }

        // Delete message
        const delMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
        if (delMatch && request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(delMatch[1]).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // Blocked users
        if (url.pathname === '/api/users/blocked') {
          return new Response(JSON.stringify([]), { headers: corsHeaders });
        }

        // Read receipts stub
        if (url.pathname.endsWith('/read') && request.method === 'POST') {
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. Reject root WebSocket handshake cleanly so frontend avoids crashing
    if (request.headers.get('Upgrade') === 'websocket') {
      return new Response('WebSockets not active on edge worker', { status: 501 });
    }

    // 3. Fallback to Vite SPA static assets
    return env.ASSETS.fetch(request);
  },
};
