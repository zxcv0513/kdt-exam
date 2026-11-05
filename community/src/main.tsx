import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from 'react-router';
import { api, errorMessage } from './api';
import { Loading, NotFound } from './components';
import { AuthProvider, ToastProvider, useAuth, useToast } from './context';
import { useTitle } from './hooks';
import { LoginPage, SignupPage } from './pages/AuthPages';
import { ListPage } from './pages/ListPage';
import { DetailPage } from './pages/DetailPage';
import { EditPage, WritePage } from './pages/PostFormPages';
import { SavedPage } from './pages/SavedPage';
import './styles.css';

function Header() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const logout = async () => {
    try {
      await api.logout();
      setUser(null);
      navigate('/');
    } catch (error) {
      toast(errorMessage(error));
    }
  };

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="주 메뉴">
        <Link to="/" className="logo">
          커뮤니티
        </Link>
        {!loading && user && (
          <>
            <NavLink to="/write">글쓰기</NavLink>
            <NavLink to="/saved">저장한 글</NavLink>
            <span className="nickname" title={user.nickname}>
              {user.nickname}
            </span>
            <button type="button" className="link-button" onClick={logout}>
              로그아웃
            </button>
          </>
        )}
        {!loading && !user && (
          <>
            <span className="nav-spacer" />
            <NavLink to="/login">로그인</NavLink>
            <NavLink to="/signup">회원가입</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}

function Layout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);

  // 화면이 바뀐 것을 키보드와 스크린리더 사용자도 알 수 있게 본문으로 포커스를 옮긴다.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      <Header />
      <main className="content" ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  );
}

/**
 * 들어올 때만 로그인을 확인한다. 작성 중에 세션이 만료되어도 화면을 없애지 않아서
 * 입력한 내용이 사라지지 않고, 제출하면 만료 안내를 보여준다.
 */
function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const entered = useRef(false);

  if (loading) return <Loading />;
  if (user) entered.current = true;
  if (!user && !entered.current) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

function RequireGuest() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;
  return <Outlet />;
}

function NotFoundPage() {
  useTitle('없는 페이지');
  return <NotFound />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ListPage /> },
      { path: '/posts/:id', element: <DetailPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/write', element: <WritePage /> },
          { path: '/posts/:id/edit', element: <EditPage /> },
          { path: '/saved', element: <SavedPage /> },
        ],
      },
      {
        element: <RequireGuest />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
