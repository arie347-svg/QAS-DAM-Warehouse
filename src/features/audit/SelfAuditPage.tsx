import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle,
  Camera, 
  Image as ImageIcon,
  Sparkles, 
  X, 
  Lock, 
  Save, 
  RotateCw,
  Loader2
} from 'lucide-react';

const BroomIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14 3L21 10" />
    <path d="M12 5L19 12" />
    <path d="M11 13L16 8" />
    <path d="M3 21l3-1 7-7-4-4-7 7-1 3z" />
    <path d="M6 18l2 2" />
    <path d="M8 14l4 4" />
  </svg>
);
import { 
  saveDraftLocally, 
  getDraftAnswers, 
  clearDraftLocally,
  markDraftAnswerSynced,
} from '../../lib/offlineDraft';
import { 
  apiFetch, 
  getActiveDevUser, 
  getStoredAuditRecord, 
  getStoredAuditAnswers,
  getMasterSections,
  MasterQuestion
} from '../../lib/api';
import { Button } from '../../components/ui/primitives';
import { compressAuditImage } from '../../lib/imageCompression';
import { calculateQASAuditIndex, getQASPredicate, getQASPredicateBadgeColors } from '../../lib/scoring';

interface Option {
  id: string;
  code: string;
  label: string;
  numeric_value: number | null;
  display_order: number;
  is_na: boolean;
  is_improvement?: boolean;
}

interface Question {
  id: string;
  section_id: string;
  code: string;
  prompt: string;
  display_order: number;
  evidence_required: boolean;
  is_required: boolean;
  options: Option[];
  self_answer?: {
    option_id: string | null;
    option_label: string | null;
    numeric_value?: number | null;
    note: string | null;
    improvement_title?: string;
    evidence: Array<{
      id: string;
      original_name: string;
      size_bytes: number;
      preview_url?: string;
    }>;
  };
  current_answer?: {
    id: string;
    option_id: string | null;
    note: string | null;
    improvement_title?: string;
    evidence_count: number;
    evidence: Array<{
      id: string;
      original_name: string;
      size_bytes: number;
      preview_url?: string;
    }>;
  };
}

interface Section {
  id: string;
  code: string;
  title: string;
  display_order: number;
  questions: Question[];
}

function mapMasterOptionsToAuditOptions(mqOptions: MasterQuestion['options'] | undefined, fallbackOptions: Option[]): Option[] {
  if (!mqOptions || mqOptions.length === 0) return fallbackOptions;
  return mqOptions.map((o, idx) => ({
    id: o.id,
    code: o.code,
    label: o.label,
    numeric_value: o.numeric_value,
    display_order: idx + 1,
    is_na: Boolean(o.is_na),
    is_improvement: Boolean(o.is_improvement),
  }));
}

interface AuditData {
  audit: {
    id: string;
    cycle_id: string;
    depot_id: string;
    audit_type: 'SELF' | 'OFFICIAL';
    status: 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID';
    submitted_at: string | null;
    score?: number | null;
    version?: number;
  };
  cycle: {
    id: string;
    code: string;
    title: string;
    self_due_at: string;
  };
  depot: {
    id: string;
    code: string;
    name: string;
  };
  sections: Section[];
}

type SyncStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'offline' | 'conflict';

