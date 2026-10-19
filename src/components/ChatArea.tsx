import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Video,
  Mic,
  Smile,
  Shield,
  Lock,
  Users,
  Check,
  CheckCheck,
  Trash2,
  Play,
  Pause,
  Phone,
  Clock,
  Flame,
  ChevronDown,
  MoreVertical,
  Eraser,
  Ban,
  UserCheck,
  ArrowLeft,
  EyeOff,
} from 'lucide-react';
import { useChat } from '../context/ChatContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useCall } from '../context/CallContext.tsx';
import { MediaType } from '../types.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useI18n } from '../i18n.tsx';

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '🛡️', '🔒', '🚀', '⚡', '👀', '🤫', '💯'];

export const DISAPPEARING_TIMER_OPTIONS = [
  { label: '1 minute', seconds: 60, short: '1m' },
  { label: '5 minutes', seconds: 300, short: '5m' },
  { label: '15 minutes', seconds: 900, short: '15m' },
  { label: '1 hour', seconds: 3600, short: '1h' },
  { label: '6 hours', seconds: 21600, short: '6h' },
  { label: '12 hours', seconds: 43200, short: '12h' },
  { label: '24 hours', seconds: 86400, short: '24h' },
  { label: '3 days', seconds: 259200, short: '3d' },
  { label: '7 days', seconds: 604800, short: '7d' },
];

export function formatTimerLabel(seconds?: number): string {
  if (!seconds) return '5m';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function formatRemainingTime(expiresAt?: string, nowMs: number = Date.now()): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - nowMs;
  if (diff <= 0) return '0s';
  if (diff < 60000) return `${Math.max(1, Math.ceil(diff / 1000))}s`;
  if (diff < 3600000) return `${Math.ceil(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.ceil(diff / 3600000)}h`;
  return `${Math.ceil(diff / 86400000)}d`;
}

