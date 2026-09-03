import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  Maximize2,
  Phone,
  Clock,
  Flame,
  ChevronDown,
  Timer,
  MoreVertical,
  Eraser,
  Ban,
  UserCheck,
  ArrowLeft,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { useChat } from '../context/ChatContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useCall } from '../context/CallContext.tsx';
import { Message, MediaType } from '../types.ts';
import { AudioVoiceRecorder } from './AudioVoiceRecorder.tsx';
import { MediaLightbox } from './MediaLightbox.tsx';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useI18n } from '../i18n.tsx';

// Quick emojis list for instant reaction
const COMMON_EMOJIS = ['👍', '❤️', '🔥', '🛡️', '🔒', '🚀', '⚡', '👀', '🤫', '💯'];

// Ephemeral Disappearing Presets
export const DISAPPEARING_TIMER_OPTIONS = [
  { label: '1 minute (Flash)', seconds: 60, short: '1m', desc: 'Vanish immediately after 60 seconds' },
  { label: '5 minutes', seconds: 300, short: '5m', desc: 'Fast confidential exchange' },
  { label: '15 minutes', seconds: 900, short: '15m', desc: 'Brief conversation session' },
  { label: '1 hour', seconds: 3600, short: '1h', desc: 'Standard temporary talk' },
  { label: '6 hours', seconds: 21600, short: '6h', desc: 'Medium duration retention' },
  { label: '12 hours', seconds: 43200, short: '12h', desc: 'Half-day lifespan' },
  { label: '24 hours (1 day)', seconds: 86400, short: '24h', desc: 'Default private chat duration' },
  { label: '3 days', seconds: 259200, short: '3d', desc: 'Public room standard' },
  { label: '7 days', seconds: 604800, short: '7d', desc: 'Extended retention archive' },
];

