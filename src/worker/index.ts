export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle API Routes
    if (url.pathname.startsWith('/api')) {
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
      }

      try {
        // Health Check
        if (url.pathname === '/api/health') {
          return new Response(JSON.stringify({ status: 'ok', d1: true }), { headers });
        }

        // Demo Accounts
        if (url.pathname === '/api/auth/demo-accounts') {
          const accounts = [
            {
              email: 'beestingsone@gmail.com',
              password: 'Admin@123',
              display_name: 'Vent Master',
              role: 'admin',
              desc: 'Platform Administrator',
            },
            {
              email: 'shadow@node.dev',
              password: 'Password@123',
              display_name: 'ShadowWalker',
              role: 'user',
              desc: 'Ephemeral messaging only.',
            },
            {
              email: 'ghost@node.dev',
              password: 'Password@123',
              display_name: 'GhostProtocol',
              role: 'user',
              desc: 'Encrypted end-to-end.',
            },
          ];
          return new Response(JSON.stringify(accounts), { headers });
        }

        // Login
        if (url.pathname === '/api/auth/login' && request.method === 'POST') {
          const { email } = await request.json() as any;
          const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
            .bind(email)
            .first();

          if (!user) {
            return new Response(JSON.stringify({ error: 'User not found' }), { status: 401, headers });
          }

          // Return user and simple token
          return new Response(
            JSON.stringify({
              user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                bio: user.bio,
                role: user.role,
                status: 'online',
              },
              token: `tok_${user.id}`,
            }),
            { headers }
          );
        }

        // Current Profile
        if (url.pathname === '/api/auth/me') {
          const auth = request.headers.get('Authorization')?.replace('Bearer ', '');
          const userId = auth?.replace('tok_', '') || 'usr-super-admin-001';

          const user = await env.DB.prepare('SELECT id, email, display_name, avatar_url, bio, role, status FROM users WHERE id = ?')
            .bind(userId)
            .first();

          return new Response(JSON.stringify(user || {}), { headers });
        }

        // List Conversations
        if (url.pathname === '/api/conversations' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all();
          return new Response(JSON.stringify(results || []), { headers });
        }

        // List Messages for a Conversation
        const matchMessages = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
        if (matchMessages && request.method === 'GET') {
          const convId = matchMessages[1];
          const { results } = await env.DB.prepare(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
          )
            .bind(convId)
            .all();
          return new Response(JSON.stringify(results || []), { headers });
        }

        // Post a New Message to D1
        if (matchMessages && request.method === 'POST') {
          const convId = matchMessages[1];
          const body = await request.json() as any;
          const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const senderId = body.sender_id || 'usr-super-admin-001';
          const content = body.content || '';
          const mediaType = body.media_type || 'none';

          await env.DB.prepare(
            'INSERT INTO messages (id, conversation_id, sender_id, content, media_type, expires_at) VALUES (?, ?, ?, ?, ?, datetime("now", "+3 days"))'
          )
            .bind(id, convId, senderId, content, mediaType)
            .run();

          const message = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
          return new Response(JSON.stringify(message), { status: 201, headers });
        }

        // Admin Stats
        if (url.pathname === '/api/admin/stats') {
          const usersCount = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first('count');
          const convCount = await env.DB.prepare('SELECT COUNT(*) as count FROM conversations').first('count');
          const msgCount = await env.DB.prepare('SELECT COUNT(*) as count FROM messages').first('count');

          return new Response(
            JSON.stringify({
              totalUsers: usersCount || 0,
              active24h: usersCount || 0,
              conversations: convCount || 0,
              totalMessages: msgCount || 0,
              mediaFiles: 0,
            }),
            { headers }
          );
        }

        // Admin Users List
        if (url.pathname === '/api/admin/users') {
          const { results } = await env.DB.prepare('SELECT * FROM users').all();
          return new Response(JSON.stringify(results || []), { headers });
        }

        return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404, headers });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 2. Serve static SPA assets for all non-API routes
    return env.ASSETS.fetch(request);
  },
};
