import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  User,
  Mail,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowLeft,
  Key,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { compressAvatar } from '../utils/imageUtils.ts';

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

export const AuthView: React.FC = () => {
  const { login, signup, resetPassword } = useAuth();
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot_password'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_PRESETS[0]);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  const [isCompressingAvatar, setIsCompressingAvatar] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle custom profile picture upload with auto-compression (<10KB)
  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingAvatar(true);
      setError(null);
      const compressed = await compressAvatar(file, 96, 0.6);
      if (compressed) {
        setSelectedAvatar(compressed);
        setCustomAvatarPreview(compressed);
      }
    } catch (err: any) {
      console.warn('Avatar compression failed:', err);
      setError('Could not process selected image. Please try another.');
    } finally {
      setIsCompressingAvatar(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanNewPassword = newPassword.trim();
    const cleanConfirmPassword = confirmPassword.trim();
    const cleanDisplayName = displayName.trim();

    try {
      if (authMode === 'signup') {
        if (!cleanEmail) {
          throw new Error('Please enter a valid email address.');
        }
        if (!cleanDisplayName) {
          throw new Error('Please choose a public display name / pseudonym.');
        }
        if (cleanPassword.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        // Ensure avatar is compact before saving
        let finalAvatar = selectedAvatar;
        if (finalAvatar.startsWith('data:') && finalAvatar.length > 20000) {
          finalAvatar = await compressAvatar(finalAvatar, 96, 0.6);
        }

        await signup({
          email: cleanEmail,
          password: cleanPassword,
          display_name: cleanDisplayName,
          avatar_url: finalAvatar,
          bio: bio.trim(),
        });
      } else if (authMode === 'signin') {
        if (!cleanEmail) {
          throw new Error('Please enter your registered email address.');
        }
        if (!cleanPassword) {
          throw new Error('Please enter your password.');
        }
        await login(cleanEmail, cleanPassword);
      } else if (authMode === 'forgot_password') {
        if (!cleanEmail) {
          throw new Error('Please enter your registered account email.');
        }
        if (cleanNewPassword.length < 6) {
          throw new Error('New password must be at least 6 characters.');
        }
        if (cleanNewPassword !== cleanConfirmPassword) {
          throw new Error('New passwords do not match. Please re-check.');
        }
        // Direct password reset & auto sign-in
        await resetPassword(cleanEmail, cleanNewPassword);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-8 sm:py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Ambient Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-800/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10 px-4 sm:px-0">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 via-teal-600 to-slate-800 shadow-xl shadow-cyan-500/20 text-white mb-4">
          <span className="text-3xl">💨</span>
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Vent
        </h2>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto font-medium">
          Let it out. Let it vanish. Real-time encrypted messaging and live audio/video calling.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        {/* Main Card */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 py-7 px-5 shadow-2xl rounded-2xl sm:px-10">
          {/* Privacy Guarantee Box */}
          <div className="mb-5 p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-cyan-300 block mb-0.5">
                Zero-Knowledge Pseudonym Architecture
              </span>
              Your email and credentials are encrypted securely in private storage and never exposed in chat rooms or searches. Other members only interact with your chosen pseudonym.
            </div>
          </div>

          {/* Toggle Tabs (Only shown when not in forgot password mode) */}
          {authMode !== 'forgot_password' ? (
            <div className="flex rounded-xl bg-slate-800/80 p-1 mb-5 border border-slate-700/60">
              <button
                type="button"
                id="tab-btn-signin"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className={`w-1/2 py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                  authMode === 'signin'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                id="tab-btn-signup"
                onClick={() => {
                  setAuthMode('signup');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className={`w-1/2 py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Pseudonym
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Reset Account Password</h3>
              </div>
              <button
                type="button"
                id="btn-back-to-signin"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="mb-5 p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{error}</span>
                {error.includes("Account not found") && authMode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setError(null);
                    }}
                    className="block mt-1 text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer"
                  >
                    Click here to Create Pseudonym
                  </button>
                )}
                {error.includes("Invalid password") && authMode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot_password');
                      setError(null);
                    }}
                    className="block mt-1 text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer"
                  >
                    Click here to Reset Password
                  </button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {/* Sign Up Specific Fields */}
            {authMode === 'signup' && (
              <>
                {/* Public Display Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Public Display Name (Pseudonym)</span>
                    <span className="text-[10px] text-cyan-400 font-normal">
                      Publicly visible
                    </span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      id="input-signup-display-name"
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. ShadowRaven, CipherFox"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Avatar Selector & Compressed Image Upload */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Choose Profile Avatar
                    </label>
                    <label className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      <span>{isCompressingAvatar ? 'Optimizing...' : 'Upload Custom'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCustomAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    {/* Custom upload thumbnail if chosen */}
                    {customAvatarPreview && (
                      <button
                        type="button"
                        onClick={() => setSelectedAvatar(customAvatarPreview)}
                        className={`relative rounded-full p-0.5 transition cursor-pointer shrink-0 ${
                          selectedAvatar === customAvatarPreview
                            ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-slate-900 scale-105'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={customAvatarPreview}
                          alt="Custom Avatar"
                          className="w-10 h-10 rounded-full object-cover border border-cyan-500"
                        />
                        {selectedAvatar === customAvatarPreview && (
                          <div className="absolute bottom-0 right-0 bg-cyan-600 rounded-full p-0.5 text-white">
                            <CheckCircle2 className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    )}

                    {AVATAR_PRESETS.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedAvatar(url)}
                        className={`relative rounded-full p-0.5 transition cursor-pointer shrink-0 ${
                          selectedAvatar === url
                            ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-slate-900 scale-105'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Avatar ${i + 1}`}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        {selectedAvatar === url && (
                          <div className="absolute bottom-0 right-0 bg-cyan-600 rounded-full p-0.5 text-white">
                            <CheckCircle2 className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Bio */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Bio / Status (Optional)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Public</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 pt-2.5 pointer-events-none text-slate-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <textarea
                      id="input-signup-bio"
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="e.g. Cypherpunk & zero-knowledge enthusiast"
                      className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition resize-none"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email Address (Always normalized) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Account Email Address</span>
                <span className="text-[10px] text-cyan-400 font-medium flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Confidential
                </span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="input-auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@domain.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Sign-In / Sign-Up Password Field */}
            {authMode !== 'forgot_password' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      id="btn-forgot-password"
                      onClick={() => {
                        setAuthMode('forgot_password');
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition cursor-pointer font-medium"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="input-auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Password Reset Specific Fields */}
            {authMode === 'forgot_password' && (
              <>
                {/* New Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      id="input-reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      id="input-reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={isLoading || isCompressingAvatar}
              className="w-full mt-2 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-cyan-600/25 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              {isLoading ? (
                <span>Verifying credentials...</span>
              ) : isCompressingAvatar ? (
                <span>Optimizing avatar...</span>
              ) : (
                <>
                  <span>
                    {authMode === 'signup'
                      ? 'Create Pseudonymous Account'
                      : authMode === 'forgot_password'
                      ? 'Reset & Sign In Immediately'
                      : 'Sign In Securely'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
