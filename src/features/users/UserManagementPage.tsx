import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Edit3, 
  Trash2, 
  X, 
  Lock, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { 
  getActiveDevUser, 
  getAllUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  canUserManageUsers,
  syncUsersFromBackend,
  DEPOTS,
  DemoUserOption
} from '../../lib/api';
import { Button } from '../../components/ui/primitives';

export const UserManagementPage: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<DemoUserOption>(getActiveDevUser());
  const [userList, setUserList] = useState<DemoUserOption[]>(getAllUsers());
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DemoUserOption | null>(null);

  // Form state
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN'>('PIC_QAS');
  const [formDepotIds, setFormDepotIds] = useState<string[]>(['depot-krw']);
  const [formCanManageMaster, setFormCanManageMaster] = useState(false);
  const [formCanManageUsers, setFormCanManageUsers] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const toggleDepotId = (depotId: string) => {
    setFormDepotIds((prev) => {
      if (prev.includes(depotId)) {
        const next = prev.filter((id) => id !== depotId);
        return next.length === 0 ? [depotId] : next;
      } else {
        return [...prev, depotId];
      }
    });
  };

  const hasAccess = canUserManageUsers(currentUser);

  // Sync users list on events and initial backend fetch
  useEffect(() => {
    syncUsersFromBackend();
    const handleSync = () => {
      setUserList(getAllUsers());
      setCurrentUser(getActiveDevUser());
    };
    window.addEventListener('qas-users-changed', handleSync);
    window.addEventListener('qas-role-changed', handleSync);
    return () => {
      window.removeEventListener('qas-users-changed', handleSync);
      window.removeEventListener('qas-role-changed', handleSync);
    };
  }, []);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  const handleOpenAddModal = () => {
    setFormFullName('');
    setFormEmail('');
    setFormRole('PIC_QAS');
    setFormDepotIds(['depot-krw']);
    setFormCanManageMaster(false);
    setFormCanManageUsers(false);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (user: DemoUserOption) => {
    setSelectedUser(user);
    setFormFullName(user.profile.fullName);
    setFormEmail(user.profile.email);
    setFormRole(user.profile.primaryRole);
    const assigned = user.profile.scopes.map((s) => s.depotId).filter(Boolean) as string[];
    setFormDepotIds(assigned.length > 0 ? assigned : ['depot-krw']);
    setFormCanManageMaster(Boolean(user.profile.canManageMaster));
    setFormCanManageUsers(Boolean(user.profile.canManageUsers));
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleOpenDeleteModal = (user: DemoUserOption) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleSubmitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const res = createUser({
      fullName: formFullName,
      email: formEmail,
      role: formRole,
      depotIds: formDepotIds,
      canManageMaster: formCanManageMaster,
      canManageUsers: formCanManageUsers,
    });

    if (!res.success) {
      setFormError(res.error || 'Gagal menambahkan pengguna.');
      return;
    }

    setIsAddModalOpen(false);
    setUserList(getAllUsers());
    showNotification('success', `Pengguna "${formFullName}" berhasil ditambahkan.`);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError(null);

    const res = updateUser(selectedUser.key, {
      fullName: formFullName,
      email: formEmail,
      role: formRole,
      depotIds: formDepotIds,
      canManageMaster: formCanManageMaster,
      canManageUsers: formCanManageUsers,
    });

    if (!res.success) {
      setFormError(res.error || 'Gagal memperbarui pengguna.');
      return;
    }

    setIsEditModalOpen(false);
    setUserList(getAllUsers());
    showNotification('success', `Data pengguna "${formFullName}" berhasil diperbarui.`);
  };

  const handleConfirmDelete = () => {
    if (!selectedUser) return;

    const res = deleteUser(selectedUser.key);
    if (!res.success) {
      showNotification('error', res.error || 'Gagal menghapus pengguna.');
      setIsDeleteModalOpen(false);
      return;
    }

    setIsDeleteModalOpen(false);
    setUserList(getAllUsers());
    showNotification('success', `Pengguna "${selectedUser.profile.fullName}" berhasil dihapus.`);
  };

  // Filtered list
  const filteredUsers = userList.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      u.profile.fullName.toLowerCase().includes(q) ||
      u.profile.email.toLowerCase().includes(q) ||
      u.depotName.toLowerCase().includes(q);
    return matchQuery;
  });

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 shadow-card p-6 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-brand-ink mb-1">Akses Terbatas</h2>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Anda tidak memiliki wewenang untuk mengatur akun pengguna.
          </p>
          <Button variant="primary" onClick={() => (window.location.href = '/')}>
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-between overflow-hidden gap-3 bg-white rounded-2xl border border-brand-line p-3 sm:p-5 shadow-card w-full max-w-full">
      {/* 1. Header Halaman */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-base font-extrabold text-brand-ink">Kelola Akun</h1>
        <button type="button" onClick={handleOpenAddModal} aria-label="Tambah akun" title="Tambah akun" className="w-9 h-9 rounded-xl bg-brand-red text-white grid place-items-center">
          <UserPlus className="w-4 h-4" />
        </button>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold animate-in fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-brand-red'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-brand-red flex-shrink-0" />
          )}
          <span className="flex-1">{feedbackMsg.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pencarian */}
      <div className="flex-shrink-0">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, e-mail, atau depo..."
            className="w-full h-9 pl-8 pr-3 rounded-xl bg-slate-50 border border-brand-line text-xs text-brand-ink placeholder-slate-400 outline-none focus:bg-white focus:border-brand-red"
          />
        </div>

      </div>

      {/* 4. Daftar Pengguna (Scrollable Card Grid) */}
      <div className="flex-1 min-h-0 overflow-y-auto qas-scroll space-y-2 pr-1">
        {filteredUsers.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-slate-400">
            <Users className="w-8 h-8 stroke-1 text-slate-300 mb-1" />
            <p className="text-xs font-bold text-slate-600">Tidak ada pengguna ditemukan</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci pencarian atau filter.</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelf =
              user.profile.email.toLowerCase() === currentUser.profile.email.toLowerCase() ||
              user.key === currentUser.key;

            return (
              <div
                key={user.key}
                className="p-3 rounded-xl bg-white border border-brand-line flex items-center justify-between gap-3 shadow-xs"
              >
                <h4 className="text-sm font-bold text-brand-ink truncate">{user.profile.fullName}</h4>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(user)}
                    className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-lg grid place-items-center text-slate-600 hover:bg-slate-100"
                    title="Ubah data pengguna"
                    aria-label={`Ubah ${user.profile.fullName}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => handleOpenDeleteModal(user)}
                    className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-lg grid place-items-center text-brand-red hover:bg-red-50 disabled:opacity-30"
                    title={isSelf ? 'Tidak dapat menghapus akun Anda sendiri' : 'Hapus pengguna'}
                    aria-label={`Hapus ${user.profile.fullName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: TAMBAH PENGGUNA BARU */}
      {/* ============================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-brand-line shadow-2xl max-w-md w-full max-h-[90dvh] flex flex-col animate-in zoom-in-95 overflow-hidden">
            <div className="p-4 sm:p-5 flex items-center justify-between border-b border-brand-line flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-100 text-brand-red flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-brand-ink">
                  Tambah Pengguna Baru
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center min-h-[36px] min-w-[36px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdd} className="flex-1 overflow-y-auto qas-scroll p-4 sm:p-5 flex flex-col justify-between gap-3 min-h-0">
              <div className="space-y-3">
                {formError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-brand-red text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Lengkap <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-brand-line text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    E-mail Kantor <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="nama.user@daya-motora.com"
                    className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-brand-line text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Peran Utama
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN')}
                    className="w-full h-9 px-2.5 rounded-xl bg-white border border-brand-line text-xs font-semibold text-slate-800 outline-none focus:border-brand-red"
                  >
                    <option value="PIC_QAS">PIC QAS Gudang</option>
                    <option value="AUDITOR_QAS">Auditor QAS</option>
                    <option value="ADMIN">Admin Lead</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Penugasan Depo Gudang ({formDepotIds.length} Depo Dipilih)
                  </label>
                  <div className="grid grid-cols-1 gap-1.5 p-2 rounded-xl bg-slate-50 border border-brand-line">
                    {DEPOTS.map((d) => {
                      const isChecked = formDepotIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-red-50/80 border-red-200 text-brand-red'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDepotId(d.id)}
                              className="w-4 h-4 rounded text-brand-red accent-red-600 cursor-pointer"
                            />
                            <span>Gudang {d.name} ({d.code})</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200">
                            {d.code}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Dapat memilih lebih dari 1 depo (misal: Baros & Cirebon untuk Antonius Trubayu).
                  </p>
                </div>

                {/* Special Permissions Checkboxes */}
                <div className="p-3 rounded-xl bg-slate-50 border border-brand-line space-y-2 mt-1">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Hak Akses Khusus
                  </p>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 min-h-[32px]">
                    <input
                      type="checkbox"
                      checked={formCanManageMaster}
                      onChange={(e) => setFormCanManageMaster(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-red accent-red-600 cursor-pointer"
                    />
                    <span>Kelola Master Soal (Edit katalog pertanyaan & bobot)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 min-h-[32px]">
                    <input
                      type="checkbox"
                      checked={formCanManageUsers}
                      onChange={(e) => setFormCanManageUsers(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-red accent-red-600 cursor-pointer"
                    />
                    <span>Kelola Akun Pengguna (Bisa tambah, edit, atau hapus user)</span>
                  </label>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white pt-3 border-t border-brand-line flex items-center justify-end gap-2 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                  className="min-h-[44px] sm:min-h-0"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="min-h-[44px] sm:min-h-0 font-bold"
                >
                  Simpan Pengguna
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: UBAH DATA PENGGUNA */}
      {/* ============================================================== */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-brand-line shadow-2xl max-w-md w-full max-h-[90dvh] flex flex-col animate-in zoom-in-95 overflow-hidden">
            <div className="p-4 sm:p-5 flex items-center justify-between border-b border-brand-line flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-brand-blue flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-brand-ink">
                  Ubah Data Pengguna
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center min-h-[36px] min-w-[36px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="flex-1 overflow-y-auto qas-scroll p-4 sm:p-5 flex flex-col justify-between gap-3 min-h-0">
              <div className="space-y-3">
                {formError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-brand-red text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Lengkap <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-brand-line text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    E-mail Kantor <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-brand-line text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Peran Utama
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as 'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN')}
                    className="w-full h-9 px-2.5 rounded-xl bg-white border border-brand-line text-xs font-semibold text-slate-800 outline-none focus:border-brand-red"
                  >
                    <option value="PIC_QAS">PIC QAS Gudang</option>
                    <option value="AUDITOR_QAS">Auditor QAS</option>
                    <option value="ADMIN">Admin Lead</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Penugasan Depo Gudang ({formDepotIds.length} Depo Dipilih)
                  </label>
                  <div className="grid grid-cols-1 gap-1.5 p-2 rounded-xl bg-slate-50 border border-brand-line">
                    {DEPOTS.map((d) => {
                      const isChecked = formDepotIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-red-50/80 border-red-200 text-brand-red'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDepotId(d.id)}
                              className="w-4 h-4 rounded text-brand-red accent-red-600 cursor-pointer"
                            />
                            <span>Gudang {d.name} ({d.code})</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200">
                            {d.code}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Dapat memilih lebih dari 1 depo (misal: Baros & Cirebon untuk Antonius Trubayu).
                  </p>
                </div>

                {/* Special Permissions Checkboxes */}
                <div className="p-3 rounded-xl bg-slate-50 border border-brand-line space-y-2 mt-1">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Hak Akses Khusus
                  </p>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 min-h-[32px]">
                    <input
                      type="checkbox"
                      checked={formCanManageMaster}
                      onChange={(e) => setFormCanManageMaster(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-red accent-red-600 cursor-pointer"
                    />
                    <span>Kelola Master Soal (Edit katalog pertanyaan & bobot)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 min-h-[32px]">
                    <input
                      type="checkbox"
                      checked={formCanManageUsers}
                      onChange={(e) => setFormCanManageUsers(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-red accent-red-600 cursor-pointer"
                    />
                    <span>Kelola Akun Pengguna (Bisa tambah, edit, atau hapus user)</span>
                  </label>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white pt-3 border-t border-brand-line flex items-center justify-end gap-2 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditModalOpen(false)}
                  className="min-h-[44px] sm:min-h-0"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="min-h-[44px] sm:min-h-0 font-bold"
                >
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: KONFIRMASI HAPUS PENGGUNA */}
      {/* ============================================================== */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl border border-red-200 shadow-2xl max-w-sm w-full p-4 sm:p-5 flex flex-col gap-3 animate-in zoom-in-95 text-center max-h-[90dvh] overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-red-100 text-brand-red flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-brand-ink">
                Hapus Akun Pengguna?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Apakah Anda yakin ingin menghapus akun{' '}
                <span className="font-bold text-slate-800">{selectedUser.profile.fullName}</span>{' '}
                (<span className="font-mono text-[11px]">{selectedUser.profile.email}</span>)?
              </p>
              <p className="text-[11px] text-brand-red font-semibold mt-2 bg-red-50 p-2 rounded-xl border border-red-100">
                Peringatan: Akun ini tidak akan dapat login lagi ke dalam sistem Audit QAS.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteModalOpen(false)}
                className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none justify-center"
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmDelete}
                className="!bg-brand-red hover:!bg-red-700 min-h-[44px] sm:min-h-0 flex-1 sm:flex-none justify-center"
              >
                Ya, Hapus Akun
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
