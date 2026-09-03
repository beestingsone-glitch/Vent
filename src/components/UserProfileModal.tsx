import React, { useState, useRef } from 'react';
import { X, User, Lock, Save, CheckCircle2, Globe, Upload, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { UserStatus } from '../types.ts';
import { resizeAndCompressAvatar } from '../lib/imageUtils.ts';
import { useI18n, LANGUAGES, LanguageCode } from '../i18n.tsx';

interface UserProfileModalProps {
  onClose: () => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ onClose }) => {
  const { user, updateProfile, logout } = useAuth();
  const { language, setLanguage, t } = useI18n();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || AVATAR_PRESETS[0]);
  const [bio, setBio] = useState(user?.bio || '');
  const [status, setStatus] = useState<UserStatus>(user?.status || 'online');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [compressionNotice, setCompressionNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!user) return null;

  const handleAvatarFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    setIsUploading(true);
    setError(null);
    setCompressionNotice(null);

    try {
      // Client-side automatic resizing and compression (<10KB)
      const compressedDataUrl = await resizeAndCompressAvatar(file, 96, 0.6);
      setAvatarUrl(compressedDataUrl);
      setCompressionNotice(t('compression_notice'));
    } catch (err: any) {
      console.error('Avatar upload/compression error:', err);
      setError('Failed to process and compress avatar. Reverting to preset.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateProfile({
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
        bio: bio.trim(),
        status,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('edit_profile')}</h2>
              <p className="text-xs text-slate-400">{t('zero_knowledge_box_title')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t('saved')}</span>
            </div>
          )}

          {compressionNotice && (
            <div className="p-2.5 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>{compressionNotice}</span>
            </div>
          )}

          {/* Real Email - Locked & Private */}
          <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-xl">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                {t('account_email')}
              </span>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded font-mono">
                {t('confidential')}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-300 truncate">
              {user.email}
            </div>
          </div>

          {/* Public Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>{t('display_name_label')}</span>
              <span className="text-[10px] text-emerald-400">{t('public_visible')}</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('display_name_placeholder')}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Avatar Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                {t('choose_avatar')}
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>{isUploading ? 'Compressing...' : 'Upload Custom'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatarFileUpload(f);
                }}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {AVATAR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(preset)}
                  className={`relative rounded-full p-0.5 transition cursor-pointer shrink-0 ${
                    avatarUrl === preset
                      ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-slate-900 scale-105'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={preset}
                    alt={`Preset ${idx + 1}`}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  {avatarUrl === preset && (
                    <div className="absolute bottom-0 right-0 bg-cyan-600 rounded-full p-0.5 text-white">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Language Selector in Profile */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('language')}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                    language === lang.code
                      ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                  </span>
                  {language === lang.code && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>{t('bio_label')}</span>
              <span className="text-[10px] text-slate-500">{t('public_visible')}</span>
            </label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('bio_placeholder')}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>

          {/* Status Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t('set_presence')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['online', 'away', 'busy', 'offline'] as UserStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center gap-2 transition capitalize cursor-pointer ${
                    status === st
                      ? 'bg-cyan-950/60 border-cyan-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      st === 'online'
                        ? 'bg-emerald-500'
                        : st === 'away'
                        ? 'bg-amber-500'
                        : st === 'busy'
                        ? 'bg-rose-500'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>{t(st as any)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Account Security & Sign Out */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onClose();
                logout();
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-2 transition cursor-pointer min-h-[40px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('logout')}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer min-h-[40px]"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? '...' : t('save_changes')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

