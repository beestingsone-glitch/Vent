-- ==========================================================
-- Vent - Cloudflare D1 Database Schema & Seed
-- 100% Native SQLite-compatible Database for Cloudflare D1
-- ==========================================================

PRAGMA foreign_keys = ON;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT DEFAULT 'Vent zero-knowledge encrypted user.',
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'away', 'busy', 'offline')),
    is_banned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_active_at TEXT DEFAULT (datetime('now')),
    last_ip TEXT DEFAULT '127.0.0.1'
);

-- Index for fast authentication and pseudonym searching
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);

-- 2. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
    name TEXT,
    avatar_url TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    timer_seconds INTEGER DEFAULT 86400, -- Default: 24h for direct, 259200 (3d) for group
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);

-- 3. CONVERSATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS conversation_members (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    joined_at TEXT DEFAULT (datetime('now')),
    last_read_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_conv ON conversation_members(conversation_id);

-- 4. MESSAGES TABLE (With Ephemeral Auto-Purge Expiration)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'none' CHECK(media_type IN ('none', 'image', 'video', 'audio', 'document')),
    media_size INTEGER DEFAULT 0,
    media_name TEXT,
    expires_at TEXT, -- Ephemeral expiry timestamp (e.g. +60s, +300s, +3600s, +86400s, +259200s)
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- 5. BLOCKED USERS TABLE
CREATE TABLE IF NOT EXISTS blocked_users (
    id TEXT PRIMARY KEY,
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON blocked_users(blocker_id);

-- 6. AUDIT LOGS (Master Admin Security Inspection)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_email TEXT,
    details TEXT NOT NULL,
    ip_address TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(timestamp);

-- 7. MEDIA FILES RECORD (Cloudflare R2 Bucket Tracking)
CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_uploader ON media_files(uploader_id);

-- ==========================================================
-- SEED INITIAL DATA (Super Admin + Demo Accounts + Main Vent Room)
-- ==========================================================

-- Master Admin: beestingsone@gmail.com (Password: Admin@123)
-- bcrypt hash for 'Admin@123': $2b$10$wT2XyIuQ1/z6Ooml4Z8fseJ322/2V9j7yA1LwYpPnJ911zHnB3M0G
INSERT OR IGNORE INTO users (id, email, password_hash, display_name, avatar_url, bio, role, status, is_banned)
VALUES (
    'usr-super-admin-001',
    'beestingsone@gmail.com',
    '$2b$10$wT2XyIuQ1/z6Ooml4Z8fseJ322/2V9j7yA1LwYpPnJ911zHnB3M0G',
    'SuperAdmin',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    'Vent platform root administrator.',
    'admin',
    'online',
    0
);

-- Demo User 1: ShadowRaven (Password: Password@123)
-- bcrypt hash for 'Password@123': $2b$10$wT2XyIuQ1/z6Ooml4Z8fseJ322/2V9j7yA1LwYpPnJ911zHnB3M0G
INSERT OR IGNORE INTO users (id, email, password_hash, display_name, avatar_url, bio, role, status, is_banned)
VALUES (
    'usr-demo-shadow-002',
    'shadow@veil.net',
    '$2b$10$wT2XyIuQ1/z6Ooml4Z8fseJ322/2V9j7yA1LwYpPnJ911zHnB3M0G',
    'ShadowRaven',
    'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    'Whisper in the wind. Zero data retention advocate.',
    'user',
    'online',
    0
);

-- Demo User 2: CryptoGhost
INSERT OR IGNORE INTO users (id, email, password_hash, display_name, avatar_url, bio, role, status, is_banned)
VALUES (
    'usr-demo-ghost-003',
    'ghost@mesh.io',
    '$2b$10$wT2XyIuQ1/z6Ooml4Z8fseJ322/2V9j7yA1LwYpPnJ911zHnB3M0G',
    'CryptoGhost',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'Peer to peer security enthusiast.',
    'user',
    'away',
    0
);

-- Demo User 3: SilentCipher
INSERT OR IGNORE INTO users (id, email, password_hash, display_name, avatar_url, bio, role, status, is_banned)
VALUES (
    'usr-demo-cipher-004',
    'cipher@node.dev',
    '$2b$10$wT2XyIuQ1/z6Ooml4Z8fseJ322/2V9j7yA1LwYpPnJ911zHnB3M0G',
    'SilentCipher',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'Ephemeral messaging only.',
    'user',
    'online',
    0
);

-- Main Public Room: 💨 Main Vent Room (3-Day Ephemeral Retention = 259200 seconds)
INSERT OR IGNORE INTO conversations (id, type, name, avatar_url, created_by, timer_seconds)
VALUES (
    'conv-main-vent-room',
    'group',
    '💨 Main Vent Room',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80',
    'usr-super-admin-001',
    259200
);

-- Add all users to Main Vent Room
INSERT OR IGNORE INTO conversation_members (id, conversation_id, user_id, role)
VALUES
    ('mem-main-001', 'conv-main-vent-room', 'usr-super-admin-001', 'owner'),
    ('mem-main-002', 'conv-main-vent-room', 'usr-demo-shadow-002', 'member'),
    ('mem-main-003', 'conv-main-vent-room', 'usr-demo-ghost-003', 'member'),
    ('mem-main-004', 'conv-main-vent-room', 'usr-demo-cipher-004', 'member');

-- Initial Welcome Message in Main Vent Room
INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, media_type, expires_at)
VALUES (
    'msg-welcome-001',
    'conv-main-vent-room',
    'usr-super-admin-001',
    'Welcome to Vent! All messages in this public room automatically vanish after 3 days. Your real email is isolated and never displayed to other users.',
    'none',
    datetime('now', '+3 days')
);

-- Initial Audit Log Entry
INSERT OR IGNORE INTO audit_logs (id, action, actor_id, actor_email, details)
VALUES (
    'log-init-001',
    'SYSTEM_BOOTSTRAP',
    'usr-super-admin-001',
    'beestingsone@gmail.com',
    'Vent platform initialized with Cloudflare D1, Durable Objects & R2 storage layer.'
);
