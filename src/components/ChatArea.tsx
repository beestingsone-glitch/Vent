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
    createConversation,
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
      await sendMessage({
        content: text,
        media_type: 'none',
        timer_seconds: currentTimerSeconds,
      });
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
        timer_seconds: currentTimerSeconds,
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

  const handleDirectChatClick = async (senderId: string, displayName?: string) => {
    if (!user || !senderId || senderId === user.id) return;
    try {
      await createConversation('direct', [user.id, senderId], displayName || 'Direct Chat');
    } catch (err: any) {
      alert(err.message || 'Failed to open direct conversation');
    }
  };

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
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb
