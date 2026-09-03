import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  User,
  LogOut,
  Flame,
  Globe,
  Download,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { UserStatus } from '../types.ts';
import { useI18n, LANGUAGES, LanguageCode } from '../i18n.tsx';
import { ConfirmModal } from './ConfirmModal.tsx';

interface NavbarProps {
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onOpenNewChat: () => void;
  isAdminViewOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenProfile,
  onOpenAdmin,
  onOpenNewChat,
  isAdminViewOpen,
}) => {
  const { user, logout, panicWipe, updateProfile, isAdmin } = useAuth();
  const { language, setLanguage, t } = useI18n();

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showPanicModal, setShowPanicModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // Show info for browsers without prompt (e.g. Safari iOS)
      alert(t('ios_install_instructions'));
    }
  };

  if (!user) return null;

  const handleStatusChange = async (newStatus: UserStatus) => {
    setShowStatusMenu(false);
    try {
      await updateProfile({ status: newStatus });
    } catch (err) {
      console.error('Failed to change status', err);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500';
      case 'away':
        return 'bg-amber-500';
      case 'busy':
        return 'bg-rose-500';
      default:
        return 'bg-slate-400';
    }
  };

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between select-none z-30 relative shrink-0">
      {/* Brand & Privacy Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-teal-600 to-slate-800 flex items-center justify-center shadow-md shadow-cyan-500/20 text-white font-bold shrink-0">
            <span className="text-xl">💨</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight text-base sm:text-lg">
                {t('app_name')}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400">
              {t('app_tagline')}
            </p>
          </div>
        </div>
      </div>

      {/* Center Action (New Chat shortcut on desktop) */}
      <div className="hidden md:flex items-center gap-2">
        <button
          onClick={onOpenNewChat}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span>{t('new_chat_group')}</span>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* PWA Install Button */}
        {!isInstalled && (
          <button
            onClick={handleInstallApp}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer"
            title={t('install_pwa_title')}
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">{t('install_app')}</span>
          </button>
        )}

        {/* Panic Wipe Emergency Button */}
        <button
          onClick={() => setShowPanicModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40 text-xs font-semibold transition cursor-pointer shadow-sm hover:shadow-rose-500/20"
          title={t('panic_button')}
        >
          <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          <span className="hidden sm:inline">{t('panic_button')}</span>
        </button>

        {/* Language Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer"
            title={t('select_language')}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs uppercase">{currentLang.code}</span>
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('language')}
              </div>
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLanguage(l.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                    language === l.code
                      ? 'bg-cyan-950/70 text-cyan-300 font-semibold'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{l.flag}</span>
                    <span>{l.nativeName}</span>
                  </span>
                  {language === l.code && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Super Admin Control Panel Button (Exclusively for beestingsone@gmail.com) */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
              isAdminViewOpen
                ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/30'
                : 'bg-purple-950/50 text-purple-300 border-purple-500/30 hover:bg-purple-900/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-300" />
            <span className="hidden lg:inline">{t('admin_panel')}</span>
          </button>
        )}

        {/* User Presence & Profile Button */}
        <div className="relative">
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="relative group cursor-pointer focus:outline-none"
              title="Change presence status"
            >
              <img
                src={
                  user.avatar_url ||
                  `https://api.dicebear.com/7.x/identicon/svg?seed=${user.display_name}`
                }
                alt={user.display_name}
                className="w-9 h-9 rounded-full object-cover border border-slate-700 bg-slate-800"
              />
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${getStatusColor(
                  user.status
                )}`}
              />
            </button>

            <button
              onClick={onOpenProfile}
              className="text-left hidden lg:block hover:opacity-80 transition cursor-pointer"
            >
              <div className="text-xs font-semibold text-white leading-tight flex items-center gap-1.5">
                <span>{user.display_name}</span>
                {isAdmin && (
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Owner
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 capitalize">
                {t((user.status || 'online') as any)}
              </div>
            </button>
          </div>

          {showStatusMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('set_presence')}
              </div>
              <button
                onClick={() => handleStatusChange('online')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                {t('online')}
              </button>
              <button
                onClick={() => handleStatusChange('away')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                {t('away')}
              </button>
              <button
                onClick={() => handleStatusChange('busy')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                {t('busy')}
              </button>
              <button
                onClick={() => handleStatusChange('offline')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                {t('offline')}
              </button>

              <div className="my-1 border-t border-slate-800" />

              <button
                onClick={() => {
                  setShowStatusMenu(false);
                  onOpenProfile();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-cyan-300 flex items-center gap-2 transition cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                {t('edit_profile')}
              </button>

              <button
                onClick={() => {
                  setShowStatusMenu(false);
                  logout();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-rose-950/50 text-rose-300 flex items-center gap-2 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Panic Modal */}
      <ConfirmModal
        isOpen={showPanicModal}
        title={t('panic_wipe_confirm_title')}
        description={t('panic_wipe_confirm_desc')}
        confirmText={t('panic_button')}
        confirmVariant="danger"
        isLoading={false}
        onConfirm={() => {
          setShowPanicModal(false);
          panicWipe();
        }}
        onClose={() => setShowPanicModal(false)}
      />
    </header>
  );
};