export const SelfAuditPage: React.FC = () => {
  const { id: auditId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeUser, setActiveUser] = useState(() => getActiveDevUser());

  useEffect(() => {
    const handleAuth = () => setActiveUser(getActiveDevUser());
    window.addEventListener('qas-role-changed', handleAuth);
    window.addEventListener('qas-auth-changed', handleAuth);
    return () => {
      window.removeEventListener('qas-role-changed', handleAuth);
      window.removeEventListener('qas-auth-changed', handleAuth);
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const savedUntilRef = useRef<number>(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSyncStatusWithPriority = (newStatus: SyncStatus) => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    // Status conflict, offline, unsaved, dan saving diprioritaskan langsung
    if (newStatus === 'conflict' || newStatus === 'offline' || newStatus === 'unsaved' || newStatus === 'saving') {
      savedUntilRef.current = 0;
      setSyncStatus(newStatus);
      return;
    }

    if (newStatus === 'saved') {
      setSyncStatus('saved');
      savedUntilRef.current = Date.now() + 1500;
      return;
    }

    const remaining = savedUntilRef.current - Date.now();
    if (remaining > 0) {
      statusTimerRef.current = setTimeout(() => {
        setSyncStatus(newStatus);
      }, remaining);
    } else {
      setSyncStatus(newStatus);
    }
  };

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Floating Modal Form State
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [modalOptionId, setModalOptionId] = useState<string | null>(null);
  const [modalNote, setModalNote] = useState<string>('');
  const [modalImprovementTitle, setModalImprovementTitle] = useState<string>('');
  const [modalEvidence, setModalEvidence] = useState<
    Array<{ id: string; original_name: string; size_bytes: number; preview_url?: string; base64_data?: string }>
  >([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Local answers state: questionId -> answer
  const [answersState, setAnswersState] = useState<
    Record<
      string,
      {
        option_id: string | null;
        note: string;
        improvement_title?: string;
        evidence: Array<{ id: string; original_name: string; size_bytes: number; preview_url?: string; base64_data?: string }>;
        updated_at?: string;
      }
    >
  >({});
  const [auditVersion, setAuditVersion] = useState<number>(1);
  const [loadError, setLoadError] = useState<{
    code: string;
    message: string;
    requestId?: string;
  } | null>(null);

  // Load audit data from server & local cache
  useEffect(() => {
    async function loadAudit() {
      if (!auditId) return;
      try {
        setLoading(true);
        setLoadError(null);
        const json = await apiFetch<AuditData>(`/api/audits/${auditId}`);
        if (json.success && json.data) {
          // Sinkronisasi metadata soal (Akses Galeri & Wajib Foto Bukti) langsung dari Master Template
          const masterSecs = getMasterSections();
          const masterQMap = new Map<string, MasterQuestion>();
          masterSecs.forEach((sec) => {
            sec.questions.forEach((mq) => {
              masterQMap.set(mq.id, mq);
              masterQMap.set(mq.code, mq);
            });
          });

          json.data.sections = json.data.sections.map((sec) => ({
            ...sec,
            questions: sec.questions.map((q) => {
              const mq = masterQMap.get(q.id) || masterQMap.get(q.code);
              if (!mq) return q;
              return {
                ...q,
                prompt: mq.prompt,
                code: mq.code,
                is_required: Boolean(mq.is_required),
                evidence_required: Boolean(mq.evidence_required),
                options: mapMasterOptionsToAuditOptions(mq.options, q.options),
              };
            }),
          }));

          setAuditData(json.data);

          const initialMap: Record<
            string,
            {
              option_id: string | null;
              note: string;
              improvement_title?: string;
              evidence: Array<{ id: string; original_name: string; size_bytes: number; preview_url?: string; base64_data?: string }>;
              updated_at?: string;
            }
          > = {};

          json.data.sections.forEach((sec) => {
            sec.questions.forEach((q) => {
              initialMap[q.id] = {
                option_id: q.current_answer?.option_id || null,
                note: q.current_answer?.note || '',
                improvement_title: q.current_answer?.improvement_title || '',
                evidence: (q.current_answer?.evidence || []).map((e) => ({
                  ...e,
                  preview_url: e.preview_url || `/api/evidence/${e.id}`,
                })),
              };
            });
          });

          // Check stored records & offline drafts across both IDs
          const depotCode = (json.data.depot?.code || 'krw').toLowerCase();
          const prefix = json.data.audit.audit_type === 'OFFICIAL' ? 'off' : 'self';
          const alias1 = `aud-${prefix}-${json.data.depot.id}`;
          const alias2 = `audit-${prefix}-${depotCode}-202610`;

          const storedRec = getStoredAuditRecord(auditId) || getStoredAuditRecord(alias1) || getStoredAuditRecord(alias2);
          if (storedRec && storedRec.status === 'SUBMITTED') {
            json.data.audit.status = 'SUBMITTED';
            if (storedRec.score !== undefined && storedRec.score !== null) {
              json.data.audit.score = storedRec.score;
            }
            if (storedRec.submitted_at) {
              json.data.audit.submitted_at = storedRec.submitted_at;
            }
          }

          // Pending IndexedDB entries are an offline queue. D1 remains the source of truth.
          let pendingDrafts: Awaited<ReturnType<typeof getDraftAnswers>> = null;
          if (json.data.audit.status === 'DRAFT') {
            const drafts = await getDraftAnswers(auditId);
            if (drafts) {
              pendingDrafts = drafts;
              Object.keys(drafts.answers).forEach((qId) => {
                const localAnswer = drafts.answers[qId];
                if (initialMap[qId] && localAnswer.syncState !== 'synced') {
                  initialMap[qId].option_id = drafts.answers[qId].optionId;
                  initialMap[qId].note = drafts.answers[qId].note || '';
                  if (drafts.answers[qId].improvementTitle) {
                    initialMap[qId].improvement_title = drafts.answers[qId].improvementTitle;
                  }
                  if (drafts.answers[qId].evidence && drafts.answers[qId].evidence.length > 0) {
                    initialMap[qId].evidence = drafts.answers[qId].evidence.map((e) => ({
                      ...e,
                      preview_url: e.preview_url || `/api/evidence/${e.id}`,
                    }));
                  }
                }
              });
            }
          }

          // Local mock data is available only during local development.
          const stored = import.meta.env.DEV
            ? (getStoredAuditAnswers(auditId) || getStoredAuditAnswers(alias1) || getStoredAuditAnswers(alias2))
            : null;
          if (stored) {
            Object.entries(stored).forEach(([qId, val]) => {
              if (initialMap[qId]) {
                if (val.option_id) initialMap[qId].option_id = val.option_id;
                if (val.note) initialMap[qId].note = val.note;
                if (val.improvement_title) initialMap[qId].improvement_title = val.improvement_title;
                if (val.evidence && val.evidence.length > 0) {
                  initialMap[qId].evidence = val.evidence.map((ev, i) => ({
                    id: ev.id || `ev-${i}`,
                    original_name: ev.original_name,
                    size_bytes: ev.size_bytes,
                    preview_url: ev.preview_url || (ev as { base64?: string }).base64 || `/api/evidence/${ev.id}`,
                  }));
                }
              }
            });
          }

          setAuditData(json.data);
          if (json.data.audit?.version) {
            setAuditVersion(json.data.audit.version);
          }
          setAnswersState(initialMap);
          const entriesToSync = Object.entries(pendingDrafts?.answers || {}).filter(
            ([, answer]) => answer.syncState !== 'synced'
          );
          if (entriesToSync.length === 0) {
            updateSyncStatusWithPriority('saved');
          } else {
            updateSyncStatusWithPriority('saving');
            let currentVersion = json.data.audit.version ?? 1;
            let allSynced = true;
            for (const [questionId, answer] of entriesToSync) {
              const synced = await apiFetch<{ id: string; new_version: number }>(
                `/api/audits/${auditId}/answers/${questionId}`,
                {
                  method: 'PUT',
                  body: JSON.stringify({
                    question_id: questionId,
                    option_id: answer.optionId,
                    note: answer.note || '',
                    improvement_title: answer.improvementTitle || '',
                    client_version: currentVersion,
                    client_updated_at: answer.updatedAt,
                  }),
                }
              );
              if (!synced.success || !synced.data) {
                allSynced = false;
                updateSyncStatusWithPriority(synced.error?.code === 'CONFLICT' ? 'conflict' : 'offline');
                break;
              }
              for (const photo of answer.evidence?.filter((item) => item.base64_data) || []) {
                const upload = await apiFetch(`/api/answers/${synced.data.id}/evidence`, {
                  method: 'POST',
                  body: JSON.stringify({
                    original_name: photo.original_name,
                    mime_type: 'image/jpeg',
                    size_bytes: photo.size_bytes,
                    base64_data: photo.base64_data,
                  }),
                });
                if (!upload.success) {
                  updateSyncStatusWithPriority('offline');
                  return;
                }
              }
              currentVersion = synced.data.new_version;
              await markDraftAnswerSynced(auditId, questionId, currentVersion);
            }
            setAuditVersion(currentVersion);
            if (allSynced) updateSyncStatusWithPriority('saved');
          }
        } else {
          const errorInfo = json.error as { code?: string; message?: string; requestId?: string } | undefined;
          const jsonObj = json as { requestId?: string };
          setLoadError({
            code: json.error?.code || 'AUDIT_NOT_FOUND',
            message: json.error?.message || 'Gagal memuat lembar audit dari server.',
            requestId: jsonObj.requestId || errorInfo?.requestId,
          });
        }
      } catch (err: unknown) {
        console.warn('Gagal memuat detail audit:', err);
        const errorObj = err as { code?: string; message?: string; requestId?: string } | undefined;
        setLoadError({
          code: errorObj?.code || 'NETWORK_OR_SERVER_ERROR',
          message: errorObj?.message || 'Terjadi kesalahan jaringan atau server saat memuat audit.',
          requestId: errorObj?.requestId,
        });
      } finally {
        setLoading(false);
      }
    }
    loadAudit();
  }, [auditId]);

  // Sinkronisasi real-time ketika master template diubah (Akses Galeri, Wajib Foto Bukti, teks dsb)
  useEffect(() => {
    const handleMasterChanged = () => {
      const masterSecs = getMasterSections();
      const masterQMap = new Map<string, MasterQuestion>();
      masterSecs.forEach((sec) => {
        sec.questions.forEach((mq) => {
          masterQMap.set(mq.id, mq);
          masterQMap.set(mq.code, mq);
        });
      });

      setAuditData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((sec) => ({
            ...sec,
            questions: sec.questions.map((q) => {
              const mq = masterQMap.get(q.id) || masterQMap.get(q.code);
              if (!mq) return q;
              return {
                ...q,
                prompt: mq.prompt,
                code: mq.code,
                is_required: Boolean(mq.is_required),
                evidence_required: Boolean(mq.evidence_required),
                options: mapMasterOptionsToAuditOptions(mq.options, q.options),
              };
            }),
          })),
        };
      });

      setEditingQuestion((prev) => {
        if (!prev) return null;
        const mq = masterQMap.get(prev.id) || masterQMap.get(prev.code);
        if (!mq) return prev;
        return {
          ...prev,
          prompt: mq.prompt,
          code: mq.code,
          is_required: Boolean(mq.is_required),
          evidence_required: Boolean(mq.evidence_required),
          options: mapMasterOptionsToAuditOptions(mq.options, prev.options),
        };
      });
    };

    window.addEventListener('qas-master-changed', handleMasterChanged);
    return () => window.removeEventListener('qas-master-changed', handleMasterChanged);
  }, []);

  // Flattened questions list
  const allQuestions = useMemo(() => {
    if (!auditData) return [];
    return auditData.sections.flatMap((s) => s.questions);
  }, [auditData]);

  const isSubmitted = auditData?.audit.status === 'SUBMITTED';
  const isOfficialAudit = auditData?.audit.audit_type === 'OFFICIAL';
  const isSelfAudit = auditData?.audit.audit_type === 'SELF';

  // Role permissions
  const canEdit = useMemo(() => {
    if (isSubmitted) return false;
    if (activeUser.profile.primaryRole === 'ADMIN') return true;
    if (isSelfAudit) {
      return (
        activeUser.profile.primaryRole === 'PIC_QAS' &&
        (activeUser.profile.isGlobalAccess || activeUser.profile.scopes.some((s) => s.depotId === auditData?.depot.id))
      );
    }
    if (isOfficialAudit) {
      return activeUser.profile.primaryRole === 'AUDITOR_QAS';
    }
    return false;
  }, [isSubmitted, activeUser, isSelfAudit, isOfficialAudit, auditData]);

  // Compute progress counts
  const totalQuestions = allQuestions.length;
  const answeredCount = useMemo(() => {
    return allQuestions.filter((q) => answersState[q.id]?.option_id !== null && answersState[q.id]?.option_id !== undefined).length;
  }, [allQuestions, answersState]);

  const evidenceRequiredQuestions = useMemo(() => {
    return allQuestions.filter((q) => q.evidence_required);
  }, [allQuestions]);

  const missingEvidenceCount = useMemo(() => {
    return evidenceRequiredQuestions.filter((q) => {
      const ev = answersState[q.id]?.evidence;
      return !ev || ev.length === 0;
    }).length;
  }, [evidenceRequiredQuestions, answersState]);

  const questionSectionMap = useMemo(() => {
    if (!auditData) return {};
    const map: Record<string, string> = {};
    auditData.sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        map[q.id] = sec.code;
        map[q.code] = sec.code;
      });
    });
    return map;
  }, [auditData]);

  const cycleMonthName = useMemo(() => {
    if (!auditData?.cycle?.title) return 'Oktober';
    const match = auditData.cycle.title.match(/(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)/i);
    return match ? match[0] : auditData.cycle.title;
  }, [auditData]);

  // Mapping numeric_value dari options berdasarkan answersState
  const scoringAnswersMap = useMemo(() => {
    const map: Record<string, { option_id?: string | null; numeric_value?: number | null }> = {};
    allQuestions.forEach((q) => {
      const ans = answersState[q.id];
      if (ans && ans.option_id) {
        const opt = q.options.find((o) => o.id === ans.option_id);
        map[q.id] = {
          option_id: ans.option_id,
          numeric_value: opt?.numeric_value ?? null,
        };
      }
    });
    return map;
  }, [allQuestions, answersState]);

  // Scoring preview: Selalu 0 jika belum ada pertanyaan yang dijawab
  const currentScoring = useMemo(() => {
    if (answeredCount === 0) {
      return {
        index: 0,
        indexFormatted: '0',
        predicate: null,
        predicateColor: null,
      };
    }
    const res = calculateQASAuditIndex(scoringAnswersMap, questionSectionMap);
    const pred = res.index > 0 ? getQASPredicate(res.index) : null;
    return {
      index: res.index,
      indexFormatted: res.index > 0 ? res.indexFormatted : '0',
      predicate: pred,
      predicateColor: pred ? getQASPredicateBadgeColors(pred) : null,
    };
  }, [answeredCount, scoringAnswersMap, questionSectionMap]);

  const predicate = currentScoring.predicate;
  const predicateColors = currentScoring.predicateColor;

  const isReadyToSubmit =
    allQuestions.length > 0 &&
    answeredCount === allQuestions.length &&
    missingEvidenceCount === 0 &&
    syncStatus !== 'saving' &&
    canEdit &&
    !isSubmitted;

  // State & Handler untuk Tekan Lama (Long-Press) & Reset Jawaban (Sapu)
  const [longPressQuestionId, setLongPressQuestionId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const handleTouchStart = (qId: string, isAnswered: boolean) => {
    if (!isAnswered || isSubmitted) return;
    isLongPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setLongPressQuestionId(qId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch {
          // Abaikan jika API vibrasi tidak didukung oleh browser/perangkat
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

  const handleRowClick = (q: Question) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    if (longPressQuestionId) {
      setLongPressQuestionId(null);
      return;
    }
    handleOpenQuestionModal(q);
  };

  // Reset baris pertanyaan yang sudah dijawab
  const handleResetQuestion = async (qId: string) => {
    if (!auditId || isSubmitted) return;

    const nowIso = new Date().toISOString();
    const updatedAnswer = {
      option_id: null,
      note: '',
      improvement_title: undefined,
      evidence: [],
      updated_at: nowIso,
    };

    // 1. Optimistic update local state
    setAnswersState((prev) => ({
      ...prev,
      [qId]: updatedAnswer,
    }));
    setLongPressQuestionId(null);

    // 2. Clear dari cache lokal
    await saveDraftLocally(auditId, qId, null, '', '', []);

    // 3. Simpan ke database / server
    updateSyncStatusWithPriority('saving');
    try {
      const payload = {
        question_id: qId,
        option_id: null,
        note: '',
        improvement_title: '',
        client_version: auditVersion,
        client_updated_at: nowIso,
      };

      const saveRes = await apiFetch<{
        id: string;
        new_version?: number;
        conflict?: boolean;
      }>(`/api/audits/${auditId}/answers/${qId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!saveRes.success || !saveRes.data || saveRes.error?.code === 'CONFLICT' || saveRes.data.conflict) {
        updateSyncStatusWithPriority(saveRes.error?.code === 'CONFLICT' ? 'conflict' : 'offline');
      } else {
        const nextVersion = saveRes.data?.new_version ?? auditVersion + 1;
        setAuditVersion(nextVersion);
        await markDraftAnswerSynced(auditId, qId, nextVersion);
        updateSyncStatusWithPriority('saved');
      }
    } catch {
      updateSyncStatusWithPriority('offline');
    }
  };

  // Open modal for a specific question (sinkronkan dengan setting Master)
  const handleOpenQuestionModal = (q: Question) => {
    const masterSecs = getMasterSections();
    const masterQMap = new Map<string, MasterQuestion>();
    masterSecs.forEach((sec) => {
      sec.questions.forEach((mq) => {
        masterQMap.set(mq.id, mq);
        masterQMap.set(mq.code, mq);
      });
    });

    const mq = masterQMap.get(q.id) || masterQMap.get(q.code);
    const syncedQ: Question = mq
      ? {
          ...q,
          prompt: mq.prompt,
          code: mq.code,
          is_required: Boolean(mq.is_required),
          evidence_required: Boolean(mq.evidence_required),
          options: mapMasterOptionsToAuditOptions(mq.options, q.options),
        }
      : q;

    setEditingQuestion(syncedQ);
    const existing = answersState[q.id];
    setModalOptionId(existing?.option_id || null);
    setModalNote(existing?.note || '');
    setModalImprovementTitle(existing?.improvement_title || '');
    setModalEvidence(existing?.evidence || []);
  };

  // Close modal
  const handleCloseModal = () => {
    setEditingQuestion(null);
    setModalOptionId(null);
    setModalNote('');
    setModalImprovementTitle('');
    setModalEvidence([]);
  };

  // Handle Photo capture / file select
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const compressed = await compressAuditImage(file, {
        maxDimension: 1280,
        quality: 0.8,
      });

      const base64Data = compressed.dataUrl.split(',')[1] || compressed.dataUrl;

      const newEv = {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        original_name: file.name,
        size_bytes: compressed.sizeBytes,
        preview_url: compressed.dataUrl,
        base64_data: base64Data,
      };

      setModalEvidence((prev) => [...prev, newEv].slice(0, 3));
    } catch (err) {
      console.warn('Gagal memproses gambar:', err);
    } finally {
      setIsCompressing(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  // Handle Remove Photo
  const handleRemovePhoto = (photoId: string) => {
    setModalEvidence((prev) => prev.filter((p) => p.id !== photoId));
  };

  // Save Modal Form Answers
  const handleSaveModal = async () => {
    if (!editingQuestion || !auditId) return;

    const qId = editingQuestion.id;
    const nowIso = new Date().toISOString();

    const updatedAnswer = {
      option_id: modalOptionId,
      note: modalNote,
      improvement_title: modalImprovementTitle || undefined,
      evidence: modalEvidence,
      updated_at: nowIso,
    };

    // 1. Optimistic local state update (instant UI reaction)
    setAnswersState((prev) => ({
      ...prev,
      [qId]: updatedAnswer,
    }));

    // 2. Local IndexedDB Cache
    await saveDraftLocally(
      auditId,
      qId,
      modalOptionId,
      modalNote,
      modalImprovementTitle,
      modalEvidence
    );

    handleCloseModal();

    // 3. Server Autosave & Background Sync (langsung dieksekusi tanpa delay sintetis)
    updateSyncStatusWithPriority('saving');
    try {
      const payload: {
        question_id: string;
        option_id: string | null;
        note: string;
        improvement_title?: string;
        client_version: number;
        client_updated_at: string;
      } = {
        question_id: qId,
        option_id: modalOptionId,
        note: modalNote,
        improvement_title: modalImprovementTitle,
        client_version: auditVersion,
        client_updated_at: nowIso,
      };

      const saveRes = await apiFetch<{
        id: string;
        new_version?: number;
        conflict?: boolean;
        server_updated_at?: string;
      }>(`/api/audits/${auditId}/answers/${qId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!saveRes.success || !saveRes.data || saveRes.error?.code === 'CONFLICT' || saveRes.data.conflict) {
        updateSyncStatusWithPriority(saveRes.error?.code === 'CONFLICT' ? 'conflict' : 'offline');
      } else {
        const nextVersion = saveRes.data?.new_version ?? auditVersion + 1;
        setAuditVersion(nextVersion);

        const photosToUpload = modalEvidence.filter((e) => e.base64_data);
        for (const p of photosToUpload) {
          const uploaded = await apiFetch(`/api/answers/${saveRes.data.id}/evidence`, {
            method: 'POST',
            body: JSON.stringify({
              original_name: p.original_name,
              mime_type: 'image/jpeg',
              size_bytes: p.size_bytes,
              base64_data: p.base64_data,
            }),
          });
          if (!uploaded.success) {
            updateSyncStatusWithPriority('offline');
            return;
          }
        }

        await markDraftAnswerSynced(auditId, qId, nextVersion);
        updateSyncStatusWithPriority('saved');
      }
    } catch {
      updateSyncStatusWithPriority('offline');
    }
  };

  // Submit Audit Handler
  const handleSubmitAudit = async () => {
    if (!auditId || !canEdit) return;
    try {
      setSubmitting(true);
      setSubmitError(null);

      const res = await apiFetch<{ status: string; score?: number }>(`/api/audits/${auditId}/submit`, {
        method: 'POST',
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Gagal mengirim audit.');
      }

      if (auditData) {
        setAuditData({
          ...auditData,
          audit: {
            ...auditData.audit,
            status: 'SUBMITTED',
            submitted_at: new Date().toISOString(),
            score: res.data?.score ?? auditData.audit.score,
          },
        });
      }

      await clearDraftLocally(auditId);
      setShowSubmitConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-slate-500">
        <RotateCw className="w-6 h-6 animate-spin text-brand-red mr-2" />
        <span className="text-sm font-bold">Memuat lembar audit...</span>
      </div>
    );
  }

  if (!auditData) {
    const errorCode = loadError?.code || 'AUDIT_NOT_FOUND';
    const isAccessDenied = errorCode === 'AUDIT_NOT_ASSIGNED';
    const isDepotDenied = errorCode === 'DEPOT_ACCESS_DENIED';
    const isCycleNotOpen = errorCode === 'CYCLE_NOT_OPEN';
    const isTypeNotAllowed = errorCode === 'AUDIT_TYPE_NOT_ALLOWED';

    let title = 'Audit Tidak Ditemukan';
    if (isAccessDenied) title = 'Akses Penugasan Ditolak';
    else if (isDepotDenied) title = 'Akses Depo Ditolak';
    else if (isCycleNotOpen) title = 'Siklus Audit Belum Dibuka';
    else if (isTypeNotAllowed) title = 'Otorisasi Role Ditolak';

    const message = loadError?.message || 'Data lembar audit tidak ditemukan pada server atau Anda belum memiliki hak akses ke slot ini.';

    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
          isAccessDenied || isDepotDenied ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-brand-red'
        }`}>
          {isAccessDenied || isDepotDenied ? (
            <Lock className="w-7 h-7" />
          ) : (
            <AlertCircle className="w-7 h-7" />
          )}
        </div>
        <h2 className="text-base sm:text-lg font-black text-slate-900 mb-1">{title}</h2>
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 mb-2 border border-slate-200">
          [{errorCode}]
        </div>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
          {message}
        </p>
        {loadError?.requestId && (
          <p className="text-[11px] text-slate-400 font-mono mb-4">
            Request ID: {loadError.requestId}
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate('/audits')}>
          Kembali ke Daftar Audit
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto qas-scroll p-3 sm:p-5 max-w-5xl mx-auto w-full gap-3">
      {/* 1. Baris Langsung Progress & Index (Header lama & badge tersimpan/proses dihilangkan) */}
      <div className="p-3 sm:p-4 rounded-xl border border-brand-line bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          {/* Tombol Navigasi Kembali */}
          <button
            type="button"
            onClick={() => navigate('/audits')}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer flex-shrink-0 shadow-2xs"
            title="Kembali ke Daftar Audit"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Progress Pertanyaan (tanpa tulisan terjawab) */}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Progres
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg sm:text-xl font-black text-slate-900 leading-none">
                {answeredCount}/{totalQuestions}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-20 sm:w-28 h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="h-full bg-brand-red rounded-full transition-all duration-300"
                style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Indeks Capaian (Singkron dengan jawaban yang dipilih, 0 jika belum ada jawaban) */}
          <div className="border-l border-slate-100 pl-3 sm:pl-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Index
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black text-brand-ink leading-none">
                {currentScoring.indexFormatted}
              </span>
              {predicate && predicateColors && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${predicateColors.bg} ${predicateColors.text} ${predicateColors.border}`}>
                  {predicate}
                </span>
              )}
            </div>
          </div>

          {/* Keterangan Nama Bulan (Atas) & Nama Gudang (Bawah) */}
          <div className="border-l border-slate-100 pl-3 sm:pl-4 flex flex-col justify-center min-w-0">
            <span className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate">
              {cycleMonthName}
            </span>
            <span className="text-[11px] font-bold text-slate-500 leading-tight truncate">
              {auditData.depot.name}
            </span>
          </div>
        </div>

        {/* Tombol Kirim Audit */}
        <div className="flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          {!isSubmitted ? (
            <Button
              variant="primary"
              size="md"
              disabled={!isReadyToSubmit || submitting}
              onClick={() => setShowSubmitConfirm(true)}
              className="w-full sm:w-auto font-bold min-h-[44px] shadow-2xs"
            >
              <Save className="w-4 h-4 mr-1.5" />
              <span>{isOfficialAudit ? 'Kirim Audit Resmi' : 'Kirim Self Audit'}</span>
            </Button>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit Telah Disubmit & Terkunci</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. DAFTAR PERTANYAAN (PAS LAYAR HP, BEBAS SCROLL HORIZONTAL, TEKAN LAMA UNTUK SAPU RESET) */}
      <div className="rounded-xl border border-brand-line bg-white shadow-2xs overflow-hidden flex-1 flex flex-col min-h-0 w-full">
        <div className="overflow-y-auto qas-scroll flex-1 divide-y divide-slate-100 w-full">
          {allQuestions.map((q, idx) => {
            const answer = answersState[q.id];
            const isAnswered = Boolean(answer?.option_id);

            return (
              <div
                key={q.id}
                onClick={() => handleRowClick(q)}
                onTouchStart={() => handleTouchStart(q.id, isAnswered)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
                onMouseDown={() => handleTouchStart(q.id, isAnswered)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer select-none ${
                  longPressQuestionId === q.id
                    ? 'bg-amber-50/80 border-l-4 border-l-amber-500'
                    : 'bg-white hover:bg-slate-50/90'
                }`}
              >
                {/* 1. Nomor Urut & Uraian Pertanyaan (Wrap Pas di Layar HP Tanpa Scroll Horizontal) */}
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0 pt-0.5">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug break-words">
                      {q.prompt}
                    </p>
                  </div>
                </div>

                {/* 2. Icon Status: Loading Redup jika Belum Diisi, Checklist Hijau jika Terisi, atau Icon Sapu saat Tekan Lama */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                  {longPressQuestionId === q.id && isAnswered && !isSubmitted ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetQuestion(q.id);
                      }}
                      className="p-1.5 px-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95 animate-scale-up"
                      title="Bersihkan / Reset Jawaban Pertanyaan Ini"
                    >
                      <BroomIcon className="w-4 h-4 text-amber-700" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Bersihkan</span>
                    </button>
                  ) : isAnswered ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-slate-300 flex-shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. FORMULIR MENGAMBANG (FLOATING MODAL / BOTTOM SHEET) */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white sm:rounded-2xl shadow-2xl border border-slate-100 w-full sm:max-w-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 border-b border-brand-line flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-200 font-mono font-black text-xs text-slate-800">
                  {editingQuestion.code}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Instrumen Audit Mutu
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto qas-scroll flex-1 space-y-3.5">
              {/* REQUIREMENT 7: Ringkasan Hasil Self Audit Satu Baris (Khusus Audit Resmi) */}
              {isOfficialAudit && editingQuestion.self_answer && (
                <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-950 flex items-center justify-between gap-2 text-xs">
                  <div className="truncate flex-1">
                    <span className="font-extrabold text-blue-900">Self Audit: </span>
                    <span className="font-semibold">{editingQuestion.self_answer.option_label || 'Pilihan -'}</span>
                    <span className="mx-1.5 text-blue-300">|</span>
                    <span className="font-extrabold text-blue-900">Nilai: </span>
                    <span>{editingQuestion.self_answer.numeric_value ?? '-'}</span>
                    <span className="mx-1.5 text-blue-300">|</span>
                    <span className="font-extrabold text-blue-900">Catatan: </span>
                    <span className="italic">{editingQuestion.self_answer.note || '-'}</span>
                  </div>

                  {editingQuestion.self_answer.evidence?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(editingQuestion.self_answer?.evidence[0]?.preview_url || null)}
                      className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-white px-2 py-1 rounded-lg border border-blue-200 hover:bg-blue-50 cursor-pointer"
                    >
                      <ImageIcon className="w-3 h-3 text-blue-600" />
                      <span>{editingQuestion.self_answer.evidence.length} Bukti</span>
                    </button>
                  )}
                </div>
              )}

              {/* Teks Pertanyaan Lengkap (Penanda wajib bukti dihilangkan) */}
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-brand-ink leading-relaxed">
                  {editingQuestion.prompt}
                </p>
              </div>

              {/* Pilihan Jawaban */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Pilihan Jawaban
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {editingQuestion.options.map((opt) => {
                    const isSelected = modalOptionId === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => !isSubmitted && setModalOptionId(opt.id)}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'border-brand-red bg-red-50/40 ring-1 ring-brand-red shadow-2xs'
                            : 'border-brand-line bg-white hover:bg-slate-50'
                        } ${isSubmitted ? 'cursor-default' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-brand-red bg-brand-red' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 block truncate">
                              {opt.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {opt.is_improvement && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                              <span>Kaizen</span>
                            </span>
                          )}
                          <span className="text-[11px] font-mono font-bold text-slate-400">
                            [{opt.numeric_value ?? 'N/A'}]
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Judul Improvement (jika Kaizen dipilih) */}
              {editingQuestion.options.find((o) => o.id === modalOptionId)?.is_improvement && (
                <div>
                  <label className="text-[11px] font-bold text-amber-900 block mb-1">
                    Judul Inisiatif Improvement / Kaizen
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitted}
                    value={modalImprovementTitle}
                    onChange={(e) => setModalImprovementTitle(e.target.value)}
                    placeholder="Contoh: Pembuatan rak khusus sparepart berlebih"
                    className="w-full px-3 py-2 text-xs border border-amber-300 rounded-xl bg-amber-50/30 text-slate-900 outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Catatan / Justifikasi */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Catatan Pemeriksaan Lapangan
                </label>
                <textarea
                  rows={2}
                  disabled={isSubmitted}
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder="Ketik catatan kondisi fisik, kelengkapan, atau alasan pemilihan opsi..."
                  className="w-full px-3 py-2 text-xs border border-brand-line rounded-xl bg-white text-slate-900 outline-none focus:border-brand-red resize-none"
                />
              </div>

              {/* Upload Foto Bukti Kamera vs Galeri (Masing-masing 1 Tombol, Maksimal 3 Foto, Minimal 1 Foto Terpenuhi) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Foto Bukti Pemeriksaan
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {editingQuestion.evidence_required
                      ? modalEvidence.length >= 1
                        ? `✓ Syarat terpenuhi (${modalEvidence.length}/3)`
                        : `Wajib min. 1 foto (${modalEvidence.length}/3)`
                      : modalEvidence.length > 0
                        ? `Opsional (${modalEvidence.length}/3 foto)`
                        : `Opsional (Maks. 3 foto)`}
                  </span>
                </div>

                {/* Pratinjau Thumbnail Foto jika sudah ada foto terlampir */}
                {modalEvidence.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap pb-1">
                    {modalEvidence.map((ev, idx) => (
                      <div key={ev.id} className="relative group w-16 h-16 rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                        <img
                          src={ev.preview_url || (ev.base64_data ? `data:image/jpeg;base64,${ev.base64_data}` : '')}
                          alt={ev.original_name}
                          onClick={() => setPreviewImage(ev.preview_url || null)}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        />
                        {!isSubmitted && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(ev.id)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 cursor-pointer shadow-xs z-10"
                            title="Hapus foto"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        <span className="absolute bottom-0.5 left-1 text-[8px] font-black text-white bg-black/60 px-1 rounded">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 1 Tombol Kamera di Atas & 1 Tombol Galeri di Bawahnya (Maksimal 3 Foto) */}
                {!isSubmitted && modalEvidence.length < 3 && (
                  <div className="w-full space-y-2">
                    {/* Tombol Kamera Langsung */}
                    <label className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 flex items-center justify-center gap-2 font-bold text-xs text-slate-700 cursor-pointer shadow-2xs transition-all active:scale-[0.99]">
                      <Camera className="w-4 h-4 text-slate-600" />
                      <span>{isCompressing ? 'Memproses Kamera...' : 'Kamera'}</span>
                      {editingQuestion.evidence_required && modalEvidence.length === 0 && (
                        <span className="text-brand-red font-black text-sm ml-0.5 leading-none" title="Wajib min. 1 foto bukti">*</span>
                      )}
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={isCompressing}
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>

                    {/* Tombol Galeri Penyimpanan Internal (Hanya muncul jika Akses Galeri aktif di Master) */}
                    {editingQuestion.is_required && (
                      <label className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 flex items-center justify-center gap-2 font-bold text-xs text-slate-700 cursor-pointer shadow-2xs transition-all active:scale-[0.99]">
                        <ImageIcon className="w-4 h-4 text-slate-600" />
                        <span>{isCompressing ? 'Memproses Galeri...' : 'Galeri'}</span>
                        <input
                          ref={galleryInputRef}
                          type="file"
                          accept="image/*"
                          disabled={isCompressing}
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-brand-line bg-slate-50/50 flex items-center justify-end gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={handleCloseModal}>
                Batal
              </Button>
              {!isSubmitted && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveModal}
                  className="font-bold min-h-[40px] shadow-2xs"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  <span>Simpan Jawaban</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL KONFIRMASI SUBMIT AUDIT (OBS-01: Sticky Footer, Safe Area, Mobile 360px Friendly) */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-100 max-w-sm w-full mx-auto max-h-[85vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-brand-red shadow-xs">
                  <Save className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  Konfirmasi Kirim Audit
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto qas-scroll flex-1 space-y-3 pb-6">
              <p className="text-xs text-slate-600 leading-relaxed">
                Kirim hasil <strong>{isOfficialAudit ? 'Audit Resmi (QAR)' : 'Self Audit'}</strong> untuk Depo <strong>{auditData.depot.name}</strong>?
              </p>

              {/* Ringkasan Isian */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500">Pertanyaan Terisi:</span>
                  <span className="font-extrabold text-slate-900">{answeredCount} / {totalQuestions} Soal</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500">Bukti Foto Terlampir:</span>
                  <span className="font-extrabold text-slate-900">
                    {missingEvidenceCount === 0 ? 'Lengkap (Semua Syarat)' : `${missingEvidenceCount} Bukti Belum Terisi`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-[11px] font-semibold text-slate-500">Estimasi Skor Sementara:</span>
                  <span className="font-extrabold text-brand-ink">
                    {currentScoring.indexFormatted} {predicate ? `(${predicate})` : ''}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-semibold text-left leading-relaxed">
                ⚠️ <strong>Perhatian:</strong> Setelah disubmit, seluruh isian jawaban, catatan, dan foto bukti akan dikunci secara permanen menjadi dokumen resmi yang tidak dapat diubah kembali.
              </div>

              {submitError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-bold">
                  {submitError}
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 p-3 sm:p-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xs flex items-center gap-2 flex-shrink-0 z-10">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
              >
                Kembali Periksa
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitAudit}
                className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Ya, Kirim Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL PREVIEW FOTO BESAR */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in"
        >
          <div className="relative max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden bg-black shadow-2xl">
            <img
              src={previewImage}
              alt="Bukti Audit Ukuran Penuh"
              className="max-w-full max-h-[85vh] object-contain mx-auto"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
