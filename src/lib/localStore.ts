import { AuthUser, PublicUser, Conversation, Message, MediaType } from '../types.ts';
import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  sanitizeLightweightUser,
  purgeNonCriticalStorage,
} from '../utils/storage.ts';

const LOCAL_USERS_KEY = 'vent_users';
const LEGACY_USERS_KEY = 'vent_local_users_v2';
const LOCAL_CURRENT_USER_KEY = 'vent_current_user';
const LOCAL_CONVERSATIONS_KEY = 'vent_local_conversations_v2';
const LOCAL_MESSAGES_KEY = 'vent_local_messages_v2';
const LOCAL_BLOCKED_KEY = 'vent_local_blocked_v2';

export interface LocalUserRecord extends AuthUser {
  password_hash: string;
}

const DEFAULT_USERS: LocalUserRecord[] = [
  {
    id: 'user-admin-1',
    email: 'beestingsone@gmail.com',
    display_name: 'Vent Master',
    avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    bio: 'System Super Administrator & Cryptography Lead',
    role: 'admin',
    status: 'online',
    password_hash: 'Admin@123',
  },
  {
    id: 'user-shadow-2',
    email: 'shadow@veil.net',
    display_name: 'ShadowRaven',
    avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    bio: 'Ephemeral channel explorer. Here today, gone tomorrow.',
    role: 'user',
    status: 'online',
    password_hash: 'Password@123',
  },
  {
    id: 'user-viper-3',
    email: 'viper@mesh.io',
    display_name: 'NeonViper',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    bio: 'Mesh network advocate & zero-knowledge fanatic.',
    role: 'user',
    status: 'online',
    password_hash: 'Password@123',
  },
  {
    id: 'user-cipher-4',
    email: 'cipher@crypt.org',
    display_name: 'CipherFox',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    bio: 'Decentralized communications researcher.',
    role: 'user',
    status: 'away',
    password_hash: 'Password@123',
  },
];

function getStored<T>(key: string, defaultVal: T): T {
  try {
    const raw = safeGetItem(key);
    if (!raw) return defaultVal;
    return JSON.parse(raw) as T;
  } catch {
    return defaultVal;
  }
}

function setStored<T>(key: string, val: T): void {
  try {
    safeSetItem(key, JSON.stringify(val));
  } catch (err) {
    console.warn(`safeSetItem fallback error for key "${key}":`, err);
  }
}

export function localPanicWipe(): void {
  try {
    safeRemoveItem(LOCAL_USERS_KEY);
    safeRemoveItem(LEGACY_USERS_KEY);
    safeRemoveItem(LOCAL_CURRENT_USER_KEY);
    safeRemoveItem(LOCAL_CONVERSATIONS_KEY);
    safeRemoveItem(LOCAL_MESSAGES_KEY);
    safeRemoveItem('chat_token');
    safeRemoveItem('vent_language');
    // Clear all storage safely
    localStorage.clear();
  } catch (e) {
    console.error('Error during panic wipe:', e);
  }
}

export function initLocalStore(): void {
  let users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
  if (users.length === 0) {
    // Check legacy key
    const legacy = getStored<LocalUserRecord[]>(LEGACY_USERS_KEY, []);
    if (legacy.length > 0) {
      users = legacy;
    } else {
      users = DEFAULT_USERS;
    }
    setStored(LOCAL_USERS_KEY, users);
    setStored(LEGACY_USERS_KEY, users);
  }

  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  if (convs.length === 0) {
    const seedConvs: Conversation[] = [
      {
        id: 'conv-group-global',
        type: 'group',
        name: '🔒 Vent Encrypted Lounge',
        avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        created_by: 'user-admin-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        timer_seconds: 3600,
        members: DEFAULT_USERS.map((u) => ({
          user_id: u.id,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          joined_at: new Date().toISOString(),
        })),
      },
    ];
    setStored(LOCAL_CONVERSATIONS_KEY, seedConvs);
    setStored(LOCAL_MESSAGES_KEY, []);
  }
}

