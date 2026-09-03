export type UserRole = 'user' | 'admin';
export type UserStatus = 'online' | 'away' | 'busy' | 'offline';
export type MediaType = 'image' | 'video' | 'audio' | 'none';
export type ConversationType = 'direct' | 'group';

// Public User Profile - Cleanly stripped of email and sensitive data
export interface PublicUser {
  id: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  status?: UserStatus;
  role?: UserRole;
  last_active_at?: string;
}

// Admin View User Profile - Only available to beestingsone@gmail.com
export interface AdminUser extends PublicUser {
  email: string;
  is_banned: boolean;
  created_at: string;
  last_ip?: string;
  message_count?: number;
  conversation_count?: number;
}

// Authenticated current user (includes email for own account view)
export interface AuthUser extends PublicUser {
  email: string;
  role: UserRole;
  is_banned?: boolean;
}

export interface ConversationMember {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  joined_at: string;
  last_read_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_display_name: string;
  sender_avatar?: string;
  content: string;
  media_url?: string;
  media_type: MediaType;
  media_name?: string;
  media_size?: number; // in bytes
  created_at: string;
  expires_at?: string; // ISO string when message is permanently purged
  is_deleted?: boolean;
  read_by?: string[]; // user IDs who have read this message
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string; // for group chats
  avatar_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  timer_seconds?: number; // self-destruct disappearing timer in seconds (e.g. 60, 300, 3600, 86400)
  members: ConversationMember[];
  last_message?: Message;
  unread_count?: number;
}

export interface MediaFileRecord {
  id: string;
  file_name: string;
  file_url: string;
  file_type: MediaType;
  file_size: number;
  uploaded_by: string;
  uploader_display_name: string;
  uploader_email?: string;
  conversation_id: string;
  conversation_name?: string;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  active_users_24h: number;
  total_conversations: number;
  total_messages: number;
  total_media_files: number;
  total_storage_bytes: number;
  banned_users: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_email: string;
  target_id?: string;
  details: string;
  timestamp: string;
  ip_address?: string;
}

// WebSocket Event Payloads
export type WSEventType =
  | 'auth'
  | 'auth_success'
  | 'presence_sync'
  | 'user_status'
  | 'send_message'
  | 'new_message'
  | 'typing'
  | 'user_typing'
  | 'mark_read'
  | 'messages_read'
  | 'delete_message'
  | 'message_deleted'
  | 'conversation_cleared'
  | 'conversation_deleted'
  | 'user_blocked'
  | 'user_unblocked'
  | 'user_banned'
  | 'conversation_created'
  | 'timer_updated'
  | 'call_invite'
  | 'call_accepted'
  | 'call_rejected'
  | 'call_ended'
  | 'webrtc_offer'
  | 'webrtc_answer'
  | 'webrtc_ice_candidate'
  | 'ping'
  | 'pong';

export interface WSMessage<T = unknown> {
  type: WSEventType;
  payload: T;
}

export type CallType = 'audio' | 'video';
export type CallState = 'idle' | 'calling' | 'ringing' | 'connected';

export interface CallPeerInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  conversationId?: string;
}

export interface CallInvitePayload {
  toUserId: string;
  fromUserId: string;
  fromDisplayName: string;
  fromAvatarUrl?: string;
  conversationId?: string;
  callType: CallType;
}

export interface CallAcceptPayload {
  toUserId: string;
  fromUserId: string;
  conversationId?: string;
}

export interface CallRejectPayload {
  toUserId: string;
  fromUserId: string;
  reason?: string;
}

export interface CallEndPayload {
  toUserId: string;
  fromUserId: string;
}

export interface WebRTCSignalPayload {
  toUserId: string;
  fromUserId: string;
  sdp?: any;
  candidate?: any;
}
