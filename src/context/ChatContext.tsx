import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Conversation, Message, MediaType, WSMessage } from '../types.ts';
import { useAuth } from './AuthContext.tsx';
import { safeFetchJson } from '../lib/api.ts';
import {
  localGetConversations,
  localGetMessages,
  localSendMessage,
  localCreateConversation,
  localDeleteMessage,
  localClearConversation,
  localDeleteConversation,
  localBlockUser,
  localUnblockUser,
  localGetBlockedUsers,
  localSetConversationTimer,
  localPurgeExpiredMessages,
} from '../lib/localStore.ts';

interface TypingInfo {
  userId: string;
  displayName: string;
}

interface ChatContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isLoadingMessages: boolean;
  onlineUserIds: string[];
  typingUsers: TypingInfo[];
  blockedUserIds: string[];
  setActiveConversationId: (id: string | null) => void;
  sendMessage: (params: {
    content?: string;
    media_url?: string;
    media_type?: MediaType;
    media_name?: string;
    media_size?: number;
    timer_seconds?: number;
  }) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;
  createConversation: (
    type: 'direct' | 'group',
    memberIds: string[],
    name?: string,
    avatarUrl?: string
  ) => Promise<Conversation>;
  deleteMessage: (messageId: string) => Promise<void>;
  clearConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  blockUser: (targetUserId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
  setConversationTimer: (conversationId: string, timerSeconds: number) => Promise<void>;
  refreshConversations: () => Promise<void>;
  uploadMedia: (file: File) => Promise<{
    file_url: string;
    file_name: string;
    file_size: number;
    media_type: MediaType;
  }>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore audio block in non-interacted browser states
  }
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, token, isLocalMode } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [typingMap, setTypingMap] = useState<Record<string, Record<string, TypingInfo>>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  const activeTyping: TypingInfo[] = activeConversationId && typingMap[activeConversationId]
    ? (Object.values(typingMap[activeConversationId]) as TypingInfo[]).filter((t) => t.userId !== user?.id)
    : [];

  const refreshConversations = useCallback(async () => {
    if (!user) return;

    const res = await safeFetchJson<Conversation[]>('/api/conversations', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      setConversations(res.data);
    } else {
      const localConvs = localGetConversations(user.id);
      setConversations(localConvs);
    }
  }, [token, user]);

  const refreshBlockedUsers = useCallback(async () => {
    if (!user) return;

    const res = await safeFetchJson<string[]>('/api/users/blocked', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.ok && Array.isArray(res.data)) {
      setBlockedUserIds(res.data);
    } else {
      setBlockedUserIds(localGetBlockedUsers(user.id));
    }
  }, [token, user]);

  useEffect(() => {
    refreshConversations();
    refreshBlockedUsers();
  }, [refreshConversations, refreshBlockedUsers]);

  // Load and continuously poll messages from D1 every 2.5 seconds
  useEffect(() => {
    if (!activeConversationId || !user) {
      setMessages([]);
      return;
    }

    let isSubscribed = true;

    async function fetchMessages() {
      const res = await safeFetchJson<Message[]>(`/api/conversations/${activeConversationId}/messages`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok && Array.isArray(res.data) && isSubscribed) {
        const now = Date.now();
        const activeMessages = res.data.filter(
          (m) => !m.expires_at || new Date(m.expires_at).getTime() > now
        );

        setMessages((prev) => {
          // Merge incoming polled data with existing state to preserve rendered base64 media
          const merged = activeMessages.map((incoming) => {
            const existing = prev.find((p) => p.id === incoming.id);
            if (existing?.media_url && !incoming.media_url) {
              return {
                ...incoming,
                media_url: existing.media_url,
                media_type: existing.media_type || incoming.media_type,
                media_name: existing.media_name || incoming.media_name,
                media_size: existing.media_size || incoming.media_size,
              };
            }
            return incoming;
          });

          const prevIds = prev.map((m) => `${m.id}-${m.media_url ? 'media' : 'text'}`).join(',');
          const nextIds = merged.map((m) => `${m.id}-${m.media_url ? 'media' : 'text'}`).join(',');
          if (prevIds === nextIds && prev.length === merged.length) return prev;

          const hasNewFromOthers = merged.some(
            (m) => m.sender_id !== user.id && !prev.some((p) => p.id === m.id)
          );
          if (hasNewFromOthers) {
            playChime();
          }

          return merged;
        });

        safeFetchJson(`/api/conversations/${activeConversationId}/read`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => {});

        return;
      }

      if (isSubscribed) {
        const localMsgs = localGetMessages(activeConversationId);
        setMessages(localMsgs);
      }
    }

    setIsLoadingMessages(true);
    fetchMessages().finally(() => {
      if (isSubscribed) setIsLoadingMessages(false);
    });

    const pollInterval = setInterval(fetchMessages, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [activeConversationId, token, user]);

  // Listen for simulated local chat events in demo mode
  useEffect(() => {
    const handleLocalMessage = (event: Event) => {
      const customEvent = event as CustomEvent<Message>;
      const newMsg = customEvent.detail;
      if (!newMsg) return;

      if (newMsg.conversation_id === activeConversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      if (newMsg.sender_id !== user?.id) {
        playChime();
      }

      refreshConversations();
    };

    window.addEventListener('vent_local_message', handleLocalMessage);
    return () => window.removeEventListener('vent_local_message', handleLocalMessage);
  }, [activeConversationId, user?.id, refreshConversations]);

  // WebSocket connection handler
  useEffect(() => {
    if (!token || !user || isLocalMode || token.startsWith('local-jwt-')) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let isUnmounted = false;

    function connect() {
      try {
        const protocol = window.location.protocol