export function formatTimerLabel(seconds?: number): string {
  if (!seconds) return '24h';
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
  } = useChat();

  const [inputContent, setInputContent] = useState('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isUpdatingTimer, setIsUpdatingTimer] = useState(false);
  const [timerToast, setTimerToast] = useState<string | null>(null);
  const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
  const [isPrivacyBlurred, setIsPrivacyBlurred] = useState(false);

  // Modal state for destructive actions
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'clear' | 'delete';
    isLoading: boolean;
  }>({
    isOpen: false,
    type: 'clear',
    isLoading: false,
  });

  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    type: MediaType;
    name?: string;
    sender?: string;
    time?: string;
  } | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [audioSpeed, setAudioSpeed] = useState<number>(1);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const timerMenuRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  // Track expired messages that have already had a delete request issued to avoid duplicate calls
  const deletedMessageIdsRef = useRef<Set<string>>(new Set());

  // Privacy Blur when tab is hidden / blurred
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPrivacyBlurred(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Periodic tick to refresh live remaining expiration countdowns and instantly vanish expired messages
  useEffect(() => {
    const tickInterval = setInterval(() => {
      const now = Date.now();
      setCurrentTimeTick(now);

      // Auto-trigger background purge for messages whose timer reached 0
      messages.forEach((msg) => {
        if (msg.expires_at && !msg.is_deleted && !deletedMessageIdsRef.current.has(msg.id)) {
          const expiresTime = new Date(msg.expires_at).getTime();
          if (expiresTime <= now) {
            deletedMessageIdsRef.current.add(msg.id);
            deleteMessage(msg.id).catch((err) =>
              console.warn(`Failed to auto-delete expired message ${msg.id}:`, err)
            );
          }
        }
      });
    }, 500);
    return () => clearInterval(tickInterval);
  }, [messages, deleteMessage]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (timerMenuRef.current && !timerMenuRef.current.contains(e.target as Node)) {
        setShowTimerMenu(false);
      }
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    }
    if (showTimerMenu || showHeaderMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTimerMenu, showHeaderMenu]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Handle textarea resize and typing signal
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputContent(e.target.value);
    sendTyping(e.target.value.length > 0);

    // Auto resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const isGroup = activeConversation?.type === 'group';
  const otherMember = !isGroup ? activeConversation?.members.find((m) => m.user_id !== user?.id) : null;
  const otherUserId = otherMember?.user_id;
  const isDirectOnline = otherMember ? onlineUserIds.includes(otherMember.user_id) : false;
  const isTargetBlocked = otherUserId ? blockedUserIds.includes(otherUserId) : false;
  const currentTimerSeconds = activeConversation?.timer_seconds || (isGroup ? 259200 : 86400);

  const handleSendText = async () => {
    const text = inputContent.trim();
    if (!text || isUploading || isTargetBlocked) return;

    setInputContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await sendMessage({ content: text, media_type: 'none' });
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    }
  };

  const handleSelectTimer = async (seconds: number) => {
    if (!activeConversation) return;
    setIsUpdatingTimer(true);
    try {
      await setConversationTimer(activeConversation.id, seconds);
      setShowTimerMenu(false);
      setTimerToast(`Self-destruct timer set to ${formatTimerLabel(seconds)}.`);
      setTimeout(() => setTimerToast(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to update disappearing timer');
    } finally {
      setIsUpdatingTimer(false);
    }
  };

  const handleConfirmHeaderAction = async () => {
    if (!activeConversation) return;
    setModalConfig((prev) => ({ ...prev, isLoading: true }));
    try {
      if (modalConfig.type === 'clear') {
        await clearConversation(activeConversation.id);
      } else if (modalConfig.type === 'delete') {
        await deleteConversation(activeConversation.id);
      }
      setModalConfig({ isOpen: false, type: 'clear', isLoading: false });
      setShowHeaderMenu(false);
    } catch (err: any) {
      alert(err.message || 'Action failed');
      setModalConfig((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleToggleBlockUser = async () => {
    if (!otherUserId) return;
    setShowHeaderMenu(false);
    try {
      if (isTargetBlocked) {
        await unblockUser(otherUserId);
      } else {
        await blockUser(otherUserId);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update block state');
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || isTargetBlocked) return;

    if (file.type.startsWith('image/') && file.size > 10 * 1024 * 1024) {
      alert('Images must be smaller than 10MB.');
      return;
    }
    if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) {
      alert('Videos must be smaller than 50MB.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(30);

    try {
      setUploadProgress(70);
      const res = await uploadMedia(file);
      setUploadProgress(90);

      await sendMessage({
        content: '',
        media_url: res.file_url,
        media_type: res.media_type,
        media_name: res.file_name,
      });
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const togglePlayAudio = (msgId: string) => {
    const audio = audioRefs.current[msgId];
    if (!audio) return;

    if (activeAudioId === msgId) {
      audio.pause();
      setActiveAudioId(null);
    } else {
      Object.keys(audioRefs.current).forEach((id) => {
        audioRefs.current[id]?.pause();
      });
      audio.playbackRate = audioSpeed;
      audio.play();
      setActiveAudioId(msgId);
    }
  };

  const cycleAudioSpeed = (msgId: string) => {
    const speeds = [1, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(audioSpeed) + 1) % speeds.length];
    setAudioSpeed(nextSpeed);
    const audio = audioRefs.current[msgId];
    if (audio) {
      audio.playbackRate = nextSpeed;
    }
  };

  // If no conversation selected
  if (!activeConversation) {
    return (
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center mb-4 text-cyan-400">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{t('select_conversation_title')}</h2>
        <p className="text-sm text-slate-400 max-w-sm">
          {t('select_conversation_desc')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 h-full bg-slate-950 flex flex-col relative overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Privacy Blur Overlay */}
      {isPrivacyBlurred && (
        <div
          onClick={() => setIsPrivacyBlurred(false)}
          className="absolute inset-0 z-50 backdrop-blur-2xl bg-slate-950/85 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-300 select-none animate-in fade-in"
        >
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 shadow-xl shadow-cyan-500/10">
            <EyeOff className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">{t('privacy_shield_active')}</h3>
          <p className="text-xs text-slate-400 max-w-xs mb-4">
            {t('privacy_shield_desc')}
          </p>
          <button
            onClick={() => setIsPrivacyBlurred(false)}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/30 transition cursor-pointer"
          >
            {t('tap_to_resume')}
          </button>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-cyan-950/80 border-2 border-dashed border-cyan-400 z-40 flex flex-col items-center justify-center pointer-events-none">
          <ImageIcon className="w-12 h-12 text-cyan-300 animate-bounce mb-2" />
          <p className="text-base font-semibold text-white">Drop photo or video here to encrypt & send</p>
          <p className="text-xs text-cyan-200 mt-1">Up to 10MB images / 50MB videos</p>
        </div>
      )}

      {/* Ephemeral Timer Change Toast Notification */}
      {timerToast && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-30 bg-cyan-900/90 border border-cyan-400/40 text-cyan-200 text-xs px-4 py-2 rounded-full shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <Clock className="w-3.5 h-3.5 text-cyan-300" />
          <span>{timerToast}</span>
        </div>
      )}

      {/* Chat Room Top Navigation Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Back button on Mobile */}
          <button
            type="button"
            id="btn-chat-mobile-back"
            onClick={onBackMobile}
            className="md:hidden min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition cursor-pointer"
            title="Back to conversation list"
            aria-label="Back to conversation list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Conversation Avatar */}
          <div
            onClick={onOpenInfoModal}
            className="relative shrink-0 cursor-pointer group"
          >
            <img
              src={
                activeConversation.avatar_url ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${activeConversation.name || activeConversation.id}`
              }
              alt={activeConversation.name || 'Chat'}
              className="w-10 h-10 rounded-full object-cover border border-slate-700 bg-slate-800"
            />
            {!isGroup && isDirectOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 ring-1 ring-emerald-400" />
            )}
            {isGroup && (
              <span className="absolute -bottom-1 -right-1 p-0.5 bg-cyan-600 rounded-md text-[9px] text-white font-bold">
                <Users className="w-2.5 h-2.5" />
              </span>
            )}
          </div>

          {/* Conversation Info */}
          <div
            onClick={onOpenInfoModal}
            className="min-w-0 cursor-pointer group"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition">
                {activeConversation.name || 'Anonymous Chat'}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
              {isGroup ? (
                <span>{activeConversation.members.length} {t('members')}</span>
              ) : isDirectOnline ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t('online')}
                </span>
              ) : (
                <span>{t('offline')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Audio / Video P2P Call Buttons */}
          {!isGroup && otherUserId && (
            <>
              <button
                type="button"
                id="btn-start-audio-call"
                onClick={() => startCall(otherUserId, 'audio')}
                disabled={isTargetBlocked}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title={t('start_voice_call')}
              >
                <Phone className="w-4 h-4 text-emerald-400" />
              </button>
              <button
                type="button"
                id="btn-start-video-call"
                onClick={() => startCall(otherUserId, 'video')}
                disabled={isTargetBlocked}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title={t('start_video_call')}
              >
                <Video className="w-4 h-4 text-cyan-400" />
              </button>
            </>
          )}

          {/* Vanishing Timer Selector Trigger */}
          <div className="relative" ref={timerMenuRef}>
            <button
              id="btn-timer-dropdown-trigger"
              type="button"
              onClick={() => setShowTimerMenu((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-cyan-300 transition cursor-pointer"
              title="Change disappearing message timer"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{formatTimerLabel(currentTimerSeconds)}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Timer Presets Dropdown Popover */}
            {showTimerMenu && (
              <div
                id="menu-timer-presets"
                className="absolute right-0 mt-2 w-64 p-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2 py-1.5 mb-1 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Flame className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{t('disappearing_timer')}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Messages self-destruct for all participants.
                  </p>
                </div>

                <div className="space-y-0.5 max-h-60 overflow-y-auto">
                  {DISAPPEARING_TIMER_OPTIONS.map((opt) => (
                    <button
                      key={opt.seconds}
                      type="button"
                      disabled={isUpdatingTimer}
                      onClick={() => handleSelectTimer(opt.seconds)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                        currentTimerSeconds === opt.seconds
                          ? 'bg-cyan-600 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-[9px] opacity-75">{opt.desc}</div>
                      </div>
                      {currentTimerSeconds === opt.seconds && (
                        <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3-Dots Room Options Menu */}
          <div className="relative" ref={headerMenuRef}>
            <button
              id="btn-header-menu-trigger"
              type="button"
              onClick={() => setShowHeaderMenu((prev) => !prev)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="More Chat Options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showHeaderMenu && (
              <div
                id="menu-header-options"
                className="absolute right-0 mt-2 w-52 py-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    if (onOpenInfoModal) onOpenInfoModal();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                >
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('room_settings')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setModalConfig({ isOpen: true, type: 'clear', isLoading: false });
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-amber-300 hover:bg-amber-950/40 hover:text-amber-200 flex items-center gap-2 transition"
                >
                  <Eraser className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('clear_chat')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setModalConfig({ isOpen: true, type: 'delete', isLoading: false });
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2 transition"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('delete_chat')}</span>
                </button>

                {!isGroup && otherUserId && (
                  <button
                    type="button"
                    onClick={handleToggleBlockUser}
                    className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 transition border-t border-slate-800 ${
                      isTargetBlocked
                        ? 'text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {isTargetBlocked ? (
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
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {isLoadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">{t('loading_encrypted_history')}</span>
          </div>
        ) : (() => {
          const visibleMessages = messages.filter((msg) => !msg.is_deleted);

          if (visibleMessages.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 select-none my-auto">
                <div className="w-14 h-14 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center mb-3 text-cyan-400 shadow-lg shadow-cyan-500/5">
                  <Flame className="w-7 h-7 text-cyan-400 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">
                  {t('no_messages_yet_title')}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-4">
                  {t('no_messages_yet_desc')}
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-medium">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>{t('timer_label')}: {formatTimerLabel(currentTimerSeconds)}</span>
                </div>
              </div>
            );
          }

          return (
            <AnimatePresence initial={false}>
              {visibleMessages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                const isDeleted = msg.is_deleted;
                const isRead = Boolean(msg.read_by && msg.read_by.length > 1);

                // Live Burn Countdown calculations
                const remainingTime = formatRemainingTime(msg.expires_at, currentTimeTick);
                const isExpiringSoon =
                  msg.expires_at &&
                  new Date(msg.expires_at).getTime() - currentTimeTick < 60000;

                // Lifespan progress percentage
                let lifespanPercent = 100;
                if (msg.expires_at && msg.created_at) {
                  const totalSpan = new Date(msg.expires_at).getTime() - new Date(msg.created_at).getTime();
                  const remainingSpan = new Date(msg.expires_at).getTime() - currentTimeTick;
                  if (totalSpan > 0) {
                    lifespanPercent = Math.max(0, Math.min(100, (remainingSpan / totalSpan) * 100));
                  }
                }

                return (
                  <motion.div
                    key={msg.id}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(8px)', transition: { duration: 0.3 } }}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[85%] sm:max-w-md flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {/* Sender and Burn Indicator Header */}
                      <div className="flex items-center gap-2 mb-1 px-1">
                        {!isMe && (
                          <span className="text-[11px] font-semibold text-slate-400">
                            {msg.sender_display_name}
                          </span>
                        )}

                        {/* Visual Burn-On-Read Live Countdown Badge */}
                        {msg.expires_at && !isDeleted && (
                          <div
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                              isExpiringSoon
                                ? 'bg-rose-950/80 border-rose-500/50 text-rose-300 animate-pulse'
                                : 'bg-slate-900/90 border-slate-800 text-slate-400'
                            }`}
                            title={`Self-destruct in ${remainingTime}`}
                          >
                            <Flame className={`w-3 h-3 ${isExpiringSoon ? 'text-rose-400' : 'text-cyan-400'}`} />
                            <span>{remainingTime}</span>
                          </div>
                        )}
                      </div>

                      {/* Message Bubble Container */}
                      <div
                        className={`group relative p-3.5 rounded-2xl shadow-sm transition-all overflow-hidden ${
                          isMe
                            ? 'bg-cyan-600 text-white rounded-tr-none'
                            : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        {/* Soft background pulse when expiring */}
                        {isExpiringSoon && (
                          <div className="absolute inset-0 bg-rose-500/10 animate-pulse pointer-events-none" />
                        )}

                        {/* Lifespan bar at bottom of bubble */}
                        {msg.expires_at && !isDeleted && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/20 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                isExpiringSoon ? 'bg-rose-400' : isMe ? 'bg-cyan-200/60' : 'bg-cyan-500/60'
                              }`}
                              style={{ width: `${lifespanPercent}%` }}
                            />
                          </div>
                        )}

                        {/* Content rendering */}
                        {isDeleted ? (
                          <div className="flex items-center gap-1.5 text-xs italic opacity-60">
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>This message has vanished</span>
                          </div>
                        ) : (
                          <>
                            {/* Text Message */}
                            {msg.content && (
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                {msg.content}
                              </p>
                            )}

                            {/* Photo / Image */}
                            {msg.media_type === 'image' && msg.media_url && (
                              <div
                                onClick={() =>
                                  setLightboxMedia({
                                    url: msg.media_url!,
                                    type: 'image',
                                    name: msg.media_name,
                                    sender: msg.sender_display_name,
                                    time: msg.created_at,
                                  })
                                }
                                className="mt-1 cursor-pointer overflow-hidden rounded-xl border border-black/20 group/img relative"
                              >
                                <img
                                  src={msg.media_url}
                                  alt="Shared photo"
                                  className="max-h-72 max-w-full rounded-xl object-cover hover:scale-102 transition duration-200"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white text-xs font-medium transition">
                                  <Maximize2 className="w-5 h-5" />
                                </div>
                              </div>
                            )}

                            {/* Video */}
                            {msg.media_type === 'video' && msg.media_url && (
                              <div className="mt-1 overflow-hidden rounded-xl border border-black/20">
                                <video
                                  src={msg.media_url}
                                  controls
                                  className="max-h-72 max-w-full rounded-xl bg-black"
                                />
                              </div>
                            )}

                            {/* Voice Note Audio */}
                            {msg.media_type === 'audio' && msg.media_url && (
                              <div className="mt-1 flex items-center gap-3 bg-black/30 p-2.5 rounded-xl min-w-56">
                                <audio
                                  ref={(el) => {
                                    if (el) audioRefs.current[msg.id] = el;
                                  }}
                                  src={msg.media_url}
                                  onEnded={() => setActiveAudioId(null)}
                                />

                                <button
                                  type="button"
                                  onClick={() => togglePlayAudio(msg.id)}
                                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition cursor-pointer"
                                >
                                  {activeAudioId === msg.id ? (
                                    <Pause className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-4 h-4 ml-0.5" />
                                  )}
                                </button>

                                <div className="flex-1 flex flex-col">
                                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        activeAudioId === msg.id
                                          ? 'bg-amber-400 animate-pulse w-full'
                                          : 'bg-white/60 w-0'
                                      }`}
                                    />
                                  </div>
                                  <span className="text-[10px] opacity-75 mt-1">Voice note</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => cycleAudioSpeed(msg.id)}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition cursor-pointer"
                                >
                                  {audioSpeed}x
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {/* Read Receipts & Delete message action */}
                        <div className="flex items-center justify-end gap-1.5 mt-1.5 pt-1 text-[10px] opacity-75">
                          {isMe && !isDeleted && (
                            <span title={isRead ? 'Read' : 'Delivered'}>
                              {isRead ? (
                                <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </span>
                          )}

                          {/* Instant delete message button */}
                          {(isMe || isAdmin) && !isDeleted && (
                            <button
                              type="button"
                              onClick={() => deleteMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 hover:text-rose-300 p-0.5 transition cursor-pointer"
                              title="Delete message for all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          );
        })()}

        {/* Realtime Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic px-2 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>{t('typing')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Blocked Contact Warning Banner */}
      {isTargetBlocked && (
        <div className="p-3 bg-rose-950/40 border-t border-rose-900/40 flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-400 shrink-0" />
            <span>You have blocked this contact. Messages and calls are restricted.</span>
          </div>
          <button
            type="button"
            onClick={handleToggleBlockUser}
            className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-200 rounded-lg font-medium transition cursor-pointer shrink-0"
          >
            {t('unblock_user')}
          </button>
        </div>
      )}

      {/* Bottom Message Input Area */}
      <div className="p-2.5 sm:p-4 bg-slate-900 border-t border-slate-800 z-20 pb-safe shrink-0">
        {/* Upload progress indicator */}
        {isUploading && (
          <div className="mb-2 p-2 bg-slate-800 rounded-xl flex items-center gap-3 text-xs text-slate-300">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span>Encrypting and uploading media...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Emoji Quick Bar Popover */}
        {showEmojiPicker && !isTargetBlocked && (
          <div className="absolute bottom-20 left-4 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl flex items-center gap-1.5 z-30">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInputContent((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                className="text-lg hover:scale-125 transition-transform p-1 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Audio Recording Bar OR Standard Message Input */}
        {isRecordingAudio ? (
          <AudioVoiceRecorder
            onCancel={() => setIsRecordingAudio(false)}
            onSendComplete={() => setIsRecordingAudio(false)}
          />
        ) : (
          <div className="flex items-end gap-2">
            {/* Attachment Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              accept="image/*,video/*"
              className="hidden"
            />
            <button
              type="button"
              id="btn-chat-attach-file"
              disabled={isTargetBlocked || isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
              title="Attach Photo / Video (up to 50MB)"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Quick Emoji Button */}
            <button
              type="button"
              disabled={isTargetBlocked}
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
              title="Insert Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Textarea Input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                id="input-chat-message"
                value={inputContent}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isTargetBlocked}
                placeholder={isTargetBlocked ? 'Cannot send messages to blocked contact' : t('type_message')}
                rows={1}
                className="w-full py-2.5 px-3.5 bg-slate-800/90 border border-slate-700/80 rounded-2xl text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none max-h-36 disabled:opacity-40 disabled:cursor-not-allowed transition leading-normal"
              />
            </div>

            {/* Voice Note Button or Send Button */}
            {inputContent.trim() ? (
              <button
                type="button"
                id="btn-chat-send"
                disabled={isTargetBlocked || isUploading}
                onClick={handleSendText}
                className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-lg shadow-cyan-600/30 transition cursor-pointer shrink-0"
                title="Send Message"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                id="btn-chat-record-voice"
                disabled={isTargetBlocked || isUploading}
                onClick={() => setIsRecordingAudio(true)}
                className="p-2.5 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Media Viewer */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          onClose={() => setLightboxMedia(null)}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={
          modalConfig.type === 'clear'
            ? t('clear_chat') + '?'
            : t('delete_chat') + '?'
        }
        description={
          modalConfig.type === 'clear'
            ? `Are you sure you want to delete all messages in ${activeConversation.name}?`
            : `Are you sure you want to permanently delete ${activeConversation.name}?`
        }
        confirmText={modalConfig.type === 'clear' ? t('clear_chat') : t('delete_chat')}
        confirmVariant="danger"
        isLoading={modalConfig.isLoading}
        onConfirm={handleConfirmHeaderAction}
        onClose={() => setModalConfig({ isOpen: false, type: 'clear', isLoading: false })}
      />
    </div>
  );
};