interface ChatAreaProps {
  onOpenInfoModal?: () => void;
  onBackMobile?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onOpenInfoModal, onBackMobile }) => {
  const { user, isAdmin } = useAuth();
  const { startCall } = useCall();
  const { t } = useI18n();
  const {
    activeConversation,
    messages,
    isLoadingMessages,
    onlineUserIds,
    typingUsers,
    blockedUserIds,
    sendMessage,
    sendTyping,
    uploadMedia,
    deleteMessage,
    clearConversation,
    deleteConversation,
    blockUser,
    unblockUser,
    setConversationTimer,
    createConversation,
  } = useChat();

  const [inputContent, setInputContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
  const [isPrivacyBlurred, setIsPrivacyBlurred] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: 'clear' | 'delete'; isLoading: boolean }>({
    isOpen: false,
    type: 'clear',
    isLoading: false,
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const timerMenuRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleVis = () => document.hidden && setIsPrivacyBlurred(true);
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (timerMenuRef.current && !timerMenuRef.current.contains(e.target as Node)) setShowTimerMenu(false);
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setShowHeaderMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  const isGroup = activeConversation?.type === 'group';
  const otherMember = !isGroup ? activeConversation?.members.find((m) => m.user_id !== user?.id) : null;
  const otherUserId = otherMember?.user_id;
  const isDirectOnline = otherMember ? onlineUserIds.includes(otherMember.user_id) : false;
  const isTargetBlocked = otherUserId ? blockedUserIds.includes(otherUserId) : false;
  const currentTimerSeconds = activeConversation?.timer_seconds || (isGroup ? 259200 : 300);

  const handleSendText = async () => {
    const text = inputContent.trim();
    if (!text || isUploading || isTargetBlocked) return;
    setInputContent('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await sendMessage({ content: text, media_type: 'none', timer_seconds: currentTimerSeconds });
  };

  const handleFileUpload = async (file: File) => {
    if (!file || isTargetBlocked) return;
    setIsUploading(true);
    try {
      const res = await uploadMedia(file);
      await sendMessage({
        content: '',
        media_url: res.file_url,
        media_type: res.media_type,
        media_name: res.file_name,
        timer_seconds: currentTimerSeconds,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDirectChatClick = async (senderId: string, displayName?: string) => {
    if (!user || !senderId || senderId === user.id) return;
    await createConversation('direct', [user.id, senderId], displayName || 'Direct Chat');
  };

  if (!activeConversation) {
    return (
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <Lock className="w-12 h-12 text-cyan-400 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">{t('select_conversation_title')}</h2>
        <p className="text-sm text-slate-400 max-w-sm">{t('select_conversation_desc')}</p>
      </div>
    );
  }

  const visibleMessages = messages.filter((msg) => !msg.is_deleted);

  return (
    <div className="flex-1 h-full bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Privacy Shield */}
      {isPrivacyBlurred && (
        <div
          onClick={() => setIsPrivacyBlurred(false)}
          className="absolute inset-0 z-50 backdrop-blur-2xl bg-slate-950/85 flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none"
        >
          <EyeOff className="w-10 h-10 text-cyan-400 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1.5">{t('privacy_shield_active')}</h3>
          <p className="text-xs text-slate-400 max-w-xs mb-4">{t('privacy_shield_desc')}</p>
          <button className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-semibold">
            {t('tap_to_resume')}
          </button>
        </div>
      )}

      {/* Top Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={onBackMobile} className="md:hidden p-2 text-slate-300 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div onClick={onOpenInfoModal} className="cursor-pointer flex items-center gap-2.5">
            <img
              src={activeConversation.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeConversation.name || activeConversation.id}`}
              alt={activeConversation.name || 'Chat'}
              className="w-10 h-10 rounded-full object-cover border border-slate-700 bg-slate-800"
            />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">{activeConversation.name || 'Chat'}</h2>
              <p className="text-xs text-slate-400">
                {isGroup ? `${activeConversation.members.length} ${t('members')}` : isDirectOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isGroup && otherUserId && (
            <>
              <button onClick={() => startCall(otherUserId, 'audio')} className="p-2 text-slate-300 hover:text-white">
                <Phone className="w-4 h-4 text-emerald-400" />
              </button>
              <button onClick={() => startCall(otherUserId, 'video')} className="p-2 text-slate-300 hover:text-white">
                <Video className="w-4 h-4 text-cyan-400" />
              </button>
            </>
          )}

          {/* Timer Selector */}
          <div className="relative" ref={timerMenuRef}>
            <button
              onClick={() => setShowTimerMenu((prev) => !prev)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 text-xs font-semibold text-cyan-300 border border-slate-700"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{formatTimerLabel(currentTimerSeconds)}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showTimerMenu && (
              <div className="absolute right-0 mt-2 w-48 p-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50">
                {DISAPPEARING_TIMER_OPTIONS.map((opt) => (
                  <button
                    key={opt.seconds}
                    onClick={() => {
                      setConversationTimer(activeConversation.id, opt.seconds);
                      setShowTimerMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex justify-between ${
                      currentTimerSeconds === opt.seconds ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {currentTimerSeconds === opt.seconds && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3-Dots Menu */}
          <div className="relative" ref={headerMenuRef}>
            <button onClick={() => setShowHeaderMenu((prev) => !prev)} className="p-2 text-slate-400 hover:text-white">
              <MoreVertical className="w-4 h-4" />
            </button>

            {showHeaderMenu && (
              <div className="absolute right-0 mt-2 w-48 py-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50">
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setModalConfig({ isOpen: true, type: 'clear', isLoading: false });
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-amber-300 hover:bg-slate-800 flex items-center gap-2"
                >
                  <Eraser className="w-3.5 h-3.5" /> Clear Chat
                </button>
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setModalConfig({ isOpen: true, type: 'delete', isLoading: false });
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-rose-400 hover:bg-slate-800 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoadingMessages ? (
          <div className="flex justify-center items-center h-full text-slate-500 text-xs">Loading history...</div>
        ) : (
          visibleMessages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const remaining = formatRemainingTime(msg.expires_at, currentTimeTick);

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1 px-1">
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => handleDirectChatClick(msg.sender_id, msg.sender_display_name)}
                      className="text-[11px] font-semibold text-cyan-400 hover:underline"
                    >
                      {msg.sender_display_name || 'Member'}
                    </button>
                  )}
                  {msg.expires_at && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                      <Flame className="w-3 h-3 text-cyan-400" /> {remaining}
                    </span>
                  )}
                </div>

                <div
                  className={`p-3 rounded-2xl max-w-sm sm:max-w-md ${
                    isMe ? 'bg-cyan-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {msg.content && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}
                  {msg.media_type === 'image' && msg.media_url && (
                    <img src={msg.media_url} alt="Shared" className="mt-1 rounded-xl max-h-72 object-cover" />
                  )}
                  {msg.media_type === 'video' && msg.media_url && (
                    <video src={msg.media_url} controls className="mt-1 rounded-xl max-h-72 bg-black" />
                  )}
                  {msg.media_type === 'audio' && msg.media_url && (
                    <audio src={msg.media_url} controls className="mt-1 w-56" />
                  )}
                  <div className="flex justify-end items-center gap-1 mt-1 text-[10px] opacity-70">
                    {(isMe || isAdmin) && (
                      <button onClick={() => deleteMessage(msg.id)} className="hover:text-rose-400 p-0.5">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            accept="image/*,video/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-2 text-slate-400 hover:text-white"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={inputContent}
            onChange={(e) => {
              setInputContent(e.target.value);
              sendTyping(e.target.value.length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
            placeholder={t('type_message')}
            rows={1}
            className="flex-1 py-2 px-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
          />

          <button
            onClick={handleSendText}
            disabled={!inputContent.trim()}
            className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.type === 'clear' ? 'Clear Chat?' : 'Delete Chat?'}
        description={`Are you sure you want to ${modalConfig.type} this chat?`}
        confirmText={modalConfig.type === 'clear' ? 'Clear' : 'Delete'}
        confirmVariant="danger"
        isLoading={modalConfig.isLoading}
        onConfirm={async () => {
          setModalConfig((p) => ({ ...p, isLoading: true }));
          if (modalConfig.type === 'clear') await clearConversation(activeConversation.id);
          else await deleteConversation(activeConversation.id);
          setModalConfig({ isOpen: false, type: 'clear', isLoading: false });
        }}
        onClose={() => setModalConfig({ isOpen: false, type: 'clear', isLoading: false })}
      />
    </div>
  );
};