// Local Auth operations
export function localSignup(params: {
  email: string;
  password: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
}): { user: AuthUser; token: string } {
  initLocalStore();
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanPassword = params.password.trim();
  const cleanDisplayName = params.display_name.trim();

  // Strict email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (!cleanDisplayName) {
    throw new Error('Please choose a public display name / pseudonym.');
  }

  const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
  const existing = users.find((u) => u.email.trim().toLowerCase() === cleanEmail);
  if (existing) {
    throw new Error('An account with this email already exists. Please sign in or reset your password.');
  }

  const isSuperAdmin = cleanEmail === 'beestingsone@gmail.com';
  
  // Provide clean, lightweight avatar URL
  const avatarUrl =
    params.avatar_url && params.avatar_url.trim()
      ? params.avatar_url.trim()
      : `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanDisplayName)}`;

  const newUser: LocalUserRecord = {
    id: 'user-' + Math.random().toString(36).substring(2, 11),
    email: cleanEmail,
    display_name: cleanDisplayName,
    avatar_url: avatarUrl,
    bio: params.bio?.trim() || (isSuperAdmin ? 'Super Administrator' : 'Encrypted pseudonymous member'),
    role: isSuperAdmin ? 'admin' : 'user',
    status: 'online',
    password_hash: cleanPassword,
  };

  users.push(newUser);
  setStored(LOCAL_USERS_KEY, users);
  setStored(LEGACY_USERS_KEY, users);

  // Add new user to default global group chat
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  const globalConv = convs.find((c) => c.id === 'conv-group-global');
  if (globalConv && !globalConv.members.some((m) => m.user_id === newUser.id)) {
    globalConv.members.push({
      user_id: newUser.id,
      display_name: newUser.display_name,
      avatar_url: newUser.avatar_url,
      joined_at: new Date().toISOString(),
    });
    setStored(LOCAL_CONVERSATIONS_KEY, convs);
  }

  const token = 'local-jwt-' + btoa(JSON.stringify({ id: newUser.id, email: newUser.email }));
  const { password_hash: _, ...safeUser } = newUser;
  const lightweightUser = sanitizeLightweightUser(safeUser);
  safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweightUser));
  safeSetItem('chat_token', token);

  return { user: lightweightUser, token };
}

export function localLogin(email: string, pass: string): { user: AuthUser; token: string } {
  initLocalStore();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = pass.trim();

  // Strict email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!cleanPass) {
    throw new Error('Please enter your password.');
  }

  const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
  const user = users.find((u) => u.email.trim().toLowerCase() === cleanEmail);

  if (!user) {
    throw new Error("Account not found. Please click 'Create Pseudonym' to register.");
  }

  if (user.password_hash !== cleanPass) {
    throw new Error("Invalid password. Please check your credentials or click 'Forgot Password?' to reset it.");
  }

  // Ensure role is preserved / elevated ONLY for designated super admin
  if (user.email.trim().toLowerCase() === 'beestingsone@gmail.com') {
    user.role = 'admin';
  } else {
    user.role = 'user';
  }
  setStored(LOCAL_USERS_KEY, users);
  setStored(LEGACY_USERS_KEY, users);

  const token = 'local-jwt-' + btoa(JSON.stringify({ id: user.id, email: user.email }));
  const { password_hash: _, ...safeUser } = user;
  const lightweightUser = sanitizeLightweightUser(safeUser);
  safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweightUser));
  safeSetItem('chat_token', token);

  return { user: lightweightUser, token };
}

export function localResetPassword(email: string, newPassword: string): { user: AuthUser; token: string } {
  initLocalStore();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = newPassword.trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!cleanPass || cleanPass.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
  let user = users.find((u) => u.email.trim().toLowerCase() === cleanEmail);

  if (!user) {
    if (cleanEmail === 'beestingsone@gmail.com') {
      // Auto-create super admin account with this password
      return localSignup({
        email: 'beestingsone@gmail.com',
        password: cleanPass,
        display_name: 'Vent Master',
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        bio: 'Super Admin & Cryptography Lead',
      });
    }
    throw new Error("Account not found. Please click 'Create Pseudonym' to register.");
  }

  user.password_hash = cleanPass;
  if (cleanEmail === 'beestingsone@gmail.com') {
    user.role = 'admin';
  }
  setStored(LOCAL_USERS_KEY, users);
  setStored(LEGACY_USERS_KEY, users);

  const token = 'local-jwt-' + btoa(JSON.stringify({ id: user.id, email: user.email }));
  const { password_hash: _, ...safeUser } = user;
  const lightweightUser = sanitizeLightweightUser(safeUser);
  safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweightUser));
  safeSetItem('chat_token', token);

  return { user: lightweightUser, token };
}

export function localGetMe(token: string): AuthUser | null {
  initLocalStore();
  // Check vent_current_user first
  try {
    const raw = safeGetItem(LOCAL_CURRENT_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) return sanitizeLightweightUser(parsed);
    }
  } catch {
    // ignore
  }

  if (!token.startsWith('local-jwt-')) {
    // Try base64 parse
    try {
      const parsed = JSON.parse(atob(token.replace('local-jwt-', '')));
      const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
      const match = users.find((u) => u.id === parsed.id || u.email.trim().toLowerCase() === parsed.email.trim().toLowerCase());
      if (match) {
        const { password_hash: _, ...safeUser } = match;
        return sanitizeLightweightUser(safeUser);
      }
    } catch {
      return null;
    }
  }

  try {
    const raw = token.replace('local-jwt-', '');
    const data = JSON.parse(atob(raw));
    const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
    const match = users.find((u) => u.id === data.id);
    if (match) {
      const { password_hash: _, ...safeUser } = match;
      return sanitizeLightweightUser(safeUser);
    }
  } catch {
    return null;
  }
  return null;
}

