// Comprehensive API Client with Local Dev Role Switcher & In-Memory Fallback Adapter
// Ensures application functions 100% interactively on localhost even if Wrangler dev server is not running.

import { NORMALIZED_MASTER_SECTIONS } from './masterQuestionsData';
import { clearAllDraftsLocally, clearDraftLocally, getStoredDraftSummary } from './offlineDraft';
import { evaluatePasswordStrength } from './passwordValidator';

export interface UserScope {
  role: 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN';
  depotId: string | null;
  depotCode: string | null;
  canManageMaster: boolean;
  canManageUsers?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  primaryRole: 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN';
  isGlobalAccess: boolean;
  canManageMaster: boolean;
  canManageUsers?: boolean;
  mustChangePassword?: boolean;
  scopes: UserScope[];
}

export interface DemoUserOption {
  key: string;
  label: string;
  roleName: string;
  depotName: string;
  profile: UserProfile;
}

export const INITIAL_DEMO_USERS: DemoUserOption[] = [
  {
    key: 'usr-001',
    label: 'Ari Imam Safari',
    roleName: 'PIC QAS Depo Karawang',
    depotName: 'Karawang',
    profile: {
      id: 'USR-001',
      email: 'ari.imam@daya-motora.com',
      fullName: 'Ari Imam Safari',
      primaryRole: 'PIC_QAS',
      isGlobalAccess: false,
      canManageMaster: true,
      canManageUsers: true,
      scopes: [{ role: 'PIC_QAS', depotId: 'depot-krw', depotCode: 'KRW', canManageMaster: true, canManageUsers: true }],
    },
  },
  {
    key: 'usr-002',
    label: 'Indra Winata',
    roleName: 'PIC QAS Depo Baros',
    depotName: 'Baros',
    profile: {
      id: 'USR-002',
      email: 'indra.winata@daya-group.co.id',
      fullName: 'Indra Winata',
      primaryRole: 'PIC_QAS',
      isGlobalAccess: false,
      canManageMaster: false,
      canManageUsers: false,
      scopes: [{ role: 'PIC_QAS', depotId: 'depot-brs', depotCode: 'BRS', canManageMaster: false, canManageUsers: false }],
    },
  },
  {
    key: 'usr-003',
    label: 'Marcelia Krista',
    roleName: 'PIC QAS Depo Cirebon',
    depotName: 'Cirebon',
    profile: {
      id: 'USR-003',
      email: 'marcelia.krista@daya-motora.com',
      fullName: 'Marcelia Krista',
      primaryRole: 'PIC_QAS',
      isGlobalAccess: false,
      canManageMaster: false,
      canManageUsers: false,
      scopes: [{ role: 'PIC_QAS', depotId: 'depot-crb', depotCode: 'CRB', canManageMaster: false, canManageUsers: false }],
    },
  },
  {
    key: 'usr-004',
    label: 'Fachmi Herdiansyah',
    roleName: 'Auditor QAS Depo Karawang',
    depotName: 'Karawang',
    profile: {
      id: 'USR-004',
      email: 'fachmi.herdiansyah@daya-motora.com',
      fullName: 'Fachmi Herdiansyah',
      primaryRole: 'AUDITOR_QAS',
      isGlobalAccess: true,
      canManageMaster: true,
      canManageUsers: false,
      scopes: [{ role: 'AUDITOR_QAS', depotId: 'depot-krw', depotCode: 'KRW', canManageMaster: true, canManageUsers: false }],
    },
  },
  {
    key: 'usr-005',
    label: 'Antonius Trubayu',
    roleName: 'Auditor QAS Depo Baros & Cirebon',
    depotName: 'Baros & Cirebon',
    profile: {
      id: 'USR-005',
      email: 'antonius.tribayu@daya-motora.com',
      fullName: 'Antonius Trubayu',
      primaryRole: 'AUDITOR_QAS',
      isGlobalAccess: true,
      canManageMaster: true,
      canManageUsers: false,
      scopes: [
        { role: 'AUDITOR_QAS', depotId: 'depot-brs', depotCode: 'BRS', canManageMaster: true, canManageUsers: false },
        { role: 'AUDITOR_QAS', depotId: 'depot-crb', depotCode: 'CRB', canManageMaster: true, canManageUsers: false },
      ],
    },
  },
  {
    key: 'user-admin',
    label: 'Administrator QAS Pusat',
    roleName: 'Admin Lead',
    depotName: 'Semua Depo',
    profile: {
      id: 'USR-ADMIN',
      email: 'admin@qas.internal',
      fullName: 'Administrator QAS Pusat',
      primaryRole: 'ADMIN',
      isGlobalAccess: true,
      canManageMaster: true,
      canManageUsers: true,
      scopes: [{ role: 'ADMIN', depotId: null, depotCode: null, canManageMaster: true, canManageUsers: true }],
    },
  },
];

export const DEMO_USERS: DemoUserOption[] = [...INITIAL_DEMO_USERS];

const USERS_STORAGE_KEY = 'qas_custom_users_list_v2';

export function canUserManageUsers(user?: DemoUserOption): boolean {
  const targetUser = user || getActiveDevUser();
  if (!targetUser || !targetUser.profile) return false;
  if (targetUser.profile.primaryRole === 'ADMIN') return true;
  if (targetUser.profile.canManageUsers) return true;
  return targetUser.profile.scopes.some((s) => Boolean(s.canManageUsers));
}

export function getAllUsers(): DemoUserOption[] {
  if (typeof window === 'undefined') return [...DEMO_USERS];
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const updated = parsed as DemoUserOption[];
        DEMO_USERS.length = 0;
        DEMO_USERS.push(...updated);
        return [...updated];
      }
    }
  } catch (err) {
    console.error('Failed to parse users from storage:', err);
  }
  return [...DEMO_USERS];
}

function persistUsersList(users: DemoUserOption[]): void {
  const copy = [...users];
  DEMO_USERS.length = 0;
  DEMO_USERS.push(...copy);
  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(copy));
    window.dispatchEvent(new Event('qas-users-changed'));
    window.dispatchEvent(new Event('qas-role-changed'));
  }
}

export function createUser(data: {
  fullName: string;
  email: string;
  role: 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN';
  depotId?: string | null;
  depotIds?: string[];
  canManageMaster?: boolean;
  canManageUsers?: boolean;
}): { success: boolean; user?: DemoUserOption; error?: string } {
  const allUsers = getAllUsers();
  const normalizedEmail = (data.email || '').trim().toLowerCase();
  const fullName = (data.fullName || '').trim();

  if (!fullName) {
    return { success: false, error: 'Nama lengkap wajib diisi.' };
  }
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'Format e-mail kantor tidak valid.' };
  }
  if (allUsers.some((u) => u.profile.email.toLowerCase() === normalizedEmail)) {
    return { success: false, error: `E-mail ${normalizedEmail} sudah terdaftar dalam sistem.` };
  }

  const randomId = `USR-${Math.floor(100 + Math.random() * 900)}`;
  const slugKey = `usr-${Date.now().toString(36)}`;

  const DEPOT_MAP: Record<string, { code: string; name: string }> = {
    'depot-krw': { code: 'KRW', name: 'Karawang' },
    'depot-brs': { code: 'BRS', name: 'Baros' },
    'depot-crb': { code: 'CRB', name: 'Cirebon' },
  };

  const selectedDepotIds: string[] =
    data.depotIds && data.depotIds.length > 0
      ? data.depotIds.filter((id) => id !== 'all')
      : data.depotId && data.depotId !== 'all'
      ? [data.depotId]
      : [];

  let depotName = 'Semua Depo';
  if (selectedDepotIds.length > 0) {
    depotName = selectedDepotIds.map((id) => DEPOT_MAP[id]?.name || id).join(' & ');
  }

  const roleName =
    data.role === 'ADMIN'
      ? 'Admin Lead'
      : data.role === 'AUDITOR_QAS'
      ? `Auditor QAS Depo ${depotName}`
      : `PIC QAS Depo ${depotName}`;

  const isGlobal = data.role === 'ADMIN' || data.role === 'AUDITOR_QAS';
  const canManageMaster = Boolean(data.canManageMaster || data.role === 'ADMIN');
  const canManageUsers = Boolean(data.canManageUsers || data.role === 'ADMIN');

  const scopes: UserScope[] =
    selectedDepotIds.length > 0
      ? selectedDepotIds.map((id) => ({
          role: data.role,
          depotId: id,
          depotCode: DEPOT_MAP[id]?.code || null,
          canManageMaster,
          canManageUsers,
        }))
      : [
          {
            role: data.role,
            depotId: null,
            depotCode: null,
            canManageMaster,
            canManageUsers,
          },
        ];

  const newUser: DemoUserOption = {
    key: slugKey,
    label: fullName,
    roleName,
    depotName,
    profile: {
      id: randomId,
      email: normalizedEmail,
      fullName,
      primaryRole: data.role,
      isGlobalAccess: isGlobal,
      canManageMaster,
      canManageUsers,
      scopes,
    },
  };

  const updatedList = [...allUsers, newUser];
  persistUsersList(updatedList);

  // Background sync to backend Worker D1
  if (typeof window !== 'undefined') {
    apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        fullName,
        email: normalizedEmail,
        role: data.role,
        depotId: selectedDepotIds.length === 1 ? selectedDepotIds[0] : null,
        canManageMaster,
        canManageUsers,
      }),
    }).catch((err) => console.warn('[USERS] Background create D1 sync failed:', err));
  }

  return { success: true, user: newUser };
}

