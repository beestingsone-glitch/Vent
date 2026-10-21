export interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SUPER_ADMIN_EMAIL?: string;
}

// Vent accounts are device-local: the app identifies the caller with a
// "local-jwt-" token whose payload is base64 JSON { id, email }.
// Decode it to learn who is asking, then only serve conversations and
// messages to the people who are actually members of them.
function parseCaller(request: Request): { id: string; email: string } | null {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  let token = match[1].trim();
  if (token.startsWith('local-jwt-')) {
    token = token.slice('local-jwt-'.length);
  } else if (token.includes('.')) {
    // Standard JWT shape: decode the payload segment.
    token = token.split('.')[1] || '';
    token = token.replace(/-/g, '+').replace(/_/g, '/');
  }
  try {
    const parsed = JSON.parse(atob(token));
    if (parsed && typeof parsed.id === 'string' && parsed.id.length > 0) {
      return {
        id: parsed.id,
        email: typeof parsed.email === 'string' ? parsed.email : '',
      };
    }
  } catch {
    /* not a token format we recognise */
  }
  return null;
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
        // Every API route requires a signed-in caller, and conversation
        // data is only ever served to that conversation's members.
        const caller = parseCaller(request);
        if (!caller) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: corsHeaders,
          });
        }
        const callerId = caller.id;
        const adminEmail = (env.SUPER_ADMIN_EMAIL || 'beestingsone@gmail.com').toLowerCase();
        // The owner is always admin. Anyone else is an admin when their
        // directory record carries role = 'admin' (managed from the console).
        let isAdmin =
          callerId === 'usr-super-admin-001' ||
          (caller.email && caller.email.toLowerCase() === adminEmail);
        if (!isAdmin) {
          try {
            const roleRow: any = await env.DB.prepare(
              'SELECT role FROM users WHERE id = ?'
            ).bind(callerId).first();
            if (roleRow && roleRow.role === 'admin') isAdmin = true;
          } catch {
            /* directory lookup failed; owner check above still applies */
          }
        }

        // True when the caller belongs to the conversation. Legacy
        // conversations with no member rows at all stay visible to the
        // admin only, never to everyone.
        const canAccessConversation = async (convId: string): Promise<boolean> => {
          const member: any = await env.DB.prepare(
            'SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
          ).bind(convId, callerId).first();
          if (member) return true;
          if (isAdmin) {
            const anyMember: any = await env.DB.prepare(
              'SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? LIMIT 1'
            ).bind(convId).first();
            if (!anyMember) return true;
          }
          return false;
        };

        const forbidden = () =>
          new Response(JSON.stringify({ error: 'Forbidden: not a member of this conversation' }), {
            status: 403,
            headers: corsHeaders,
          });

        // --- CONVERSATIONS ---

        // Get only the caller's own conversations, with participant details
        if (url.pathname === '/api/conversations' && request.method === 'GET') {
          const { results: convs } = await env.DB.prepare(`
            SELECT * FROM conversations c
            WHERE EXISTS (
              SELECT 1 FROM conversation_members cm
              WHERE cm.conversation_id = c.id AND cm.user_id = ?
            )
            OR (
              ? = 1 AND NOT EXISTS (
                SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = c.id
              )
            )
            ORDER BY c.created_at DESC
          `).bind(callerId, isAdmin ? 1 : 0).all();

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
                members: members || [],
              };
            })
          );

          return new Response(JSON.stringify(populated), { headers: corsHeaders });
        }

        // Create or retrieve Direct / Group Conversation
        if (url.pathname === '/api/conversations' && request.method === 'POST') {
          const body: any = await request.json();
          const type = body.type || 'direct';
          const memberIds: string[] = Array.from(
            new Set([...(body.member_ids || []), callerId])
          );
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
          if (!(await canAccessConversation(convId))) return forbidden();
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
          if (!(await canAccessConversation(convId))) return forbidden();
          await env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(convId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // Delete a conversation completely
        const deleteConvMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
        if (deleteConvMatch && request.method === 'DELETE') {
          const convId = deleteConvMatch[1];
          if (!(await canAccessConversation(convId))) return forbidden();
          await env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(convId).run();
          await env.DB.prepare('DELETE FROM conversation_members WHERE conversation_id = ?').bind(convId).run();
          await env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(convId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // --- MESSAGES ---

        // Get messages for a specific conversation (members only)
        const msgMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
        if (msgMatch && request.method === 'GET') {
          const convId = msgMatch[1];
          if (!(await canAccessConversation(convId))) return forbidden();
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

        // Send a message (members only, always sent as the caller)
        if (msgMatch && request.method === 'POST') {
          const convId = msgMatch[1];
          if (!(await canAccessConversation(convId))) return forbidden();
          const body: any = await request.json();
          const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const senderId = callerId;
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

        // Delete a single message (only its sender, or the admin)
        const singleMsgMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
        if (singleMsgMatch && request.method === 'DELETE') {
          const messageId = singleMsgMatch[1];
          const msg: any = await env.DB.prepare(
            'SELECT sender_id FROM messages WHERE id = ?'
          ).bind(messageId).first();
          if (msg && msg.sender_id !== callerId && !isAdmin) return forbidden();
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

        // --- USER DIRECTORY (real users only: people register themselves
        // when they sign in, so demo/seed accounts never appear here) ---

        // Register or refresh the caller's own directory entry
        if (url.pathname === '/api/users/register' && request.method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          const displayName = (body.display_name || 'Vent Member').toString().slice(0, 80);
          const avatarUrl = body.avatar_url ? body.avatar_url.toString().slice(0, 600) : null;
          const bio = body.bio ? body.bio.toString().slice(0, 200) : null;
          await env.DB.prepare(`
            INSERT INTO users (id, email, password_hash, display_name, avatar_url, bio)
            VALUES (?, ?, '', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              display_name = excluded.display_name,
              avatar_url = excluded.avatar_url,
              bio = excluded.bio
          `).bind(callerId, caller.email || null, displayName, avatarUrl, bio).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // The caller's own directory profile (the app reads its role here,
        // so people promoted to admin get the console on their own device)
        if (url.pathname === '/api/users/me' && request.method === 'GET') {
          const row: any = await env.DB.prepare(
            'SELECT id, email, display_name, avatar_url, bio, role, status FROM users WHERE id = ?'
          ).bind(callerId).first();
          if (row) {
            return new Response(JSON.stringify(row), { headers: corsHeaders });
          }
          return new Response(
            JSON.stringify({
              id: callerId,
              email: caller.email || null,
              display_name: null,
              avatar_url: null,
              bio: null,
              role: isAdmin ? 'admin' : 'user',
              status: 'offline',
            }),
            { headers: corsHeaders }
          );
        }

        // Search the directory of real users
        if (url.pathname === '/api/users/search' && request.method === 'GET') {
          const q = (url.searchParams.get('q') || '').trim();
          const { results } = await env.DB.prepare(`
            SELECT id, display_name, avatar_url, bio, status
            FROM users
            WHERE id != ? AND (? = '' OR display_name LIKE '%' || ? || '%')
            ORDER BY display_name ASC
            LIMIT 50
          `).bind(callerId, q, q).all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }

        // Leave the directory (remove own entry)
        if (url.pathname === '/api/users/me' && request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(callerId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // --- SUPER ADMIN ( Audit Console: real data from D1 ) ---
        if (url.pathname.startsWith('/api/admin/')) {
          if (!isAdmin) return forbidden();

          const logAudit = async (action: string, targetId: string | null, details: string) => {
            try {
              await env.DB.prepare(
                'CREATE TABLE IF NOT EXISTS admin_audit_logs (id TEXT PRIMARY KEY, action TEXT, actor_email TEXT, target_id TEXT, details TEXT, timestamp TEXT)'
              ).run();
              await env.DB.prepare(
                'INSERT INTO admin_audit_logs (id, action, actor_email, target_id, details, timestamp) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
              ).bind(
                `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                action,
                caller.email || callerId,
                targetId,
                details
              ).run();
            } catch {
              /* audit logging must never break the action itself */
            }
          };

          // Platform totals
          if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
            const count = async (sql: string, ...binds: any[]): Promise<number> => {
              const row: any = await env.DB.prepare(sql).bind(...binds).first();
              return row && typeof row.n === 'number' ? row.n : 0;
            };
            const registeredCount = await count('SELECT COUNT(*) AS n FROM users');
            const deviceOnlyCount = await count(
              'SELECT COUNT(DISTINCT user_id) AS n FROM conversation_members WHERE user_id NOT IN (SELECT id FROM users)'
            );
            const totalUsers = registeredCount + deviceOnlyCount;
            const active24h = await count(
              "SELECT COUNT(DISTINCT sender_id) AS n FROM messages WHERE created_at >= datetime('now', '-24 hours')"
            );
            const totalConversations = await count('SELECT COUNT(*) AS n FROM conversations');
            const totalMessages = await count('SELECT COUNT(*) AS n FROM messages');
            const mediaRow: any = await env.DB.prepare(
              'SELECT COUNT(*) AS n, COALESCE(SUM(media_size), 0) AS bytes FROM messages WHERE media_url IS NOT NULL'
            ).first();
            let bannedUsers = 0;
            try {
              bannedUsers = await count('SELECT COUNT(*) AS n FROM users WHERE is_banned = 1');
            } catch {
              bannedUsers = 0;
            }
            return new Response(
              JSON.stringify({
                total_users: totalUsers,
                active_users_24h: active24h,
                total_conversations: totalConversations,
                total_messages: totalMessages,
                total_media_files: mediaRow?.n || 0,
                total_storage_bytes: mediaRow?.bytes || 0,
                banned_users: bannedUsers,
              }),
              { headers: corsHeaders }
            );
          }

          // Full user directory with activity counts. Besides registered
          // users it also lists device-only accounts: Vent accounts live on
          // each device, so a person can appear in chats (conversation
          // members) without ever having a row in the users table. Their
          // names are recovered from chat records (message sender names
          // and direct-chat names) until the account registers itself.
          if (url.pathname === '/api/admin/users' && request.method === 'GET') {
            const { results } = await env.DB.prepare(`
              SELECT u.*,
                (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS message_count,
                (SELECT COUNT(*) FROM conversation_members cm WHERE cm.user_id = u.id) AS conversation_count
              FROM users u
              ORDER BY u.display_name ASC
            `).all();
            const mapped = (results || []).map((u: any) => {
              const { password_hash, ...rest } = u;
              return {
                ...rest,
                is_banned: !!u.is_banned,
                last_active_at: u.last_active_at || u.created_at || null,
              };
            });

            // Device-only accounts: conversation members with no users row
            const { results: deviceRows } = await env.DB.prepare(`
              SELECT cm.user_id AS id,
                COUNT(DISTINCT cm.conversation_id) AS conversation_count,
                (SELECT COUNT(*) FROM messages mm WHERE mm.sender_id = cm.user_id) AS message_count
              FROM conversation_members cm
              LEFT JOIN users u ON u.id = cm.user_id
              WHERE u.id IS NULL
              GROUP BY cm.user_id
            `).all();

            let extras: any[] = [];
            if (deviceRows && deviceRows.length > 0) {
              const nameById = new Map<string, string>();
              for (const u of mapped) {
                if (u.display_name) nameById.set(u.id, u.display_name);
              }
              const { results: snaps } = await env.DB.prepare(
                'SELECT DISTINCT sender_id, sender_display_name FROM messages WHERE sender_display_name IS NOT NULL'
              ).all();
              for (const s of snaps || []) {
                if (!nameById.has(s.sender_id)) nameById.set(s.sender_id, s.sender_display_name);
              }
              const { results: allMembers } = await env.DB.prepare(
                'SELECT conversation_id, user_id FROM conversation_members'
              ).all();
              const membersOf = new Map<string, string[]>();
              for (const m of allMembers || []) {
                const arr = membersOf.get(m.conversation_id) || [];
                arr.push(m.user_id);
                membersOf.set(m.conversation_id, arr);
              }
              const { results: directConvs } = await env.DB.prepare(
                "SELECT id, name FROM conversations WHERE type = 'direct' AND name IS NOT NULL"
              ).all();
              // A direct chat is named after a participant; when one side is
              // known, the chat name identifies the other side. A few passes
              // resolve chains (e.g. a name learned in one chat names the
              // partner in the next).
              for (let pass = 0; pass < 3; pass++) {
                for (const conv of directConvs || []) {
                  const ms = membersOf.get(conv.id) || [];
                  if (ms.length !== 2) continue;
                  const [a, b] = ms;
                  if (nameById.has(a) && !nameById.has(b)) nameById.set(b, conv.name);
                  else if (nameById.has(b) && !nameById.has(a)) nameById.set(a, conv.name);
                }
              }
              extras = deviceRows.map((m: any) => ({
                id: m.id,
                email: null,
                display_name: nameById.get(m.id) || 'Device account',
                avatar_url: null,
                bio: null,
                role: 'user',
                status: 'offline',
                is_banned: false,
                created_at: null,
                last_active_at: null,
                message_count: m.message_count || 0,
                conversation_count: m.conversation_count || 0,
                unregistered: true,
              }));
            }

            const everyone = [...mapped, ...extras].sort((a: any, b: any) =>
              String(a.display_name || '').localeCompare(String(b.display_name || ''))
            );
            return new Response(JSON.stringify(everyone), { headers: corsHeaders });
          }

          // Promote a user to admin, or remove their admin role.
          // The owner account can never be demoted.
          const roleMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
          if (roleMatch && request.method === 'POST') {
            const targetId = roleMatch[1];
            const body: any = await request.json().catch(() => ({}));
            const role = body.role === 'admin' ? 'admin' : 'user';
            const target: any = await env.DB.prepare(
              'SELECT email FROM users WHERE id = ?'
            ).bind(targetId).first();
            if (
              targetId === 'usr-super-admin-001' ||
              (target && target.email && target.email.toLowerCase() === adminEmail)
            ) {
              return new Response(
                JSON.stringify({ error: 'The owner account always stays admin' }),
                { status: 400, headers: corsHeaders }
              );
            }
            await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, targetId).run();
            await logAudit(
              role === 'admin' ? 'promote_admin' : 'demote_admin',
              targetId,
              `Role set to ${role}`
            );
            return new Response(JSON.stringify({ success: true, role }), { headers: corsHeaders });
          }

          // Ban / unban a user
          const banMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/ban$/);
          if (banMatch && request.method === 'POST') {
            const targetId = banMatch[1];
            const body: any = await request.json().catch(() => ({}));
            const banned = body.is_banned ? 1 : 0;
            await env.DB.prepare('UPDATE users SET is_banned = ? WHERE id = ?').bind(banned, targetId).run();
            await logAudit(banned ? 'ban_user' : 'unban_user', targetId, `is_banned set to ${banned}`);
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
          }

          // Permanently delete a user account (directory entry + memberships)
          const deleteUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
          if (deleteUserMatch && request.method === 'DELETE') {
            const targetId = deleteUserMatch[1];
            await env.DB.prepare('DELETE FROM conversation_members WHERE user_id = ?').bind(targetId).run();
            await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
            await logAudit('delete_user', targetId, 'Account permanently deleted by admin');
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
          }

          // Every conversation on the platform, with members
          if (url.pathname === '/api/admin/conversations' && request.method === 'GET') {
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
                return { ...conv, members: members || [] };
              })
            );
            return new Response(JSON.stringify(populated), { headers: corsHeaders });
          }

          // Read any conversation's messages (audit inspector)
          const adminMsgMatch = url.pathname.match(/^\/api\/admin\/conversations\/([^/]+)\/messages$/);
          if (adminMsgMatch && request.method === 'GET') {
            const convId = adminMsgMatch[1];
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

          // Join a conversation as a member (Audit Console "Open Chat")
          const adminJoinMatch = url.pathname.match(/^\/api\/admin\/conversations\/([^/]+)\/join$/);
          if (adminJoinMatch && request.method === 'POST') {
            const convId = adminJoinMatch[1];
            await env.DB.prepare(
              "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')"
            ).bind(convId, callerId).run();
            await logAudit('join_conversation', convId, 'Admin joined conversation from the Audit Console');
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
          }

          // Media library: every message that carries a file
          if (url.pathname === '/api/admin/media' && request.method === 'GET') {
            const { results } = await env.DB.prepare(`
              SELECT
                m.id AS id,
                m.media_name AS file_name,
                m.media_url AS file_url,
                m.media_type AS file_type,
                m.media_size AS file_size,
                m.sender_id AS uploaded_by,
                m.sender_display_name AS uploader_display_name,
                u.email AS uploader_email,
                m.conversation_id AS conversation_id,
                c.name AS conversation_name,
                m.created_at AS created_at
              FROM messages m
              LEFT JOIN users u ON m.sender_id = u.id
              LEFT JOIN conversations c ON c.id = m.conversation_id
              WHERE m.media_url IS NOT NULL
              ORDER BY m.created_at DESC
              LIMIT 200
            `).all();
            return new Response(JSON.stringify(results || []), { headers: corsHeaders });
          }

          // Remove a media file from its message
          const deleteMediaMatch = url.pathname.match(/^\/api\/admin\/media\/([^/]+)$/);
          if (deleteMediaMatch && request.method === 'DELETE') {
            const mediaId = deleteMediaMatch[1];
            await env.DB.prepare(
              "UPDATE messages SET media_url = NULL, media_type = 'none', media_name = NULL, media_size = NULL WHERE id = ?"
            ).bind(mediaId).run();
            await logAudit('delete_media', mediaId, 'Media removed by admin');
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
          }

          // Security & audit logs
          if (url.pathname === '/api/admin/audit-logs' && request.method === 'GET') {
            await env.DB.prepare(
              'CREATE TABLE IF NOT EXISTS admin_audit_logs (id TEXT PRIMARY KEY, action TEXT, actor_email TEXT, target_id TEXT, details TEXT, timestamp TEXT)'
            ).run();
            const { results } = await env.DB.prepare(
              'SELECT * FROM admin_audit_logs ORDER BY timestamp DESC LIMIT 100'
            ).all();
            return new Response(JSON.stringify(results || []), { headers: corsHeaders });
          }

          // Purge expired ephemeral messages right now
          if (url.pathname === '/api/admin/purge-ephemeral' && request.method === 'POST') {
            const before: any = await env.DB.prepare(
              "SELECT COUNT(*) AS n FROM messages WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')"
            ).first();
            await env.DB.prepare(
              "DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')"
            ).run();
            await logAudit('purge_ephemeral', null, `Purged ${before?.n || 0} expired messages`);
            return new Response(
              JSON.stringify({ purgedMessages: before?.n || 0, purgedFiles: 0 }),
              { headers: corsHeaders }
            );
          }
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
