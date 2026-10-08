import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  ShieldCheck, 
  Bell, 
  Settings, 
  HelpCircle, 
  Info, 
  LogOut, 
  ChevronRight, 
  Building2,
  Users,
  X,
  CheckCircle2,
  Sparkles,
  Smartphone,
  Server,
  Lock,
  Mail,
  RefreshCw,
  Download,
  Trash2,
  Eye
} from 'lucide-react';
import { apiFetch, getActiveDevUser, logoutUser, canUserManageUsers } from '../../lib/api';
import { Avatar } from '../../components/ui/primitives';

interface AppNotification {
  id: string;
  audit_id?: string;
  type: 'INFO' | 'DEADLINE' | 'COMPLETED';
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export const MoreProfilePage: React.FC = () => {
  const activeUser = getActiveDevUser();
  const navigate = useNavigate();
  const canManageUsers = canUserManageUsers(activeUser);
  const [activeModal, setActiveModal] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).has('notifications') ? 'notifications' : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pwaAvailable, setPwaAvailable] = useState(
    () => sessionStorage.getItem('qas_pwa_install_available') === 'true'
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    const result = await apiFetch<AppNotification[]>('/api/notifications');
    if (result.success && Array.isArray(result.data)) {
      setNotifications(result.data);
    } else {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const onAvailability = (event: Event) => {
      setPwaAvailable(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener('qas-pwa-availability', onAvailability);
    return () => window.removeEventListener('qas-pwa-availability', onAvailability);
  }, [loadNotifications]);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/', { replace: true });
  };

  const handleClearCacheAndReload = () => {
    setIsRefreshing(true);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((item) => Boolean(item && !item.read_at)).length
    : 0;

  const menuItems = [
    { id: 'profile', icon: User, label: 'Profil Saya', hint: activeUser.profile.email },
    { id: 'auth', icon: ShieldCheck, label: 'Sesi & Hak Akses', hint: activeUser.profile.primaryRole },
    ...(canManageUsers
      ? [{ id: 'users', icon: Users, label: 'Kelola Pengguna', hint: 'Tambah, Ubah & Hapus', href: '/users' }]
      : []),
    { id: 'notifications', icon: Bell, label: 'Notifikasi', badge: String(unreadCount) },
    ...(pwaAvailable ? [{ id: 'install_pwa', icon: Download, label: 'Pasang Aplikasi (PWA)' }] : []),
    { id: 'settings', icon: Settings, label: 'Pengaturan Aplikasi' },
    { id: 'help', icon: HelpCircle, label: 'Bantuan & Panduan' },
    { id: 'about', icon: Info, label: 'Tentang Aplikasi', hint: 'v1.0.0-rc1' },
  ];

  const primaryRoleLabel =
    activeUser.profile.primaryRole === 'AUDITOR_QAS'
      ? 'Auditor QAS'
      : activeUser.profile.primaryRole === 'ADMIN'
      ? 'Admin Lead'
      : 'PIC QAS Gudang';

  return (
    <div className="h-full flex flex-col justify-between overflow-hidden gap-3 bg-white rounded-2xl border border-brand-line p-3 sm:p-5 shadow-card max-w-lg mx-auto w-full relative">
      {/* 1. Header: Profil Card */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-brand-line flex items-center gap-3.5 flex-shrink-0">
        <Avatar name={activeUser.profile.fullName} size="lg" className="!bg-brand-navy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-extrabold text-brand-ink truncate">
              {activeUser.profile.fullName}
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Aktif
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-600 mt-0.5">
            {primaryRoleLabel}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-brand-muted mt-0.5">
            <Building2 className="w-3 h-3 text-slate-400" />
            <span className="truncate">
              Gudang {activeUser.depotName || 'Karawang'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Menu Items List */}
      <div className="flex-1 min-h-0 overflow-y-auto qas-scroll divide-y divide-brand-line border-y border-brand-line">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => {
                if ('href' in item && item.href) {
                  navigate(item.href);
                } else if (item.id === 'install_pwa') {
                  window.dispatchEvent(new Event('qas-request-pwa-install'));
                } else {
                  setActiveModal(item.id);
                  if (item.id === 'notifications') void loadNotifications();
                }
              }}
              className="py-3.5 px-2 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer text-xs rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-800 truncate text-sm">{item.label}</span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {item.hint && (
                  <span className="text-[11px] text-slate-400 hidden sm:inline-block">
                    {item.hint}
                  </span>
                )}
                {item.badge && item.badge !== '0' && (
                  <span className="w-5 h-5 rounded-full bg-brand-red text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                    {item.badge}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Tombol Keluar */}
      <div className="flex-shrink-0 pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full py-3 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-brand-red text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-xs active:scale-[0.99]"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar dari Akun</span>
        </button>
      </div>

      {/* MODAL INTERAKTIF: PROFIL SAYA */}
      {activeModal === 'profile' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-brand-line overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-brand-line flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-brand-navy" />
                <h3 className="font-extrabold text-sm sm:text-base text-brand-ink">Profil Pengguna</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-brand-line">
                <Avatar name={activeUser.profile.fullName} size="lg" className="!bg-brand-navy flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-extrabold text-sm text-brand-ink truncate">{activeUser.profile.fullName}</div>
                  <div className="text-slate-500 truncate text-[11px]">{activeUser.profile.email}</div>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                    {primaryRoleLabel}
                  </span>
                </div>
              </div>
              <div className="space-y-2 border-t border-brand-line pt-3">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">ID Pengguna</span>
                  <span className="font-mono font-bold text-slate-800">{activeUser.profile.id}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Penugasan Depo</span>
                  <span className="font-bold text-slate-800">{activeUser.depotName || 'Depo Karawang (KRW)'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Status Autentikasi</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Terverifikasi SSO
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Database Terdaftar</span>
                  <span className="font-bold text-slate-800">Cloudflare D1 (APAC)</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-brand-line bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-brand-navy hover:bg-slate-800 text-white font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INTERAKTIF: SESI & HAK AKSES */}
      {activeModal === 'auth' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-brand-line overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-brand-line flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-sm sm:text-base text-brand-ink">Sesi & Hak Akses (RBAC)</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 overflow-y-auto text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-1">
                <div className="font-extrabold text-xs flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" /> Otorisasi Server Aktif (Zero Client Trust)
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Hak akses diverifikasi deterministik di Edge Server Cloudflare Workers dan tersimpan di database D1.
                </p>
              </div>
              <div className="space-y-2">
                <div className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">Matriks Akses Pengguna</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-brand-line">
                    <span className="text-slate-700 font-medium">Input Self Audit</span>
                    <span className="font-bold text-emerald-600">Diizinkan</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-brand-line">
                    <span className="text-slate-700 font-medium">Input Official Audit</span>
                    <span className={`font-bold ${activeUser.profile.primaryRole !== 'PIC_QAS' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {activeUser.profile.primaryRole !== 'PIC_QAS' ? 'Diizinkan' : 'Dibatasi (Hanya Auditor)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-brand-line">
                    <span className="text-slate-700 font-medium">Blind Audit Guard</span>
                    <span className="font-bold text-indigo-600">Aktif Terproteksi</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-brand-line">
                    <span className="text-slate-700 font-medium">Kelola Master Template</span>
                    <span className={`font-bold ${activeUser.profile.primaryRole === 'ADMIN' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {activeUser.profile.primaryRole === 'ADMIN' ? 'Akses Penuh' : 'Khusus Admin Lead'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-brand-line">
                    <span className="text-slate-700 font-medium">Kelola Pengguna</span>
                    <span className={`font-bold ${canManageUsers ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {canManageUsers ? 'Akses Penuh' : 'Tidak Diizinkan'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-brand-line bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-brand-navy hover:bg-slate-800 text-white font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFIKASI DINAMIS */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-brand-line overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-brand-line flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-brand-red" />
                <h3 className="font-extrabold text-sm text-brand-ink">Notifikasi</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-lg hover:bg-slate-200 grid place-items-center text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto text-xs min-h-36">
              {!Array.isArray(notifications) || notifications.length === 0 ? (
                <div className="h-32 grid place-items-center text-slate-400">Belum ada notifikasi.</div>
              ) : notifications.map((item) => (
                <div key={item.id} className={`p-3 rounded-xl border ${item.read_at ? 'bg-white border-brand-line' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-extrabold text-brand-ink">{item.title}</p>
                      <p className="text-[11px] text-slate-600 mt-1">{item.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1.5">{new Date(item.created_at).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        aria-label={item.read_at ? 'Tandai belum dibaca' : 'Tandai dibaca'}
                        onClick={async () => {
                          await apiFetch(`/api/notifications/${item.id}`, { method: 'PATCH', body: JSON.stringify({ read: !item.read_at }) });
                          await loadNotifications();
                        }}
                        className="w-8 h-8 rounded-lg grid place-items-center text-slate-500 hover:bg-slate-100"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Hapus notifikasi"
                        onClick={async () => {
                          await apiFetch(`/api/notifications/${item.id}`, { method: 'DELETE' });
                          await loadNotifications();
                        }}
                        className="w-8 h-8 rounded-lg grid place-items-center text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL INTERAKTIF: PENGATURAN APLIKASI */}
      {/* MODAL INTERAKTIF: PENGATURAN APLIKASI */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-brand-line overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-brand-line flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-700" />
                <h3 className="font-extrabold text-sm sm:text-base text-brand-ink">Pengaturan Aplikasi</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-brand-line">
                  <div>
                    <div className="font-bold text-slate-800">Status PWA & Offline Cache</div>
                    <div className="text-[11px] text-slate-500">Service Worker v1.0.0 Aktif</div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-brand-line">
                  <div>
                    <div className="font-bold text-slate-800">Optimasi Tampilan Mobile</div>
                    <div className="text-[11px] text-slate-500">Viewport 360px & Touch-Friendly</div>
                  </div>
                  <Smartphone className="w-4 h-4 text-slate-400" />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-brand-line">
                  <div>
                    <div className="font-bold text-slate-800">Lingkungan Server</div>
                    <div className="text-[11px] text-slate-500">Cloudflare Staging (Edge)</div>
                  </div>
                  <Server className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={handleClearCacheAndReload}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold flex items-center justify-center gap-2 transition-colors active:scale-98"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Memperbarui...' : 'Bersihkan Cache & Segarkan'}</span>
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-brand-line bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-brand-navy hover:bg-slate-800 text-white font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INTERAKTIF: BANTUAN & PANDUAN */}
      {activeModal === 'help' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-brand-line overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-brand-line flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-sm sm:text-base text-brand-ink">Bantuan & Panduan Alur</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 overflow-y-auto text-xs">
              <div className="font-extrabold text-slate-700 text-xs">4 Langkah Utama Siklus Audit QAS:</div>
              <div className="space-y-2.5">
                <div className="flex gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-brand-line">
                  <span className="w-5 h-5 rounded-full bg-brand-navy text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <div>
                    <div className="font-bold text-slate-800">Self Audit (PIC Gudang)</div>
                    <div className="text-[11px] text-slate-600">Periksa 17 pertanyaan fisik, unggah bukti foto, dan klik Submit.</div>
                  </div>
                </div>
                <div className="flex gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-brand-line">
                  <span className="w-5 h-5 rounded-full bg-brand-navy text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <div>
                    <div className="font-bold text-slate-800">Official Audit (Auditor QAS)</div>
                    <div className="text-[11px] text-slate-600">Auditor melakukan audit independen tanpa melihat data Self (Blind Audit).</div>
                  </div>
                </div>
                <div className="flex gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-brand-line">
                  <span className="w-5 h-5 rounded-full bg-brand-navy text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <div>
                    <div className="font-bold text-slate-800">Komparasi & Scoring Otomatis</div>
                    <div className="text-[11px] text-slate-600">Sistem menghitung formula skor baku, gap nilai, dan predikat mutu.</div>
                  </div>
                </div>
                <div className="flex gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-brand-line">
                  <span className="w-5 h-5 rounded-full bg-brand-navy text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <div>
                    <div className="font-bold text-slate-800">Sign-Off PIC Gudang</div>
                    <div className="text-[11px] text-slate-600">PIC Gudang mereview hasil dan menandatangani komitmen perbaikan.</div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-700" /> Kontak Dukungan Teknis
                </div>
                <p className="text-[11px] text-blue-800">
                  Hubungi Admin Lead Logistik: <span className="font-bold">ari.imam@daya-motora.com</span>
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-brand-line bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-brand-navy hover:bg-slate-800 text-white font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INTERAKTIF: TENTANG APLIKASI */}
      {activeModal === 'about' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-brand-line overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-brand-line flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-brand-navy" />
                <h3 className="font-extrabold text-sm sm:text-base text-brand-ink">Tentang Aplikasi</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-red text-white flex items-center justify-center shadow-md">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h4 className="font-extrabold text-sm text-brand-ink pt-2">Audit Mutu QAS Logistik</h4>
                <p className="text-slate-500 text-[11px]">Quality Assurance System Motorcycle Logistic</p>
                <span className="inline-block px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] rounded-full mt-1">
                  Versi 1.0.0-rc1 (Staging)
                </span>
              </div>

              <div className="space-y-2 border-t border-brand-line pt-3">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Perusahaan</span>
                  <span className="font-bold text-slate-800">PT Daya Adicipta Motora</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Prinsipal</span>
                  <span className="font-bold text-slate-800">PT Astra Honda Motor</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Depo Pilot</span>
                  <span className="font-bold text-slate-800">Karawang, Baros, Cirebon</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Arsitektur</span>
                  <span className="font-bold text-slate-800">Edge Worker & D1 Relational</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Penyimpanan Bukti</span>
                  <span className="font-bold text-slate-800">Cloudflare R2 Private Bucket</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-brand-line bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-brand-navy hover:bg-slate-800 text-white font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
