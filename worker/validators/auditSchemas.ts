import { z } from 'zod';

export const createCycleSchema = z.object({
  code: z
    .string()
    .min(3, 'Kode siklus minimal 3 karakter')
    .max(50, 'Kode siklus maksimal 50 karakter')
    .regex(/^[A-Z0-9_-]+$/, 'Kode siklus hanya boleh huruf kapital, angka, dash, dan underscore'),
  title: z
    .string()
    .min(3, 'Nama siklus minimal 3 karakter')
    .max(150, 'Nama siklus maksimal 150 karakter'),
  period_start: z.string().min(1, 'Tanggal mulai periode wajib diisi'),
  period_end: z.string().min(1, 'Tanggal akhir periode wajib diisi'),
  self_due_at: z.string().min(1, 'Batas waktu self audit wajib diisi'),
  official_due_at: z.string().min(1, 'Batas waktu audit resmi wajib diisi'),
  template_version_id: z.string().min(1, 'Template version ID wajib ditentukan'),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).default('OPEN'),
});

export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const startAuditSchema = z.object({
  depot_id: z.string().optional(),
});

export type StartAuditInput = z.infer<typeof startAuditSchema>;

export const saveAnswerSchema = z.object({
  question_id: z.string().optional(),
  option_id: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  improvement_title: z.string().nullable().optional(),
  client_version: z.number().int().optional(),
  client_updated_at: z.string().optional(),
});

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const submitAuditSchema = z.object({
  idempotency_key: z.string().optional(),
});

export type SubmitAuditInput = z.infer<typeof submitAuditSchema>;

export const reopenAuditSchema = z.object({
  reason: z
    .string()
    .min(5, 'Alasan pembukaan kembali audit wajib diisi (minimal 5 karakter)'),
});

export type ReopenAuditInput = z.infer<typeof reopenAuditSchema>;

export const attachEvidenceSchema = z.object({
  original_name: z.string().min(1, 'Nama file wajib diisi'),
  mime_type: z.string().min(1, 'MIME type file wajib diisi'),
  size_bytes: z.number().int().positive('Ukuran file harus lebih dari 0 byte'),
  sha256: z.string().optional(),
});

export type AttachEvidenceInput = z.infer<typeof attachEvidenceSchema>;
