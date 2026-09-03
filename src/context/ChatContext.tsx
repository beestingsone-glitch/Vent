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

// Web Audio sound generator for notifications (clean zero-asset chime)
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // ignore audio block in non-user interacted states
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

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // Active conversation typing list
  const activeTyping: TypingInfo[] = activeConversationId && typingMap[activeConversationId]
    ? (Object.values(typingMap[activeConversationId]) as TypingInfo[]).filter((t) => t.userId !== user?.id)
    : [];

  // Fetch user conversations
  const refreshConversations = useCallback(async () => {
    if (!token || !user) return;

    if (isLocalMode || token.startsWith('local-jwt-')) {
      const localConvs = localGetConversations(user.id);
      setConversations(localConvs);
      return;
    }

    const res = await safeFetchJson<Conversation[]>('/api/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok && Array.isArray(res.data)) {
      setConversations(res.data);
    } else {
      // Fallback to local
      const localConvs = localGetConversations(user.id);
      setConversations(localConvs);
    }
  }, [token, user, isLocalMode]);

  // Fetch blocked users
  const refreshBlockedUsers = useCallback(async () => {
    if (!token || !user) return;

    if (isLocalMode || token.startsWith('local-jwt-')) {
      setBlockedUserIds(localGetBlockedUsers(user.id));
      return;
    }

    const res = await safeFetchJson<string[]>('/api/users/blocked', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok && Array.isArray(res.data)) {
      setBlockedUserIds(res.data);
    } else {
      setBlockedUserIds(localGetBlockedUsers(user.id));
    }
  }, [token, user, isLocalMode]);

  useEffect(() => {
    refreshConversations();
    refreshBlockedUsers();
  }, [refreshConversations, refreshBlockedUsers]);

  // Listen for simulated local chat events in demo / offline mode
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

  // Connect WebSocket when in server mode
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
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'auth',
              payload: { token },
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg: WSMessage<any> = JSON.parse(event.data);

            switch (msg.type) {
              case 'presence_sync':
                setOnlineUserIds(msg.payload?.onlineUserIds || []);
                break;

              case 'user_status':
                refreshConversations();
                break;

              case 'new_message': {
                const newMsg: Message = msg.payload;

                if (newMsg.conversation_id === activeConversationId) {
                  setMessages((prev) => {
                    if (prev.some((m) => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                  });

                  if (newMsg.sender_id !== user.id) {
                    ws.send(
                      JSON.stringify({
                        type: 'mark_read',
                        payload: { conversation_id: activeConversationId },
                      })
                    );
                  }
                }

                if (newMsg.sender_id !== user.id) {
                  playChime();
                }

                setConversations((prev) => {
                  return prev
                    .map((conv) => {
                      if (conv.id === newMsg.conversation_id) {
                        const isCurrent = conv.id === activeConversationId;
                        return {
                          ...conv,
                          last_message: newMsg,
                          updated_at: newMsg.created_at,
                          unread_count:
                            isCurrent || newMsg.sender_id === user.id ? 0 : (conv.unread_count || 0) + 1,
                        };
                      }
                      return conv;
                    })
                    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                });

                break;
              }

              case 'user_typing': {
                const { conversation_id, user_id, display_name, is_typing } = msg.payload;
                setTypingMap((prev) => {
                  const convTyping = { ...(prev[conversation_id] || {}) };
                  if (is_typing) {
                    convTyping[user_id] = { userId: user_id, displayName: display_name };
                  } else {
                    delete convTyping[user_id];
                  }
                  return { ...prev, [conversation_id]: convTyping };
                });
                break;
              }

              case 'message_deleted': {
                const { message_id } = msg.payload;
                setMessages((prev) => prev.filter((m) => m.id !== message_id));
                break;
              }

              case 'conversation_cleared': {
                const { conversation_id } = msg.payload;
                if (activeConversationId === conversation_id) {
                  setMessages([]);
                }
                setConversations((prev) =>
                  prev.map((c) => (c.id === conversation_id ? { ...c, last_message: undefined } : c))
                );
                break;
              }

              case 'conversation_deleted': {
                const { conversation_id } = msg.payload;
                if (activeConversationId === conversation_id) {
                  setActiveConversationId(null);
                  setMessages([]);
                }
                setConversations((prev) => prev.filter((c) => c.id !== conversation_id));
                break;
              }

              case 'timer_updated': {
                const { conversation_id, timer_seconds } = msg.payload;
                setConversations((prev) =>
                  prev.map((c) => (c.id === conversation_id ? { ...c, timer_seconds } : c))
                );
                break;
              }
            }
          } catch (parseErr) {
            console.error('WS parse error', parseErr);
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.warn('WS connection setup error', err);
      }
    }

    connect();

    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', payload: {} }));
      }
    }, 25000);

    return () => {
      isUnmounted = true;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token, user?.id, activeConversationId, refreshConversations, isLocalMode]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId || !token || !user) {
      setMessages([]);
      return;
    }

    let isSubscribed = true;
    setIsLoadingMessages(true);

    async function loadMessages() {
      if (isLocalMode || token.startsWith('local-jwt-')) {
        const localMsgs = localGetMessages(activeConversationId);
        if (isSubscribed) {
          setMessages(localMsgs);
          setIsLoadingMessages(false);
        }
        return;
      }

      const res = await safeFetchJson<Message[]>(`/api/conversations/${activeConversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok && Array.isArray(res.data) && isSubscribed) {
        const now = Date.now();
        const activeMessages = res.data.filter(
          (m) => !m.expires_at || new Date(m.expires_at).getTime() > now
        );
        setMessages(activeMessages);

        // Mark conversation as read
        safeFetchJson(`/api/conversations/${activeConversationId}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});

        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, unread_count: 0 } : c))
        );
      } else {
        // Local fallback
        const localMsgs = localGetMessages(activeConversationId);
        if (isSubscribed) setMessages(localMsgs);
      }

      if (isSubscribed) setIsLoadingMessages(false);
    }

    loadMessages();

    return () => {
      isSubscribed = false;
    };
  }, [activeConversationId, token, user, isLocalMode]);

  // Client-Side Immediate Vanish Ticker:
  useEffect(() => {
    if (!messages.length || !token) return;

    const purgeTicker = setInterval(() => {
      const now = Date.now();
      const expiredMsgs = messages.filter(
        (m) => m.expires_at && new Date(m.expires_at).getTime() <= now
      );

      if (expiredMsgs.length > 0) {
        const expiredIds = new Set(expiredMsgs.map((m) => m.id));
        setMessages((prev) => prev.filter((m) => !expiredIds.has(m.id)));

        if (isLocalMode || token.startsWith('local-jwt-')) {
          localPurgeExpiredMessages();
        } else {
          expiredMsgs.forEach((msg) => {
            safeFetchJson(`/api/messages/${msg.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          });
        }
      }
    }, 500);

    return () => clearInterval(purgeTicker);
  }, [messages, token, isLocalMode]);

  const sendMessage = async (params: {
    content?: string;
    media_url?: string;
    media_type?: MediaType;
    media_name?: string;
    media_size?: number;
  }) => {
    if (!activeConversationId || !token || !user) return;

    sendTyping(false);

    if (isLocalMode || token.startsWith('local-jwt-')) {
      const newMsg = localSendMessage({
        conversation_id: activeConversationId,
        sender_id: user.id,
        sender_display_name: user.display_name,
        sender_avatar: user.avatar_url,
        content: params.content || '',
        media_url: params.media_url,
        media_type: params.media_type || 'none',
        media_name: params.media_name,
        media_size: params.media_size,
      });

      setMessages((prev) => [...prev, newMsg]);
      refreshConversations();
      return;
    }

    const res = await safeFetchJson(`/api/conversations/${activeConversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      // Fallback local message send
      const newMsg = localSendMessage({
        conversation_id: activeConversationId,
        sender_id: user.id,
        sender_display_name: user.display_name,
        sender_avatar: user.avatar_url,
        content: params.content || '',
        media_url: params.media_url,
        media_type: params.media_type || 'none',
        media_name: params.media_name,
        media_size: params.media_size,
      });
      setMessages((prev) => [...prev, newMsg]);
      refreshConversations();
    }
  };

  const sendTyping = (isTyping: boolean) => {
    if (!activeConversationId || !wsRef.current || !user) return;
    if (wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'typing',
        payload: {
          conversation_id: activeConversationId,
          display_name: user.display_name,
          is_typing: isTyping,
        },
      })
    );

    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 4000);
    }
  };

  const createConversation = async (
    type: 'direct' | 'group',
    memberIds: string[],
    name?: string,
    avatarUrl?: string
  ): Promise<Conversation> => {
    if (!token || !user) throw new Error('Not authenticated');

    if (isLocalMode || token.startsWith('local-jwt-')) {
      const localConv = localCreateConversation({
        creator_id: user.id,
        type,
        member_ids: memberIds,
        name,
        avatar_url: avatarUrl,
      });
      await refreshConversations();
      setActiveConversationId(localConv.id);
      return localConv;
    }

    const res = await safeFetchJson<Conversation>('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type,
        member_ids: memberIds,
        name,
        avatar_url: avatarUrl,
      }),
    });

    if (res.ok && res.data) {
      await refreshConversations();
      setActiveConversationId(res.data.id);
      return res.data;
    }

    // Fallback local create
    const localConv = localCreateConversation({
      creator_id: user.id,
      type,
      member_ids: memberIds,
      name,
      avatar_url: avatarUrl,
    });
    await refreshConversations();
    setActiveConversationId(localConv.id);
    return localConv;
  };

  const deleteMessage = async (messageId: string) => {
    if (!token) return;

    if (isLocalMode || token.startsWith('local-jwt-')) {
      localDeleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return;
    }

    const res = await safeFetchJson(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localDeleteMessage(messageId);
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const clearConversation = async (conversationId: string) => {
    if (!token) throw new Error('Not authenticated');

    if (isLocalMode || token.startsWith('local-jwt-')) {
      localClearConversation(conversationId);
      if (activeConversationId === conversationId) setMessages([]);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, last_message: undefined } : c))
      );
      return;
    }

    const res = await safeFetchJson(`/api/conversations/${conversationId}/clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localClearConversation(conversationId);
    }

    if (activeConversationId === conversationId) {
      setMessages([]);
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, last_message: undefined } : c))
    );
  };

  const deleteConversation = async (conversationId: string) => {
    if (!token) throw new Error('Not authenticated');

    if (isLocalMode || token.startsWith('local-jwt-')) {
      localDeleteConversation(conversationId);
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      return;
    }

    const res = await safeFetchJson(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localDeleteConversation(conversationId);
    }

    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
    }
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
  };

  const blockUser = async (targetUserId: string) => {
    if (!token || !user) throw new Error('Not authenticated');

    if (isLocalMode || token.startsWith('local-jwt-')) {
      localBlockUser(user.id, targetUserId);
      setBlockedUserIds((prev) => Array.from(new Set([...prev, targetUserId])));
      return;
    }

    const res = await safeFetchJson(`/api/users/${targetUserId}/block`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localBlockUser(user.id, targetUserId);
    }
    setBlockedUserIds((prev) => Array.from(new Set([...prev, targetUserId])));
  };

  const unblockUser = async (targetUserId: string) => {
    if (!token || !user) throw new Error('Not authenticated');

    if (isLocalMode || token.startsWith('local-jwt-')) {
      localUnblockUser(user.id, targetUserId);
      setBlockedUserIds((prev) => prev.filter((id) => id !== targetUserId));
      return;
    }

    const res = await safeFetchJson(`/api/users/${targetUserId}/unblock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localUnblockUser(user.id, targetUserId);
    }
    setBlockedUserIds((prev) => prev.filter((id) => id !== targetUserId));
  };

  const setConversationTimer = async (conversationId: string, timerSeconds: number) => {
    if (!token) throw new Error('Not authenticated');

    if (isLocalMode || token.startsWith('local-jwt-')) {
      localSetConversationTimer(conversationId, timerSeconds);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, timer_seconds: timerSeconds } : c))
      );
      return;
    }

    const res = await safeFetchJson(`/api/conversations/${conversationId}/timer`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ timer_seconds: timerSeconds }),
    });

    if (!res.ok) {
      localSetConversationTimer(conversationId, timerSeconds);
    }

    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, timer_seconds: timerSeconds } : c))
    );
  };

  const uploadMedia = async (file: File) => {
    if (!token) throw new Error('Not authenticated');

    // If local mode, encode directly as Data URL for self-contained offline support
    if (isLocalMode || token.startsWith('local-jwt-')) {
      return new Promise<{ file_url: string; file_name: string; file_size: number; media_type: MediaType }>(
        (resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            let type: MediaType = 'image';
            if (file.type.startsWith('video/')) type = 'video';
            else if (file.type.startsWith('audio/')) type = 'audio';

            resolve({
              file_url: dataUrl,
              file_name: file.name,
              file_size: file.size,
              media_type: type,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }
      );
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await safeFetchJson<{
      file_url: string;
      file_name: string;
      file_size: number;
      media_type: MediaType;
    }>('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (res.ok && res.data) {
      return res.data;
    }

    // Fallback to client-side data URL on upload endpoint error
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        let type: MediaType = 'image';
        if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';

        resolve({
          file_url: dataUrl,
          file_name: file.name,
          file_size: file.size,
          media_type: type,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        isLoadingMessages,
        onlineUserIds,
        typingUsers: activeTyping,
        blockedUserIds,
        setActiveConversationId,
        sendMessage,
        sendTyping,
        createConversation,
        deleteMessage,
        clearConversation,
        deleteConversation,
        blockUser,
        unblockUser,
        setConversationTimer,
        refreshConversations,
        uploadMedia,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
