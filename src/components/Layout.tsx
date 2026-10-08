import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ClipboardList, 
  BookOpen, 
  Settings, 
  Home, 
  Menu, 
  Bell, 
  Search, 
  LogOut, 
  CalendarDays, 
  Users,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNetworkStatus } from '../serviceWorkerRegistration';
import { bootstrapAuthenticatedUser, getActiveDevUser, getAuthenticatedUser, logoutUser, canUserManageUsers, isUserLoggedIn, type DemoUserOption } from '../lib/api';
import { SplashScreen } from './SplashScreen';
import { LoginPage } from '../features/auth/LoginPage';
import { PasswordChangeModal } from '../features/auth/PasswordChangeModal';
import { Avatar } from './ui/primitives';
import { roleLabel } from './ui/tokens';
import { PwaInstallPrompt } from './PwaInstallPrompt';

const isTestEnv =
  (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST))) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  match?: string[];
}


// Mobile bottom navigation (termasuk menu Ekspor Data langsung)
const MOBILE_NAV: NavItem[] = [
  { name: 'Beranda', href: '/', icon: Home },
  { name: 'Audit', href: '/audits', icon: ClipboardList, match: ['/audits', '/cycles', '/comparisons', '/findings'] },
  { name: 'Ekspor', href: '/export', icon: FileSpreadsheet, match: ['/export', '/reports'] },
  { name: 'Master', href: '/master', icon: BookOpen },
  { name: 'Lainnya', href: '/more', icon: Menu, match: ['/more', '/status', '/users'] },
];

