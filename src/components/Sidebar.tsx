import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Users,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Mic,
  ShieldCheck,
  UserPlus,
  MoreVertical,
  Trash2,
  Eraser,
  Ban,
  UserCheck,
  LogOut,
} from 'lucide-react';
import { useChat } from '../context/ChatContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { Conversation, PublicUser } from '../types.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useI18n } from '../i18n.tsx';

interface SidebarProps {
  onOpenNewChat: () => void;
  onSelectConversationMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewChat,
  onSelectConversationMobile,
}) => {
  const { user, token, logout, panicWipe } = useAuth();
  const { t } = useI18n();
  const {
    conversations,
    activeConversation,
    setActiveConversationId,
    onlineUserIds,
    blockedUserIds,
    createConversation,
    clearConversation,
    deleteConversation,
    blockUser,
    unblockUser,
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'direct' | 'group'>('all');
  const [publicSearchResults, setPublicSearchResults] = useState<PublicUser[]>([]);
  const [isSearchingPublic, setIsSearchingPublic] = useState(false);

  // Context Menu State
  const [openMenuConvId, setOpenMenuConvId] = useState<string | null>(null);

  // Confirmation Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'clear' | 'delete';
    convId: string;
    convName: string;
    isLoading: boolean;
  }>({
    isOpen: false,
    type: 'clear',
    convId: '',
    convName: '',
    isLoading: false,
  });

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuConvId(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Debounced search for public users when typing
  useEffect(() => {
    if (!searchQuery.trim() || !token) {
      setPublicSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingPublic(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPublicSearchResults(data);
        }
      } catch (err) {
        console.error('Failed to search public users', err);
      } finally {
        setIsSearchingPublic(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, token]);

  const handleStartDMWithUser = async (targetUser: PublicUser) => {
    try {
      const conv = await createConversation('direct', [targetUser.id]);
      setActiveConversationId(conv.id);
      setSearchQuery('');
      setPublicSearchResults([]);
      if (onSelectConversationMobile) onSelectConversationMobile();
    } catch (err) {
      console.error('Failed to create direct chat', err);
    }
  };

  const handleConfirmModalAction = async () => {
    if (!modalConfig.convId) return;
    setModalConfig((prev) => ({ ...prev, isLoading: true }));
    try {
      if (modalConfig.type === 'clear') {
        await clearConversation(modalConfig.convId);
      } else if (modalConfig.type === 'delete') {
        await deleteConversation(modalConfig.convId);
      }
      setModalConfig({ isOpen: false, type: 'clear', convId: '', convName: '', isLoading: false });
    } catch (err: any) {
      alert(err.message || 'Action failed');
      setModalConfig((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleToggleBlock = async (otherUserId: string, isBlocked: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuConvId(null);
    try {
      if (isBlocked) {
        await unblockUser(otherUserId);
      } else {
        await blockUser(otherUserId);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update block state');
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (filterType === 'direct' && c.type !== 'direct') return false;
    if (filterType === 'group' && c.type !== 'group') return false;

    if (!searchQuery.trim()) return true;

    const name = c.name || '';
    const lastMsg = c.last_message?.content || '';
    const q = searchQuery.toLowerCase();
    return name.toLowerCase().includes(q) || lastMsg.toLowerCase().includes(q);
  });

  const isUserOnline = (conv: Conversation) => {
    if (conv.type === 'group') return false;
    const otherMember = conv.members.find((m) => m.user_id !== user?.id);
    return otherMember ? onlineUserIds.includes(otherMember.user_id) : false;
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full bg-slate-900 border-r border-slate-800 flex flex-col select-none shrink-0 relative">
      {/* Search Header */}
      <div className="p-3.5 border-b border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <span>{t('all')}</span>
          </div>

          <button
            id="btn-sidebar-new-chat"
            onClick={onOpenNewChat}
            className="p-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title={t('new_chat_group')}
          >
            <Plus className="w-4 h-4" />
            <span className="text-xs">{t('new_chat_group')}</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="input-sidebar-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full pl-9 pr-8 py-2 bg-slate-800/90 border border-slate-700/80 rounded-xl text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            id="filter-all-chats"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-700 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {t('all')}
          </button>
          <button
            id="filter-direct-chats"
            onClick={() => setFilterType('direct')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              filterType === 'direct'
                ? 'bg-slate-700 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {t('direct')}
          </button>
          <button
            id="filter-group-chats"
            onClick={() => setFilterType('group')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              filterType === 'group'
                ? 'bg-slate-700 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Users className="w-3 h-3" /> {t('groups')}
          </button>
        </div>
      </div>

      {/* Public Search Discovered Users Panel */}
      {searchQuery.trim() && publicSearchResults.length > 0 && (
        <div className="p-3 bg-cyan-950/30 border-b border-cyan-500/20 max-h-48 overflow-y-auto shrink-0">
          <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> Found Users
          </div>
          <div className="space-y-1.5">
            {publicSearchResults.map((pubUser) => (
              <div
                key={pubUser.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={
                        pubUser.avatar_url ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${pubUser.display_name}`
                      }
                      alt={pubUser.display_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    {onlineUserIds.includes(pubUser.id) && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {pubUser.display_name}
                    </div>
                    {pubUser.bio && (
                      <div className="text-[10px] text-slate-400 truncate">{pubUser.bio}</div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleStartDMWithUser(pubUser)}
                  className="px-2.5 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium shrink-0 transition cursor-pointer"
                >
                  Chat
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p className="text-xs font-medium">{t('no_chats_found')}</p>
            <p className="text-[11px] mt-1 text-slate-600">
              {t('no_chats_desc')}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeConversation?.id === conv.id;
            const isOnline = isUserOnline(conv);
            const isGroup = conv.type === 'group';
            const otherMember = !isGroup ? conv.members.find((m) => m.user_id !== user?.id) : null;
            const otherUserId = otherMember?.user_id;
            const isBlocked = otherUserId ? blockedUserIds.includes(otherUserId) : false;
            const isMenuOpen = openMenuConvId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => {
                  setActiveConversationId(conv.id);
                  if (onSelectConversationMobile) onSelectConversationMobile();
                }}
                className={`group w-full text-left p-3.5 flex items-center gap-3 transition cursor-pointer relative ${
                  isActive
                    ? 'bg-slate-800/90 text-white'
                    : 'hover:bg-slate-800/40 text-slate-300'
                }`}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 rounded-r" />
                )}

                {/* Avatar with Presence */}
                <div className="relative shrink-0">
                  <img
                    src={
                      conv.avatar_url ||
                      `https://api.dicebear.com/7.x/identicon/svg?seed=${conv.name || conv.id}`
                    }
                    alt={conv.name || 'Chat'}
                    className={`w-11 h-11 rounded-full object-cover border ${
                      isGroup ? 'border-cyan-500/40 rounded-xl' : 'border-slate-700'
                    } bg-slate-800`}
                  />
                  {!isGroup && isOnline && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 ring-1 ring-emerald-400" />
                  )}
                  {isGroup && (
                    <span className="absolute -bottom-1 -right-1 p-0.5 bg-cyan-600 rounded-md text-[9px] text-white font-bold">
                      <Users className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Conversation Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-xs font-semibold text-slate-100 truncate">
                        {conv.name || 'Anonymous Direct Chat'}
                      </h3>
                      {isBlocked && (
                        <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold border border-rose-500/30 shrink-0 flex items-center gap-0.5">
                          <Ban className="w-2.5 h-2.5" /> {t('blocked')}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0 font-medium ml-1">
                      {formatTime(conv.updated_at || conv.last_message?.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <p className="truncate text-[11px] flex items-center gap-1">
                      {conv.last_message ? (
                        <>
                          {conv.last_message.media_type === 'image' && (
                            <span className="inline-flex items-center gap-0.5 text-cyan-300 font-medium">
                              <ImageIcon className="w-3 h-3" /> {t('photo')}
                            </span>
                          )}
                          {conv.last_message.media_type === 'video' && (
                            <span className="inline-flex items-center gap-0.5 text-cyan-300 font-medium">
                              <Video className="w-3 h-3" /> {t('video')}
                            </span>
                          )}
                          {conv.last_message.media_type === 'audio' && (
                            <span className="inline-flex items-center gap-0.5 text-cyan-300 font-medium">
                              <Mic className="w-3 h-3" /> {t('voice_note')}
                            </span>
                          )}
                          {conv.last_message.content ? (
                            <span className="truncate">
                              {conv.last_message.sender_id === user?.id ? 'You: ' : ''}
                              {conv.last_message.content}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-500 italic">{t('no_messages_yet_title')}</span>
                      )}
                    </p>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {/* Unread Badge */}
                      {Boolean(conv.unread_count && conv.unread_count > 0) && (
                        <span className="px-1.5 py-0.5 bg-cyan-600 text-white rounded-full text-[10px] font-bold min-w-4 text-center">
                          {conv.unread_count}
                        </span>
                      )}

                      {/* 3-Dots Action Menu Trigger */}
                      <div className="relative">
                        <button
                          id={`btn-menu-conv-${conv.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuConvId((prev) => (prev === conv.id ? null : conv.id));
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                          title="Chat Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div
                            id={`dropdown-conv-${conv.id}`}
                            className="absolute right-0 top-6 z-30 w-48 py-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuConvId(null);
                                setModalConfig({
                                  isOpen: true,
                                  type: 'clear',
                                  convId: conv.id,
                                  convName: conv.name || 'this conversation',
                                  isLoading: false,
                                });
                              }}
                              className="w-full px-3 py-2 text-left text-xs font-medium text-amber-300 hover:bg-amber-950/40 hover:text-amber-200 flex items-center gap-2 transition-colors"
                            >
                              <Eraser className="w-3.5 h-3.5 text-amber-400" />
                              <span>{t('clear_chat')}</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuConvId(null);
                                setModalConfig({
                                  isOpen: true,
                                  type: 'delete',
                                  convId: conv.id,
                                  convName: conv.name || 'this chat',
                                  isLoading: false,
                                });
                              }}
                              className="w-full px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              <span>{t('delete_chat')}</span>
                            </button>

                            {!isGroup && otherUserId && (
                              <button
                                type="button"
                                onClick={(e) => handleToggleBlock(otherUserId, isBlocked, e)}
                                className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 transition-colors border-t border-slate-700/60 ${
                                  isBlocked
                                    ? 'text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300'
                                    : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                                }`}
                              >
                                {isBlocked ? (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>{t('unblock_user')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{t('block_user')}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User Footer & Prominent Sign Out */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <img
              src={
                user?.avatar_url ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${user?.display_name || 'anon'}`
              }
              alt={user?.display_name || 'User'}
              className="w-8 h-8 rounded-full object-cover border border-slate-700 bg-slate-800"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-950" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.display_name || 'Anonymous'}</p>
            <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>{t('encrypted_session')}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          id="btn-sidebar-signout"
          onClick={() => {
            if (confirm('Are you sure you want to sign out?')) {
              logout();
            }
          }}
          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
          title={t('logout')}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('logout')}</span>
        </button>
      </div>

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={
          modalConfig.type === 'clear'
            ? t('clear_chat') + '?'
            : t('delete_chat') + '?'
        }
        description={
          modalConfig.type === 'clear'
            ? `Are you sure you want to clear all messages in ${modalConfig.convName}?`
            : `Are you sure you want to permanently delete ${modalConfig.convName}?`
        }
        confirmText={modalConfig.type === 'clear' ? t('clear_chat') : t('delete_chat')}
        confirmVariant="danger"
        isLoading={modalConfig.isLoading}
        onConfirm={handleConfirmModalAction}
        onClose={() =>
          setModalConfig({ isOpen: false, type: 'clear', convId: '', convName: '', isLoading: false })
        }
      />
    </aside>
  );
};
