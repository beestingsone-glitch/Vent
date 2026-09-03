import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db, SUPER_ADMIN_EMAIL } from './server/db.ts';
import { generateToken, requireAdmin, requireAuth, verifyTokenString, AuthRequest } from './server/auth.ts';
import { WSMessage } from './src/types.ts';

const PORT = 3000;

// Setup upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve uploaded files
  app.use('/uploads', express.static(UPLOAD_DIR));

  // --- API Routes ---

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth: Signup
  app.post('/api/auth/signup', (req, res) => {
    try {
      const { email, password, display_name, avatar_url, bio } = req.body;
      if (!email || !password || !display_name) {
        res.status(400).json({ error: 'Email, password, and public display name are required' });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const user = db.createUser({
        email,
        password,
        display_name,
        avatar_url,
        bio,
        ip,
      });

      const token = generateToken(user);
      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          bio: user.bio,
          role: user.role,
          status: user.status,
        },
        token,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to sign up' });
    }
  });

  // Auth: Login
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const user = db.verifyCredentials(email, password, ip);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const token = generateToken(user);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          bio: user.bio,
          role: user.role,
          status: user.status,
        },
        token,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Login failed' });
    }
  });

  // Auth: Current Profile
  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    const user = req.user!;
    res.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      role: user.role,
      status: user.status,
      is_banned: user.is_banned,
    });
  });

  // Auth: Update Profile
  app.patch('/api/auth/update-profile', requireAuth, (req: AuthRequest, res) => {
    try {
      const { display_name, avatar_url, bio, status } = req.body;
      const updated = db.updateUserProfile(req.user!.id, {
        display_name,
        avatar_url,
        bio,
        status,
      });

      // Broadcast user profile update to all connected clients
      broadcast({
        type: 'user_status',
        payload: {
          userId: updated.id,
          display_name: updated.display_name,
          avatar_url: updated.avatar_url,
          status: updated.status,
        },
      });

      res.json({
        id: updated.id,
        email: updated.email,
        display_name: updated.display_name,
        avatar_url: updated.avatar_url,
        bio: updated.bio,
        role: updated.role,
        status: updated.status,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update profile' });
    }
  });

  // Quick Demo Accounts List for effortless testing
  app.get('/api/auth/demo-accounts', (_req, res) => {
    res.json([
      {
        email: SUPER_ADMIN_EMAIL,
        password: 'Admin@123',
        display_name: 'Overlord Zero',
        role: 'admin',
        desc: 'Super Admin with global auditing & moderation dashboard',
      },
      {
        email: 'shadow@veil.net',
        password: 'Password@123',
        display_name: 'ShadowRaven',
        role: 'user',
        desc: 'Regular user (Pseudonym active, email confidential)',
      },
      {
        email: 'viper@mesh.io',
        password: 'Password@123',
        display_name: 'NeonViper',
        role: 'user',
        desc: 'Regular user (Pseudonym active, email confidential)',
      },
      {
        email: 'cipher@crypt.org',
        password: 'Password@123',
        display_name: 'CipherFox',
        role: 'user',
        desc: 'Regular user (Pseudonym active, email confidential)',
      },
    ]);
  });

  // --- Public Users (Privacy Preserved: NO EMAILS EVER EXPOSED) ---
  app.get('/api/users/search', requireAuth, (req: AuthRequest, res) => {
    const q = (req.query.q as string) || '';
    const users = db.searchPublicUsers(q, req.user!.id);
    res.json(users);
  });

  // --- Conversations & Messaging ---
  app.get('/api/conversations', requireAuth, (req: AuthRequest, res) => {
    const conversations = db.getUserConversations(req.user!.id);
    res.json(conversations);
  });

  app.post('/api/conversations', requireAuth, (req: AuthRequest, res) => {
    try {
      const { type, member_ids, name, avatar_url } = req.body;
      if (!type || !member_ids || !Array.isArray(member_ids)) {
        res.status(400).json({ error: 'Type and member_ids array are required' });
        return;
      }

      // Include current user
      const fullMemberIds = Array.from(new Set([...member_ids, req.user!.id]));
      const conv = db.createConversation(type, fullMemberIds, req.user!.id, name, avatar_url);

      // Notify members via websocket
      broadcastToMembers(fullMemberIds, {
        type: 'conversation_created',
        payload: conv,
      });

      res.status(201).json(conv);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create conversation' });
    }
  });

  app.get('/api/conversations/:id', requireAuth, (req: AuthRequest, res) => {
    const conv = db.getConversationById(req.params.id, req.user!.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conv);
  });

  app.put('/api/conversations/:id/timer', requireAuth, (req: AuthRequest, res) => {
    try {
      const { timer_seconds } = req.body;
      if (typeof timer_seconds !== 'number' || timer_seconds < 10) {
        res.status(400).json({ error: 'Valid timer_seconds required (minimum 10 seconds)' });
        return;
      }

      const isAdmin = req.user!.role === 'admin';
      const updatedConv = db.setConversationTimer(req.params.id, req.user!.id, timer_seconds, isAdmin);

      // Broadcast timer update to all conversation participants
      broadcastToMembersOrAdmins(
        updatedConv.members.map((m) => m.user_id),
        {
          type: 'timer_updated',
          payload: {
            conversation_id: req.params.id,
            timer_seconds: updatedConv.timer_seconds,
            updated_at: updatedConv.updated_at,
          },
        }
      );

      res.json(updatedConv);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update conversation timer' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'admin';
      const messages = db.getConversationMessages(req.params.id, req.user!.id, isAdmin);
      res.json(messages);
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  app.post('/api/conversations/:id/messages', requireAuth, (req: AuthRequest, res) => {
    try {
      const { content, media_url, media_type, media_name, media_size } = req.body;
      const message = db.createMessage({
        conversation_id: req.params.id,
        sender_id: req.user!.id,
        content: content || '',
        media_url,
        media_type,
        media_name,
        media_size,
      });

      // Get conversation members
      const conv = db.getConversationById(req.params.id);
      const memberIds = conv ? conv.members.map((m) => m.user_id) : [];

      // Broadcast message to all members & connected admins
      broadcastToMembersOrAdmins(memberIds, {
        type: 'new_message',
        payload: message,
      });

      res.status(201).json(message);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to send message' });
    }
  });

  app.post('/api/conversations/:id/read', requireAuth, (req: AuthRequest, res) => {
    try {
      db.markConversationRead(req.params.id, req.user!.id);
      const conv = db.getConversationById(req.params.id);
      if (conv) {
        broadcastToMembers(
          conv.members.map((m) => m.user_id),
          {
            type: 'messages_read',
            payload: {
              conversation_id: req.params.id,
              user_id: req.user!.id,
              last_read_at: new Date().toISOString(),
            },
          }
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Clear all messages in a conversation
  app.post('/api/conversations/:id/clear', requireAuth, (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'admin';
      const result = db.clearConversation(req.params.id, req.user!.id, isAdmin);
      if (result.success) {
        broadcastToMembersOrAdmins(result.memberIds, {
          type: 'conversation_cleared',
          payload: { conversation_id: req.params.id },
        });
        res.json({ success: true, conversation_id: req.params.id });
      } else {
        res.status(400).json({ error: 'Failed to clear conversation' });
      }
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to clear conversation' });
    }
  });

  // Delete conversation completely (all messages, members, and conversation record)
  app.delete('/api/conversations/:id', requireAuth, (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'admin';
      const result = db.deleteConversation(req.params.id, req.user!.id, isAdmin);
      if (result.success) {
        broadcastToMembersOrAdmins(result.memberIds, {
          type: 'conversation_deleted',
          payload: { conversation_id: req.params.id },
        });
        res.json({ success: true, conversation_id: req.params.id });
      } else {
        res.status(400).json({ error: 'Failed to delete conversation' });
      }
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to delete conversation' });
    }
  });

  // Block a user
  app.post('/api/users/:id/block', requireAuth, (req: AuthRequest, res) => {
    try {
      db.blockUser(req.user!.id, req.params.id);
      sendToUser(req.user!.id, {
        type: 'user_blocked',
        payload: { user_id: req.user!.id, blocked_user_id: req.params.id, is_blocked: true },
      });
      res.json({ success: true, blocked_user_id: req.params.id });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to block user' });
    }
  });

  // Unblock a user
  app.post('/api/users/:id/unblock', requireAuth, (req: AuthRequest, res) => {
    try {
      db.unblockUser(req.user!.id, req.params.id);
      sendToUser(req.user!.id, {
        type: 'user_unblocked',
        payload: { user_id: req.user!.id, blocked_user_id: req.params.id, is_blocked: false },
      });
      res.json({ success: true, unblocked_user_id: req.params.id });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to unblock user' });
    }
  });

  // Get current user's blocked users
  app.get('/api/users/blocked', requireAuth, (req: AuthRequest, res) => {
    try {
      const blocked = db.getBlockedUserIds(req.user!.id);
      res.json(blocked);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/messages/:id', requireAuth, (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'admin';
      const deletedResult = db.deleteMessage(req.params.id, req.user!.id, isAdmin);
      if (deletedResult.success) {
        broadcast({
          type: 'message_deleted',
          payload: { messageId: req.params.id, conversation_id: deletedResult.conversationId },
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Message not found' });
      }
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  // Upload endpoint (images, videos, audio voice recordings)
  app.post('/api/upload', requireAuth, upload.single('file'), (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      let mediaType: 'image' | 'video' | 'audio' | 'none' = 'none';

      if (req.file.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (req.file.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      }

      res.json({
        file_url: fileUrl,
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        media_type: mediaType,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'File upload failed' });
    }
  });

  // --- Admin Master Audit & Control (beestingsone@gmail.com) ---
  app.get('/api/admin/stats', requireAuth, requireAdmin, (_req, res) => {
    res.json(db.getAdminStats());
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
    res.json(db.getAllUsersAdmin());
  });

  app.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    try {
      const { is_banned } = req.body;
      const success = db.banUserAdmin(req.params.id, Boolean(is_banned), req.user!.email);
      if (success) {
        broadcast({
          type: 'user_banned',
          payload: { userId: req.params.id, is_banned: Boolean(is_banned) },
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    try {
      const success = db.deleteUserAdmin(req.params.id, req.user!.email);
      if (success) {
        broadcast({
          type: 'user_banned',
          payload: { userId: req.params.id, is_deleted: true },
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/admin/conversations', requireAuth, requireAdmin, (_req, res) => {
    res.json(db.getAllConversationsAdmin());
  });

  app.get('/api/admin/conversations/:id/messages', requireAuth, requireAdmin, (req, res) => {
    try {
      const messages = db.getConversationMessages(req.params.id, '', true);
      res.json(messages);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/admin/media', requireAuth, requireAdmin, (_req, res) => {
    res.json(db.getAllMediaFilesAdmin());
  });

  app.delete('/api/admin/media/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    try {
      const success = db.deleteMediaFileAdmin(req.params.id, req.user!.email);
      res.json({ success });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/admin/audit-logs', requireAuth, requireAdmin, (_req, res) => {
    res.json(db.getAuditLogs());
  });

  app.post('/api/admin/purge-ephemeral', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    try {
      const result = db.purgeExpiredMessages();
      db.addAuditLog(
        'PURGE_EPHEMERAL',
        req.user!.email,
        `Manually triggered ephemeral message purge: removed ${result.purgedMessages} expired messages and ${result.purgedFiles} media files.`
      );
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- WebSocket Setup ---
  const wss = new WebSocketServer({ server });

  interface ClientInfo {
    ws: WebSocket;
    userId: string;
    email: string;
    role: string;
    isAlive: boolean;
  }

  const clients = new Map<WebSocket, ClientInfo>();

  function sendToUser(userId: string, message: WSMessage) {
    const data = JSON.stringify(message);
    clients.forEach((info) => {
      if (info.userId === userId && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(data);
      }
    });
  }

  function broadcast(message: WSMessage) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  function broadcastToMembers(memberIds: string[], message: WSMessage) {
    const data = JSON.stringify(message);
    clients.forEach((info) => {
      if (memberIds.includes(info.userId) && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(data);
      }
    });
  }

  function broadcastToMembersOrAdmins(memberIds: string[], message: WSMessage) {
    const data = JSON.stringify(message);
    clients.forEach((info) => {
      if (
        (memberIds.includes(info.userId) || info.role === 'admin') &&
        info.ws.readyState === WebSocket.OPEN
      ) {
        info.ws.send(data);
      }
    });
  }

  function broadcastPresence() {
    const onlineUserIds = Array.from(new Set(Array.from(clients.values()).map((c) => c.userId)));
    broadcast({
      type: 'presence_sync',
      payload: { onlineUserIds },
    });
  }

  wss.on('connection', (ws) => {
    let clientInfo: ClientInfo | null = null;

    ws.on('message', (rawData) => {
      try {
        const msg: WSMessage<any> = JSON.parse(rawData.toString());

        if (msg.type === 'auth') {
          const token = msg.payload?.token;
          if (token) {
            const decoded = verifyTokenString(token);
            if (decoded) {
              const user = db.findUserById(decoded.id);
              if (user && !user.is_banned) {
                clientInfo = {
                  ws,
                  userId: user.id,
                  email: user.email,
                  role: user.role,
                  isAlive: true,
                };
                clients.set(ws, clientInfo);

                db.setUserStatus(user.id, 'online');

                ws.send(
                  JSON.stringify({
                    type: 'auth_success',
                    payload: { userId: user.id, status: 'online' },
                  })
                );

                broadcastPresence();
              }
            }
          }
        } else if (msg.type === 'typing') {
          if (clientInfo) {
            const { conversation_id, is_typing, display_name } = msg.payload;
            const conv = db.getConversationById(conversation_id);
            if (conv) {
              const memberIds = conv.members.map((m) => m.user_id).filter((id) => id !== clientInfo?.userId);
              broadcastToMembers(memberIds, {
                type: 'user_typing',
                payload: {
                  conversation_id,
                  user_id: clientInfo.userId,
                  display_name,
                  is_typing,
                },
              });
            }
          }
        } else if (msg.type === 'mark_read') {
          if (clientInfo && msg.payload?.conversation_id) {
            db.markConversationRead(msg.payload.conversation_id, clientInfo.userId);
            const conv = db.getConversationById(msg.payload.conversation_id);
            if (conv) {
              broadcastToMembers(
                conv.members.map((m) => m.user_id),
                {
                  type: 'messages_read',
                  payload: {
                    conversation_id: msg.payload.conversation_id,
                    user_id: clientInfo.userId,
                    last_read_at: new Date().toISOString(),
                  },
                }
              );
            }
          }
        } else if (msg.type === 'call_invite') {
          if (clientInfo && msg.payload?.toUserId) {
            if (db.isUserBlocked(clientInfo.userId, msg.payload.toUserId)) {
              sendToUser(clientInfo.userId, {
                type: 'call_rejected',
                payload: {
                  toUserId: clientInfo.userId,
                  fromUserId: msg.payload.toUserId,
                  reason: 'User is blocked or unavailable for calls.',
                },
              });
              return;
            }
            const caller = db.findUserById(clientInfo.userId);
            sendToUser(msg.payload.toUserId, {
              type: 'call_invite',
              payload: {
                ...msg.payload,
                fromUserId: clientInfo.userId,
                fromDisplayName: caller?.display_name || 'Anonymous',
                fromAvatarUrl: caller?.avatar_url,
              },
            });
          }
        } else if (msg.type === 'call_accepted') {
          if (clientInfo && msg.payload?.toUserId) {
            sendToUser(msg.payload.toUserId, {
              type: 'call_accepted',
              payload: {
                ...msg.payload,
                fromUserId: clientInfo.userId,
              },
            });
          }
        } else if (msg.type === 'call_rejected') {
          if (clientInfo && msg.payload?.toUserId) {
            sendToUser(msg.payload.toUserId, {
              type: 'call_rejected',
              payload: {
                ...msg.payload,
                fromUserId: clientInfo.userId,
              },
            });
          }
        } else if (msg.type === 'call_ended') {
          if (clientInfo && msg.payload?.toUserId) {
            sendToUser(msg.payload.toUserId, {
              type: 'call_ended',
              payload: {
                ...msg.payload,
                fromUserId: clientInfo.userId,
              },
            });
          }
        } else if (
          msg.type === 'webrtc_offer' ||
          msg.type === 'webrtc_answer' ||
          msg.type === 'webrtc_ice_candidate'
        ) {
          if (clientInfo && msg.payload?.toUserId) {
            sendToUser(msg.payload.toUserId, {
              type: msg.type,
              payload: {
                ...msg.payload,
                fromUserId: clientInfo.userId,
              },
            });
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', payload: {} }));
        }
      } catch (err) {
        console.error('[WS] Message parse error', err);
      }
    });

    ws.on('close', () => {
      if (clientInfo) {
        clients.delete(ws);
        db.setUserStatus(clientInfo.userId, 'offline');
        broadcastPresence();
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Socket error', err);
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Privacy Chat Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Error]', err);
});