export const Layout: React.FC = () => {
  const [showSplash, setShowSplash] = useState(false);
  const [loggedIn, setLoggedIn] = useState(() => isTestEnv || isUserLoggedIn());
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [activeUser, setActiveUserState] = useState(getActiveDevUser());
  const [search, setSearch] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('qas_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const location = useLocation();
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();

  const handleFinishSplash = React.useCallback(() => {
    setShowSplash(false);
  }, []);

  useEffect(() => {
    if (isTestEnv) return;
    let mounted = true;
    bootstrapAuthenticatedUser()
      .then((user) => {
        if (!mounted) return;
        setLoggedIn(Boolean(user));
        if (user) setActiveUserState(user);
      })
      .catch((err) => {
        console.warn('Bootstrap auth check:', err);
      })
      .finally(() => {
        if (!mounted) return;
        setCheckingAuth(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('qas_sidebar_collapsed', String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Listen to role and auth changes
  useEffect(() => {
    const handleAuthOrRoleChanged = () => {
      const authenticated = getAuthenticatedUser();
      setLoggedIn(Boolean(authenticated) || isTestEnv);
      if (authenticated) setActiveUserState(authenticated);
    };
    window.addEventListener('qas-role-changed', handleAuthOrRoleChanged);
    window.addEventListener('qas-auth-changed', handleAuthOrRoleChanged);
    return () => {
      window.removeEventListener('qas-role-changed', handleAuthOrRoleChanged);
      window.removeEventListener('qas-auth-changed', handleAuthOrRoleChanged);
    };
  }, []);

  const isActive = (item: NavItem) => {
    if (item.href === '/') return location.pathname === '/';
    const prefixes = item.match || [item.href];
    return prefixes.some((p) => location.pathname.startsWith(p));
  };

  const handleLogout = async () => {
    await logoutUser();
    setLoggedIn(false);
    navigate('/', { replace: true });
  };

  const handleLoginSuccess = (user: DemoUserOption) => {
    setActiveUserState(user);
    setLoggedIn(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/audits?q=${encodeURIComponent(q)}` : '/audits');
  };

  // 1. Splash screen
  if (showSplash) {
    return <SplashScreen onFinish={handleFinishSplash} durationMs={650} />;
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs font-semibold text-slate-500">
        Memeriksa sesi aman...
      </div>
    );
  }

  // 2. Authentication guard: login first (no registration)
  if (!loggedIn) {
    return (
      <div className="min-h-screen w-full bg-[#F4F6F9] overflow-y-auto">
        <PwaInstallPrompt />
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (activeUser.profile.mustChangePassword) {
    return (
      <div className="h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-4">
        <PasswordChangeModal 
          onSuccess={handleLoginSuccess} 
          userEmail={activeUser.profile.email} 
          onClose={handleLogout}
        />
      </div>
    );
  }

  const fullName = activeUser.profile.fullName;
  const role = roleLabel(activeUser.profile.primaryRole);
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const isHome = location.pathname === '/';

  const canManageUsers = canUserManageUsers(activeUser);
  const desktopNav: NavItem[] = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Audit', href: '/audits', icon: ClipboardList, match: ['/audits', '/cycles', '/comparisons', '/findings'] },
    { name: 'Ekspor Data', href: '/export', icon: FileSpreadsheet, match: ['/export', '/reports'] },
    { name: 'Master Soal', href: '/master', icon: BookOpen },
    ...(canManageUsers ? [{ name: 'Pengguna', href: '/users', icon: Users, match: ['/users'] }] : []),
    { name: 'Sistem', href: '/status', icon: Settings },
  ];

  return (
    <div className="h-[100dvh] max-h-[100dvh] flex bg-brand-bg text-brand-ink overflow-hidden overflow-x-hidden w-full max-w-full font-sans antialiased">
      {/* ===================== Sidebar (web) ===================== */}
      <aside 
        className={`hidden lg:flex flex-shrink-0 flex-col bg-white border-r border-brand-line transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-[68px]' : 'w-[224px]'
        }`}
      >
        {/* Header Sidebar: Logo & Toggle Button */}
        <div className={`h-16 flex items-center border-b border-brand-line/40 transition-all ${
          isCollapsed ? 'justify-center px-1' : 'justify-between px-4'
        }`}>
          <Link to="/" aria-label="QAS Quality Assurance System" className="flex items-center overflow-hidden">
            <div className={isCollapsed ? 'text-center' : ''}>
              <p className="text-lg font-extrabold text-slate-900 leading-none">QAS</p>
              {!isCollapsed && (
                <p className="text-[9px] font-semibold text-slate-500 mt-1">Quality Assurance System</p>
              )}
            </div>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Perluas Menu Navigator' : 'Perkecil Menu Navigator (Ikon Saja)'}
            aria-label={isCollapsed ? 'Perluas Menu Navigator' : 'Perkecil Menu Navigator'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-ink hover:bg-slate-100 transition-colors"
          >
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Menu Navigasi Sidebar */}
        <nav aria-label="Navigasi Utama" className="flex-1 px-2.5 pt-3 space-y-1 overflow-y-auto qas-scroll">
          {desktopNav.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <div key={item.name} className="relative group">
                <Link
                  to={item.href}
                  className={`flex items-center ${
                    isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
                  } min-h-[42px] rounded-xl text-[13px] font-semibold transition-colors ${
                    active ? 'bg-brand-redSoft text-brand-red' : 'text-slate-600 hover:bg-slate-50 hover:text-brand-ink'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active ? 2.4 : 2} />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>

                {/* Floating Tooltip saat Navigator Dikecilkan (Hover Popup) */}
                {isCollapsed && (
                  <div className="absolute left-[60px] top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-1.5">
                      <span>{item.name}</span>
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-solid border-r-slate-900 border-r-4 border-y-transparent border-y-4 border-l-0" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Profil Pengguna Bawah Sidebar */}
        <div className="p-2.5 border-t border-brand-line">
          {!isCollapsed ? (
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-50/70 border border-slate-100">
              <Avatar name={fullName} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-brand-ink truncate">{fullName}</p>
                <p className="text-[10px] text-brand-muted truncate">{role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Keluar"
                aria-label="Keluar"
                className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-red hover:bg-brand-redSoft transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                <Avatar name={fullName} />
                <div className="absolute left-[52px] top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                    <p className="font-bold">{fullName}</p>
                    <p className="text-[10px] text-slate-300">{role}</p>
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-solid border-r-slate-900 border-r-4 border-y-transparent border-y-4 border-l-0" />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Keluar dari akun"
                aria-label="Keluar"
                className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-red hover:bg-brand-redSoft transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ===================== Main column ===================== */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* PWA Persistent Install Prompt (Always appears when accessing via browser) */}
        <PwaInstallPrompt />

        {!isOnline && (
          <div className="bg-amber-500 text-white text-[11px] sm:text-xs px-3 py-1 text-center font-semibold flex-shrink-0">
            Mode Offline: draft tersimpan lokal dan disinkronkan saat online.
          </div>
        )}

        {/* Topbar (web) */}
        <header className="hidden lg:flex h-16 flex-shrink-0 items-center justify-between gap-4 px-6 bg-white/80 backdrop-blur border-b border-brand-line">
          <form onSubmit={handleSearch} className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari audit, judul, atau kode..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-brand-bg border border-brand-line text-xs text-brand-ink placeholder-slate-400 outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
            />
          </form>
          <div className="flex items-center gap-4">
            <span className="hidden xl:flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarDays className="w-4 h-4" />
              {today}
            </span>
            <Link
              to="/more?notifications=1"
              aria-label="Notifikasi"
              title="Notifikasi"
              className="w-9 h-9 inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <Bell className="w-[18px] h-[18px]" />
            </Link>
            <Link to="/more" className="flex items-center gap-2 pl-1">
              <Avatar name={fullName} size="sm" />
              <span className="text-xs font-semibold text-brand-ink max-w-[140px] truncate">{fullName}</span>
            </Link>
          </div>
        </header>

        {/* Header (mobile) — Beranda only; other pages render their own PageHeader */}
        {isHome && (
          <header className="lg:hidden flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-1 bg-white">
            <Link to="/" aria-label="QAS Quality Assurance System">
              <p className="text-base font-extrabold text-slate-900 leading-none">QAS</p>
              <p className="text-[8px] font-semibold text-slate-500 mt-0.5">Quality Assurance System</p>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to="/more?notifications=1"
                aria-label="Notifikasi"
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
              >
                <Bell className="w-5 h-5" />
              </Link>
              <Link to="/more" aria-label="Profil">
                <Avatar name={fullName} size="sm" className="!bg-brand-navy" />
              </Link>
            </div>
          </header>
        )}

        {/* Page content — strict responsive container */}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col w-full mx-auto max-w-[1440px] px-2.5 pt-2 pb-1 sm:px-4 sm:pt-3 sm:pb-2 lg:px-6 lg:pt-5 lg:pb-5 animate-fade-up">
          <Outlet />
        </main>

        {/* Bottom navigation (mobile) */}
        <nav
          aria-label="Navigasi Bawah Mobile"
          className="lg:hidden flex-shrink-0 h-16 bg-white border-t border-brand-line flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)] z-40"
        >
          {MOBILE_NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[56px] text-[10px] font-semibold transition-colors ${
                  active ? 'text-brand-red' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 1.9} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
