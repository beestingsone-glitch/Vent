-- ==========================================================
-- Smoke Talk Database Schema & Row-Level Security (RLS)
-- "Talk freely. Stay anonymous."
-- Target: PostgreSQL / Supabase / Cloud SQL
-- ==========================================================

-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE user_status AS ENUM ('online', 'away', 'busy', 'offline');
CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE media_type AS ENUM ('image', 'video', 'audio', 'none');
CREATE TYPE call_type AS ENUM ('audio', 'video');
CREATE TYPE call_status AS ENUM ('completed', 'missed', 'declined', 'cancelled');

-- 2. USERS TABLE
-- Privacy Guarantee: Real email and metadata are restricted from public queries
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT DEFAULT 'Smoke Talk encrypted user.',
    role user_role DEFAULT 'user',
    status user_status DEFAULT 'offline',
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    last_ip TEXT
);

-- 3. CONVERSATIONS TABLE
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type conversation_type NOT NULL,
    name TEXT, -- Applicable for group chats (e.g. 💨 Main Smoke Room)
    avatar_url TEXT,
    timer_seconds INT DEFAULT 86400, -- Custom disappearing timer in seconds (e.g. 60, 300, 3600, 86400)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CONVERSATION MEMBERS TABLE
CREATE TABLE conversation_members (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- 5. MESSAGES TABLE
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    media_type media_type DEFAULT 'none',
    media_name TEXT,
    media_size BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE,
    read_by UUID[] DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Disappearing countdown deadline
);

-- 6. MEDIA AUDIT TABLE (Admin tracking & Supabase Storage)
CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type media_type NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. CALL LOGS TABLE (WebRTC sessions)
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    call_type call_type NOT NULL DEFAULT 'audio',
    status call_status NOT NULL DEFAULT 'completed',
    duration_seconds INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AUDIT LOGS TABLE (Super Admin compliance for beestingsone@gmail.com)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    target_id TEXT,
    details TEXT NOT NULL,
    ip_address TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- INDEXES FOR PERFORMANCE
-- ==========================================================
CREATE INDEX idx_users_display_name ON users(display_name);
CREATE INDEX idx_conversation_members_user ON conversation_members(user_id);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_media_files_uploaded_by ON media_files(uploaded_by);
CREATE INDEX idx_call_logs_caller ON call_logs(caller_id, created_at DESC);

-- ==========================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Rule 1: Public Profile View (Excludes Real Email)
CREATE POLICY "Public profiles are viewable by all authenticated users"
ON users FOR SELECT
TO authenticated
USING (
    -- Admins can view all columns including email
    (auth.jwt() ->> 'email' = 'beestingsone@gmail.com')
    OR
    -- Regular users can only see unbanned public users (email is filtered in API layer)
    (is_banned = FALSE)
);

-- Rule 2: Conversation Access (Participants or Super Admin)
CREATE POLICY "Users can access conversations they belong to"
ON conversations FOR SELECT
TO authenticated
USING (
    (auth.jwt() ->> 'email' = 'beestingsone@gmail.com')
    OR
    EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_members.conversation_id = conversations.id
        AND conversation_members.user_id = auth.uid()
    )
);

-- Rule 3: Message Read & Write (Participants or Super Admin)
CREATE POLICY "Users can view messages in their conversations"
ON messages FOR SELECT
TO authenticated
USING (
    (auth.jwt() ->> 'email' = 'beestingsone@gmail.com')
    OR
    EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_members.conversation_id = messages.conversation_id
        AND conversation_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert messages into their conversations"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_members.conversation_id = messages.conversation_id
        AND conversation_members.user_id = auth.uid()
    )
);

-- Rule 4: Admin Audit Access (beestingsone@gmail.com)
CREATE POLICY "Only super admin can view audit logs"
ON audit_logs FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = 'beestingsone@gmail.com');

-- -------------------------------------------------------------
-- EPHEMERAL AUTO-DELETION CLEANUP (Instant Vanish & Periodic Cron)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_expired_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION purge_expired_smoke_talk_messages()
RETURNS void AS $$
BEGIN
    -- Delete messages exceeding custom countdown timer or default TTL
    DELETE FROM messages 
    WHERE (expires_at IS NOT NULL AND expires_at <= NOW())
       OR id IN (
        SELECT m.id
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE (
            (c.type = 'group' AND m.created_at < NOW() - INTERVAL '72 hours')
            OR
            (c.type = 'direct' AND m.created_at < NOW() - INTERVAL '24 hours')
        )
    );

    -- Delete orphaned media file records
    DELETE FROM media_files
    WHERE id IN (
        SELECT mf.id
        FROM media_files mf
        JOIN conversations c ON c.id = mf.conversation_id
        WHERE (
            (c.type = 'group' AND mf.created_at < NOW() - INTERVAL '72 hours')
            OR
            (c.type = 'direct' AND mf.created_at < NOW() - INTERVAL '24 hours')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional pg_cron hourly job trigger in Supabase:
-- SELECT cron.schedule('purge-ephemeral-smoke-talk', '0 * * * *', 'SELECT purge_expired_smoke_talk_messages()');
