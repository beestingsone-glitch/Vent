/**
 * Safe LocalStorage and Storage Quota Recovery Helper
 * Protects against QuotaExceededError and maintains ultra-lightweight user sessions.
 */

import { AuthUser } from '../types.ts';

// Ephemeral in-memory storage fallback if localStorage is completely locked or unavailable
const memoryFallbackStore: Record<string, string> = {};

// Non-critical cache keys that can be purged if quota is reached
const NON_CRITICAL_CACHE_KEYS = [
  'vent_local_messages_v2',
  'vent_messages',
  'vent_call_history',
  'vent_logs',
  'vent_temp_media',
];

/**
 * Purge non-critical cached data (e.g. old chat messages) to recover storage space.
 */
export function purgeNonCriticalStorage(): void {
  try {
    for (const key of NON_CRITICAL_CACHE_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('Failed during storage cache purge:', err);
  }
}

/**
 * Sanitize user object to ensure only lightweight metadata is stored.
 * Strips out heavy base64 images or bloated properties.
 */
export function sanitizeLightweightUser(user: any): AuthUser {
  if (!user) return user;

  let avatarUrl = user.avatar_url || user.avatarUrl || '';
  // If avatar is an overly large data URL (>20KB), replace with lightweight SVG identicon
  if (typeof avatarUrl === 'string' && avatarUrl.startsWith('data:') && avatarUrl.length > 20000) {
    avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
      user.display_name || user.pseudonym || user.id || 'vent'
    )}`;
  }

  return {
    id: String(user.id || ''),
    email: String(user.email || '').trim().toLowerCase(),
    display_name: String(user.display_name || user.pseudonym || user.name || '').trim(),
    role: user.role === 'admin' ? 'admin' : 'user',
    avatar_url: avatarUrl,
    bio: user.bio ? String(user.bio).slice(0, 200) : '',
    status: user.status || 'online',
  };
}

/**
 * Safe LocalStorage getItem wrapper with in-memory fallback.
 */
export function safeGetItem(key: string): string | null {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
  } catch (err) {
    console.warn(`safeGetItem failed for key "${key}":`, err);
  }
  return memoryFallbackStore[key] ?? null;
}

/**
 * Safe LocalStorage setItem wrapper with QuotaExceededError recovery and in-memory fallback.
 */
export function safeSetItem(key: string, value: string): void {
  // If storing current user session, make sure we sanitize and strip heavy bloat
  let processedValue = value;
  if (key === 'vent_current_user') {
    try {
      const parsed = JSON.parse(value);
      const lightweight = sanitizeLightweightUser(parsed);
      processedValue = JSON.stringify(lightweight);
    } catch {
      // keep original if not JSON
    }
  }

  try {
    localStorage.setItem(key, processedValue);
    // Keep in-memory cache in sync
    memoryFallbackStore[key] = processedValue;
  } catch (err: any) {
    console.warn(`Storage write failed for key "${key}". Initiating quota recovery:`, err);

    // Step 1: Purge non-critical message cache to free quota
    purgeNonCriticalStorage();

    try {
      // Step 2: Retry write
      localStorage.setItem(key, processedValue);
      memoryFallbackStore[key] = processedValue;
      return;
    } catch (retryErr) {
      console.warn(`Retry write for "${key}" also failed. Falling back to in-memory store.`, retryErr);
      // Step 3: Gracefully store in-memory so app does not crash and user can continue
      memoryFallbackStore[key] = processedValue;
    }
  }
}

/**
 * Safe LocalStorage removeItem wrapper.
 */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  delete memoryFallbackStore[key];
}