export function updateUser(
  keyOrId: string,
  data: Partial<{
    fullName: string;
    email: string;
    role: 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN';
    depotId: string | null;
    depotIds: string[];
    canManageMaster: boolean;
    canManageUsers: boolean;
  }>
): { success: boolean; user?: DemoUserOption; error?: string } {
  const allUsers = getAllUsers();
  const index = allUsers.findIndex((u) => u.key === keyOrId || u.profile.id === keyOrId);
  if (index === -1) {
    return { success: false, error: 'Pengguna tidak ditemukan.' };
  }

  const existing = allUsers[index];
  const newEmail = data.email !== undefined ? data.email.trim().toLowerCase() : existing.profile.email;
  const newFullName = data.fullName !== undefined ? data.fullName.trim() : existing.profile.fullName;
  const newRole = data.role !== undefined ? data.role : existing.profile.primaryRole;

  if (newEmail !== existing.profile.email.toLowerCase()) {
    if (allUsers.some((u, i) => i !== index && u.profile.email.toLowerCase() === newEmail)) {
      return { success: false, error: `E-mail ${newEmail} sudah digunakan oleh pengguna lain.` };
    }
  }

  const DEPOT_MAP: Record<string, { code: string; name: string }> = {
    'depot-krw': { code: 'KRW', name: 'Karawang' },
    'depot-brs': { code: 'BRS', name: 'Baros' },
    'depot-crb': { code: 'CRB', name: 'Cirebon' },
  };

  let selectedDepotIds: string[] = [];
  if (data.depotIds !== undefined) {
    selectedDepotIds = data.depotIds.filter((id) => id !== 'all');
  } else if (data.depotId !== undefined) {
    selectedDepotIds = data.depotId && data.depotId !== 'all' ? [data.depotId] : [];
  } else {
    selectedDepotIds = existing.profile.scopes.map((s) => s.depotId).filter(Boolean) as string[];
  }

  let depotName = 'Semua Depo';
  if (selectedDepotIds.length > 0) {
    depotName = selectedDepotIds.map((id) => DEPOT_MAP[id]?.name || id).join(' & ');
  }

  const roleName =
    newRole === 'ADMIN'
      ? 'Admin Lead'
      : newRole === 'AUDITOR_QAS'
      ? `Auditor QAS Depo ${depotName}`
      : `PIC QAS Depo ${depotName}`;

  const isGlobal = newRole === 'ADMIN' || newRole === 'AUDITOR_QAS';
  const canManageMaster = data.canManageMaster !== undefined ? data.canManageMaster : existing.profile.canManageMaster;
  const canManageUsers = data.canManageUsers !== undefined ? data.canManageUsers : Boolean(existing.profile.canManageUsers);

  const scopes: UserScope[] =
    selectedDepotIds.length > 0
      ? selectedDepotIds.map((id) => ({
          role: newRole,
          depotId: id,
          depotCode: DEPOT_MAP[id]?.code || null,
          canManageMaster,
          canManageUsers,
        }))
      : [
          {
            role: newRole,
            depotId: null,
            depotCode: null,
            canManageMaster,
            canManageUsers,
          },
        ];

  const updated: DemoUserOption = {
    ...existing,
    label: newFullName,
    roleName,
    depotName,
    profile: {
      ...existing.profile,
      email: newEmail,
      fullName: newFullName,
      primaryRole: newRole,
      isGlobalAccess: isGlobal,
      canManageMaster,
      canManageUsers,
      scopes,
    },
  };

  allUsers[index] = updated;
  persistUsersList(allUsers);

  // Background sync to backend Worker D1
  if (typeof window !== 'undefined') {
    apiFetch(`/api/users/${existing.profile.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        fullName: newFullName,
        role: newRole,
        depotId: selectedDepotIds.length === 1 ? selectedDepotIds[0] : null,
        canManageMaster,
        canManageUsers,
      }),
    }).catch((err) => console.warn('[USERS] Background update D1 sync failed:', err));
  }

  return { success: true, user: updated };
}

export function deleteUser(keyOrId: string): { success: boolean; error?: string } {
  const allUsers = getAllUsers();
  const current = getActiveDevUser();
  const target = allUsers.find((u) => u.key === keyOrId || u.profile.id === keyOrId);
  if (!target) {
    return { success: false, error: 'Pengguna tidak ditemukan.' };
  }

  if (target.key === current.key || target.profile.id === current.profile.id || target.profile.email.toLowerCase() === current.profile.email.toLowerCase()) {
    return { success: false, error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.' };
  }

  const filtered = allUsers.filter((u) => u.key !== target.key && u.profile.id !== target.profile.id);
  persistUsersList(filtered);

  // Background sync to backend Worker D1
  if (typeof window !== 'undefined') {
    apiFetch(`/api/users/${target.profile.id}`, {
      method: 'DELETE',
    }).catch((err) => console.warn('[USERS] Background delete D1 sync failed:', err));
  }

  return { success: true };
}

export function resetDefaultUsers(): void {
  persistUsersList(INITIAL_DEMO_USERS);
}

/**
 * Synchronizes user list from D1 database when backend Worker is active.
 */
export async function syncUsersFromBackend(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await apiFetch<
      Array<{
        id: string;
        email: string;
        full_name: string;
        role: 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN';
        depot_id: string | null;
        depot_name: string | null;
        depot_code: string | null;
        can_manage_master: number;
        can_manage_users: number;
      }>
    >('/api/users');

    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      const mapped: DemoUserOption[] = res.data.map((u) => {
        let depotName = u.depot_name || 'Semua Depo';
        if (u.depot_id === 'depot-krw') depotName = 'Karawang';
        else if (u.depot_id === 'depot-brs') depotName = 'Baros';
        else if (u.depot_id === 'depot-crb') depotName = 'Cirebon';

        const roleName =
          u.role === 'ADMIN'
            ? 'Admin Lead'
            : u.role === 'AUDITOR_QAS'
            ? `Auditor QAS Depo ${depotName}`
            : `PIC QAS Depo ${depotName}`;

        const isGlobal = u.role === 'ADMIN' || u.role === 'AUDITOR_QAS';
        const canManageMaster = Boolean(u.can_manage_master || u.role === 'ADMIN');
        const canManageUsers = Boolean(u.can_manage_users || u.role === 'ADMIN');

        return {
          key: `usr-${u.id.toLowerCase()}`,
          label: u.full_name,
          roleName,
          depotName,
          profile: {
            id: u.id,
            email: u.email,
            fullName: u.full_name,
            primaryRole: u.role,
            isGlobalAccess: isGlobal,
            canManageMaster,
            canManageUsers,
            scopes: [
              {
                role: u.role,
                depotId: u.depot_id,
                depotCode: u.depot_code,
                canManageMaster,
                canManageUsers,
              },
            ],
          },
        };
      });

      persistUsersList(mapped);
    }
  } catch {
    // Non-fatal if offline
  }
}

// Active user display state. Authentication itself is owned by Cloudflare
// Access; these keys never grant access to an API.
const ACTIVE_USER_STORAGE_KEY = 'qas_active_dev_user_key';
const AUTH_SESSION_KEY = 'qas_auth_session';
const REMEMBER_ACCOUNT_KEY = 'qas_remember_account';
let authenticatedUser: DemoUserOption | null = null;

const KEY_ALIASES: Record<string, string> = {
  'pic_krw': 'usr-001',
  'pic_brs': 'usr-002',
  'pic_crb': 'usr-003',
  'auditor': 'usr-004',
  'admin': 'usr-004',
  'user-pic-krw': 'usr-001',
  'user-pic-brs': 'usr-002',
  'user-pic-crb': 'usr-003',
  'user-auditor': 'usr-004',
  'user-admin': 'usr-004',
};

export function isUserLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  const isTest =
    (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST))) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');
  if (isTest) {
    return localStorage.getItem(AUTH_SESSION_KEY) !== 'false';
  }
  return localStorage.getItem(AUTH_SESSION_KEY) === 'true' || authenticatedUser !== null;
}

export function loginUser(key: string): void {
  if (typeof window === 'undefined') return;
  const mappedKey = KEY_ALIASES[key] || key;
  localStorage.setItem(AUTH_SESSION_KEY, 'true');
  localStorage.setItem(ACTIVE_USER_STORAGE_KEY, mappedKey);
  const allUsers = getAllUsers();
  const user = allUsers.find((u) => u.key === mappedKey) || DEMO_USERS.find((u) => u.key === mappedKey) || DEMO_USERS[0];
  const assigned = user.profile.scopes.map((s) => s.depotId).filter(Boolean);
  const targetDepot = (assigned.length > 0 && assigned[0]) ? (assigned[0] as string) : 'depot-krw';
  localStorage.setItem(ACTIVE_DEPOT_STORAGE_KEY, targetDepot);
  window.dispatchEvent(new Event('qas-role-changed'));
  window.dispatchEvent(new Event('qas-auth-changed'));
  window.dispatchEvent(new Event('qas-depot-changed'));
}

export function loginWithEmail(email: string): boolean {
  void email;
  return false;
}

export interface AuthActionResult {
  success: boolean;
  user?: DemoUserOption;
  error?: { code: string; message: string; requestId?: string };
}

const USER_PASSWORDS_STORAGE_KEY = 'qas_user_passwords_v1';
const RESET_OTP_PREFIX = 'qas_reset_otp_';

export function getStoredUserPassword(email: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_PASSWORDS_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, { password: string; changedAt: string }>;
    return map[email.trim().toLowerCase()]?.password || null;
  } catch {
    return null;
  }
}

export function saveUserPassword(email: string, password: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(USER_PASSWORDS_STORAGE_KEY);
    const map: Record<string, { password: string; changedAt: string }> = raw ? JSON.parse(raw) : {};
    map[email.trim().toLowerCase()] = {
      password,
      changedAt: new Date().toISOString(),
    };
    localStorage.setItem(USER_PASSWORDS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export interface OtpRequestResult {
  success: boolean;
  message?: string;
  simulatedOtp?: string;
  error?: string;
}

export function handleLocalOtpRequest(email: string): OtpRequestResult {
  const normalizedEmail = email.trim().toLowerCase();
  const allUsers = getAllUsers();
  const exists = allUsers.some((u) => u.profile.email.toLowerCase() === normalizedEmail);
  if (!exists) {
    return {
      success: false,
      error: `Email kantor "${normalizedEmail}" tidak terdaftar dalam sistem QAS. Hubungi Admin Lead untuk pendaftaran akun.`,
    };
  }

  // Generate 6-digit cryptographic random numeric OTP
  const otpArray = new Uint32Array(1);
  crypto.getRandomValues(otpArray);
  const otp = String(100000 + (otpArray[0] % 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  if (typeof window !== 'undefined') {
    localStorage.setItem(
      `${RESET_OTP_PREFIX}${normalizedEmail}`,
      JSON.stringify({ otp, expiresAt, email: normalizedEmail, createdAt: Date.now() })
    );
  }

  return {
    success: true,
    message: `Kode verifikasi OTP telah dikirimkan ke email ${normalizedEmail}.`,
    simulatedOtp: otp,
  };
}

export function handleLocalOtpReset(
  email: string,
  otp: string,
  newPassword: string,
  confirmPassword: string
): { success: boolean; error?: string; message?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();

  if (!cleanOtp || cleanOtp.length !== 6) {
    return { success: false, error: 'Kode OTP harus berupa 6 digit angka.' };
  }
  if (newPassword !== confirmPassword) {
    return { success: false, error: 'Konfirmasi kata sandi baru tidak cocok.' };
  }
  const strength = evaluatePasswordStrength(newPassword);
  if (!strength.isValid) {
    return { success: false, error: strength.errorMessage || 'Kata sandi baru belum memenuhi syarat keamanan.' };
  }

  if (typeof window !== 'undefined') {
    const rawOtp = localStorage.getItem(`${RESET_OTP_PREFIX}${normalizedEmail}`);
    if (!rawOtp) {
      return { success: false, error: 'Kode OTP tidak ditemukan atau sudah pernah digunakan. Silakan minta kode baru.' };
    }
    try {
      const parsed = JSON.parse(rawOtp) as { otp: string; expiresAt: number };
      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(`${RESET_OTP_PREFIX}${normalizedEmail}`);
        return { success: false, error: 'Kode OTP telah kedaluwarsa (berlaku 10 menit). Silakan minta kode baru.' };
      }
      if (parsed.otp !== cleanOtp) {
        return { success: false, error: 'Kode OTP salah. Periksa kembali email Anda.' };
      }

      // Validated! Burn the OTP immediately
      localStorage.removeItem(`${RESET_OTP_PREFIX}${normalizedEmail}`);
      saveUserPassword(normalizedEmail, newPassword);

      // Update user mustChangePassword flag
      const allUsers = getAllUsers();
      const idx = allUsers.findIndex((u) => u.profile.email.toLowerCase() === normalizedEmail);
      if (idx !== -1) {
        allUsers[idx].profile.mustChangePassword = false;
        persistUsersList(allUsers);
      }

      return { success: true, message: 'Kata sandi berhasil diubah. Silakan masuk menggunakan kata sandi baru Anda.' };
    } catch {
      return { success: false, error: 'Data OTP tidak valid.' };
    }
  }

  return { success: false, error: 'Gagal memperbarui kata sandi.' };
}

export async function requestPasswordResetOtp(email: string): Promise<OtpRequestResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'Masukkan format email kantor yang valid.' };
  }

  try {
    const response = await fetch('/api/auth/forgot-password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') || '' : '';
    if (response.ok && contentType.includes('application/json')) {
      const payload = (await response.json()) as { success: boolean; message?: string; simulatedOtp?: string; error?: { message?: string } };
      if (payload.success) {
        return {
          success: true,
          message: payload.message || `Kode OTP telah dikirim ke email ${normalizedEmail}.`,
          simulatedOtp: payload.simulatedOtp,
        };
      }
      return { success: false, error: payload.error?.message || 'Gagal memproses permintaan OTP.' };
    }
  } catch {
    // backend offline
  }

  return handleLocalOtpRequest(normalizedEmail);
}

export async function verifyOtpAndResetPassword(
  email: string,
  otp: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();

  try {
    const response = await fetch('/api/auth/forgot-password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, otp: cleanOtp, newPassword, confirmPassword }),
    });
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') || '' : '';
    if (response.ok && contentType.includes('application/json')) {
      const payload = (await response.json()) as { success: boolean; message?: string; error?: { message?: string } };
      if (payload.success) {
        saveUserPassword(normalizedEmail, newPassword);
        return { success: true, message: 'Password Anda berhasil diperbarui. Silakan login.' };
      }
      return { success: false, error: payload.error?.message || 'Gagal mereset kata sandi.' };
    }
  } catch {
    // backend offline
  }

  return handleLocalOtpReset(normalizedEmail, cleanOtp, newPassword, confirmPassword);
}

export async function loginWithPassword(
  email: string,
  password: string,
  rememberMe: boolean
): Promise<AuthActionResult> {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password, rememberMe }),
    });
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') || '' : '';
    if (response.ok && (contentType.includes('application/json') || !contentType)) {
      const payload = (await response.json()) as { success?: boolean; error?: { code?: string; message?: string; requestId?: string } };
      if (payload.success) {
        setRememberAccount(rememberMe);
        const user = await bootstrapAuthenticatedUser();
        return user ? { success: true, user } : { success: false, error: { code: 'SESSION_NOT_CREATED', message: 'Session login tidak dapat dibuat.' } };
      }
      return { success: false, error: { code: payload.error?.code || 'LOGIN_FAILED', message: payload.error?.message || 'Login gagal. Periksa email dan password.', requestId: payload.error?.requestId } };
    }
  } catch {
    // Backend offline / network error
  }

  // Graceful local mock fallback for development environment
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    const allUsers = getAllUsers();
    const foundUser = allUsers.find((u) => u.profile.email.toLowerCase() === normalizedEmail);
    if (foundUser) {
      const storedPass = getStoredUserPassword(normalizedEmail);
      if (storedPass) {
        // User has already set their own password
        if (password === storedPass) {
          setRememberAccount(rememberMe);
          loginUser(foundUser.key);
          foundUser.profile.mustChangePassword = false;
          authenticatedUser = foundUser;
          return { success: true, user: foundUser };
        }
        if (password === '12345') {
          return {
            success: false,
            error: {
              code: 'INITIAL_PASSWORD_EXPIRED',
              message: 'Password awal (12345) sudah tidak berlaku. Akun ini telah memperbarui password. Silakan gunakan password baru Anda.',
            },
          };
        }
        return { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Password salah.' } };
      } else {
        // User has not set their password yet (default 12345)
        if (password === '12345') {
          setRememberAccount(rememberMe);
          loginUser(foundUser.key);
          foundUser.profile.mustChangePassword = true;
          authenticatedUser = foundUser;
          return { success: true, user: foundUser };
        }
        return {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Password salah (gunakan password awal: 12345 untuk akun baru).',
          },
        };
      }
    }
    return { success: false, error: { code: 'USER_NOT_FOUND', message: 'Email kantor tidak terdaftar dalam sistem.' } };
  }

  return { success: false, error: { code: 'NETWORK_OFFLINE', message: 'Server tidak dapat dijangkau.' } };
}

export async function changeApplicationPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
  email?: string
): Promise<AuthActionResult> {
  if (newPassword !== confirmPassword) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Konfirmasi password baru tidak cocok.' } };
  }
  const strength = evaluatePasswordStrength(newPassword);
  if (!strength.isValid) {
    return { success: false, error: { code: 'WEAK_PASSWORD', message: strength.errorMessage || 'Password baru belum memenuhi standar keamanan.' } };
  }

  const activeUser = authenticatedUser || getActiveDevUser();
  const targetEmail = (email || activeUser?.profile?.email || '').trim().toLowerCase();

  try {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') || '' : '';
    if (response.ok && (contentType.includes('application/json') || !contentType)) {
      const payload = (await response.json()) as { success?: boolean; error?: { code?: string; message?: string; requestId?: string } };
      if (payload.success) {
        if (targetEmail) {
          saveUserPassword(targetEmail, newPassword);
          const allUsers = getAllUsers();
          const idx = allUsers.findIndex((u) => u.profile.email.toLowerCase() === targetEmail);
          if (idx !== -1) {
            allUsers[idx].profile.mustChangePassword = false;
            persistUsersList(allUsers);
          }
        }
        if (authenticatedUser) {
          authenticatedUser.profile.mustChangePassword = false;
        }
        const user = await bootstrapAuthenticatedUser();
        return user ? { success: true, user } : { success: false, error: { code: 'SESSION_REFRESH_FAILED', message: 'Session tidak dapat diperbarui.' } };
      }
      return { success: false, error: { code: payload.error?.code || 'PASSWORD_CHANGE_FAILED', message: payload.error?.message || 'Password tidak dapat diubah.', requestId: payload.error?.requestId } };
    }
  } catch {
    // Backend offline
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    const activeEmail = (targetEmail || activeUser.profile.email).toLowerCase();
    const storedPass = getStoredUserPassword(activeEmail);
    const expectedPass = storedPass || '12345';
    if (currentPassword !== expectedPass) {
      return { success: false, error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Password lama tidak sesuai.' } };
    }

    saveUserPassword(activeEmail, newPassword);
    activeUser.profile.mustChangePassword = false;
    const allUsers = getAllUsers();
    const idx = allUsers.findIndex((u) => u.profile.email.toLowerCase() === activeEmail);
    if (idx !== -1) {
      allUsers[idx].profile.mustChangePassword = false;
      persistUsersList(allUsers);
    }
    authenticatedUser = activeUser;
    return { success: true, user: activeUser };
  }

  return { success: false, error: { code: 'NETWORK_OFFLINE', message: 'Server tidak dapat dijangkau.' } };
}

export function setRememberAccount(remember: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_ACCOUNT_KEY, String(remember));
}

export function getRememberAccount(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(REMEMBER_ACCOUNT_KEY) === 'true';
}

export async function bootstrapAuthenticatedUser(): Promise<DemoUserOption | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') || '' : 'application/json';
    if (response.ok && !contentType.includes('text/html')) {
      const payload = (await response.json()) as { success?: boolean; data?: UserProfile };
      if (payload.success && payload.data) {
        const profile = payload.data;
        const depotName = profile.scopes
          .map((scope) => scope.depotCode)
          .filter(Boolean)
          .join(', ') || 'Semua Depo';
        authenticatedUser = {
          key: `access-${profile.id.toLowerCase()}`,
          label: profile.fullName,
          roleName: profile.primaryRole,
          depotName,
          profile,
        };
        if (getRememberAccount()) {
          localStorage.setItem(ACTIVE_USER_STORAGE_KEY, authenticatedUser.key);
        } else {
          sessionStorage.setItem(ACTIVE_USER_STORAGE_KEY, authenticatedUser.key);
        }
        window.dispatchEvent(new Event('qas-auth-changed'));
        return authenticatedUser;
      }
    }
  } catch {
    // Backend offline or timeout
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    if (typeof window !== 'undefined') {
      const hasSession = localStorage.getItem(AUTH_SESSION_KEY) === 'true';
      if (hasSession) {
        const devUser = getActiveDevUser();
        authenticatedUser = devUser;
        return devUser;
      }
    }
  }

  authenticatedUser = null;
  return null;
}

export function getAuthenticatedUser(): DemoUserOption | null {
  return authenticatedUser;
}

export async function logoutUser(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
  } finally {
    authenticatedUser = null;
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_DEPOT_STORAGE_KEY);
    sessionStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    window.dispatchEvent(new Event('qas-role-changed'));
    window.dispatchEvent(new Event('qas-auth-changed'));
    window.dispatchEvent(new Event('qas-depot-changed'));
  }
}

export function getActiveDevUser(): DemoUserOption {
  if (authenticatedUser) return authenticatedUser;
  if (typeof window === 'undefined') return DEMO_USERS[0];
  const allUsers = getAllUsers();
  const savedKey = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
  const mappedKey = (savedKey && KEY_ALIASES[savedKey]) || savedKey;
  const found = allUsers.find((u) => u.key === mappedKey);
  return found || DEMO_USERS[0]; // Default: Ari Imam Safari
}

export function setActiveDevUser(key: string): void {
  if (typeof window === 'undefined') return;
  const mappedKey = KEY_ALIASES[key] || key;
  localStorage.setItem(ACTIVE_USER_STORAGE_KEY, mappedKey);
  window.dispatchEvent(new Event('qas-role-changed'));
}

// -------------------------------------------------------------
// SEED MOCK DATA DEFINITIONS (17 Standard Questions & 4 Sections)
// -------------------------------------------------------------
export const MOCK_SECTIONS = [
  {
    id: 'sec-01',
    code: 'SEC-1',
    title: 'Penerimaan Unit Sepeda Motor',
    display_order: 1,
    weight: 0.25,
    questions: [
      { id: 'q-01', code: 'P-01', prompt: 'Pemeriksaan dokumen surat jalan dan fisik unit saat unloading.', is_required: true, evidence_required: true },
      { id: 'q-02', code: 'P-02', prompt: 'Kondisi fisik unit bebas dari lecet, penyok, dan cacat ekspedisi.', is_required: true, evidence_required: true },
      { id: 'q-03', code: 'P-03', prompt: 'Pencatatan nomor rangka dan nomor mesin sesuai manifes surat pengantar.', is_required: true, evidence_required: false },
      { id: 'q-04', code: 'P-04', prompt: 'Ketersediaan kelengkapan spion, accu, dan tool set bawaan unit.', is_required: true, evidence_required: false },
    ],
  },
  {
    id: 'sec-02',
    code: 'SEC-2',
    title: 'Penyimpanan & Tata Letak Gudang',
    display_order: 2,
    weight: 0.30,
    questions: [
      { id: 'q-05', code: 'P-05', prompt: 'Kerapihan susunan unit sepeda motor per tipe dan warna di staging area.', is_required: true, evidence_required: true },
      { id: 'q-06', code: 'P-06', prompt: 'Jarak gangway dan lorong darurat bebas dari hambatan logistik.', is_required: true, evidence_required: false },
      { id: 'q-07', code: 'P-07', prompt: 'Pemisahan tegas area unit RFS (Ready For Sale) dan NRFS (Not Ready For Sale).', is_required: true, evidence_required: true },
      { id: 'q-08', code: 'P-08', prompt: 'Kondisi cover pelindung debu dan alas standar roda motor.', is_required: true, evidence_required: false },
      { id: 'q-09', code: 'P-09', prompt: 'Suhu, kelembaban, dan ventilasi udara gudang terpelihara dengan baik.', is_required: true, evidence_required: false },
    ],
  },
  {
    id: 'sec-03',
    code: 'SEC-3',
    title: 'Pengeluaran & Loading Distribusi',
    display_order: 3,
    weight: 0.25,
    questions: [
      { id: 'q-10', code: 'P-10', prompt: 'Verifikasi DO (Delivery Order) sebelum unit dimuat ke truk distribusi dealer.', is_required: true, evidence_required: false },
      { id: 'q-11', code: 'P-11', prompt: 'Pemeriksaan checklist kondisi unit saat serah terima ke supir truk ekspedisi.', is_required: true, evidence_required: true },
      { id: 'q-12', code: 'P-12', prompt: 'Pengikatan tali pengaman unit di bak truk menggunakan bantalan busa.', is_required: true, evidence_required: true },
      { id: 'q-13', code: 'P-13', prompt: 'Kesesuaian kapasitas muat truk dan susunan tingkat aman unit.', is_required: true, evidence_required: false },
    ],
  },
  {
    id: 'sec-04',
    code: 'SEC-4',
    title: 'Sarana, K3 & Pengamanan Fasilitas',
    display_order: 4,
    weight: 0.20,
    questions: [
      { id: 'q-14', code: 'P-14', prompt: 'Ketersediaan dan masa berlaku APAR (Alat Pemadam Api Ringan) di gudang.', is_required: true, evidence_required: true },
      { id: 'q-15', code: 'P-15', prompt: 'Penerangan lampu gudang memadai pada siang dan malam hari.', is_required: true, evidence_required: false },
      { id: 'q-16', code: 'P-16', prompt: 'Penggunaan APD (Alat Pelindung Diri) helm & sepatu safety oleh pekerja.', is_required: true, evidence_required: true },
      { id: 'q-17', code: 'P-17', prompt: 'Sistem pengamanan CCTV dan logbook pemeriksaan keamanan 24 jam.', is_required: true, evidence_required: false },
    ],
  },
];

export const STANDARD_OPTIONS = [
  { id: 'opt-a', code: 'OPT-A', label: 'A - Sangat Baik (Sesuai Standar Mutu Penuh)', numeric_value: 5.0, is_na: false },
  { id: 'opt-b', code: 'OPT-B', label: 'B - Cukup Baik (Ada Catatan Minor)', numeric_value: 3.0, is_na: false },
  { id: 'opt-c', code: 'OPT-C', label: 'C - Kurang (Perlu Perbaikan Segera)', numeric_value: 1.0, is_na: false },
  { id: 'opt-na', code: 'OPT-NA', label: 'N/A - Tidak Berlaku (Dikecualikan)', numeric_value: null, is_na: true },
];

export const DEPOTS = [
  { id: 'depot-krw', code: 'KRW', name: 'Karawang' },
  { id: 'depot-brs', code: 'BRS', name: 'Baros' },
  { id: 'depot-crb', code: 'CRB', name: 'Cirebon' },
];

export const ACTIVE_DEPOT_STORAGE_KEY = 'qas_active_depot_id';

export function getUserAssignedDepots(user?: DemoUserOption): typeof DEPOTS {
  const targetUser = user || getActiveDevUser();
  const allowedIds = new Set(targetUser.profile.scopes.map((s) => s.depotId).filter(Boolean));
  if (allowedIds.size === 0) return DEPOTS;
  return DEPOTS.filter((d) => allowedIds.has(d.id));
}

export function getUserActiveDepotId(user?: DemoUserOption): string {
  const targetUser = user || getActiveDevUser();
  const assigned = getUserAssignedDepots(targetUser);
  if (assigned.length === 1) {
    return assigned[0].id;
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(ACTIVE_DEPOT_STORAGE_KEY);
    if (saved && assigned.some((d) => d.id === saved)) {
      return saved;
    }
  }
  return assigned[0]?.id || 'depot-krw';
}

export function setUserActiveDepotId(depotId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_DEPOT_STORAGE_KEY, depotId);
  window.dispatchEvent(new Event('qas-depot-changed'));
}

export interface MasterOption {
  id: string;
  code: string;
  label: string;
  numeric_value: number | null;
  is_na: boolean;
  is_improvement?: boolean;
}

export interface MasterQuestion {
  id: string;
  code: string;
  prompt: string;
  is_required: boolean;
  evidence_required: boolean;
  options?: MasterOption[];
}

export interface MasterSection {
  id: string;
  code: string;
  title: string;
  display_order: number;
  weight: number;
  questions: MasterQuestion[];
}

export interface SystemStatusData {
  server: {
    status: 'online' | 'degraded' | 'offline';
    uptime: string;
    environment: string;
    app_version: string;
    colo: string;
    timestamp: string;
  };
  database: {
    status: 'online' | 'degraded' | 'offline';
    latency_ms: number;
    driver: string;
    error?: string | null;
    records: {
      total_audits: number;
      total_answers: number;
      total_questions: number;
      total_events: number;
      total_evidence: number;
      total_users: number;
      total_records: number;
    };
  };
  storage: {
    total_used_formatted: string;
    total_used_bytes?: number;
    remaining_formatted?: string;
    remaining_bytes?: number;
    total_capacity_formatted: string;
    used_percentage: number;
    breakdown: {
      audits: {
        label: string;
        count: number;
        percentage: number;
        color: string;
      };
      master: {
        label: string;
        count: number;
        percentage: number;
        color: string;
      };
      logs: {
        label: string;
        count: number;
        percentage: number;
        color: string;
      };
    };
  };
  activities: Array<{
    id: string;
    time: string;
    raw_time?: string;
    action: string;
    actor: string;
    event_type: string;
  }>;
  requestId?: string;
}

export interface MockAuditRecord {
  id: string;
  cycle_id: string;
  depot_id: string;
  audit_type: 'SELF' | 'OFFICIAL';
  status: 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID';
  assigned_user_id?: string;
  template_version_id?: string;
  score?: number | null;
  category?: string | null;
  started_at?: string | null;
  version?: number;
  submitted_at?: string | null;
  evidence_count?: number;
}

export interface MockAnswerRecord {
  option_id?: string | null;
  note?: string;
  improvement_title?: string;
  client_version?: number;
  updated_at?: string;
  evidence?: Array<{ id?: string; original_name: string; size_bytes: number; preview_url?: string; base64?: string }>;
}

// In-Memory / LocalStorage Mock State Storage
const STORAGE_PREFIX = 'qas_mock_db_';
const MASTER_SECTIONS_STORAGE_KEY = 'qas_normalized_master_sections_v3';

export function getMasterSections(): MasterSection[] {
  const initialSections: MasterSection[] = NORMALIZED_MASTER_SECTIONS as unknown as MasterSection[];

  if (typeof window === 'undefined') {
    return initialSections;
  }

  const stored = getStored<MasterSection[] | null>(MASTER_SECTIONS_STORAGE_KEY, null);
  if (stored && Array.isArray(stored) && stored.length > 0) {
    return stored;
  }

  setStored(MASTER_SECTIONS_STORAGE_KEY, initialSections);
  return initialSections;
}

export function saveMasterSections(sections: MasterSection[]): void {
  setStored(MASTER_SECTIONS_STORAGE_KEY, sections);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('qas-master-changed'));
  }
}

/**
 * Synchronizes master template sections from D1 backend when Worker is active.
 */
export async function syncMasterSectionsFromBackend(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await apiFetch<{
      sections: Array<{
        id: string;
        code: string;
        title: string;
        display_order: number;
        weight: number | null;
        questions: Array<{
          id: string;
          code: string;
          prompt: string;
          display_order: number;
          evidence_required: boolean;
          is_required: boolean;
          weight: number | null;
          options: Array<{
            id: string;
            code: string;
            label: string;
            numeric_value: number | null;
            display_order: number;
            is_na: boolean;
          }>;
        }>;
      }>;
    }>('/api/admin/template-versions/ver-qas-log-v1');

    if (res.success && res.data && Array.isArray(res.data.sections) && res.data.sections.length > 0) {
      const backendSections: MasterSection[] = res.data.sections.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        display_order: s.display_order,
        weight: s.weight || 1.0,
        questions: (s.questions || []).map((q) => ({
          id: q.id,
          code: q.code,
          prompt: q.prompt,
          is_required: Boolean(q.is_required),
          evidence_required: Boolean(q.evidence_required),
          options: (q.options || []).map((o) => ({
            id: o.id,
            code: o.code,
            label: o.label,
            numeric_value: o.numeric_value,
            is_na: Boolean(o.is_na),
            is_improvement: Boolean(o.code === 'OPT-D' || (o.code === 'OPT-A' && q.code === 'J1-04')),
          })),
        })),
      }));

      saveMasterSections(backendSections);
    }
  } catch {
    // Non-fatal if offline
  }
}

export function updateMasterQuestion(
  questionId: string,
  updates: Partial<MasterQuestion>
): boolean {
  const sections = getMasterSections();
  let found = false;

  const newSections = sections.map((sec) => ({
    ...sec,
    questions: sec.questions.map((q) => {
      if (q.id === questionId) {
        found = true;
        return {
          ...q,
          ...updates,
          options: updates.options || q.options || STANDARD_OPTIONS,
        };
      }
      return q;
    }),
  }));

  if (found) {
    saveMasterSections(newSections);

    // Background sync to backend Worker D1
    if (typeof window !== 'undefined') {
      apiFetch(`/api/admin/questions/${questionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          prompt: updates.prompt,
          evidence_required: updates.evidence_required,
          is_required: updates.is_required,
        }),
      }).catch((err) => console.warn('[MASTER] Backend update D1 question sync failed:', err));

      if (updates.options && updates.options.length > 0) {
        updates.options.forEach((opt) => {
          apiFetch(`/api/admin/options/${opt.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              label: opt.label,
              numeric_value: opt.numeric_value,
              is_na: opt.is_na,
            }),
          }).catch(() => {});
        });
      }
    }
  }
  return found;
}

export function addMasterQuestion(
  sectionCode: string,
  question: MasterQuestion
): boolean {
  const sections = getMasterSections();
  const targetSection = sections.find((s) => s.code === sectionCode);
  if (!targetSection) return false;

  targetSection.questions.push({
    ...question,
    options: question.options || STANDARD_OPTIONS,
  });

  saveMasterSections([...sections]);

  // Background sync to backend Worker D1
  if (typeof window !== 'undefined') {
    const secId = targetSection.id || 'sec-j1-dis';
    apiFetch(`/api/admin/sections/${secId}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        code: question.code,
        prompt: question.prompt,
        display_order: targetSection.questions.length,
        evidence_required: Boolean(question.evidence_required),
        is_required: Boolean(question.is_required),
      }),
    }).catch((err) => console.warn('[MASTER] Backend add D1 question sync failed:', err));
  }

  return true;
}

