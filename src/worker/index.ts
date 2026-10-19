export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  // 1. Scheduled Background Cron: Purges expired ephemeral messages from D1
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      env.DB.prepare(
        "DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')"
      ).run()
    );
  },

  // 2. Main HTTP Fetch Handler
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
        // --- CONVERSATIONS ---

        // Get all conversations with participant details
        if (url.pathname === '/api/conversations' && request.method === 'GET') {
          const { results: convs } = await env.DB.prepare(
            'SELECT * FROM conversations ORDER BY created_at DESC'
          ).all();

          const populated = await Promise.all(
            (convs || []).map(async (conv: any) => {
              const { results: members } = await env.DB.prepare(`
                SELECT cm.user_id, cm.role, u.display_name, u.avatar_url
                FROM conversation_members cm
                LEFT JOIN users u ON cm.user_id = u.id
                WHERE cm.conversation_id = ?
              `).bind(conv.id).all();

              return {
                ...conv,
                members: members && members.length > 0 ? members : [{ user_id: 'usr-super-admin-001', role: 'owner' }],
              };
            })
          );

          return new Response(JSON.stringify(populated), { headers: corsHeaders });
        }

        // Create or retrieve Direct / Group Conversation
        if (url.pathname === '/api/conversations' && request.method === 'POST') {
          const body: any = await request.json();
          const type = body.type || 'direct';
          const memberIds: string[] = body.member_ids || [];
          const name = body.name || (type === 'group' ? 'New Group' : 'Direct Chat');
          const avatarUrl = body.avatar_url || null;

          // If 1-on-1 direct chat, check if an existing room between these two users exists
          if (type === 'direct' && memberIds.length === 2) {
            const existing: any = await env.DB.prepare(`
              SELECT c.* FROM conversations c
              JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
              JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
              WHERE c.type = 'direct'
              LIMIT 1
            `).bind(memberIds[0], memberIds[1]).first();

            if (existing) {
              return new Response(JSON.stringify(existing), { status: 200, headers: corsHeaders });
            }
          }

          const convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

        // Update Conversation Disappearing Timer
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

        // Clear all messages in a conversation
        const clearMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/clear$/);
        if (clearMatch && request.method === 'POST') {
          const convId = clearMatch[1];
          await env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(convId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // Delete a conversation completely
        const deleteConvMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
        if (deleteConvMatch && request.method === 'DELETE') {
          const convId = deleteConvMatch[1];
          await env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(convId).run();
          await env.DB.prepare('DELETE FROM conversation_members WHERE conversation_id = ?').bind(convId).run();
          await env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(convId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // --- MESSAGES ---

        // Get messages for a specific conversation
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

        // Send a message
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
              id, conversation_id, sender_id, sender_display_name, sender_avatar,
              content, media_type, expires_at, created_at,
              media_url, media_name, media_size
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

        // Delete a single message
        const singleMsgMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
        if (singleMsgMatch && request.method === 'DELETE') {
          const messageId = singleMsgMatch[1];
          await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(messageId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // --- MEDIA UPLOAD ---
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

          const mediaType = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('audio/')
            ? 'audio'
            : 'file';

          return new Response(
            JSON.stringify({
              file_url: `data:${file.type};base64,${base64}`,
              file_name: file.name,
              file_size: file.size,
              media_type: mediaType,
            }),
            { headers: corsHeaders }
          );
        }

        return new Response(JSON.stringify({ error: 'API route not found' }), {
          status: 404,
          headers: corsHeaders,
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Fallback: serve frontend static assets
    return env.ASSETS.fetch(request);
  },
};