export function localUpdateProfile(userId: string, updates: Partial<AuthUser>): AuthUser {
  initLocalStore();
  const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error('User not found');

  users[idx] = {
    ...users[idx],
    ...updates,
  };
  setStored(LOCAL_USERS_KEY, users);
  setStored(LEGACY_USERS_KEY, users);

  // Also update in conversation memberships
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  let convsChanged = false;
  convs.forEach((c) => {
    const m = c.members.find((mem) => mem.user_id === userId);
    if (m) {
      if (updates.display_name) m.display_name = updates.display_name;
      if (updates.avatar_url) m.avatar_url = updates.avatar_url;
      convsChanged = true;
    }
  });
  if (convsChanged) setStored(LOCAL_CONVERSATIONS_KEY, convs);

  const { password_hash: _, ...safeUser } = users[idx];
  const lightweightUser = sanitizeLightweightUser(safeUser);
  safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweightUser));
  return lightweightUser;
}

export function localSearchUsers(query: string, excludeUserId?: string): PublicUser[] {
  initLocalStore();
  const q = query.toLowerCase().trim();
  const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);

  return users
    .filter((u) => {
      if (excludeUserId && u.id === excludeUserId) return false;
      if (!q) return true;
      return u.display_name.toLowerCase().includes(q) || (u.bio && u.bio.toLowerCase().includes(q));
    })
    .map((u) => ({
      id: u.id,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      bio: u.bio,
      status: u.status,
      role: u.role,
    }));
}

export function localGetConversations(userId: string): Conversation[] {
  initLocalStore();
  localPurgeExpiredMessages();
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  return convs.filter((c) => c.members.some((m) => m.user_id === userId));
}

export function localGetMessages(conversationId: string): Message[] {
  initLocalStore();
  localPurgeExpiredMessages();
  const msgs = getStored<Message[]>(LOCAL_MESSAGES_KEY, []);
  return msgs
    .filter((m) => m.conversation_id === conversationId && !m.is_deleted)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function localSendMessage(params: {
  conversation_id: string;
  sender_id: string;
  sender_display_name: string;
  sender_avatar?: string;
  content: string;
  media_url?: string;
  media_type?: MediaType;
  media_name?: string;
  media_size?: number;
  timer_seconds?: number;
}): Message {
  initLocalStore();
  const msgs = getStored<Message[]>(LOCAL_MESSAGES_KEY, []);
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  const conv = convs.find((c) => c.id === params.conversation_id);

  const timer = params.timer_seconds ?? (conv?.timer_seconds || 0);
  const now = new Date();
  const expiresAt = timer > 0 ? new Date(now.getTime() + timer * 1000).toISOString() : undefined;

  const newMsg: Message = {
    id: 'msg-' + Math.random().toString(36).substring(2, 11),
    conversation_id: params.conversation_id,
    sender_id: params.sender_id,
    sender_display_name: params.sender_display_name,
    sender_avatar: params.sender_avatar,
    content: params.content,
    media_url: params.media_url,
    media_type: params.media_type || 'none',
    media_name: params.media_name,
    media_size: params.media_size,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    read_by: [params.sender_id],
  };

  msgs.push(newMsg);
  setStored(LOCAL_MESSAGES_KEY, msgs);

  if (conv) {
    conv.last_message = newMsg;
    conv.updated_at = now.toISOString();
    setStored(LOCAL_CONVERSATIONS_KEY, convs);
  }

  // Trigger simulated local peer response if sent to a demo direct conversation
  if (conv && conv.type === 'direct') {
    const otherMember = conv.members.find((m) => m.user_id !== params.sender_id);
    if (otherMember && otherMember.user_id.startsWith('user-')) {
      setTimeout(() => {
        simulatePeerReply(conv.id, otherMember, params.content);
      }, 1500 + Math.random() * 1000);
    }
  }

  return newMsg;
}

function simulatePeerReply(convId: string, peer: { user_id: string; display_name: string; avatar_url?: string }, userText: string): void {
  const replies = [
    'Message received securely. Zero metadata logged.',
    'Acknowledged. End-to-end encryption verified.',
    'Understood! This conversation is protected.',
    'Roger that. Let me know if you want to try voice or video calling.',
    'Your message has been received with cryptographic proof.',
  ];
  const replyContent = replies[Math.floor(Math.random() * replies.length)];

  const msgs = getStored<Message[]>(LOCAL_MESSAGES_KEY, []);
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  const conv = convs.find((c) => c.id === convId);

  const now = new Date();
  const timer = conv?.timer_seconds || 0;
  const expiresAt = timer > 0 ? new Date(now.getTime() + timer * 1000).toISOString() : undefined;

  const replyMsg: Message = {
    id: 'msg-' + Math.random().toString(36).substring(2, 11),
    conversation_id: convId,
    sender_id: peer.user_id,
    sender_display_name: peer.display_name,
    sender_avatar: peer.avatar_url,
    content: replyContent,
    media_type: 'none',
    created_at: now.toISOString(),
    expires_at: expiresAt,
    read_by: [peer.user_id],
  };

  msgs.push(replyMsg);
  setStored(LOCAL_MESSAGES_KEY, msgs);

  if (conv) {
    conv.last_message = replyMsg;
    conv.updated_at = now.toISOString();
    setStored(LOCAL_CONVERSATIONS_KEY, convs);
  }

  // Dispatch custom event for UI reaction in local mode
  window.dispatchEvent(new CustomEvent('vent_local_message', { detail: replyMsg }));
}

export function localCreateConversation(params: {
  creator_id: string;
  type: 'direct' | 'group';
  member_ids: string[];
  name?: string;
  avatar_url?: string;
}): Conversation {
  initLocalStore();
  const users = getStored<LocalUserRecord[]>(LOCAL_USERS_KEY, []);
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);

  const allMemberIds = Array.from(new Set([params.creator_id, ...params.member_ids]));
  const members = allMemberIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is LocalUserRecord => Boolean(u))
    .map((u) => ({
      user_id: u.id,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      joined_at: new Date().toISOString(),
    }));

  const newConv: Conversation = {
    id: 'conv-' + Math.random().toString(36).substring(2, 11),
    type: params.type,
    name: params.name || (params.type === 'direct' ? members.find((m) => m.user_id !== params.creator_id)?.display_name : 'New Group'),
    avatar_url: params.avatar_url,
    created_by: params.creator_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    timer_seconds: 0,
    members,
  };

  convs.unshift(newConv);
  setStored(LOCAL_CONVERSATIONS_KEY, convs);
  return newConv;
}