export function deleteMasterQuestion(questionId: string): boolean {
  const sections = getMasterSections();
  let found = false;

  const newSections = sections.map((sec) => ({
    ...sec,
    questions: sec.questions.filter((q) => {
      if (q.id === questionId) {
        found = true;
        return false;
      }
      return true;
    }),
  }));

  if (found) {
    saveMasterSections(newSections);

    // Background sync to backend Worker D1
    if (typeof window !== 'undefined') {
      apiFetch(`/api/admin/questions/${questionId}`, {
        method: 'DELETE',
      }).catch((err) => console.warn('[MASTER] Backend delete D1 question sync failed:', err));
    }
  }
  return found;
}

export function resetMasterSectionsToDefault(): void {
  const initialSections: MasterSection[] = NORMALIZED_MASTER_SECTIONS as unknown as MasterSection[];
  saveMasterSections(initialSections);
}

function getStored<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore
  }
}

export function getStoredAuditRecord(auditId: string): MockAuditRecord | undefined {
  const store = getStored<Record<string, MockAuditRecord>>('audits', {});
  return store[auditId];
}

export function setStoredAuditRecord(auditId: string, record: Partial<MockAuditRecord>): void {
  const store = getStored<Record<string, MockAuditRecord>>('audits', {});
  store[auditId] = {
    ...(store[auditId] || {
      id: auditId,
      cycle_id: 'cyc-2026-10',
      depot_id: auditId.includes('brs') ? 'depot-brs' : auditId.includes('crb') ? 'depot-crb' : 'depot-krw',
      audit_type: auditId.includes('off') ? 'OFFICIAL' : 'SELF',
    }),
    ...record,
  };
  setStored('audits', store);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('qas-audits-updated'));
  }
}

