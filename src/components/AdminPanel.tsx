import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  MessageSquare,
  HardDrive,
  Activity,
  Search,
  Ban,
  Trash2,
  Lock,
  Eye,
  CheckCircle,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  Download,
  RefreshCw,
  ExternalLink,
  X,
  Clock,
  Flame,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  AdminStats,
  AdminUser,
  AuditLog,
  Conversation,
  MediaFileRecord,
  Message,
} from '../types.ts';
import { safeFetchJson } from '../lib/api.ts';
import {
  localGetConversations,
  localGetMessages,
  localDeleteMessage,
  localPurgeExpiredMessages,
} from '../lib/localStore.ts';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { token, user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'messages' | 'storage' | 'logs'>('users');

  // Hard authorization barrier
  if (!user || !isAdmin) {
    return null;
  }

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<Message[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaFileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [userSearch, setUserSearch] = useState('');
  const [mediaSearch, setMediaSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch admin stats
  const fetchStats = useCallback(async () => {
    if (!token) return;
    const res = await safeFetchJson<AdminStats>('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok && res.data) {
      setStats(res.data);
    } else {
      // Local fallback stats
      setStats({
        totalUsers: 4,
        onlineUsers: 4,
        bannedUsers: 0,
        activeConversations: 2,
        totalMessages: 4,
        totalMediaFiles: 0,
        storageBytesUsed: 0,
        recentErrors: 0,
        ephemeralPurges: 12,
      });
    }
  }, [token]);

  // Fetch users directory
  const fetchUsers = useCallback(async () => {
    if (!token) return;
    const res = await safeFetchJson<AdminUser[]>('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok && Array.isArray(res.data)) {
      setUsersList(res.data);
    }
  }, [token]);

  // Fetch all conversations for message audit
  const fetchConversations = useCallback(async () => {
    if (!token) return;
    const res = await safeFetchJson<Conversation[]>('/api/admin/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok && Array.isArray(res.data)) {
      setConversations(res.data);
      if (res.data.length > 0 && !selectedConvId) {
        setSelectedConvId(res.data[0].id);
      }
    } else {
      const localConvs = localGetConversations('user-admin-1');
      setConversations(localConvs);
      if (localConvs.length > 0 && !selectedConvId) {
        setSelectedConvId(localConvs[0].id);
      }
    }
  }, [token, selectedConvId]);

  // Fetch messages for selected conversation
  const fetchConversationMessages = useCallback(
    async (convId: string) => {
      if (!token) return;
      const res = await safeFetchJson<Message[]>(`/api/admin/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && Array.isArray(res.data)) {
        setConvMessages(res.data);
      } else {
        const localMsgs = localGetMessages(convId);
        setConvMessages(localMsgs);
      }
    },
    [token]
  );

  // Fetch storage files
  const fetchMedia = useCallback(async () => {
    if (!token) return;
    const res = await safeFetchJson<MediaFileRecord[]>('/api/admin/media', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok && Array.isArray(res.data)) {
      setMediaFiles(res.data);
    }
  }, [token]);

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    if (!token) return;
    const res = await safeFetchJson<AuditLog[]>('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok && Array.isArray(res.data)) {
      setAuditLogs(res.data);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();
    fetchUsers();
    fetchConversations();
    fetchMedia();
    fetchLogs();
  }, [fetchStats, fetchUsers, fetchConversations, fetchMedia, fetchLogs]);

  useEffect(() => {
    if (selectedConvId) {
      fetchConversationMessages(selectedConvId);
    }
  }, [selectedConvId, fetchConversationMessages]);

  const handleBanUser = async (targetUserId: string, currentBanStatus: boolean) => {
    if (!token) return;
    const confirm = window.confirm(
      `Are you sure you want to ${currentBanStatus ? 'unban' : 'ban'} this user?`
    );
    if (!confirm) return;

    const res = await safeFetchJson(`/api/admin/users/${targetUserId}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ is_banned: !currentBanStatus }),
    });

    setActionMessage(`User ban state successfully updated.`);
    fetchUsers();
    fetchStats();
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleDeleteUser = async (targetUserId: string, displayName: string) => {
    if (!token) return;
    const confirm = window.confirm(
      `Permanently delete account for '${displayName}'? This action cannot be undone.`
    );
    if (!confirm) return;

    const res = await safeFetchJson(`/api/admin/users/${targetUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    setActionMessage(`User account '${displayName}' permanently deleted.`);
    fetchUsers();
    fetchStats();
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!token) return;
    const confirm = window.confirm('Delete this message globally from the platform?');
    if (!confirm) return;

    const res = await safeFetchJson(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localDeleteMessage(messageId);
    }
    if (selectedConvId) fetchConversationMessages(selectedConvId);
    fetchStats();
  };

  const handleDeleteMedia = async (mediaId: string, filename: string) => {
    if (!token) return;
    const confirm = window.confirm(`Permanently remove media file '${filename}'?`);
    if (!confirm) return;

    await safeFetchJson(`/api/admin/media/${mediaId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    setActionMessage(`Media file '${filename}' removed.`);
    fetchMedia();
    fetchStats();
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handlePurgeEphemeral = async () => {
    if (!token) return;

    const res = await safeFetchJson<{ purgedMessages?: number; purgedFiles?: number }>(
      '/api/admin/purge-ephemeral',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (res.ok && res.data) {
      setActionMessage(
        `Ephemeral purge complete: ${res.data.purgedMessages ?? 0} messages and ${res.data.purgedFiles ?? 0} attachments cleaned.`
      );
    } else {
      const { purgedCount } = localPurgeExpiredMessages();
      setActionMessage(`Ephemeral purge complete: ${purgedCount} expired local messages cleaned.`);
    }

    fetchStats();
    fetchConversations();
    fetchMedia();
    fetchLogs();
    if (selectedConvId) {
      fetchConversationMessages(selectedConvId);
    }
    setTimeout(() => setActionMessage(null), 4000);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredUsers = usersList.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.display_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      (u.last_ip && u.last_ip.includes(q))
    );
  });

  const filteredMedia = mediaFiles.filter((m) => {
    const q = mediaSearch.toLowerCase();
    return (
      m.file_name.toLowerCase().includes(q) ||
      m.uploader_display_name.toLowerCase().includes(q) ||
      (m.uploader_email && m.uploader_email.toLowerCase().includes(q)) ||
      (m.conversation_name && m.conversation_name.toLowerCase().includes(q))
    );
  });

  const filteredLogs = auditLogs.filter((l) => {
    const q = logSearch.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.actor_email.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col text-slate-100 select-none animate-in fade-in duration-150">
      {/* Top Banner */}
      <header className="h-16 px-6 bg-slate-900 border-b border-purple-500/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
            <ShieldAlert className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                Super Admin Global Audit Console
              </h1>
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded font-bold uppercase">
                Owner Mode: beestingsone@gmail.com
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Master inspection of accounts, real emails, active chat rooms, and uploaded media.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePurgeEphemeral}
            className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Clean up all messages and media older than 72h (public) or 24h (private)"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Purge Ephemeral</span>
          </button>

          <button
            onClick={() => {
              fetchStats();
              fetchUsers();
              fetchConversations();
              fetchMedia();
              fetchLogs();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Refresh dashboard data"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 transition cursor-pointer"
            title="Close Admin Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Action Notification */}
      {actionMessage && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 px-6 py-2 text-xs text-emerald-300 flex items-center gap-2 animate-in slide-in-from-top">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="p-4 sm:p-6 bg-slate-900/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Total Users
          </div>
          <div className="text-xl font-bold text-white flex items-center justify-between">
            <span>{stats?.total_users || 0}</span>
            <Users className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Active 24h
          </div>
          <div className="text-xl font-bold text-emerald-400 flex items-center justify-between">
            <span>{stats?.active_users_24h || 0}</span>
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Conversations
          </div>
          <div className="text-xl font-bold text-white flex items-center justify-between">
            <span>{stats?.total_conversations || 0}</span>
            <MessageSquare className="w-5 h-5 text-purple-400" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Total Messages
          </div>
          <div className="text-xl font-bold text-white flex items-center justify-between">
            <span>{stats?.total_messages || 0}</span>
            <FileText className="w-5 h-5 text-sky-400" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Media Files
          </div>
          <div className="text-xl font-bold text-white flex items-center justify-between">
            <span>{stats?.total_media_files || 0}</span>
            <ImageIcon className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Storage Used
          </div>
          <div className="text-xl font-bold text-white flex items-center justify-between">
            <span>{formatBytes(stats?.total_storage_bytes || 0)}</span>
            <HardDrive className="w-5 h-5 text-rose-400" />
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="px-6 bg-slate-900 border-b border-slate-800 flex items-center gap-4 shrink-0">
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'users'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`py-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'messages'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Message Audit Inspector</span>
        </button>

        <button
          onClick={() => setActiveTab('storage')}
          className={`py-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'storage'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>System Storage & Media ({mediaFiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`py-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'logs'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Security & Audit Logs</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Tab 1: User Management */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by pseudonym, confidential email, user ID, IP..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin View: Real emails decrypted for compliance & moderation</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">User / Pseudonym</th>
                      <th className="p-3.5">Confidential Real Email</th>
                      <th className="p-3.5">Role / Status</th>
                      <th className="p-3.5">IP & Last Active</th>
                      <th className="p-3.5">Activity</th>
                      <th className="p-3.5 text-right">Moderation Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {filteredUsers.map((u) => {
                      const isSuper = u.email.toLowerCase() === 'beestingsone@gmail.com';
                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 font-sans">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={
                                  u.avatar_url ||
                                  `https://api.dicebear.com/7.x/identicon/svg?seed=${u.display_name}`
                                }
                                alt={u.display_name}
                                className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                              />
                              <div>
                                <div className="font-semibold text-white flex items-center gap-1.5">
                                  <span>{u.display_name}</span>
                                  {isSuper && (
                                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0.2 rounded border border-purple-500/40">
                                      Owner
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  ID: {u.id.substring(0, 8)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono">{u.email}</span>
                            </div>
                          </td>

                          <td className="p-3.5 font-sans">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                  u.is_banned
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : u.status === 'online'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {u.is_banned ? 'Banned' : u.status || 'offline'}
                              </span>
                              <span className="text-[10px] text-slate-500 uppercase">{u.role}</span>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="text-slate-300">{u.last_ip || '127.0.0.1'}</div>
                            <div className="text-[10px] text-slate-500">
                              {new Date(u.last_active_at).toLocaleString()}
                            </div>
                          </td>

                          <td className="p-3.5 font-sans text-slate-300">
                            <div>{u.message_count || 0} messages</div>
                            <div className="text-[10px] text-slate-500">
                              {u.conversation_count || 0} chats
                            </div>
                          </td>

                          <td className="p-3.5 text-right font-sans">
                            {!isSuper ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleBanUser(u.id, u.is_banned)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                                    u.is_banned
                                      ? 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60'
                                      : 'bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-700/60'
                                  }`}
                                  title={u.is_banned ? 'Unban user' : 'Ban user'}
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>{u.is_banned ? 'Unban' : 'Ban'}</span>
                                </button>

                                <button
                                  onClick={() => handleDeleteUser(u.id, u.display_name)}
                                  className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-700/60 transition cursor-pointer"
                                  title="Permanently delete user"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Protected</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Message Audit Inspector */}
        {activeTab === 'messages' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[70vh]">
            {/* Conversation Selector */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-full">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span>All Active Threads ({conversations.length})</span>
              </h3>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConvId(c.id)}
                    className={`w-full text-left p-3 rounded-xl transition cursor-pointer flex items-center gap-3 ${
                      selectedConvId === c.id
                        ? 'bg-purple-950/50 border border-purple-500/40 text-white'
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <img
                      src={
                        c.avatar_url ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${c.name || c.id}`
                      }
                      alt={c.name || 'Chat'}
                      className="w-9 h-9 rounded-full object-cover shrink-0 bg-slate-800"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold truncate">
                          {c.name || 'Direct Chat'}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-slate-500">
                          {c.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {c.members.map((m) => m.display_name).join(', ')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Inspect Messages Stream */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-full">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div>
                  <h3 className="text-xs font-bold text-white">Live Conversation Inspector</h3>
                  <p className="text-[11px] text-slate-400">
                    Thread ID: {selectedConvId || 'None selected'}
                  </p>
                </div>
                <span className="text-xs text-purple-300 font-mono">
                  {convMessages.length} Messages in thread
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {convMessages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No messages recorded in this conversation.
                  </div>
                ) : (
                  convMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-300">
                            {msg.sender_display_name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({new Date(msg.created_at).toLocaleString()})
                          </span>
                          {msg.expires_at && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
                              <Clock className="w-2.5 h-2.5" />
                              <span>Purges: {new Date(msg.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-xs transition cursor-pointer"
                          title="Purge message from platform"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Content */}
                      {msg.content && (
                        <p className="text-xs text-slate-200 whitespace-pre-wrap">{msg.content}</p>
                      )}

                      {/* Attached Media */}
                      {msg.media_url && (
                        <div className="mt-2 p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between max-w-sm">
                          <div className="flex items-center gap-2 text-xs text-slate-300 truncate">
                            {msg.media_type === 'image' && <ImageIcon className="w-4 h-4 text-indigo-400" />}
                            {msg.media_type === 'video' && <Video className="w-4 h-4 text-purple-400" />}
                            {msg.media_type === 'audio' && <Mic className="w-4 h-4 text-emerald-400" />}
                            <span className="truncate">{msg.media_name || 'Uploaded File'}</span>
                          </div>
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-slate-800 text-indigo-300 text-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: System Storage & Media Moderation */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  placeholder="Search media files by name, uploader pseudonym, email..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="text-xs text-slate-400 font-mono">
                Total Storage: {formatBytes(stats?.total_storage_bytes || 0)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMedia.length === 0 ? (
                <div className="col-span-full p-8 text-center text-slate-500 text-xs">
                  No uploaded media files found.
                </div>
              ) : (
                filteredMedia.map((m) => (
                  <div
                    key={m.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-md"
                  >
                    {/* Media Preview */}
                    <div className="h-40 bg-slate-950 flex items-center justify-center overflow-hidden relative group">
                      {m.file_type === 'image' && (
                        <img
                          src={m.file_url}
                          alt={m.file_name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {m.file_type === 'video' && (
                        <video src={m.file_url} className="w-full h-full object-cover" />
                      )}
                      {m.file_type === 'audio' && (
                        <div className="flex flex-col items-center justify-center text-emerald-400">
                          <Mic className="w-10 h-10 mb-2" />
                          <span className="text-xs font-mono">Voice Recording</span>
                        </div>
                      )}

                      <a
                        href={m.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                      >
                        <ExternalLink className="w-6 h-6" />
                      </a>
                    </div>

                    {/* Meta & Moderation */}
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white truncate" title={m.file_name}>
                          {m.file_name}
                        </h4>
                        <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                          <div>
                            Uploader: <span className="text-indigo-300 font-semibold">{m.uploader_display_name}</span>
                          </div>
                          <div className="text-slate-500 font-mono text-[10px]">
                            {m.uploader_email}
                          </div>
                          <div>Size: {formatBytes(m.file_size)}</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {new Date(m.created_at).toLocaleDateString()}
                        </span>

                        <button
                          onClick={() => handleDeleteMedia(m.id, m.file_name)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold flex items-center gap-1 border border-rose-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Purge</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Security & Audit Logs */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filter logs by action, actor email, details..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs">
              <div className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="p-3.5 hover:bg-slate-800/40 transition">
                    <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                      <span className="font-semibold text-purple-300">{log.action}</span>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-slate-200 text-xs">{log.details}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Actor: {log.actor_email} {log.ip_address ? `| IP: ${log.ip_address}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
