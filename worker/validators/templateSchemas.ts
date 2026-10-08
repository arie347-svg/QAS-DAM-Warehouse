import { z } from 'zod';

export const createSectionSchema = z.object({
  code: z.string().min(1, 'Kode seksi wajib diisi').max(20).trim(),
  title: z.string().min(1, 'Judul seksi wajib diisi').max(255).trim(),
  display_order: z.number().int().min(1, 'Urutan seksi minimal 1'),
  weight: z.number().min(0).nullable().optional(),
});

export const updateSectionSchema = createSectionSchema.partial();

export const createQuestionSchema = z.object({
  code: z.string().min(1, 'Kode pertanyaan wajib diisi').max(30).trim(),
  prompt: z.string().min(1, 'Teks pertanyaan wajib diisi').trim(),
  display_order: z.number().int().min(1, 'Urutan pertanyaan minimal 1'),
  evidence_required: z.boolean().default(false),
  is_required: z.boolean().default(true),
  weight: z.number().min(0).nullable().optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial();

export const createOptionSchema = z.object({
  code: z.string().min(1, 'Kode opsi wajib diisi').max(20).trim(),
  label: z.string().min(1, 'Label opsi wajib diisi').trim(),
  numeric_value: z.number().nullable().optional(),
  display_order: z.number().int().min(1, 'Urutan opsi minimal 1'),
  is_na: z.boolean().default(false),
});

export const updateOptionSchema = createOptionSchema.partial();

export const publishVersionSchema = z.object({
  scoring_config_json: z.string().optional(),
});