export function localDeleteMessage(messageId: string): void {
  initLocalStore();
  const msgs = getStored<Message[]>(LOCAL_MESSAGES_KEY, []);
  const updated = msgs.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: 'Message deleted' } : m));
  setStored(LOCAL_MESSAGES_KEY, updated);
}

export function localClearConversation(convId: string): void {
  initLocalStore();
  const msgs = getStored<Message[]>(LOCAL_MESSAGES_KEY, []);
  const filtered = msgs.filter((m) => m.conversation_id !== convId);
  setStored(LOCAL_MESSAGES_KEY, filtered);

  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  const c = convs.find((item) => item.id === convId);
  if (c) {
    c.last_message = undefined;
    setStored(LOCAL_CONVERSATIONS_KEY, convs);
  }
}

export function localDeleteConversation(convId: string): void {
  initLocalStore();
  localClearConversation(convId);
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  const updated = convs.filter((c) => c.id !== convId);
  setStored(LOCAL_CONVERSATIONS_KEY, updated);
}

export function localBlockUser(userId: string, targetUserId: string): void {
  const key = `${LOCAL_BLOCKED_KEY}_${userId}`;
  const blocked = getStored<string[]>(key, []);
  if (!blocked.includes(targetUserId)) {
    blocked.push(targetUserId);
    setStored(key, blocked);
  }
}

export function localUnblockUser(userId: string, targetUserId: string): void {
  const key = `${LOCAL_BLOCKED_KEY}_${userId}`;
  const blocked = getStored<string[]>(key, []);
  const updated = blocked.filter((id) => id !== targetUserId);
  setStored(key, updated);
}

export function localGetBlockedUsers(userId: string): string[] {
  const key = `${LOCAL_BLOCKED_KEY}_${userId}`;
  return getStored<string[]>(key, []);
}

export function localSetConversationTimer(convId: string, timerSeconds: number): void {
  initLocalStore();
  const convs = getStored<Conversation[]>(LOCAL_CONVERSATIONS_KEY, []);
  const c = convs.find((item) => item.id === convId);
  if (c) {
    c.timer_seconds = timerSeconds;
    setStored(LOCAL_CONVERSATIONS_KEY, convs);
  }
}

export function localPurgeExpiredMessages(): { purgedCount: number } {
  const msgs = getStored<Message[]>(LOCAL_MESSAGES_KEY, []);
  const now = new Date().getTime();
  const unexpired = msgs.filter((m) => {
    if (!m.expires_at) return true;
    return new Date(m.expires_at).getTime() > now;
  });

  const purgedCount = msgs.length - unexpired.length;
  if (purgedCount > 0) {
    setStored(LOCAL_MESSAGES_KEY, unexpired);
  }
  return { purgedCount };
}
