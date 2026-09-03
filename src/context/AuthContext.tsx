import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser, UserStatus } from '../types.ts';
import {
  initLocalStore,
  localLogin,
  localSignup,
  localGetMe,
  localUpdateProfile,
  localResetPassword,
  localPanicWipe,
} from '../lib/localStore.ts';
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  sanitizeLightweightUser,
} from '../utils/storage.ts';

const LOCAL_CURRENT_USER_KEY = 'vent_current_user';
const TOKEN_KEY = 'chat_token';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isLocalMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    password: string;
    display_name: string;
    avatar_url?: string;
    bio?: string;
  }) => Promise<void>;
  resetPassword: (email: string, newPassword: string) => Promise<void>;
  logout: () => void;
  panicWipe: () => void;
  updateProfile: (updates: {
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    status?: UserStatus;
  }) => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 1. Initial State from safe storage for instant auto-login & persistence
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      initLocalStore();
      const rawUser = safeGetItem(LOCAL_CURRENT_USER_KEY);
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed && parsed.id) return sanitizeLightweightUser(parsed);
      }
      const savedToken = safeGetItem(TOKEN_KEY);
      if (savedToken) {
        const restored = localGetMe(savedToken);
        if (restored) {
          const lightweight = sanitizeLightweightUser(restored);
          safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweight));
          return lightweight;
        }
      }
    } catch (e) {
      console.error('Failed to restore auth session from storage:', e);
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    const savedToken = safeGetItem(TOKEN_KEY);
    if (savedToken) return savedToken;
    if (user) {
      const generated = 'local-jwt-' + btoa(JSON.stringify({ id: user.id, email: user.email }));
      safeSetItem(TOKEN_KEY, generated);
      return generated;
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isLocalMode = true;

  // Verify persistence on initial load
  useEffect(() => {
    initLocalStore();
    try {
      const rawUser = safeGetItem(LOCAL_CURRENT_USER_KEY);
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed && parsed.id) {
          const lightweight = sanitizeLightweightUser(parsed);
          setUser(lightweight);
          const activeToken =
            safeGetItem(TOKEN_KEY) ||
            'local-jwt-' + btoa(JSON.stringify({ id: lightweight.id, email: lightweight.email }));
          setToken(activeToken);
          safeSetItem(TOKEN_KEY, activeToken);
        }
      }
    } catch {
      // ignore
    }
    setIsLoading(false);
  }, []);

  // 100% Client-Side Pure Browser Sign In
  const login = async (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPass = password.trim();
    const result = localLogin(trimmedEmail, trimmedPass);
    const lightweight = sanitizeLightweightUser(result.user);
    safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweight));
    safeSetItem(TOKEN_KEY, result.token);
    setUser(lightweight);
    setToken(result.token);
  };

  // 100% Client-Side Pure Browser Sign Up / Pseudonym Creation
  const signup = async (data: {
    email: string;
    password: string;
    display_name: string;
    avatar_url?: string;
    bio?: string;
  }) => {
    const payload = {
      ...data,
      email: data.email.trim().toLowerCase(),
      password: data.password.trim(),
      display_name: data.display_name.trim(),
    };
    const result = localSignup(payload);
    const lightweight = sanitizeLightweightUser(result.user);
    safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweight));
    safeSetItem(TOKEN_KEY, result.token);
    setUser(lightweight);
    setToken(result.token);
  };

  // Direct Action Password Reset with immediate automatic sign-in
  const resetPassword = async (email: string, newPassword: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPass = newPassword.trim();
    const result = localResetPassword(trimmedEmail, trimmedPass);
    const lightweight = sanitizeLightweightUser(result.user);
    safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweight));
    safeSetItem(TOKEN_KEY, result.token);
    setUser(lightweight);
    setToken(result.token);
  };

  // Sign Out
  const logout = () => {
    safeRemoveItem(LOCAL_CURRENT_USER_KEY);
    safeRemoveItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
  };

  // Emergency Panic Wipe
  const panicWipe = () => {
    localPanicWipe();
    setUser(null);
    setToken(null);
  };

  // Pure Client Profile Update
  const updateProfile = async (updates: {
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    status?: UserStatus;
  }) => {
    if (!user) return;
    const updated = localUpdateProfile(user.id, updates);
    const lightweight = sanitizeLightweightUser(updated);
    safeSetItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(lightweight));
    setUser(lightweight);
  };

  const isAdmin = user?.email?.toLowerCase() === 'beestingsone@gmail.com' && user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isLocalMode,
        login,
        signup,
        resetPassword,
        logout,
        panicWipe,
        updateProfile,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