export function getStoredAuditAnswers(auditId: string): Record<string, MockAnswerRecord> {
  return getStored<Record<string, MockAnswerRecord>>(`answers_${auditId}`, {});
}

export function setStoredAuditAnswers(auditId: string, answers: Record<string, MockAnswerRecord>): void {
  setStored(`answers_${auditId}`, answers);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('qas-audits-updated'));
  }
}

export function resetAllAuditData(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(STORAGE_PREFIX) || key.startsWith('answers_') || key.startsWith('qas_draft_'))) {
      if (
        key !== 'qas_active_dev_user_key' &&
        key !== 'qas_auth_session' &&
        key !== 'qas_active_depot_id' &&
        !key.includes(MASTER_SECTIONS_STORAGE_KEY)
      ) {
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // Initialize all audits in DRAFT status with empty scores
  const cleanAudits: Record<string, MockAuditRecord> = {};
  DEPOTS.forEach((depot) => {
    cleanAudits[`aud-self-${depot.id}`] = {
      id: `aud-self-${depot.id}`,
      cycle_id: 'cyc-2026-10',
      depot_id: depot.id,
      audit_type: 'SELF',
      status: 'DRAFT',
      score: null,
      category: null,
      submitted_at: null,
    };
    cleanAudits[`aud-off-${depot.id}`] = {
      id: `aud-off-${depot.id}`,
      cycle_id: 'cyc-2026-10',
      depot_id: depot.id,
      audit_type: 'OFFICIAL',
      status: 'DRAFT',
      score: null,
      category: null,
      submitted_at: null,
    };
    cleanAudits[`audit-self-${depot.code.toLowerCase()}-202610`] = {
      id: `audit-self-${depot.code.toLowerCase()}-202610`,
      cycle_id: 'cyc-2026-10',
      depot_id: depot.id,
      audit_type: 'SELF',
      status: 'DRAFT',
      score: null,
      category: null,
      submitted_at: null,
    };
    cleanAudits[`audit-off-${depot.code.toLowerCase()}-202610`] = {
      id: `audit-off-${depot.code.toLowerCase()}-202610`,
      cycle_id: 'cyc-2026-10',
      depot_id: depot.id,
      audit_type: 'OFFICIAL',
      status: 'DRAFT',
      score: null,
      category: null,
      submitted_at: null,
    };
  });
  setStored('audits', cleanAudits);
  clearAllDraftsLocally();

  // Database reset is a local development utility only.
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    fetch('/api/audits/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => {});
  }

  window.dispatchEvent(new Event('qas-audits-reset'));
}

export const purgeAllLocalAuditData = resetAllAuditData;

/**
 * Universal API Fetch wrapper:
 * Connects to the Cloudflare Worker with the browser's Cloudflare Access session.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: { code: string; message: string; details?: unknown } }> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(endpoint, {
      credentials: options.credentials || 'include',
      cache: 'no-store',
      ...options,
      headers,
    });

    const json = (await response.json()) as {
      success: boolean;
      data?: T;
      error?: { code: string; message: string; details?: unknown };
    };
    return json;
  } catch (err) {
    const allowMockFallback = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
    if (!allowMockFallback) {
      return {
        success: false,
        error: {
          code: 'NETWORK_OFFLINE',
          message: 'Server tidak dapat dijangkau. Perubahan disimpan lokal dan belum tersinkron.',
          details: err instanceof Error ? err.message : String(err),
        },
      };
    }
    console.warn(`[API] Server dev tidak merespons pada ${endpoint}, menggunakan fallback lokal:`, err);
  }

  // Handle with Local Mock Adapter
  return handleMockRequest<T>(endpoint, options, getActiveDevUser().profile);
}

// -------------------------------------------------------------
// LOCAL MOCK ADAPTER HANDLER
// -------------------------------------------------------------
function handleMockRequest<T>(
  endpoint: string,
  options: RequestInit,
  currentUser: UserProfile
): { success: boolean; data?: T; error?: { code: string; message: string } } {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(endpoint, 'http://localhost');
  const path = url.pathname;

  // 1. GET /api/me
  if (path === '/api/me') {
    return {
      success: true,
      data: {
        id: currentUser.id,
        email: currentUser.email,
        fullName: currentUser.fullName,
        primaryRole: currentUser.primaryRole,
        isGlobalAccess: currentUser.isGlobalAccess,
        canManageMaster: currentUser.canManageMaster,
        scopes: currentUser.scopes,
      } as unknown as T,
    };
  }

  // 1b. GET /api/health
  if (path === '/api/health') {
    return {
      success: true,
      data: {
        status: 'healthy',
        app: 'qas-audit-app',
        environment: 'development',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        requestId: `req-mock-${Date.now()}`,
      } as unknown as T,
    };
  }

  // 1c. GET /api/system/status
  if (path === '/api/system/status') {
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    const masterSections = getMasterSections();
    const totalQuestions = masterSections.reduce((acc, s) => acc + (s.questions?.length || 0), 0);
    const totalAudits = Object.keys(auditsStore).length;
    let totalAnswers = 0;
    let totalEvidence = 0;

    Object.keys(auditsStore).forEach((audId) => {
      const answersStore = getStored<Record<string, MockAnswerRecord>>(`answers_${audId}`, {});
      const ansList = Object.values(answersStore);
      totalAnswers += ansList.filter((a) => Boolean(a.option_id)).length;
      ansList.forEach((a) => {
        totalEvidence += a.evidence?.length || 0;
      });
    });

    const auditRows = Math.max(totalAudits + totalAnswers + totalEvidence, 24);
    const masterRows = Math.max(totalQuestions, 17);
    const logRows = 12;
    const totalRows = auditRows + masterRows + logRows;

    const auditPercent = Math.round((auditRows / totalRows) * 100);
    const masterPercent = Math.round((masterRows / totalRows) * 100);
    const logsPercent = Math.max(5, 100 - auditPercent - masterPercent);

    const now = new Date();
    const mockActivities = [
      {
        id: 'act-1',
        time: `${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        action: 'Koneksi Cloudflare D1 Aktif (Latency Check OK)',
        actor: 'oleh System',
        event_type: 'SYSTEM_VERIFIED',
      },
      {
        id: 'act-2',
        time: `${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(now.getTime() - 10 * 60000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        action: 'Sinkronisasi Master Template Soal QAS',
        actor: `oleh ${currentUser.fullName}`,
        event_type: 'TEMPLATE_UPDATED',
      },
      {
        id: 'act-3',
        time: `${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(now.getTime() - 25 * 60000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        action: 'Draft Self Audit Depo Karawang Tersimpan',
        actor: `oleh ${currentUser.fullName}`,
        event_type: 'DRAFT_SAVED',
      },
      {
        id: 'act-4',
        time: `${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(now.getTime() - 40 * 60000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        action: 'Autentikasi Pengguna Berhasil',
        actor: `oleh ${currentUser.fullName}`,
        event_type: 'USER_LOGIN',
      },
      {
        id: 'act-5',
        time: `${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(now.getTime() - 60 * 60000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        action: 'Inisialisasi Standar Mutu Logistik QAS',
        actor: 'oleh System',
        event_type: 'AUDIT_CREATED',
      },
    ];

    return {
      success: true,
      data: {
        server: {
          status: 'online',
          uptime: '99.99%',
          environment: 'development',
          app_version: '1.0.0',
          colo: 'CGK',
          timestamp: now.toISOString(),
        },
        database: {
          status: 'online',
          latency_ms: 12.4,
          driver: 'Cloudflare D1 SQLite',
          records: {
            total_audits: totalAudits,
            total_answers: totalAnswers,
            total_questions: totalQuestions,
            total_events: logRows,
            total_evidence: totalEvidence,
            total_users: 3,
            total_records: totalRows,
          },
        },
        storage: {
          total_used_formatted: '14.8 MB',
          total_used_bytes: 15518924,
          remaining_formatted: '9.98 GB',
          remaining_bytes: 10722358324,
          total_capacity_formatted: '10 GB',
          used_percentage: 0.15,
          breakdown: {
            audits: {
              label: 'Data Audit',
              count: auditRows,
              percentage: auditPercent,
              color: 'red',
            },
            master: {
              label: 'Master Soal',
              count: masterRows,
              percentage: masterPercent,
              color: 'blue',
            },
            logs: {
              label: 'Log Sistem',
              count: logRows,
              percentage: logsPercent,
              color: 'amber',
            },
          },
        },
        activities: mockActivities,
        requestId: `req-mock-${Date.now()}`,
      } as unknown as T,
    };
  }

  // 2. GET /api/depots
  if (path === '/api/depots') {
    return { success: true, data: DEPOTS as unknown as T };
  }

  // 3. GET /api/cycles
  if (path === '/api/cycles') {
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    
    // Auto-seed draft audits for Karawang, Baros, Cirebon if store is empty or missing slots
    let updatedStore = false;
    DEPOTS.forEach((depot) => {
      const selfKey = `aud-self-${depot.id}`;
      const offKey = `aud-off-${depot.id}`;
      const detSelfKey = `audit-self-${depot.code.toLowerCase()}-202610`;
      const detOffKey = `audit-off-${depot.code.toLowerCase()}-202610`;

      if (!auditsStore[selfKey] && !auditsStore[detSelfKey]) {
        auditsStore[selfKey] = {
          id: selfKey,
          cycle_id: 'cyc-2026-10',
          depot_id: depot.id,
          audit_type: 'SELF',
          status: 'DRAFT',
          score: null,
          category: null,
          submitted_at: null,
        };
        updatedStore = true;
      }
      if (!auditsStore[offKey] && !auditsStore[detOffKey]) {
        auditsStore[offKey] = {
          id: offKey,
          cycle_id: 'cyc-2026-10',
          depot_id: depot.id,
          audit_type: 'OFFICIAL',
          status: 'DRAFT',
          score: null,
          category: null,
          submitted_at: null,
        };
        updatedStore = true;
      }
    });

    if (updatedStore) {
      setStored('audits', auditsStore);
    }

    const cycleAudits = Object.values(auditsStore);

    const cycles = [
      {
        id: 'cyc-2026-10',
        code: 'CYC-2026-10',
        title: 'Siklus Oktober 2026 - Audit Bulanan Mutu Logistik Tiga Depo',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        self_due_at: '2026-10-15T23:59:59Z',
        official_due_at: '2026-10-31T23:59:59Z',
        status: 'OPEN',
        template_version_id: 'ver-qas-log-v1',
        audits: cycleAudits,
      },
      {
        id: 'cyc-2026-11',
        code: 'CYC-2026-11',
        title: 'Siklus November 2026 - Audit Bulanan Mutu Logistik',
        period_start: '2026-11-01',
        period_end: '2026-11-30',
        self_due_at: '2026-11-15T23:59:59Z',
        official_due_at: '2026-11-30T23:59:59Z',
        status: 'OPEN',
        template_version_id: 'ver-qas-log-v1',
        audits: [],
      },
    ];

    return { success: true, data: cycles as unknown as T };
  }

  // 4. POST /api/cycles/:id/self
  if (path.includes('/self') && method === 'POST') {
    const cycleId = path.split('/')[3] || 'cyc-2026-10';
    let depotId = currentUser.scopes[0]?.depotId || 'depot-krw';
    try {
      if (typeof options.body === 'string') {
        const parsed = JSON.parse(options.body);
        if (parsed.depot_id) depotId = parsed.depot_id;
      }
    } catch {
      // Ignore
    }
    const auditId = `aud-self-${depotId}`;

    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    if (!auditsStore[auditId]) {
      auditsStore[auditId] = {
        id: auditId,
        cycle_id: cycleId,
        depot_id: depotId,
        audit_type: 'SELF',
        status: 'DRAFT',
        assigned_user_id: currentUser.id,
        template_version_id: 'ver-qas-log-v1',
        score: null,
        category: null,
        submitted_at: null,
      };
      setStored('audits', auditsStore);
    }

    return { success: true, data: auditsStore[auditId] as unknown as T };
  }

  // 5. POST /api/cycles/:id/official
  if (path.includes('/official') && method === 'POST') {
    let depotId = 'depot-krw';
    try {
      if (typeof options.body === 'string') {
        const parsed = JSON.parse(options.body);
        if (parsed.depot_id) depotId = parsed.depot_id;
      }
    } catch {
      // Ignore
    }

    const auditId = `aud-off-${depotId}`;
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    if (!auditsStore[auditId]) {
      auditsStore[auditId] = {
        id: auditId,
        cycle_id: 'cyc-2026-q4',
        depot_id: depotId,
        audit_type: 'OFFICIAL',
        status: 'DRAFT',
        assigned_user_id: currentUser.id,
        template_version_id: 'ver-qas-log-v1',
        score: null,
        category: null,
        submitted_at: null,
      };
      setStored('audits', auditsStore);
    }

    return { success: true, data: auditsStore[auditId] as unknown as T };
  }

  // 6. GET /api/audits/:id
  if (path.startsWith('/api/audits/') && method === 'GET' && !path.includes('/events')) {
    const auditId = path.split('/')[3];
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    const audit = auditsStore[auditId] || {
      id: auditId,
      cycle_id: 'cyc-2026-q4',
      depot_id: auditId.includes('brs') ? 'depot-brs' : auditId.includes('crb') ? 'depot-crb' : 'depot-krw',
      audit_type: auditId.includes('off') ? 'OFFICIAL' : 'SELF',
      status: 'DRAFT',
      score: null,
      category: null,
      submitted_at: null,
    };

    const depot = DEPOTS.find((d) => d.id === audit.depot_id) || DEPOTS[0];
    const answersStore = getStored<Record<string, MockAnswerRecord>>(`answers_${auditId}`, {});

    const dynamicSections = getMasterSections();
    const selfAuditId = `aud-self-${audit.depot_id}`;
    const selfAnswersStore = getStored<Record<string, MockAnswerRecord>>(`answers_${selfAuditId}`, {});

    const sectionsWithQuestions = dynamicSections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => {
        const ans = answersStore[q.id];
        const selfAns = selfAnswersStore[q.id];
        const selfAnswer = (audit.audit_type === 'OFFICIAL' && selfAns && selfAns.option_id) ? {
          option_id: selfAns.option_id,
          option_code: selfAns.option_id.toUpperCase().replace('OPT-', ''),
          option_label: STANDARD_OPTIONS.find((o) => o.id === selfAns.option_id)?.label || 'Terjawab',
          numeric_value: STANDARD_OPTIONS.find((o) => o.id === selfAns.option_id)?.numeric_value || null,
          note: selfAns.note || '',
          evidence_count: selfAns.evidence?.length || 0,
          evidence: selfAns.evidence || [],
        } : undefined;

        return {
          ...q,
          options: q.options || STANDARD_OPTIONS,
          self_answer: selfAnswer,
          current_answer: ans
            ? {
                id: `ans-${q.id}`,
                option_id: ans.option_id,
                note: ans.note || '',
                evidence_count: ans.evidence?.length || 0,
                evidence: ans.evidence || [],
              }
            : undefined,
        };
      }),
    }));

    return {
      success: true,
      data: {
        audit,
        cycle: {
          id: 'cyc-2026-10',
          code: 'CYC-2026-10',
          title: 'Siklus Oktober 2026 - Audit Bulanan Mutu Logistik Tiga Depo',
          self_due_at: '2026-10-15T23:59:59Z',
        },
        depot,
        sections: sectionsWithQuestions,
      } as unknown as T,
    };
  }

  // 6b. POST /api/audits/:id/start
  if (path.startsWith('/api/audits/') && path.endsWith('/start') && method === 'POST') {
    const auditId = path.split('/')[3];
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    const now = new Date().toISOString();
    if (auditsStore[auditId]) {
      if (!auditsStore[auditId].started_at) {
        auditsStore[auditId].started_at = now;
        auditsStore[auditId].version = (auditsStore[auditId].version || 1) + 1;
        setStored('audits', auditsStore);
      }
    }
    return {
      success: true,
      data: {
        id: auditId,
        started_at: now,
      } as unknown as T,
    };
  }

  // 7. PUT /api/audits/:id/answers or /api/audits/:id/answers/:qid
  if (path.includes('/answers') && method === 'PUT') {
    const parts = path.split('/');
    const auditId = parts[3];

    let bodyData: { question_id?: string; option_id?: string; note?: string; improvement_title?: string; client_version?: number } = {};
    try {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    } catch {
      // Ignore
    }
    const questionId = parts[5] || bodyData.question_id || '';

    const answersStore = getStored<Record<string, MockAnswerRecord>>(`answers_${auditId}`, {});
    const auditType = auditId.includes('off') ? 'OFFICIAL' : 'SELF';

    // Role check guardrail
    if (auditType === 'OFFICIAL' && currentUser.primaryRole !== 'AUDITOR_QAS' && currentUser.primaryRole !== 'ADMIN') {
      return {
        success: false,
        error: { code: 'FORBIDDEN_OFFICIAL_AUDIT_EDIT', message: 'PIC Gudang tidak memiliki izin mengubah Audit Resmi (QAR).' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    if (auditType === 'SELF' && currentUser.primaryRole !== 'PIC_QAS' && currentUser.primaryRole !== 'ADMIN') {
      return {
        success: false,
        error: { code: 'FORBIDDEN_SELF_AUDIT_EDIT', message: 'Auditor QAS tidak dapat mengubah isian Self Audit PIC Gudang.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }

    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    const existingAudit = auditsStore[auditId];
    if (bodyData.client_version !== undefined && existingAudit && existingAudit.version !== undefined) {
      if (bodyData.client_version !== existingAudit.version) {
        return {
          success: false,
          error: { code: 'CONFLICT', message: 'Draft telah diperbarui dari perangkat lain.' },
        } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
      }
    }

    if (existingAudit) {
      existingAudit.version = (existingAudit.version || 1) + 1;
      existingAudit.started_at = existingAudit.started_at || new Date().toISOString();
      setStored('audits', auditsStore);
    }

    answersStore[questionId] = {
      ...(answersStore[questionId] || {}),
      option_id: bodyData.option_id,
      note: bodyData.note || '',
    };
    setStored(`answers_${auditId}`, answersStore);

    return {
      success: true,
      data: { 
        id: `ans-${questionId}`, 
        question_id: questionId, 
        new_version: existingAudit?.version || 2,
        ...answersStore[questionId] 
      } as unknown as T,
    };
  }

  // 8. POST /api/audits/:id/submit
  if (path.endsWith('/submit') && method === 'POST') {
    const auditId = path.split('/')[3];
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    const answersStore = getStored<Record<string, MockAnswerRecord>>(`answers_${auditId}`, {});
    const auditType = auditId.includes('off') ? 'OFFICIAL' : 'SELF';

    // Role check guardrail
    if (auditType === 'OFFICIAL' && currentUser.primaryRole !== 'AUDITOR_QAS' && currentUser.primaryRole !== 'ADMIN') {
      return {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Hanya Auditor QAS atau Admin yang berhak men-submit Audit Resmi (QAR).' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    if (auditType === 'SELF' && currentUser.primaryRole !== 'PIC_QAS' && currentUser.primaryRole !== 'ADMIN') {
      return {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Hanya PIC Gudang atau Admin yang berhak men-submit Self Audit.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }

    // Compute or preserve 0-100 percentage score
    const existing = auditsStore[auditId];
    let finalScore = existing?.score && existing.score > 5 ? existing.score : 0;
    if (finalScore <= 5) {
      const ansList = Object.values(answersStore).filter((a) => a?.option_id);
      if (ansList.length > 0) {
        let total = 0;
        ansList.forEach((a) => {
          if (a.option_id === 'opt-tidak' || a.option_id === 'opt-c') {
            total += 20;
          } else if (a.option_id === 'opt-b') {
            total += 75;
          } else {
            total += 100;
          }
        });
        finalScore = Math.round(total / ansList.length);
      } else {
        finalScore = 92;
      }
    }
    const category = finalScore >= 90 ? 'Sangat Baik (A)' : finalScore >= 80 ? 'Baik (B)' : finalScore >= 70 ? 'Cukup (C)' : 'Perlu Perbaikan';

    const now = new Date().toISOString();
    const resolvedDepotId = auditId.includes('brs') ? 'depot-brs' : auditId.includes('crb') ? 'depot-crb' : 'depot-krw';
    const updated: MockAuditRecord = {
      ...(auditsStore[auditId] || {
        id: auditId,
        cycle_id: 'cyc-2026-10',
        depot_id: resolvedDepotId,
        audit_type: auditType,
      }),
      status: 'SUBMITTED',
      score: finalScore,
      category,
      submitted_at: now,
    };

    auditsStore[auditId] = updated;
    setStored('audits', auditsStore);

    return {
      success: true,
      data: updated as unknown as T,
    };
  }

  // 9. GET /api/comparisons/:cycleId/:depotId
  if (path.startsWith('/api/comparisons/')) {
    const parts = path.split('/');
    const cycleId = parts[3];
    const depotId = parts[4] || 'depot-krw';

    const depot = DEPOTS.find((d) => d.id === depotId) || DEPOTS[0];
    const selfAuditId = `aud-self-${depotId}`;
    const offAuditId = `aud-off-${depotId}`;

    const selfAnswers = getStored<Record<string, MockAnswerRecord>>(`answers_${selfAuditId}`, {});
    const offAnswers = getStored<Record<string, MockAnswerRecord>>(`answers_${offAuditId}`, {});

    const allQuestions = MOCK_SECTIONS.flatMap((s) =>
      s.questions.map((q) => {
        const selfAns = selfAnswers[q.id];
        const offAns = offAnswers[q.id];

        const selfScore = selfAns?.option_id === 'opt-a' ? 5.0 : selfAns?.option_id === 'opt-b' ? 3.0 : 1.0;
        const offScore = offAns?.option_id === 'opt-a' ? 5.0 : offAns?.option_id === 'opt-b' ? 3.0 : 1.0;
        const gap = offScore - selfScore;

        return {
          question_id: q.id,
          question_code: q.code,
          prompt: q.prompt,
          section_id: s.id,
          section_code: s.code,
          self_option_id: selfAns?.option_id || 'opt-a',
          self_option_code: selfAns?.option_id === 'opt-b' ? 'OPT-B' : 'OPT-A',
          self_option_label: selfAns?.option_id === 'opt-b' ? 'B - Cukup' : 'A - Sangat Baik',
          self_numeric_value: selfScore,
          self_note: selfAns?.note || 'Sesuai SOP pengoperasian unit.',
          self_evidence_count: selfAns?.evidence?.length || 1,
          official_option_id: offAns?.option_id || 'opt-a',
          official_option_code: offAns?.option_id === 'opt-b' ? 'OPT-B' : 'OPT-A',
          official_option_label: offAns?.option_id === 'opt-b' ? 'B - Cukup' : 'A - Sangat Baik',
          official_numeric_value: offScore,
          official_note: offAns?.note || 'Hasil pemeriksaan fisik lapangan selaras.',
          official_evidence_count: offAns?.evidence?.length || 1,
          gap,
          status: gap === 0 ? 'MATCH' : gap < 0 ? 'SELF_HIGHER' : 'OFFICIAL_HIGHER',
        };
      })
    );

    const sectionComparisons = MOCK_SECTIONS.map((s) => ({
      section_id: s.id,
      section_code: s.code,
      section_title: s.title,
      self_score: 4.8,
      official_score: 4.5,
      gap: -0.3,
    }));

    return {
      success: true,
      data: {
        id: `comp-${cycleId}-${depotId}`,
        cycle_id: cycleId,
        depot_id: depotId,
        self_audit_id: selfAuditId,
        official_audit_id: offAuditId,
        summary: {
          cycle_id: cycleId,
          cycle_code: 'CYC-2026-Q4',
          cycle_title: 'Siklus Q4 2026 - Logistik SMH Tiga Depo Pilot',
          depot_id: depotId,
          depot_code: depot.code,
          depot_name: depot.name,
          self_audit_id: selfAuditId,
          self_score: 4.85,
          self_category: 'Baik Sekali',
          self_submitted_at: '2026-10-01T10:00:00Z',
          official_audit_id: offAuditId,
          official_score: 4.62,
          official_category: 'Baik Sekali',
          official_submitted_at: '2026-10-01T14:30:00Z',
          score_gap: -0.23,
          total_questions: 17,
          match_count: 14,
          mismatch_count: 3,
          self_higher_count: 3,
          official_higher_count: 0,
          na_count: 0,
          max_negative_gap_question: {
            code: 'P-07',
            gap: -2.0,
            prompt: 'Pemisahan tegas area unit RFS (Ready For Sale) dan NRFS.',
          },
          section_comparisons: sectionComparisons,
          question_comparisons: allQuestions,
          generated_at: new Date().toISOString(),
        },
        acknowledgement: getStored(`ack_${offAuditId}`, null),
      } as unknown as T,
    };
  }

  // 10. POST /api/audits/:id/acknowledge
  if (path.includes('/acknowledge') && method === 'POST') {
    const auditId = path.split('/')[3];
    let note = '';
    try {
      if (typeof options.body === 'string') {
        const parsed = JSON.parse(options.body);
        note = parsed.note || '';
      }
    } catch {
      // Ignore
    }

    const ack = {
      id: `ack-${Date.now()}`,
      official_audit_id: auditId,
      user_id: currentUser.id,
      user_name: currentUser.fullName,
      note,
      acknowledged_at: new Date().toISOString(),
    };
    setStored(`ack_${auditId}`, ack);

    return { success: true, data: ack as unknown as T };
  }

  // 10b. DELETE /api/audits/:id or DELETE /api/audits?cycle_id=...&depot_id=...
  if (path.startsWith('/api/audits') && method === 'DELETE') {
    const cleanPath = path.split('?')[0];
    const parts = cleanPath.split('/');
    const targetAuditId = parts.length > 3 && parts[3] ? parts[3] : null;
    const cycleId = url.searchParams.get('cycle_id');
    const depotId = url.searchParams.get('depot_id');

    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});

    if (targetAuditId) {
      const rec = auditsStore[targetAuditId];
      if (rec && rec.status === 'SUBMITTED') {
        return {
          success: false,
          error: {
            code: 'LOCKED_AUDIT_CANNOT_BE_DELETED',
            message: 'Data audit yang sudah berstatus SUBMITTED dilarang dihapus.',
          },
        } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
      }
      localStorage.removeItem(`${STORAGE_PREFIX}answers_${targetAuditId}`);
      localStorage.removeItem(`qas_draft_summary_${targetAuditId}`);
      if (auditsStore[targetAuditId]) {
        auditsStore[targetAuditId].status = 'DRAFT';
        auditsStore[targetAuditId].started_at = null;
        auditsStore[targetAuditId].version = 1;
        auditsStore[targetAuditId].score = null;
        auditsStore[targetAuditId].category = null;
        auditsStore[targetAuditId].submitted_at = null;
        setStored('audits', auditsStore);
      }
      clearDraftLocally(targetAuditId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('qas-audits-updated'));
        window.dispatchEvent(new Event('qas-draft-changed'));
      }
      return { success: true, data: { message: 'Draft audit berhasil dihapus.' } as unknown as T };
    }

    if (depotId) {
      const matching = Object.values(auditsStore).filter(
        (a) => a.depot_id === depotId && (!cycleId || a.cycle_id === cycleId)
      );
      const hasSub = matching.some((a) => a.status === 'SUBMITTED');
      if (hasSub) {
        return {
          success: false,
          error: {
            code: 'LOCKED_AUDIT_CANNOT_BE_DELETED',
            message: 'Tidak dapat menghapus data: Terdapat audit yang sudah SUBMITTED pada depo dan periode ini.',
          },
        } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
      }
      matching.forEach((a) => {
        localStorage.removeItem(`${STORAGE_PREFIX}answers_${a.id}`);
        localStorage.removeItem(`qas_draft_summary_${a.id}`);
        if (auditsStore[a.id]) {
          auditsStore[a.id].status = 'DRAFT';
          auditsStore[a.id].started_at = null;
          auditsStore[a.id].version = 1;
          auditsStore[a.id].score = null;
          auditsStore[a.id].category = null;
          auditsStore[a.id].submitted_at = null;
        }
        clearDraftLocally(a.id);
      });
      setStored('audits', auditsStore);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('qas-audits-updated'));
        window.dispatchEvent(new Event('qas-draft-changed'));
      }
      return { success: true, data: { message: 'Data draft audit untuk depo dan periode ini berhasil dihapus.' } as unknown as T };
    }
  }

  // 11. GET /api/dashboard
  if (path === '/api/dashboard') {
    const auditsStore = getStored<Record<string, MockAuditRecord>>('audits', {});
    let auditList = Object.values(auditsStore);

    // Apply role scoping: PIC only sees own depot audits
    if (currentUser.primaryRole === 'PIC_QAS') {
      const picScope = currentUser.scopes.find((s) => s.role === 'PIC_QAS');
      if (picScope?.depotId) {
        auditList = auditList.filter((a) => a.depot_id === picScope.depotId);
      }
    }

    // Only count audits that have actual activity or are submitted (planned slots ignored)
    const activeAudits = auditList.filter((a) => {
      if (a.status === 'SUBMITTED') return true;
      if (a.started_at) return true;
      const answers = getStored<Record<string, MockAnswerRecord>>(`answers_${a.id}`, {});
      const hasAnswers = Object.values(answers).some(
        (ans) => ans.option_id !== null || (ans.note && ans.note.trim().length > 0) || (ans.evidence && ans.evidence.length > 0)
      );
      const draft = getStoredDraftSummary(a.id);
      const hasDraft = draft ? draft.answeredCount > 0 || draft.evidenceCount > 0 : false;
      return hasAnswers || hasDraft;
    });

    const submittedList = activeAudits.filter((a) => a.status === 'SUBMITTED');
    const inProgressList = activeAudits.filter((a) => a.status === 'DRAFT' || a.status === 'REOPENED');

    const totalAudits = submittedList.length + inProgressList.length;
    const submittedCount = submittedList.length;
    const inProgressCount = inProgressList.length;

    const selfSubmitted = submittedList.filter((a) => a.audit_type === 'SELF' && a.score !== null);
    const offSubmitted = submittedList.filter((a) => a.audit_type === 'OFFICIAL' && a.score !== null);

    const avgSelf = selfSubmitted.length > 0
      ? Number((selfSubmitted.reduce((acc, a) => acc + (a.score || 0), 0) / selfSubmitted.length).toFixed(2))
      : null;
    const avgOff = offSubmitted.length > 0
      ? Number((offSubmitted.reduce((acc, a) => acc + (a.score || 0), 0) / offSubmitted.length).toFixed(2))
      : null;
    const overallGap = avgSelf !== null && avgOff !== null ? Number((avgOff - avgSelf).toFixed(2)) : null;

    const depotsData = DEPOTS.map((d) => {
      const selfA = auditsStore[`aud-self-${d.id}`] || auditsStore[`audit-self-${d.code.toLowerCase()}-202610`];
      const offA = auditsStore[`aud-off-${d.id}`] || auditsStore[`audit-off-${d.code.toLowerCase()}-202610`];

      const selfScore = selfA?.status === 'SUBMITTED' ? selfA.score ?? null : null;
      const offScore = offA?.status === 'SUBMITTED' ? offA.score ?? null : null;
      const gap = selfScore !== null && offScore !== null ? Number((offScore - selfScore).toFixed(2)) : null;

      return {
        depot_id: d.id,
        depot_code: d.code,
        depot_name: d.name,
        self_score: selfScore,
        self_category: selfA?.status === 'SUBMITTED' ? selfA.category ?? null : null,
        self_status: selfA?.status || 'DRAFT',
        official_score: offScore,
        official_category: offA?.status === 'SUBMITTED' ? offA.category ?? null : null,
        official_status: offA?.status || 'DRAFT',
        gap,
      };
    });

    return {
      success: true,
      data: {
        cycle: {
          id: 'cyc-2026-10',
          code: 'CYC-2026-10',
          title: 'Siklus Oktober 2026 - Audit Bulanan Mutu',
        },
        kpis: {
          avg_official_score: avgOff,
          avg_self_score: avgSelf,
          overall_gap: overallGap,
          compliance_rate: totalAudits > 0 ? Math.round((submittedCount / totalAudits) * 100) : 0,
          submitted_audits: submittedCount,
          total_audits: totalAudits,
          in_progress_audits: inProgressCount,
        },
        depots: depotsData,
        section_gaps: [],
        priority_findings: [],
        available_cycles: [
          { id: 'cyc-2026-10', code: 'CYC-2026-10', title: 'Siklus Oktober 2026 (Audit Bulanan)' },
        ],
        available_depots: DEPOTS,
      } as unknown as T,
    };
  }

  // 11b. GET /api/exports/audits-report-data
  if (path === '/api/exports/audits-report-data') {
    const requestedDepotId = url.searchParams.get('depot_id');
    const auditType = (url.searchParams.get('audit_type') as 'RECONCILIATION' | 'SELF' | 'OFFICIAL') || 'RECONCILIATION';

    // Zero Client Trust Guardrail for PIC
    const isAdmin = currentUser.primaryRole === 'ADMIN';
    const isAuditor = currentUser.primaryRole === 'AUDITOR_QAS';

    if (!isAdmin && !isAuditor) {
      const picScope = currentUser.scopes.find((s) => s.role === 'PIC_QAS');
      if (!picScope || !picScope.depotId) {
        return {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Pengguna tidak memiliki cakupan depo yang valid.' },
        } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
      }
      if (requestedDepotId && requestedDepotId !== picScope.depotId) {
        return {
          success: false,
          error: {
            code: 'FORBIDDEN_DEPOT_ACCESS',
            message: 'PIC QAS hanya berwenang mengekspor data depo miliknya sendiri.',
          },
        } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
      }
    }

    const targetDepots = !isAdmin && !isAuditor
      ? DEPOTS.filter((d) => d.id === (currentUser.scopes[0]?.depotId || 'depot-krw'))
      : requestedDepotId && requestedDepotId !== 'all'
      ? DEPOTS.filter((d) => d.id === requestedDepotId)
      : DEPOTS;

    const sections = getMasterSections();

    const reports = targetDepots.map((depot) => {
      const selfAuditId = `aud-self-${depot.id}`;
      const selfAuditAlias = `audit-self-${depot.code.toLowerCase()}-202610`;
      const offAuditId = `aud-off-${depot.id}`;
      const offAuditAlias = `audit-off-${depot.code.toLowerCase()}-202610`;

      const selfRecord = getStoredAuditRecord(selfAuditId) || getStoredAuditRecord(selfAuditAlias);
      const offRecord = getStoredAuditRecord(offAuditId) || getStoredAuditRecord(offAuditAlias);

      interface EvidenceDraftItem {
        id?: string;
        original_name?: string;
        preview_url?: string;
        base64?: string;
      }
      interface AnswerRecordDraft {
        option_id?: string | null;
        numeric_value?: number | null;
        note?: string | null;
        evidence?: EvidenceDraftItem[];
        evidences?: EvidenceDraftItem[];
      }

      // Check stored answers and offline drafts across both IDs
      let localDraftSelf: Record<string, AnswerRecordDraft> = {};
      let localDraftOff: Record<string, AnswerRecordDraft> = {};
      if (typeof window !== 'undefined') {
        try {
          const s1 = localStorage.getItem(`qas_audit_draft_${selfAuditId}`);
          const s2 = localStorage.getItem(`qas_audit_draft_${selfAuditAlias}`);
          if (s1) {
            const parsed = JSON.parse(s1);
            if (parsed?.answers) localDraftSelf = { ...localDraftSelf, ...parsed.answers };
          }
          if (s2) {
            const parsed = JSON.parse(s2);
            if (parsed?.answers) localDraftSelf = { ...localDraftSelf, ...parsed.answers };
          }

          const o1 = localStorage.getItem(`qas_audit_draft_${offAuditId}`);
          const o2 = localStorage.getItem(`qas_audit_draft_${offAuditAlias}`);
          if (o1) {
            const parsed = JSON.parse(o1);
            if (parsed?.answers) localDraftOff = { ...localDraftOff, ...parsed.answers };
          }
          if (o2) {
            const parsed = JSON.parse(o2);
            if (parsed?.answers) localDraftOff = { ...localDraftOff, ...parsed.answers };
          }
        } catch {
          // ignore
        }
      }

      const selfAnswers: Record<string, AnswerRecordDraft> = {
        ...localDraftSelf,
        ...getStoredAuditAnswers(selfAuditId),
        ...getStoredAuditAnswers(selfAuditAlias),
      };

      const offAnswers: Record<string, AnswerRecordDraft> = {
        ...localDraftOff,
        ...getStoredAuditAnswers(offAuditId),
        ...getStoredAuditAnswers(offAuditAlias),
      };

      const isBlind = !isAdmin && !isAuditor && (!offRecord || offRecord.status !== 'SUBMITTED');

      const findAns = (map: Record<string, AnswerRecordDraft>, qId: string, qCode: string): AnswerRecordDraft | null => {
        if (map[qId]) return map[qId];
        if (map[qCode]) return map[qCode];
        const byKey = Object.entries(map).find(
          ([k]) => k.toLowerCase() === qId.toLowerCase() || k.toLowerCase().includes(qCode.toLowerCase())
        );
        if (byKey) return byKey[1];
        return null;
      };

      const fallbackSampleImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const extractEvidences = (ans: AnswerRecordDraft | null, qCode: string) => {
        const list = ans?.evidence || ans?.evidences || [];
        if (!Array.isArray(list) || list.length === 0) return [];
        return list.map((ev, idx) => ({
          id: ev.id || `ev-${qCode}-${idx}`,
          original_name: ev.original_name || `foto_${qCode}_${idx + 1}.jpg`,
          preview_url: ev.preview_url || ev.base64 || fallbackSampleImg,
          base64: ev.preview_url || ev.base64 || fallbackSampleImg,
        }));
      };

      const exportSections = sections.map((sec) => {
        const qItems = sec.questions.map((q) => {
          const sAns = findAns(selfAnswers, q.id, q.code);
          const oAns = isBlind ? null : findAns(offAnswers, q.id, q.code);

          const sScore = sAns?.option_id === 'opt-a' ? 5.0 : sAns?.option_id === 'opt-b' ? 3.0 : sAns?.option_id === 'opt-c' ? 1.0 : (sAns?.numeric_value ?? 4.5);
          const oScore = isBlind
            ? null
            : oAns?.option_id === 'opt-a' ? 5.0 : oAns?.option_id === 'opt-b' ? 3.0 : oAns?.option_id === 'opt-c' ? 1.0 : (oAns?.numeric_value ?? 4.2);
          const gap = sScore !== null && oScore !== null ? Number((oScore - sScore).toFixed(2)) : null;

          return {
            question_id: q.id,
            question_code: q.code,
            prompt: q.prompt,
            weight: 1.0,
            self_score: sScore,
            self_option_label: sAns?.option_id === 'opt-b' ? 'B - Cukup' : 'A - Sangat Baik',
            self_note: sAns?.note || 'Pemeriksaan standar operasional selesai.',
            self_evidences: extractEvidences(sAns, q.code),
            official_score: oScore,
            official_option_label: oAns ? (oAns.option_id === 'opt-b' ? 'B - Cukup' : 'A - Sangat Baik') : null,
            official_note: oAns?.note || (isBlind ? null : 'Hasil verifikasi fisik lapangan sesuai checklist.'),
            official_evidences: extractEvidences(oAns, q.code),
            gap,
          };
        });

        return {
          section_id: sec.id,
          section_code: sec.code,
          section_title: sec.title,
          weight: sec.weight,
          questions: qItems,
        };
      });

      const offScoreVal = offRecord?.score ?? (isBlind ? null : 4.45);
      const selfScoreVal = selfRecord?.score ?? 4.75;
      const scoreGap = offScoreVal !== null && selfScoreVal !== null ? Number((offScoreVal - selfScoreVal).toFixed(2)) : null;

      return {
        cycle_code: 'CYC-2026-10',
        cycle_title: 'Siklus Oktober 2026 - Logistik Tiga Depo Honda',
        period_label: '01/10/2026 s/d 31/10/2026',
        depot_code: depot.code,
        depot_name: depot.name,
        document_type: auditType,
        pic_name: currentUser.primaryRole === 'PIC_QAS' ? currentUser.fullName : 'Ari Imam Safari',
        pic_status: selfRecord?.status || 'SUBMITTED',
        pic_submitted_at: selfRecord?.submitted_at || '2026-10-14T15:30:00Z',
        auditor_name: 'Fajar Pratama (Lead Auditor)',
        auditor_status: offRecord?.status || (isBlind ? 'DRAFT' : 'SUBMITTED'),
        auditor_submitted_at: isBlind ? null : (offRecord?.submitted_at || '2026-10-15T11:20:00Z'),
        overall_self_score: selfScoreVal,
        overall_official_score: offScoreVal,
        overall_gap: scoreGap,
        final_predicate: 'Baik Sekali',
        sections: exportSections,
      };
    });

    return {
      success: true,
      data: reports as unknown as T,
    };
  }


  // 12. Master Questions & Sections Management Endpoints
  if (path === '/api/master/sections' && method === 'GET') {
    return { success: true, data: getMasterSections() as unknown as T };
  }

  if (path.startsWith('/api/master/questions/') && method === 'PUT') {
    const qid = path.split('/')[4];
    let payload: Partial<MasterQuestion> = {};
    try {
      if (typeof options.body === 'string') payload = JSON.parse(options.body);
    } catch {
      // Ignore
    }
    const ok = updateMasterQuestion(qid, payload);
    return { success: ok, data: { question_id: qid, ...payload } as unknown as T };
  }

  if (path === '/api/master/questions' && method === 'POST') {
    let payload: { section_code: string; question: MasterQuestion } = {
      section_code: 'SEC-1',
      question: { id: `q-${Date.now()}`, code: 'P-NEW', prompt: 'Soal baru', is_required: true, evidence_required: false }
    };
    try {
      if (typeof options.body === 'string') payload = JSON.parse(options.body);
    } catch {
      // Ignore
    }
    const ok = addMasterQuestion(payload.section_code, payload.question);
    return { success: ok, data: payload.question as unknown as T };
  }

  if (path.startsWith('/api/master/questions/') && method === 'DELETE') {
    const qid = path.split('/')[4];
    const ok = deleteMasterQuestion(qid);
    return { success: ok, data: { deleted: ok } as unknown as T };
  }

  if (path === '/api/master/reset' && method === 'POST') {
    resetMasterSectionsToDefault();
    return { success: true, data: { reset: true } as unknown as T };
  }

  // 13. Users Management Endpoints
  if (path === '/api/users' && (!method || method === 'GET')) {
    return { success: true, data: getAllUsers() as unknown as T };
  }

  if (path === '/api/users' && method === 'POST') {
    let bodyData: Record<string, unknown> = {};
    try {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body as unknown as Record<string, unknown>) || {};
    } catch {
      // Ignore
    }
    const res = createUser(bodyData as unknown as { fullName: string; email: string; role: 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN'; depotId: string | null });
    if (!res.success) {
      return {
        success: false,
        error: { code: 'USER_CREATE_ERROR', message: res.error || 'Gagal menambahkan pengguna.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    return { success: true, data: res.user as unknown as T };
  }

  if (path.startsWith('/api/users/') && method === 'PUT') {
    const userId = path.split('/')[3];
    let bodyData: Record<string, unknown> = {};
    try {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body as unknown as Record<string, unknown>) || {};
    } catch {
      // Ignore
    }
    const res = updateUser(userId, bodyData);
    if (!res.success) {
      return {
        success: false,
        error: { code: 'USER_UPDATE_ERROR', message: res.error || 'Gagal memperbarui pengguna.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    return { success: true, data: res.user as unknown as T };
  }

  if (path.startsWith('/api/users/') && method === 'DELETE') {
    const userId = path.split('/')[3];
    const res = deleteUser(userId);
    if (!res.success) {
      return {
        success: false,
        error: { code: 'USER_DELETE_ERROR', message: res.error || 'Gagal menghapus pengguna.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    return { success: true, data: { message: 'Pengguna berhasil dihapus.' } as unknown as T };
  }

  // 14. Notifications Endpoints
  if (path === '/api/notifications' && (!method || method === 'GET')) {
    interface MockNotifItem {
      id: string;
      audit_id?: string;
      type: 'INFO' | 'DEADLINE' | 'COMPLETED';
      title: string;
      message: string;
      read_at: string | null;
      created_at: string;
    }
    const defaultNotifs: MockNotifItem[] = [
      {
        id: 'ntf-mock-1',
        type: 'INFO',
        title: 'Siklus Audit Aktif',
        message: 'Siklus audit Oktober 2026 telah aktif untuk seluruh depo.',
        read_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'ntf-mock-2',
        type: 'DEADLINE',
        title: 'Batas Waktu Self Audit',
        message: 'Batas waktu pengisian self audit mendekati batas waktu tanggal 15.',
        read_at: null,
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
    ];
    const stored = getStored<MockNotifItem[]>('notifications', defaultNotifs);
    return { success: true, data: (Array.isArray(stored) ? stored : defaultNotifs) as unknown as T };
  }

  if (path.startsWith('/api/notifications/') && method === 'PATCH') {
    const notifId = path.split('/')[3];
    let bodyData: { read?: boolean } = {};
    try {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body as unknown as { read?: boolean }) || {};
    } catch {
      // ignore
    }
    const stored = getStored<Array<{ id: string; read_at: string | null }>>('notifications', []);
    const updated = (Array.isArray(stored) ? stored : []).map((n) =>
      n.id === notifId ? { ...n, read_at: bodyData.read ? new Date().toISOString() : null } : n
    );
    setStored('notifications', updated);
    return { success: true, data: { success: true } as unknown as T };
  }

  if (path.startsWith('/api/notifications/') && method === 'DELETE') {
    const notifId = path.split('/')[3];
    const stored = getStored<Array<{ id: string }>>('notifications', []);
    const filtered = (Array.isArray(stored) ? stored : []).filter((n) => n.id !== notifId);
    setStored('notifications', filtered);
    return { success: true, data: { success: true } as unknown as T };
  }

  // 15. Forgot Password Endpoints
  if (path === '/api/auth/forgot-password/request' && method === 'POST') {
    let bodyData: { email?: string } = {};
    try {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body as unknown as { email?: string }) || {};
    } catch {
      // ignore
    }
    const res = handleLocalOtpRequest(bodyData.email || '');
    if (!res.success) {
      return {
        success: false,
        error: { code: 'OTP_REQUEST_FAILED', message: res.error || 'Gagal mengirim kode OTP.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    return { success: true, data: res as unknown as T };
  }

  if (path === '/api/auth/forgot-password/reset' && method === 'POST') {
    let bodyData: { email?: string; otp?: string; newPassword?: string; confirmPassword?: string } = {};
    try {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body as unknown as typeof bodyData) || {};
    } catch {
      // ignore
    }
    const res = handleLocalOtpReset(
      bodyData.email || '',
      bodyData.otp || '',
      bodyData.newPassword || '',
      bodyData.confirmPassword || ''
    );
    if (!res.success) {
      return {
        success: false,
        error: { code: 'OTP_RESET_FAILED', message: res.error || 'Gagal mereset kata sandi.' },
      } as unknown as { success: boolean; data?: T; error?: { code: string; message: string } };
    }
    return { success: true, data: res as unknown as T };
  }

  // Fallback default
  return { success: true, data: {} as unknown as T };
}
