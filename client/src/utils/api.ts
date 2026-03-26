import { API_URL } from '../config';

type FetchOptions = RequestInit & {
  token?: string | null;
  onUnauthorized?: () => void;
};

export async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const { token, onUnauthorized, method, body, headers: inputHeaders, ...rest } = options;

  const headers: HeadersInit = {};

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const hasContentType = (() => {
    if (!inputHeaders) return false;
    if (inputHeaders instanceof Headers) {
      return inputHeaders.has('Content-Type') || inputHeaders.has('content-type');
    }
    if (Array.isArray(inputHeaders)) {
      return inputHeaders.some(([k]) => k.toLowerCase() === 'content-type');
    }
    return Object.keys(inputHeaders).some((k) => k.toLowerCase() === 'content-type');
  })();

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isGetLike = !method || ['GET', 'HEAD'].includes(method.toUpperCase());

  if (!hasContentType && body && !isFormData && !isGetLike) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    body,
    headers: { ...(inputHeaders || {}), ...headers },
    ...rest,
  });

  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login?expired=1';
    }
  }

  return res;
}
