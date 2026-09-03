/**
 * Bulletproof API Client & Response Parser
 * Safely parses responses without throwing "Unexpected end of JSON input"
 */

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    // If 204 No Content
    if (res.status === 204) {
      return {
        ok: true,
        status: 204,
        data: null,
      };
    }

    // Read response text first to guard against empty strings and non-JSON
    const text = await res.text();
    if (!text || text.trim().length === 0) {
      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          data: null,
        };
      }
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `Server returned empty response (HTTP ${res.status})`,
      };
    }

    // Attempt JSON parsing if content-type or structure suggests JSON
    if (contentType.includes('application/json') || text.startsWith('{') || text.startsWith('[')) {
      try {
        const json = JSON.parse(text);
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            data: json,
            error: json?.error || json?.message || `Request failed with status ${res.status}`,
          };
        }
        return {
          ok: true,
          status: res.status,
          data: json as T,
        };
      } catch (parseErr) {
        console.warn('safeFetchJson JSON parse error for URL:', url, parseErr);
      }
    }

    // Handle HTML or plain text error responses (e.g. 404 / 502 / proxy errors)
    if (!res.ok) {
      let cleanMsg = `Request failed (HTTP ${res.status})`;
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        if (res.status === 404) cleanMsg = 'Service endpoint not found (404)';
        else if (res.status === 502) cleanMsg = 'Backend server starting up or unreachable (502)';
        else if (res.status === 500) cleanMsg = 'Internal server error (500)';
      } else if (text.length < 200) {
        cleanMsg = text;
      }
      return {
        ok: false,
        status: res.status,
        data: null,
        error: cleanMsg,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: text as any,
    };
  } catch (networkErr: any) {
    console.warn('safeFetchJson network error for URL:', url, networkErr);
    return {
      ok: false,
      status: 0,
      data: null,
      error: networkErr?.message || 'Network connection error or offline',
    };
  }
}
