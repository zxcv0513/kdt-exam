import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthenticatedHandler, type User } from './api';

type AuthValue = { user: User | null; loading: boolean; setUser: (user: User | null) => void };

const AuthContext = createContext<AuthValue | null>(null);
const ToastContext = createContext<((message: string) => void) | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthenticatedHandler(() => setUser(null));
    const controller = new AbortController();
    api
      .me(controller.signal)
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const value = useMemo(() => ({ user, loading, setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider가 필요합니다.');
  return value;
}

const TOAST_DURATION_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(''), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message && <div className="toast">{message}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('ToastProvider가 필요합니다.');
  return value;
}
