import React from 'react';
import { MessageSquare, Phone, User, PlusCircle, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useChat } from '../context/ChatContext.tsx';
import { useI18n } from '../i18n.tsx';

interface MobileBottomNavProps {
  currentTab: 'chats' | 'calls' | 'settings';
  onSelectTab: (tab: 'chats' | 'calls' | 'settings') => void;
  onOpenNewChat: () => void;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onOpenCallsModal: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenNewChat,
  onOpenProfile,
  onOpenAdmin,
  onOpenCallsModal,
}) => {
  const { user, isAdmin } = useAuth();
  const { conversations } = useChat();
  const { t } = useI18n();

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Mobile Navigation"
      className="md:hidden w-full bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around z-40 shrink-0 pb-safe shadow-2xl"
    >
      {/* 1. Chats Tab */}
      <button
        type="button"
        id="btn-mobile-nav-chats"
        onClick={() => onSelectTab('chats')}
        className={`min-h-[44px] min-w-[56px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer relative ${
          currentTab === 'chats'
            ? 'text-cyan-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>
        <span className="text-[10px] tracking-tight">{t('all')}</span>
      </button>

      {/* 2. Audio/Video Calls Tab */}
      <button
        type="button"
        id="btn-mobile-nav-calls"
        onClick={() => {
          onSelectTab('calls');
          onOpenCallsModal();
        }}
        className={`min-h-[44px] min-w-[56px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
          currentTab === 'calls'
            ? 'text-cyan-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Phone className="w-5 h-5" />
        <span className="text-[10px] tracking-tight">{t('calls')}</span>
      </button>

      {/* 3. Fast New Chat Button (Prominent Center Action) */}
      <button
        type="button"
        id="btn-mobile-nav-new-chat"
        onClick={onOpenNewChat}
        className="min-h-[44px] min-w-[44px] px-2 flex flex-col items-center justify-center text-cyan-400 hover:text-cyan-300 transition cursor-pointer group"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 group-active:scale-95 transition-transform">
          <PlusCircle className="w-5 h-5" />
        </div>
        <span className="text-[9px] text-slate-300 mt-0.5 font-medium">{t('new_chat_group')}</span>
      </button>

      {/* 4. Admin Panel (If Super Admin) */}
      {isAdmin && (
        <button
          type="button"
          id="btn-mobile-nav-admin"
          onClick={onOpenAdmin}
          className="min-h-[44px] min-w-[56px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-amber-400 hover:text-amber-300 transition cursor-pointer"
        >
          <Shield className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">{t('admin_panel')}</span>
        </button>
      )}

      {/* 5. Profile & Settings Tab */}
      <button
        type="button"
        id="btn-mobile-nav-profile"
        onClick={() => {
          onSelectTab('settings');
          onOpenProfile();
        }}
        className={`min-h-[44px] min-w-[56px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
          currentTab === 'settings'
            ? 'text-cyan-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <img
            src={
              user?.avatar_url ||
              `https://api.dicebear.com/7.x/identicon/svg?seed=${user?.display_name || 'anon'}`
            }
            alt={user?.display_name || 'User'}
            className="w-5 h-5 rounded-full object-cover border border-slate-700"
          />
        </div>
        <span className="text-[10px] tracking-tight">{t('edit_profile')}</span>
      </button>
    </nav>
  );
};

