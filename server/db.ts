import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  AdminStats,
  AdminUser,
  AuditLog,
  Conversation,
  MediaFileRecord,
  Message,
  PublicUser,
  UserRole,
  UserStatus,
} from '../src/types.ts';

export const SUPER_ADMIN_EMAIL = 'beestingsone@gmail.com';

// Ephemeral message retention TTLs
export const TTL_PUBLIC_MS = 3 * 24 * 60 * 60 * 1000; // 3 days (72 hours) for public/group chats
export const TTL_DIRECT_MS = 24 * 60 * 60 * 1000; // 24 hours for 1-on-1 direct chats

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  role: UserRole;
  status: UserStatus;
  is_banned: boolean;
  created_at: string;
  last_active_at: string;
  last_ip?: string;
}

export interface ConversationRecord {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  timer_seconds?: number; // e.g. 60, 300, 900, 3600, 21600, 43200, 86400
}

export interface MemberRecord {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at?: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type: 'image' | 'video' | 'audio' | 'none';
  media_name?: string;
  media_size?: number;
  created_at: string;
  expires_at?: string;
  is_deleted?: boolean;
  read_by: string[];
}

export interface BlockedUserRecord {
  user_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  conversations: ConversationRecord[];
  members: MemberRecord[];
  messages: MessageRecord[];
  media_files: MediaFileRecord[];
  blocked_users: BlockedUserRecord[];
  audit_logs: AuditLog[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'chat_db.json');

class DatabaseStore {
  private data: DatabaseSchema = {
    users: [],
    conversations: [],
    members: [],
    messages: [],
    media_files: [],
    blocked_users: [],
    audit_logs: [],
  };

  constructor() {
    this.init();
    // Run automated ephemeral purge every 5 minutes
    setInterval(() => {
      try {
        this.purgeExpiredMessages();
      } catch (err) {
        console.error('[DB] Scheduled purge error', err);
      }
    }, 5 * 60 * 1000);
  }

  private init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || [],
          conversations: parsed.conversations || [],
          members: parsed.members || [],
          messages: parsed.messages || [],
          media_files: parsed.media_files || [],
          blocked_users: parsed.blocked_users || [],
          audit_logs: parsed.audit_logs || [],
        };
        console.log(`[DB] Loaded persistent database with ${this.data.users.length} users and ${this.data.messages.length} messages.`);
        this.purgeExpiredMessages();
      } catch (err) {
        console.error('[DB] Failed reading db file, reinitializing', err);
        this.seedInitialData();
      }
    } else {
      this.seedInitialData();
    }
  }

  public calculateMessageExpiry(
    createdAt: string,
    convType: 'direct' | 'group',
    timerSeconds?: number
  ): string {
    const createdMs = new Date(createdAt).getTime();
    const ttl =
      convType === 'group'
        ? TTL_PUBLIC_MS
        : (timerSeconds && timerSeconds > 0 ? timerSeconds * 1000 : TTL_DIRECT_MS);
    return new Date(createdMs + ttl).toISOString();
  }

  public purgeExpiredMessages(): { purgedMessages: number; purgedFiles: number } {
    const now = Date.now();
    const convMap = new Map<string, { type: 'direct' | 'group'; timerSeconds?: number }>();
    for (const c of this.data.conversations) {
      convMap.set(c.id, { type: c.type, timerSeconds: c.timer_seconds });
    }

    const remainingMessages: MessageRecord[] = [];
    const purgedMediaUrls = new Set<string>();
    let purgedMessages = 0;

    for (const m of this.data.messages) {
      let isExpired = false;

      if (m.expires_at) {
        isExpired = new Date(m.expires_at).getTime() <= now;
      } else {
        const conv = convMap.get(m.conversation_id);
        const convType = conv?.type || 'group';
        const ttl =
          convType === 'group'
            ? TTL_PUBLIC_MS
            : (conv?.timerSeconds && conv.timerSeconds > 0
                ? conv.timerSeconds * 1000
                : TTL_DIRECT_MS);
        const msgAge = now - new Date(m.created_at).getTime();
        isExpired = msgAge > ttl;
      }

      if (isExpired) {
        purgedMessages++;
        if (m.media_url) {
          purgedMediaUrls.add(m.media_url);
        }
      } else {
        remainingMessages.push(m);
      }
    }

    let purgedFiles = 0;
    if (purgedMessages > 0) {
      this.data.messages = remainingMessages;

      // Clean up orphaned media file records and files on disk
      if (purgedMediaUrls.size > 0) {
        this.data.media_files = this.data.media_files.filter((file) => {
          if (purgedMediaUrls.has(file.file_url)) {
            purgedFiles++;
            try {
              const fileName = path.basename(file.file_url);
              const filePath = path.join(process.cwd(), 'uploads', fileName);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (e) {
              console.error('[DB] Failed to remove expired media file on disk', e);
            }
            return false;
          }
          return true;
        });
      }

      this.save();
      console.log(
        `[DB] Ephemeral auto-cleanup: Purged ${purgedMessages} expired messages and ${purgedFiles} media attachments.`
      );
    }

    return { purgedMessages, purgedFiles };
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed saving database', err);
    }
  }

  private seedInitialData() {
    console.log('[DB] Seeding database with initial accounts and channels...');
    const now = new Date().toISOString();
    const adminId = 'admin-user-0001';
    const user1Id = 'user-0001';
    const user2Id = 'user-0002';
    const user3Id = 'user-0003';
    const user4Id = 'user-0004';

    const defaultPasswordHash = bcrypt.hashSync('Password@123', 10);
    const adminPasswordHash = bcrypt.hashSync('Admin@123', 10);

    const users: UserRecord[] = [
      {
        id: adminId,
        email: SUPER_ADMIN_EMAIL,
        password_hash: adminPasswordHash,
        display_name: 'Overlord Zero',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        bio: 'Platform founder & administrator. Ensuring privacy & safety.',
        role: 'admin',
        status: 'online',
        is_banned: false,
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        last_active_at: now,
        last_ip: '127.0.0.1',
      },
      {
        id: user1Id,
        email: 'shadow@veil.net',
        password_hash: defaultPasswordHash,
        display_name: 'ShadowRaven',
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        bio: 'Cypherpunk & privacy researcher. Discretion is paramount.',
        role: 'user',
        status: 'online',
        is_banned: false,
        created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
        last_active_at: now,
        last_ip: '192.168.1.101',
      },
      {
        id: user2Id,
        email: 'viper@mesh.io',
        password_hash: defaultPasswordHash,
        display_name: 'NeonViper',
        avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
        bio: 'Decentralized systems builder. Always tinkering with nodes.',
        role: 'user',
        status: 'online',
        is_banned: false,
        created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        last_active_at: now,
        last_ip: '192.168.1.102',
      },
      {
        id: user3Id,
        email: 'cipher@crypt.org',
        password_hash: defaultPasswordHash,
        display_name: 'CipherFox',
        avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        bio: 'Zero-knowledge proofs & cryptographic safety.',
        role: 'user',
        status: 'away',
        is_banned: false,
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        last_active_at: now,
        last_ip: '192.168.1.103',
      },
      {
        id: user4Id,
        email: 'ghost@void.cc',
        password_hash: defaultPasswordHash,
        display_name: 'EchoGhost',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        bio: 'Ghosting around the digital shadows.',
        role: 'user',
        status: 'offline',
        is_banned: false,
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        last_active_at: now,
        last_ip: '192.168.1.104',
      },
    ];

    const group1Id = 'conv-group-001';
    const group2Id = 'conv-group-002';
    const dm1Id = 'conv-dm-001';

    const conversations: ConversationRecord[] = [
      {
        id: group1Id,
        type: 'group',
        name: '💨 Main Vent Room (Public)',
        avatar_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150&auto=format&fit=crop&q=80',
        created_by: adminId,
        created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        updated_at: now,
      },
      {
        id: group2Id,
        type: 'group',
        name: '⚡ Cyberpunk Lounge & Media',
        avatar_url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=150&auto=format&fit=crop&q=80',
        created_by: user1Id,
        created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        updated_at: now,
      },
      {
        id: dm1Id,
        type: 'direct',
        created_by: user1Id,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        updated_at: now,
      },
    ];

    const members: MemberRecord[] = [
      // Group 1 members
      { conversation_id: group1Id, user_id: adminId, joined_at: now },
      { conversation_id: group1Id, user_id: user1Id, joined_at: now },
      { conversation_id: group1Id, user_id: user2Id, joined_at: now },
      { conversation_id: group1Id, user_id: user3Id, joined_at: now },
      { conversation_id: group1Id, user_id: user4Id, joined_at: now },

      // Group 2 members
      { conversation_id: group2Id, user_id: adminId, joined_at: now },
      { conversation_id: group2Id, user_id: user1Id, joined_at: now },
      { conversation_id: group2Id, user_id: user2Id, joined_at: now },
      { conversation_id: group2Id, user_id: user3Id, joined_at: now },

      // DM 1 members (ShadowRaven & NeonViper)
      { conversation_id: dm1Id, user_id: user1Id, joined_at: now },
      { conversation_id: dm1Id, user_id: user2Id, joined_at: now },
    ];

    const messages: MessageRecord[] = [
      {
        id: uuidv4(),
        conversation_id: group1Id,
        sender_id: user1Id,
        content: 'Welcome everyone! On this platform, all emails and private credentials remain strictly confidential. Only your chosen pseudonym is ever visible to peers.',
        media_type: 'none',
        created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
        read_by: [adminId, user1Id, user2Id, user3Id],
      },
      {
        id: uuidv4(),
        conversation_id: group1Id,
        sender_id: user2Id,
        content: 'Loving the real-time websocket sync and rich media sharing support! Check out this cybernetic architecture schematic.',
        media_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
        media_type: 'image',
        media_name: 'network-security-grid.jpg',
        media_size: 245000,
        created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
        read_by: [adminId, user1Id, user2Id],
      },
      {
        id: uuidv4(),
        conversation_id: group1Id,
        sender_id: user3Id,
        content: 'Clean zero-knowledge user directory design. Ready for testing messages and video file streaming.',
        media_type: 'none',
        created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
        read_by: [adminId, user1Id, user2Id, user3Id],
      },
      {
        id: uuidv4(),
        conversation_id: dm1Id,
        sender_id: user1Id,
        content: 'Hey NeonViper, have you checked the new direct messaging encryption flow?',
        media_type: 'none',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        read_by: [user1Id, user2Id],
      },
      {
        id: uuidv4(),
        conversation_id: dm1Id,
        sender_id: user2Id,
        content: 'Yes! Instant delivery, typing indicators, and zero data leakage. Everything looks crystal clear.',
        media_type: 'none',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        read_by: [user1Id, user2Id],
      },
    ];

    const media_files: MediaFileRecord[] = [
      {
        id: uuidv4(),
        file_name: 'network-security-grid.jpg',
        file_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
        file_type: 'image',
        file_size: 245000,
        uploaded_by: user2Id,
        uploader_display_name: 'NeonViper',
        uploader_email: 'viper@mesh.io',
        conversation_id: group1Id,
        conversation_name: '🛡️ Privacy & Cryptography',
        created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
      },
    ];

    const audit_logs: AuditLog[] = [
      {
        id: uuidv4(),
        action: 'SYSTEM_BOOTSTRAP',
        actor_email: SUPER_ADMIN_EMAIL,
        details: 'Initialized secure database with initial public chat rooms and super admin.',
        timestamp: now,
        ip_address: '127.0.0.1',
      },
    ];

    this.data = {
      users,
      conversations,
      members,
      messages,
      media_files,
      audit_logs,
      blocked_users: [],
    };

    this.save();
  }

  // --- Auth & User Management ---

  public createUser(params: {
    email: string;
    password: string;
    display_name: string;
    avatar_url?: string;
    bio?: string;
    ip?: string;
  }): UserRecord {
    const emailNormalized = params.email.trim().toLowerCase();
    const existing = this.data.users.find((u) => u.email.toLowerCase() === emailNormalized);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    // Role is automatically 'admin' if email is beestingsone@gmail.com
    const role: UserRole = emailNormalized === SUPER_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';
    const password_hash = bcrypt.hashSync(params.password, 10);
    const now = new Date().toISOString();

    const newUser: UserRecord = {
      id: uuidv4(),
      email: emailNormalized,
      password_hash,
      display_name: params.display_name.trim(),
      avatar_url:
        params.avatar_url ||
        `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(params.display_name.trim())}`,
      bio: params.bio || 'Privacy-first conversationalist.',
      role,
      status: 'online',
      is_banned: false,
      created_at: now,
      last_active_at: now,
      last_ip: params.ip || '127.0.0.1',
    };

    this.data.users.push(newUser);

    // Auto-join public group channels
    const defaultGroups = this.data.conversations.filter((c) => c.type === 'group');
    for (const group of defaultGroups) {
      this.data.members.push({
        conversation_id: group.id,
        user_id: newUser.id,
        joined_at: now,
      });
    }

    this.addAuditLog('USER_SIGNUP', newUser.email, `Created account as '${newUser.display_name}' (${newUser.role})`, newUser.id, params.ip);
    this.save();
    return newUser;
  }

  public verifyCredentials(email: string, password: string, ip?: string): UserRecord | null {
    const emailNormalized = email.trim().toLowerCase();
    const user = this.data.users.find((u) => u.email.toLowerCase() === emailNormalized);
    if (!user) return null;

    if (user.is_banned) {
      throw new Error('This account has been suspended or banned by administration.');
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return null;

    // Guarantee super admin role for beestingsone@gmail.com
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() && user.role !== 'admin') {
      user.role = 'admin';
    }

    user.last_active_at = new Date().toISOString();
    if (ip) user.last_ip = ip;
    this.save();
    return user;
  }

  public findUserById(id: string): UserRecord | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public findUserByEmail(email: string): UserRecord | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  public toPublicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      status: user.status,
      role: user.role,
      last_active_at: user.last_active_at,
    };
  }

  public searchPublicUsers(query: string, excludeUserId?: string): PublicUser[] {
    const q = query.trim().toLowerCase();
    return this.data.users
      .filter((u) => !u.is_banned && u.id !== excludeUserId)
      .filter((u) => !q || u.display_name.toLowerCase().includes(q) || (u.bio && u.bio.toLowerCase().includes(q)))
      .slice(0, 25)
      .map(this.toPublicUser);
  }

  public updateUserProfile(
    userId: string,
    updates: {
      display_name?: string;
      avatar_url?: string;
      bio?: string;
      status?: UserStatus;
    }
  ): UserRecord {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');

    if (updates.display_name) user.display_name = updates.display_name.trim();
    if (updates.avatar_url !== undefined) user.avatar_url = updates.avatar_url;
    if (updates.bio !== undefined) user.bio = updates.bio;
    if (updates.status) user.status = updates.status;
    user.last_active_at = new Date().toISOString();

    this.save();
    return user;
  }

  public setUserStatus(userId: string, status: UserStatus) {
    const user = this.data.users.find((u) => u.id === userId);
    if (user) {
      user.status = status;
      user.last_active_at = new Date().toISOString();
      this.save();
    }
  }

  // --- Conversations & Messaging ---

  public createConversation(
    type: 'direct' | 'group',
    memberIds: string[],
    createdBy: string,
    name?: string,
    avatarUrl?: string,
    timerSeconds?: number
  ): Conversation {
    const now = new Date().toISOString();

    // If direct chat, check if one already exists between these 2 users
    if (type === 'direct' && memberIds.length === 2) {
      const existingConv = this.data.conversations.find((c) => {
        if (c.type !== 'direct') return false;
        const cMembers = this.data.members.filter((m) => m.conversation_id === c.id).map((m) => m.user_id);
        return memberIds.every((id) => cMembers.includes(id)) && cMembers.length === 2;
      });

      if (existingConv) {
        return this.getConversationById(existingConv.id, createdBy)!;
      }
    }

    const defaultTimer = type === 'group' ? 259200 : 86400; // 3 days for group, 24h default for direct
    const conversationId = uuidv4();
    const newConv: ConversationRecord = {
      id: conversationId,
      type,
      name: type === 'group' ? (name?.trim() || 'New Group Chat') : undefined,
      avatar_url: avatarUrl,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      timer_seconds: timerSeconds && timerSeconds > 0 ? timerSeconds : defaultTimer,
    };

    this.data.conversations.push(newConv);

    const uniqueMemberIds = Array.from(new Set(memberIds));
    for (const uid of uniqueMemberIds) {
      this.data.members.push({
        conversation_id: conversationId,
        user_id: uid,
        joined_at: now,
      });
    }

    this.save();
    return this.getConversationById(conversationId, createdBy)!;
  }

  public setConversationTimer(
    convId: string,
    userId: string,
    timerSeconds: number,
    isAdmin = false
  ): Conversation {
    const conv = this.data.conversations.find((c) => c.id === convId);
    if (!conv) throw new Error('Conversation not found');

    const isMember = this.data.members.some((m) => m.conversation_id === convId && m.user_id === userId);
    if (!isMember && !isAdmin) {
      throw new Error('Access denied: You are not a participant in this conversation.');
    }

    conv.timer_seconds = Math.max(30, timerSeconds); // Minimum 30s
    conv.updated_at = new Date().toISOString();
    this.save();

    return this.getConversationById(convId, userId)!;
  }

  public getConversationById(convId: string, currentUserId?: string): Conversation | null {
    const conv = this.data.conversations.find((c) => c.id === convId);
    if (!conv) return null;

    const rawMembers = this.data.members.filter((m) => m.conversation_id === convId);
    const members = rawMembers.map((m) => {
      const u = this.data.users.find((u) => u.id === m.user_id);
      return {
        user_id: m.user_id,
        display_name: u?.display_name || 'Anonymous User',
        avatar_url: u?.avatar_url,
        joined_at: m.joined_at,
        last_read_at: m.last_read_at,
      };
    });

    const messages = this.data.messages.filter((m) => m.conversation_id === convId && !m.is_deleted);
    const lastMsgRecord = messages[messages.length - 1];

    let last_message: Message | undefined;
    if (lastMsgRecord) {
      const sender = this.data.users.find((u) => u.id === lastMsgRecord.sender_id);
      last_message = {
        ...lastMsgRecord,
        sender_display_name: sender?.display_name || 'Anonymous',
        sender_avatar: sender?.avatar_url,
      };
    }

    let unread_count = 0;
    if (currentUserId) {
      const membership = rawMembers.find((m) => m.user_id === currentUserId);
      const lastRead = membership?.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
      unread_count = messages.filter(
        (m) => m.sender_id !== currentUserId && new Date(m.created_at).getTime() > lastRead
      ).length;
    }

    // Compute display name/avatar for direct chats from the other user's pseudonym
    let directName = conv.name;
    let directAvatar = conv.avatar_url;
    if (conv.type === 'direct' && currentUserId) {
      const otherMember = members.find((m) => m.user_id !== currentUserId);
      if (otherMember) {
        directName = otherMember.display_name;
        directAvatar = otherMember.avatar_url;
      }
    }

    return {
      id: conv.id,
      type: conv.type,
      name: directName,
      avatar_url: directAvatar,
      created_by: conv.created_by,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      timer_seconds: conv.timer_seconds || (conv.type === 'group' ? 259200 : 86400),
      members,
      last_message,
      unread_count,
    };
  }

  public getUserConversations(userId: string): Conversation[] {
    // Ensure user is enrolled in default group rooms
    const defaultGroups = this.data.conversations.filter((c) => c.type === 'group');
    let hasAdded = false;
    for (const group of defaultGroups) {
      const alreadyMember = this.data.members.some(
        (m) => m.conversation_id === group.id && m.user_id === userId
      );
      if (!alreadyMember) {
        this.data.members.push({
          conversation_id: group.id,
          user_id: userId,
          joined_at: new Date().toISOString(),
        });
        hasAdded = true;
      }
    }
    if (hasAdded) {
      this.save();
    }

    const userMembershipConvIds = this.data.members
      .filter((m) => m.user_id === userId)
      .map((m) => m.conversation_id);

    return this.data.conversations
      .filter((c) => userMembershipConvIds.includes(c.id))
      .map((c) => this.getConversationById(c.id, userId)!)
      .filter(Boolean)
      .sort((a, b) => {
        // Pin Main Vent Room at top
        const aIsMain = a.name?.includes('Main Vent Room') || a.name?.includes('Main Smoke Room') ? 1 : 0;
        const bIsMain = b.name?.includes('Main Vent Room') || b.name?.includes('Main Smoke Room') ? 1 : 0;
        if (aIsMain !== bIsMain) return bIsMain - aIsMain;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }

  public getConversationMessages(convId: string, userId: string, isAdmin = false): Message[] {
    this.purgeExpiredMessages();

    const isMember = this.data.members.some((m) => m.conversation_id === convId && m.user_id === userId);
    if (!isMember && !isAdmin) {
      throw new Error('Access denied: You are not a participant in this conversation.');
    }

    const conv = this.data.conversations.find((c) => c.id === convId);
    const convType = conv?.type || 'group';
    const now = Date.now();

    return this.data.messages
      .filter((m) => {
        if (m.conversation_id !== convId) return false;
        // Strict Query Filtering: Prevent any expired message from ever loading or reappearing on reload
        const expiresAt = m.expires_at || this.calculateMessageExpiry(m.created_at, convType, conv?.timer_seconds);
        if (expiresAt && new Date(expiresAt).getTime() <= now) {
          return false;
        }
        return true;
      })
      .map((m) => {
        const sender = this.data.users.find((u) => u.id === m.sender_id);
        const expiresAt = m.expires_at || this.calculateMessageExpiry(m.created_at, convType, conv?.timer_seconds);
        return {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          sender_display_name: sender?.display_name || 'Deleted User',
          sender_avatar: sender?.avatar_url,
          content: m.is_deleted ? 'This message was deleted' : m.content,
          media_url: m.is_deleted ? undefined : m.media_url,
          media_type: m.is_deleted ? 'none' : m.media_type,
          media_name: m.is_deleted ? undefined : m.media_name,
          media_size: m.is_deleted ? undefined : m.media_size,
          created_at: m.created_at,
          expires_at: expiresAt,
          is_deleted: m.is_deleted,
          read_by: m.read_by,
        };
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public isUserBlocked(userA: string, userB: string): boolean {
    if (!this.data.blocked_users) this.data.blocked_users = [];
    return this.data.blocked_users.some(
      (b) =>
        (b.user_id === userA && b.blocked_user_id === userB) ||
        (b.user_id === userB && b.blocked_user_id === userA)
    );
  }

  public getBlockedUserIds(userId: string): string[] {
    if (!this.data.blocked_users) this.data.blocked_users = [];
    return this.data.blocked_users
      .filter((b) => b.user_id === userId)
      .map((b) => b.blocked_user_id);
  }

  public blockUser(userId: string, targetUserId: string): boolean {
    if (userId === targetUserId) {
      throw new Error('You cannot block yourself.');
    }
    if (!this.data.blocked_users) this.data.blocked_users = [];
    const exists = this.data.blocked_users.some(
      (b) => b.user_id === userId && b.blocked_user_id === targetUserId
    );
    if (!exists) {
      this.data.blocked_users.push({
        user_id: userId,
        blocked_user_id: targetUserId,
        created_at: new Date().toISOString(),
      });
      this.save();
    }
    return true;
  }

  public unblockUser(userId: string, targetUserId: string): boolean {
    if (!this.data.blocked_users) this.data.blocked_users = [];
    this.data.blocked_users = this.data.blocked_users.filter(
      (b) => !(b.user_id === userId && b.blocked_user_id === targetUserId)
    );
    this.save();
    return true;
  }

  public createMessage(params: {
    conversation_id: string;
    sender_id: string;
    content: string;
    media_url?: string;
    media_type?: 'image' | 'video' | 'audio' | 'none';
    media_name?: string;
    media_size?: number;
  }): Message {
    const conv = this.data.conversations.find((c) => c.id === params.conversation_id);
    if (!conv) throw new Error('Conversation does not exist.');

    const isMember = this.data.members.some(
      (m) => m.conversation_id === params.conversation_id && m.user_id === params.sender_id
    );
    if (!isMember) {
      throw new Error('Sender is not a member of this conversation.');
    }

    const sender = this.data.users.find((u) => u.id === params.sender_id);
    if (!sender) throw new Error('Sender user not found.');
    if (sender.is_banned) throw new Error('User is banned from sending messages.');

    // Check if direct conversation is blocked between participants
    if (conv.type === 'direct') {
      const otherMember = this.data.members.find(
        (m) => m.conversation_id === conv.id && m.user_id !== params.sender_id
      );
      if (otherMember && this.isUserBlocked(params.sender_id, otherMember.user_id)) {
        throw new Error('Cannot send message: This user is blocked.');
      }
    }

    const now = new Date().toISOString();
    const messageId = uuidv4();
    const mediaType = params.media_type || 'none';
    const expiresAt = this.calculateMessageExpiry(now, conv.type, conv.timer_seconds);

    const msgRecord: MessageRecord = {
      id: messageId,
      conversation_id: params.conversation_id,
      sender_id: params.sender_id,
      content: params.content?.trim() || '',
      media_url: params.media_url,
      media_type: mediaType,
      media_name: params.media_name,
      media_size: params.media_size,
      created_at: now,
      expires_at: expiresAt,
      is_deleted: false,
      read_by: [params.sender_id],
    };

    this.data.messages.push(msgRecord);
    conv.updated_at = now;

    // Track media record if file attached
    if (params.media_url && mediaType !== 'none') {
      const mediaRecord: MediaFileRecord = {
        id: uuidv4(),
        file_name: params.media_name || 'upload',
        file_url: params.media_url,
        file_type: mediaType,
        file_size: params.media_size || 0,
        uploaded_by: sender.id,
        uploader_display_name: sender.display_name,
        uploader_email: sender.email,
        conversation_id: conv.id,
        conversation_name: conv.name || (conv.type === 'direct' ? 'Direct Message' : 'Group Chat'),
        created_at: now,
      };
      this.data.media_files.push(mediaRecord);
    }

    this.save();

    return {
      ...msgRecord,
      sender_display_name: sender.display_name,
      sender_avatar: sender.avatar_url,
      expires_at: expiresAt,
    };
  }

  public markConversationRead(convId: string, userId: string): void {
    const member = this.data.members.find((m) => m.conversation_id === convId && m.user_id === userId);
    const now = new Date().toISOString();
    if (member) {
      member.last_read_at = now;
    }

    // Mark messages as read by this user
    for (const msg of this.data.messages) {
      if (msg.conversation_id === convId && !msg.read_by.includes(userId)) {
        msg.read_by.push(userId);
      }
    }

    this.save();
  }

  public deleteMessage(
    messageId: string,
    requesterUserId: string,
    isAdmin = false
  ): { success: boolean; conversationId?: string } {
    const msgIndex = this.data.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return { success: false };

    const msg = this.data.messages[msgIndex];
    const conversationId = msg.conversation_id;
    const isSender = msg.sender_id === requesterUserId;
    const isExpired = msg.expires_at ? new Date(msg.expires_at).getTime() <= Date.now() : false;
    const isMember = this.data.members.some(
      (m) => m.conversation_id === msg.conversation_id && m.user_id === requesterUserId
    );

    if (!isSender && !isAdmin && !(isExpired && isMember)) {
      throw new Error('Access denied: You can only delete your own messages.');
    }

    if (msg.media_url) {
      this.data.media_files = this.data.media_files.filter((f) => f.file_url !== msg.media_url);
      try {
        if (msg.media_url.startsWith('/uploads/')) {
          const filePath = path.join(DATA_DIR, '..', msg.media_url.replace(/^\//, ''));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (err) {
        console.error('Error removing media file from disk', err);
      }
    }

    // Permanently remove the message record from memory
    this.data.messages.splice(msgIndex, 1);
    this.save();
    return { success: true, conversationId };
  }

  public clearConversation(
    convId: string,
    requesterUserId: string,
    isAdmin = false
  ): { success: boolean; conversationId: string; memberIds: string[] } {
    const conv = this.data.conversations.find((c) => c.id === convId);
    if (!conv) throw new Error('Conversation not found.');

    const members = this.data.members.filter((m) => m.conversation_id === convId);
    const isMember = members.some((m) => m.user_id === requesterUserId);
    if (!isMember && !isAdmin) {
      throw new Error('Access denied: You are not a member of this conversation.');
    }

    const memberIds = members.map((m) => m.user_id);

    // Delete all media files on disk associated with messages in this conversation
    const convMessages = this.data.messages.filter((m) => m.conversation_id === convId);
    for (const msg of convMessages) {
      if (msg.media_url) {
        this.data.media_files = this.data.media_files.filter((f) => f.file_url !== msg.media_url);
        try {
          if (msg.media_url.startsWith('/uploads/')) {
            const filePath = path.join(DATA_DIR, '..', msg.media_url.replace(/^\//, ''));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        } catch (err) {
          console.error('Error removing media file from disk during clear', err);
        }
      }
    }

    // Permanently remove all messages for this conversation
    this.data.messages = this.data.messages.filter((m) => m.conversation_id !== convId);
    conv.updated_at = new Date().toISOString();
    this.save();

    return { success: true, conversationId: convId, memberIds };
  }

  public deleteConversation(
    convId: string,
    requesterUserId: string,
    isAdmin = false
  ): { success: boolean; conversationId: string; memberIds: string[] } {
    const conv = this.data.conversations.find((c) => c.id === convId);
    if (!conv) throw new Error('Conversation not found.');

    const members = this.data.members.filter((m) => m.conversation_id === convId);
    const isMember = members.some((m) => m.user_id === requesterUserId);
    if (!isMember && !isAdmin) {
      throw new Error('Access denied: You are not a member of this conversation.');
    }

    const memberIds = members.map((m) => m.user_id);

    // Delete associated media files
    const convMessages = this.data.messages.filter((m) => m.conversation_id === convId);
    for (const msg of convMessages) {
      if (msg.media_url) {
        this.data.media_files = this.data.media_files.filter((f) => f.file_url !== msg.media_url);
        try {
          if (msg.media_url.startsWith('/uploads/')) {
            const filePath = path.join(DATA_DIR, '..', msg.media_url.replace(/^\//, ''));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        } catch (err) {
          console.error('Error removing media file from disk during conversation delete', err);
        }
      }
    }

    // Remove messages, members, and conversation record
    this.data.messages = this.data.messages.filter((m) => m.conversation_id !== convId);
    this.data.members = this.data.members.filter((m) => m.conversation_id !== convId);
    this.data.conversations = this.data.conversations.filter((c) => c.id !== convId);
    this.save();

    return { success: true, conversationId: convId, memberIds };
  }

  // --- Admin Master Audit & Control (beestingsone@gmail.com) ---

  public getAllUsersAdmin(): AdminUser[] {
    return this.data.users.map((u) => {
      const messageCount = this.data.messages.filter((m) => m.sender_id === u.id).length;
      const convCount = this.data.members.filter((m) => m.user_id === u.id).length;
      return {
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        bio: u.bio,
        role: u.role,
        status: u.status,
        is_banned: u.is_banned,
        created_at: u.created_at,
        last_active_at: u.last_active_at,
        last_ip: u.last_ip,
        message_count: messageCount,
        conversation_count: convCount,
      };
    });
  }

  public banUserAdmin(userId: string, isBanned: boolean, adminEmail: string): boolean {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return false;
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error('Cannot ban the platform Super Admin account.');
    }

    user.is_banned = isBanned;
    user.status = isBanned ? 'offline' : 'online';
    this.addAuditLog(isBanned ? 'BAN_USER' : 'UNBAN_USER', adminEmail, `User '${user.display_name}' (${user.email}) ban status set to ${isBanned}`, user.id);
    this.save();
    return true;
  }

  public deleteUserAdmin(userId: string, adminEmail: string): boolean {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return false;
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error('Cannot delete the platform Super Admin account.');
    }

    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.members = this.data.members.filter((m) => m.user_id !== userId);
    this.addAuditLog('DELETE_USER', adminEmail, `Permanently deleted user '${user.display_name}' (${user.email})`, user.id);
    this.save();
    return true;
  }

  public getAllConversationsAdmin(): Conversation[] {
    return this.data.conversations.map((c) => {
      const conv = this.getConversationById(c.id)!;
      // In admin view, also add member email info
      return conv;
    }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public getAllMediaFilesAdmin(): MediaFileRecord[] {
    return [...this.data.media_files].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public deleteMediaFileAdmin(mediaId: string, adminEmail: string): boolean {
    const media = this.data.media_files.find((m) => m.id === mediaId);
    if (!media) return false;

    this.data.media_files = this.data.media_files.filter((m) => m.id !== mediaId);

    // Also strip media from associated messages
    for (const msg of this.data.messages) {
      if (msg.media_url === media.file_url) {
        msg.media_url = undefined;
        msg.media_type = 'none';
      }
    }

    this.addAuditLog('DELETE_MEDIA', adminEmail, `Removed media file ${media.file_name} (${media.file_url})`, media.id);
    this.save();
    return true;
  }

  public getAdminStats(): AdminStats {
    const now = Date.now();
    const oneDayAgo = now - 24 * 3600000;

    const activeUsers = this.data.users.filter(
      (u) => new Date(u.last_active_at).getTime() > oneDayAgo
    ).length;

    const totalStorageBytes = this.data.media_files.reduce((acc, f) => acc + (f.file_size || 0), 0);
    const bannedUsers = this.data.users.filter((u) => u.is_banned).length;

    return {
      total_users: this.data.users.length,
      active_users_24h: activeUsers,
      total_conversations: this.data.conversations.length,
      total_messages: this.data.messages.length,
      total_media_files: this.data.media_files.length,
      total_storage_bytes: totalStorageBytes,
      banned_users: bannedUsers,
    };
  }

  public addAuditLog(action: string, actorEmail: string, details: string, targetId?: string, ip?: string): void {
    const log: AuditLog = {
      id: uuidv4(),
      action,
      actor_email: actorEmail,
      target_id: targetId,
      details,
      timestamp: new Date().toISOString(),
      ip_address: ip,
    };
    this.data.audit_logs.unshift(log);
    if (this.data.audit_logs.length > 500) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 500);
    }
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.audit_logs;
  }
}

export const db = new DatabaseStore();
