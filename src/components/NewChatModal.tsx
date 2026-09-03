import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  MessageSquare,
  Users,
  Check,
  UserPlus,
  Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useChat } from '../context/ChatContext.tsx';
import { PublicUser } from '../types.ts';
import { safeFetchJson } from '../lib/api.ts';
import { localSearchUsers } from '../lib/localStore.ts';
import { useI18n } from '../i18n.tsx';

interface NewChatModalProps {
  onClose: () => void;
}

const GROUP_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
];

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose }) => {
  const { token, user, isLocalMode } = useAuth();
  const { createConversation, setActiveConversationId, onlineUserIds } = useChat();
  const { t } = useI18n();

  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [usersList, setUsersList] = useState<PublicUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState(GROUP_AVATAR_PRESETS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Search users on query change
  useEffect(() => {
    if (!token || !user) return;

    const timer = setTimeout(async () => {
      setIsLoading(true);

      if (isLocalMode || token.startsWith('local-jwt-')) {
        const localResults = localSearchUsers(searchQuery, user.id);
        setUsersList(localResults);
        setIsLoading(false);
        return;
      }

      const res = await safeFetchJson<PublicUser[]>(
        `/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.data) {
        // Exclude current user from results
        setUsersList(res.data.filter((u) => u.id !== user.id));
      } else {
        const localResults = localSearchUsers(searchQuery, user.id);
        setUsersList(localResults);
      }
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, token, user, isLocalMode]);

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
    } else {
      setSelectedUserIds((prev) => [...prev, userId]);
    }
  };

  const handleStartDirectChat = async (targetUser: PublicUser) => {
    setIsCreating(true);
    try {
      const conv = await createConversation('direct', [targetUser.id]);
      setActiveConversationId(conv.id);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to start direct conversation');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || selectedUserIds.length === 0) return;
    setIsCreating(true);
    try {
      const conv = await createConversation('group', selectedUserIds, groupName.trim(), groupAvatar);
      setActiveConversationId(conv.id);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('new_chat_group')}</h2>
              <p className="text-xs text-slate-400">Search by pseudonym or start a group</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 pt-3 pb-2">
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60">
            <button
              onClick={() => setMode('direct')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                mode === 'direct'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t('direct')}</span>
            </button>
            <button
              onClick={() => setMode('group')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                mode === 'group'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t('groups')}</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {mode === 'group' && (
            <div className="space-y-3 pb-3 border-b border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Group Room Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Vent Core, Private Circle"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Choose Group Avatar
                </label>
                <div className="flex gap-2">
                  {GROUP_AVATAR_PRESETS.map((avatar, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setGroupAvatar(avatar)}
                      className={`relative rounded-xl overflow-hidden border-2 transition cursor-pointer ${
                        groupAvatar === avatar
                          ? 'border-cyan-500 ring-2 ring-cyan-500/30 scale-105'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={avatar} alt="Preset" className="w-10 h-10 object-cover" />
                      {groupAvatar === avatar && (
                        <div className="absolute inset-0 bg-cyan-600/40 flex items-center justify-center text-white">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Search Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>{mode === 'direct' ? 'Search by Pseudonym' : 'Select Members'}</span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Shield className="w-2.5 h-2.5 text-cyan-400" /> Isolated pseudonyms
              </span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_placeholder')}
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="space-y-1.5 pt-1">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span>Searching pseudonyms...</span>
              </div>
            ) : usersList.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No users found matching "{searchQuery}".
              </div>
            ) : (
              usersList.map((target) => {
                const isOnline = onlineUserIds.includes(target.id) || target.status === 'online';
                const isSelected = selectedUserIds.includes(target.id);

                return (
                  <div
                    key={target.id}
                    onClick={() => {
                      if (mode === 'direct') {
                        handleStartDirectChat(target);
                      } else {
                        toggleUserSelection(target.id);
                      }
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/50'
                        : 'bg-slate-800/50 border-slate-750 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={target.avatar_url}
                          alt={target.display_name}
                          className="w-9 h-9 rounded-full object-cover bg-slate-700 border border-slate-600"
                        />
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {target.display_name}
                          </span>
                          {target.role === 'admin' && (
                            <span className="text-[9px] bg-purple-500/20 text-purple-300 font-bold px-1.5 py-0.2 rounded">
                              Admin
                            </span>
                          )}
                        </div>
                        {target.bio && (
                          <p className="text-[11px] text-slate-400 truncate">{target.bio}</p>
                        )}
                      </div>
                    </div>

                    {mode === 'direct' ? (
                      <button
                        disabled={isCreating}
                        className="px-2.5 py-1 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
                      >
                        Message
                      </button>
                    ) : (
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'border-slate-600 bg-slate-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer for Group Mode */}
        {mode === 'group' && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {selectedUserIds.length} member{selectedUserIds.length === 1 ? '' : 's'} selected
            </span>
            <button
              onClick={handleCreateGroupChat}
              disabled={isCreating || !groupName.trim() || selectedUserIds.length === 0}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md shadow-cyan-600/20 transition cursor-pointer"
            >
              {isCreating ? 'Creating Group...' : 'Create Group Chat'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
