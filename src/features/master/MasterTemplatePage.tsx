import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  Plus, 
  FileText, 
  ShieldAlert, 
  CheckCircle, 
  Truck, 
  Trash2
} from 'lucide-react';
import { 
  getMasterSections, 
  updateMasterQuestion, 
  addMasterQuestion, 
  deleteMasterQuestion, 
  syncMasterSectionsFromBackend,
  getActiveDevUser,
  MasterSection, 
  MasterQuestion 
} from '../../lib/api';
import { Button, Pagination } from '../../components/ui/primitives';

export const MasterTemplatePage: React.FC = () => {
  const [sections, setSections] = useState<MasterSection[]>(getMasterSections());
  const [selectedSectionCode, setSelectedSectionCode] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modal edit & delete states
  const [editingQuestion, setEditingQuestion] = useState<MasterQuestion | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<{ id: string; code: string; prompt: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newQuestionForm, setNewQuestionForm] = useState({
    code: '',
    prompt: '',
    sectionCode: 'J1-DIS',
    is_required: true,
    evidence_required: true,
  });

  // Long-press state untuk menampilkan icon hapus pada kartu soal
  const [activeDeleteQuestionId, setActiveDeleteQuestionId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);

  const handleTouchStart = (qId: string) => {
    isLongPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setActiveDeleteQuestionId(qId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch {
          // ignore
        }
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = (q: MasterQuestion) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    if (activeDeleteQuestionId) {
      setActiveDeleteQuestionId(null);
      return;
    }
    setEditingQuestion(q);
  };

  const activeUser = getActiveDevUser();
  const canManageMaster = Boolean(activeUser.profile.canManageMaster);

  useEffect(() => {
    syncMasterSectionsFromBackend();
    const handleMasterChanged = () => {
      setSections(getMasterSections());
    };
    window.addEventListener('qas-master-changed', handleMasterChanged);
    return () => window.removeEventListener('qas-master-changed', handleMasterChanged);
  }, []);

  const showNotification = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Flatten all questions with section info
  const allFlattenedQuestions = useMemo(() => {
    return sections.flatMap((sec) =>
      (sec.questions || []).map((q) => ({
        ...q,
        sectionTitle: sec.title,
        sectionCode: sec.code,
      }))
    );
  }, [sections]);

  // Section summary metrics for 4 Category Cards
  const categoryCards = [
    {
      code: 'J1-DIS',
      label: 'Kualitas Proses',
      sublabel: 'J1 - Distribusi AHM',
      icon: FileText,
      tone: 'blue',
      bgColor: 'bg-brand-blueSoft text-brand-blue',
      count: sections.find((s) => s.code === 'J1-DIS')?.questions?.length || 3,
    },
    {
      code: 'J1-NRFS',
      label: 'Kepatuhan Dokumen',
      sublabel: 'J1 - Unit NRFS',
      icon: CheckCircle,
      tone: 'amber',
      bgColor: 'bg-brand-amberSoft text-amber-600',
      count: sections.find((s) => s.code === 'J1-NRFS')?.questions?.length || 9,
    },
    {
      code: 'J1-MNT',
      label: 'Keselamatan Kerja',
      sublabel: 'J1 - Maintenance',
      icon: ShieldAlert,
      tone: 'red',
      bgColor: 'bg-brand-redSoft text-brand-red',
      count: sections.find((s) => s.code === 'J1-MNT')?.questions?.length || 2,
    },
    {
      code: 'J2-DIS',
      label: 'Distribusi Dealer',
      sublabel: 'J2 - MD to Dealer',
      icon: Truck,
      tone: 'green',
      bgColor: 'bg-brand-greenSoft text-brand-green',
      count: sections.find((s) => s.code === 'J2-DIS')?.questions?.length || 5,
    },
  ];

  // Filtering
  const filteredQuestions = useMemo(() => {
    return allFlattenedQuestions.filter((q) => {
      const matchSection = selectedSectionCode === 'ALL' || q.sectionCode === selectedSectionCode;
      const matchSearch =
        !searchQuery ||
        q.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchLevel =
        levelFilter === 'ALL' ||
        (levelFilter === 'EVIDENCE' && q.evidence_required) ||
        (levelFilter === 'NO_EVIDENCE' && !q.evidence_required);

      return matchSection && matchSearch && matchLevel;
    });
  }, [allFlattenedQuestions, selectedSectionCode, searchQuery, levelFilter]);

  const itemsPerPage = 6;
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / itemsPerPage));
  const displayedQuestions = filteredQuestions.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  // Save edited question
  const handleSaveQuestionEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    updateMasterQuestion(editingQuestion.id, {
      code: editingQuestion.code,
      prompt: editingQuestion.prompt,
      is_required: editingQuestion.is_required,
      evidence_required: editingQuestion.evidence_required,
      options: editingQuestion.options,
    });

    setEditingQuestion(null);
    setSections(getMasterSections());
    showNotification(`Instrumen ${editingQuestion.code} berhasil diperbarui.`);
  };

  // Add new question
  const handleAddQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionForm.code || !newQuestionForm.prompt) return;

    const newQ: MasterQuestion = {
      id: `q-${Date.now()}`,
      code: newQuestionForm.code.toUpperCase(),
      prompt: newQuestionForm.prompt,
      is_required: newQuestionForm.is_required,
      evidence_required: newQuestionForm.evidence_required,
    };

    addMasterQuestion(newQuestionForm.sectionCode, newQ);
    setShowAddModal(false);
    setNewQuestionForm({
      code: '',
      prompt: '',
      sectionCode: 'J1-DIS',
      is_required: true,
      evidence_required: false,
    });
    setSections(getMasterSections());
    showNotification(`Soal baru ${newQ.code} berhasil ditambahkan.`);
  };

  return (
    <div className="h-full flex flex-col justify-between overflow-hidden gap-2.5 sm:gap-3 bg-white rounded-2xl border border-brand-line p-3 sm:p-5 shadow-card">
      {/* 1. Header: Judul & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-brand-ink tracking-tight">Master Soal</h1>
          <p className="text-[11px] text-brand-muted hidden sm:block">
            Kelola daftar pertanyaan audit sesuai standar mutu yang berlaku.
          </p>
        </div>

        {statusMessage && (
          <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-in fade-in">
            {statusMessage}
          </div>
        )}
      </div>

      {/* 2. Search & Filter Bar Row (Matching Mockup Screen 3) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Cari pertanyaan..."
            className="w-full h-9 pl-8 pr-3 rounded-xl bg-brand-bg border border-brand-line text-xs text-brand-ink placeholder-slate-400 outline-none focus:border-brand-red focus:ring-1 focus:ring-red-100"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Kategori */}
          <select
            value={selectedSectionCode}
            onChange={(e) => {
              setSelectedSectionCode(e.target.value);
              setPage(0);
            }}
            className="h-9 px-2.5 rounded-xl bg-white border border-brand-line text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-brand-red cursor-pointer"
          >
            <option value="ALL">Semua Kategori</option>
            <option value="J1-DIS">Kualitas Proses (J1-DIS)</option>
            <option value="J1-NRFS">Kepatuhan Dokumen (J1-NRFS)</option>
            <option value="J1-MNT">Keselamatan Kerja (J1-MNT)</option>
            <option value="J2-DIS">Distribusi Dealer (J2-DIS)</option>
          </select>

          {/* Filter Level / Bukti */}
          <select
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value);
              setPage(0);
            }}
            className="h-9 px-2.5 rounded-xl bg-white border border-brand-line text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-brand-red cursor-pointer"
          >
            <option value="ALL">Semua Level</option>
            <option value="EVIDENCE">Wajib Bukti</option>
            <option value="NO_EVIDENCE">Opsional</option>
          </select>

          {/* Tombol Tambah Soal (Hanya yang berhak) */}
          {canManageMaster && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAddModal(true)}
              className="font-bold flex-shrink-0"
            >
              + Tambah Soal
            </Button>
          )}
        </div>
      </div>

      {/* 3. Four Category Summary Cards (Matching Mockup Screen 3) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 flex-shrink-0">
        {categoryCards.map((card) => {
          const isSelected = selectedSectionCode === card.code;
          const Icon = card.icon;
          return (
            <div
              key={card.code}
              onClick={() => {
                setSelectedSectionCode(isSelected ? 'ALL' : card.code);
                setPage(0);
              }}
              className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                isSelected
                  ? 'border-brand-red bg-red-50/40 ring-1 ring-brand-red shadow-xs'
                  : 'border-brand-line bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${card.bgColor}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-brand-ink block truncate leading-tight">
                  {card.label}
                </span>
                <span className="text-[10px] text-brand-muted mt-0.5 block leading-tight">
                  {card.count} soal
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Daftar Soal Ringkas (Cukup: 1. Uraian Soal, Klik langsung formulir mengambang, Tekan lama muncul icon hapus) */}
      <div className="flex-1 min-h-0 overflow-y-auto qas-scroll pr-1">
        <div className="grid grid-cols-1 gap-2">
          {displayedQuestions.map((q, idx) => {
            const displayNo = page * itemsPerPage + idx + 1;
            const isDeleteActive = activeDeleteQuestionId === q.id;

            return (
              <div
                key={q.id}
                onMouseDown={() => handleTouchStart(q.id)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                onTouchStart={() => handleTouchStart(q.id)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
                onClick={() => handleCardClick(q)}
                className={`w-full rounded-xl border p-3 shadow-2xs flex items-center justify-between gap-3 cursor-pointer select-none transition-all active:scale-[0.99] ${
                  isDeleteActive
                    ? 'border-red-300 bg-red-50/40 ring-1 ring-red-400'
                    : 'border-brand-line bg-white hover:bg-slate-50/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-500 flex-shrink-0 pt-0.5">
                    {displayNo}.
                  </span>
                  <p className="text-xs font-bold text-brand-ink leading-snug break-words">
                    {q.prompt}
                  </p>
                </div>

                {/* Icon Hapus muncul HANYA jika baris ditekan lama (Long-Press) */}
                {isDeleteActive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuestionToDelete({ id: q.id, code: q.code, prompt: q.prompt });
                      setActiveDeleteQuestionId(null);
                    }}
                    className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-brand-red flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xs transition-transform active:scale-95 animate-in fade-in zoom-in-90"
                    title="Hapus soal ini"
                  >
                    <Trash2 className="w-4 h-4 text-brand-red" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Footer: Total Pertanyaan & Pagination */}
      <div className="flex items-center justify-between pt-2 border-t border-brand-line flex-shrink-0 text-xs">
        <span className="text-[11px] text-brand-muted">
          Total {filteredQuestions.length} pertanyaan
        </span>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* Modal Edit Soal & Opsi Bobot */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-up">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-brand-line flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-brand-ink">
                Pengaturan Instrumen ({editingQuestion.code})
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuestionEdit} className="p-3.5 text-xs flex-1 min-h-0 flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Kode Soal</label>
                <input
                  type="text"
                  required
                  disabled={!canManageMaster}
                  value={editingQuestion.code}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, code: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-brand-line rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Teks Pertanyaan</label>
                <textarea
                  rows={3}
                  required
                  disabled={!canManageMaster}
                  value={editingQuestion.prompt}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, prompt: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-brand-line rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2 rounded-lg border border-brand-line bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManageMaster}
                    checked={editingQuestion.is_required}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, is_required: e.target.checked })}
                    className="rounded text-brand-red"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Akses Galeri</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-brand-line bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManageMaster}
                    checked={editingQuestion.evidence_required}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, evidence_required: e.target.checked })}
                    className="rounded text-brand-red"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Wajib Foto Bukti</span>
                </label>
              </div>

              {/* Opsi & Bobot Nilai */}
              <div className="pt-2 border-t border-brand-line space-y-2 flex-1 min-h-0 overflow-y-auto qas-scroll pr-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Opsi Skoring & Bobot:</span>
                {(editingQuestion.options || []).map((opt, i) => (
                  <div key={opt.id} className="p-2 rounded-lg border border-brand-line bg-slate-50/70 flex gap-2 items-center flex-wrap sm:flex-nowrap">
                    <span className="text-[10px] font-bold text-slate-500 w-10 flex-shrink-0">{opt.code}</span>
                    <input
                      type="text"
                      disabled={!canManageMaster}
                      value={opt.label}
                      onChange={(e) => {
                        const newOpts = [...(editingQuestion.options || [])];
                        newOpts[i].label = e.target.value;
                        setEditingQuestion({ ...editingQuestion, options: newOpts });
                      }}
                      className="flex-1 px-2 py-1 text-xs border border-brand-line rounded bg-white min-w-[120px]"
                    />
                    <input
                      type="number"
                      step="0.5"
                      disabled={!canManageMaster || opt.is_na}
                      value={opt.numeric_value ?? ''}
                      placeholder="N/A"
                      onChange={(e) => {
                        const newOpts = [...(editingQuestion.options || [])];
                        newOpts[i].numeric_value = e.target.value === '' ? null : parseFloat(e.target.value);
                        setEditingQuestion({ ...editingQuestion, options: newOpts });
                      }}
                      className="w-14 px-1.5 py-1 text-xs border border-brand-line rounded bg-white text-center font-bold flex-shrink-0"
                    />
                    {/* Tombol Toggle Improvement */}
                    <button
                      type="button"
                      disabled={!canManageMaster || opt.is_na}
                      onClick={() => {
                        const newOpts = [...(editingQuestion.options || [])];
                        newOpts[i] = { ...newOpts[i], is_improvement: !newOpts[i].is_improvement };
                        setEditingQuestion({ ...editingQuestion, options: newOpts });
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border transition-all flex-shrink-0 cursor-pointer ${
                        opt.is_improvement
                          ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                          : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                      }`}
                      title="Tandai sebagai Improvement"
                    >
                      <span>Improvement</span>
                    </button>

                    {/* Tombol Hapus Opsi (minimal 2 opsi) */}
                    {canManageMaster && (editingQuestion.options || []).length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newOpts = (editingQuestion.options || []).filter((_, idx) => idx !== i);
                          setEditingQuestion({ ...editingQuestion, options: newOpts });
                        }}
                        className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 flex-shrink-0 cursor-pointer"
                        title="Hapus opsi ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Tombol Tambah Opsi Jawaban Baru */}
                {canManageMaster && (
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        const currentOpts = editingQuestion.options || [];
                        const nextCode = `OPT-${String.fromCharCode(65 + currentOpts.length)}`;
                        const newOption = {
                          id: `opt-${Date.now()}-${currentOpts.length}`,
                          code: nextCode,
                          label: `Pilihan ${nextCode}`,
                          numeric_value: 3.0,
                          display_order: currentOpts.length + 1,
                          is_na: false,
                          is_improvement: false,
                        };
                        setEditingQuestion({
                          ...editingQuestion,
                          options: [...currentOpts, newOption],
                        });
                      }}
                      className="text-[11px] font-bold text-brand-blue hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Tambah Jawaban</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-brand-line">
                <Button variant="outline" size="sm" onClick={() => setEditingQuestion(null)}>
                  Batal
                </Button>
                {canManageMaster && (
                  <Button variant="primary" size="sm" type="submit">
                    Simpan Perubahan
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Soal Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-up">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-brand-line pb-2">
              <h3 className="text-sm font-extrabold text-brand-ink">Tambah Soal Baru</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddQuestionSubmit} className="space-y-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Kategori Bagian</label>
                <select
                  value={newQuestionForm.sectionCode}
                  onChange={(e) => setNewQuestionForm({ ...newQuestionForm, sectionCode: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-brand-line rounded-lg"
                >
                  <option value="J1-DIS">Kualitas Proses (J1-DIS)</option>
                  <option value="J1-NRFS">Kepatuhan Dokumen (J1-NRFS)</option>
                  <option value="J1-MNT">Keselamatan Kerja (J1-MNT)</option>
                  <option value="J2-DIS">Distribusi Dealer (J2-DIS)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Kode Soal</label>
                <input
                  type="text"
                  required
                  placeholder="Mis: J1-13"
                  value={newQuestionForm.code}
                  onChange={(e) => setNewQuestionForm({ ...newQuestionForm, code: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-brand-line rounded-lg font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Teks Pertanyaan</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Masukkan kalimat pertanyaan standar mutu..."
                  value={newQuestionForm.prompt}
                  onChange={(e) => setNewQuestionForm({ ...newQuestionForm, prompt: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-brand-line rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2 rounded-lg border border-brand-line bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newQuestionForm.is_required}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, is_required: e.target.checked })}
                    className="rounded text-brand-red"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Akses Galeri</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-brand-line bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newQuestionForm.evidence_required}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, evidence_required: e.target.checked })}
                    className="rounded text-brand-red"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Wajib Foto Bukti</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                  Batal
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Simpan Soal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Validasi Hapus Soal (Shadow Smooth Modern Putih) */}
      {questionToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 sm:p-6 max-w-sm w-full mx-auto space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-brand-red flex items-center justify-center flex-shrink-0 border border-red-100 shadow-xs">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900">Hapus Soal Master?</h3>
                <p className="text-xs text-slate-500 font-mono">Kode: {questionToDelete.code}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus soal ini dari standar mutu master? Perubahan akan berlaku pada siklus audit berikutnya.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuestionToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMasterQuestion(questionToDelete.id);
                  setSections(getMasterSections());
                  showNotification(`Soal ${questionToDelete.code} berhasil dihapus.`);
                  setQuestionToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-500/20 transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
