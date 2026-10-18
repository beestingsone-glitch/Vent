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

    if (url.pathname.startsWith('/api')) {
      try {
        // 1. Upload media endpoint
        if (url.pathname === '/api/upload' && request.method === 'POST') {
          const formData = await request.formData();
          const file = formData.get('file') as File;
          if (!file) {
            return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400, headers: corsHeaders });
          }

          const buffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          const dataUrl = `data:${file.type};base64,${base64}`;

          let mediaType = 'image';
          if (file.type.startsWith('video/')) mediaType = 'video';
          else if (file.type.startsWith('audio/')) mediaType = 'audio';

          return new Response(
            JSON.stringify({
              file_url: dataUrl,
              file_name: file.name,
              file_size: file.size,
              media_type: mediaType,
            }),
            { headers: corsHeaders }
          );
        }

        // 2. Conversations list
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

        // 3. Create conversation
        if (url.pathname === '/api/conversations' && request.method === 'POST') {
          const body: any = await request.json();
          const convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const type = body.type || 'direct';
          const name = body.name || (type === 'group' ? 'New Group' : 'Direct Chat');
          const avatarUrl = body.avatar_url || null;
          const memberIds: string[] = body.member_ids || [];

          await env.DB.prepare(`
            INSERT INTO conversations (id, type, name, avatar_url, timer_seconds, created_at)
            VALUES (?, ?, ?, ?, 300, datetime('now'))
          `).bind(convId, type, name, avatarUrl).run();

          for (const mId of memberIds) {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role)
              VALUES (?, ?, 'member')
            `).bind(convId, mId).run();
          }

          const createdConv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(convId).first();
          return new Response(JSON.stringify(createdConv), { status: 201, headers: corsHeaders });
        }

        // 4. Update conversation timer
        const timerMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/timer$/);
        if (timerMatch && request.method === 'PUT') {
          const convId = timerMatch[1];
          const body: any = await request.json();
          const timerSeconds = parseInt(body.timer_seconds, 10) || 300;

          await env.DB.prepare(
            'UPDATE conversations SET timer_seconds = ? WHERE id = ?'
          ).bind(timerSeconds, convId).run();

          return new Response(JSON.stringify({ success: true, timer_seconds: timerSeconds }), {
            headers: corsHeaders,
          });
        }

        // 5. Get conversation messages (Includes fallback JOIN to get user names if null)
        const msgMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
        if (msgMatch && request.method === 'GET') {
          const convId = msgMatch[1];
          const { results } = await env.DB.prepare(`
            SELECT 
              m.*,
              COALESCE(m.sender_display_name, u.display_name, 'Vent Member') AS sender_display_name,
              COALESCE(m.sender_avatar, u.avatar_url) AS sender_avatar
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at ASC
          `).bind(convId).all();

          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }

        // 6. Send message (Saves sender_display_name and sender_avatar)
        if (msgMatch && request.method === 'POST') {
          const convId = msgMatch[1];
          const body: any = await request.json();
          const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const senderId = body.sender_id || 'usr-super-admin-001';
          const senderName = body.sender_display_name || 'Vent Master';
          const senderAvatar = body.sender_avatar || null;
          const content = body.content || '';
          const mediaUrl = body.media_url || null;
          const mediaType = body.media_type || (mediaUrl ? 'image' : 'none');
          const mediaName = body.media_name || null;
          const mediaSize = body.media_size || null;

          let durationSeconds = parseInt(body.timer_seconds || body.ttl, 10);
          if (isNaN(durationSeconds) || durationSeconds <= 0) {
            const conv: any = await env.DB.prepare(
              'SELECT timer_seconds FROM conversations WHERE id = ?'
            ).bind(convId).first();
            durationSeconds = conv?.timer_seconds ? parseInt(conv.timer_seconds, 10) : 300;
          }

          const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
          const createdAt = new Date().toISOString();

          await env.DB.prepare(`
            INSERT INTO messages (
              id,
              conversation_id,
              sender_id,
              sender_display_name,
              sender_avatar,
              content,
              media_type,
              expires_at,
              created_at,
              media_url,
              media_name,
              media_size
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            convId,
            senderId,
            senderName,
            senderAvatar,
            content,
            mediaType,
            expiresAt,
            createdAt,
            mediaUrl,
            mediaName,
            mediaSize
          ).run();

          const created: any = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
          return new Response(
            JSON.stringify({
              ...created,
              sender_display_name: senderName,
              sender_avatar: senderAvatar,
              media_url: mediaUrl,
              media_type: mediaType,
            }),
            { status: 201, headers: corsHeaders }
          );
        }

        // 7. Delete message
        const singleMsgMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
        if (singleMsgMatch && request.method === 'DELETE') {
          const messageId = singleMsgMatch[1];
          await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(messageId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // 8. Users
        if (url.pathname === '/api/users' || url.pathname.startsWith('/api/users/search')) {
          let { results } = await env.DB.prepare('SELECT id, display_name, avatar_url, role, status FROM users').all();
          if (!results || results.length === 0) {
            results = [
              { id: 'usr-super-admin-001', display_name: 'Vent Master', avatar_url: null, role: 'admin', status: 'online' },
              { id: 'usr-demo-002', display_name: 'Sarah Connor', avatar_url: null, role: 'member', status: 'online' },
              { id: 'usr-demo-003', display_name: 'Alex Vance', avatar_url: null, role: 'member', status: 'offline' }
            ];
          }
          return new Response(JSON.stringify(results), { headers: corsHeaders });
        }

        // 9. Blocked users
        if (url.pathname === '/api/users/blocked') {
          return new Response(JSON.stringify([]), { headers: corsHeaders });
        }

        // 10. Read receipt
        if (url.pathname.endsWith('/read') && request.method === 'POST') {
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/sw.js') {
      return new Response('self.addEventListener("fetch",()=>{});', {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
