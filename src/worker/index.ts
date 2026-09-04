export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
        // Conversations list with populated members
        if (url.pathname === '/api/conversations' && request.method === 'GET') {
          const { results: convs } = await env.DB.prepare(
            'SELECT * FROM conversations ORDER BY created_at DESC'
          ).all();

          const populated = await Promise.all(
            (convs || []).map(async (conv: any) => {
              const { results: members } = await env.DB.prepare(
                'SELECT user_id, role FROM conversation_members WHERE conversation_id = ?'
              ).bind(conv.id).all();

              return {
                ...conv,
                members: members && members.length > 0 ? members : [{ user_id: 'usr-super-admin-001', role: 'owner' }],
              };
            })
          );

          return new Response(JSON.stringify(populated), { headers: corsHeaders });
        }

        // Messages for conversation
        const msgMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
        if (msgMatch && request.method === 'GET') {
          const convId = msgMatch[1];
          const { results } = await env.DB.prepare(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
          ).bind(convId).all();

          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }

        // Send Message
        if (msgMatch && request.method === 'POST') {
          const convId = msgMatch[1];
          const body: any = await request.json();
          const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const senderId = body.sender_id || 'usr-super-admin-001';
          const senderName = body.sender_display_name || 'Vent Master';
          const content = body.content || '';
          const mediaType = body.media_type || 'none';

          await env.DB.prepare(
            'INSERT INTO messages (id, conversation_id, sender_id, content, media_type, expires_at) VALUES (?, ?, ?, ?, ?, datetime("now", "+3 days"))'
          ).bind(id, convId, senderId, content, mediaType).run();

          const created = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
          return new Response(JSON.stringify({ ...created, sender_display_name: senderName }), {
            status: 201,
            headers: corsHeaders,
          });
        }

        // Users search
        if (url.pathname.startsWith('/api/users/search')) {
          const { results } = await env.DB.prepare('SELECT id, display_name, avatar_url, role, status FROM users').all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }

        // Blocked users
        if (url.pathname === '/api/users/blocked') {
          return new Response(JSON.stringify([]), { headers: corsHeaders });
        }

        // Read receipt
        if (url.pathname.endsWith('/read') && request.method === 'POST') {
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. Mock service worker file if requested to clear the 200 MIME error
    if (url.pathname === '/sw.js') {
      return new Response('self.addEventListener("fetch",()=>{});', {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }

    // 3. Fallback to Vite SPA static assets
    return env.ASSETS.fetch(request);
  },
};
