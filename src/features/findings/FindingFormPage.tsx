import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Save } from 'lucide-react';
import { Button } from '../../components/ui/primitives';

export const FindingFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [category, setCategory] = useState('Ketidaksesuaian Proses');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<'RENDAH' | 'SEDANG' | 'TINGGI'>('SEDANG');
  const [recommendation, setRecommendation] = useState('');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMessage('Temuan berhasil dicatat ke dalam audit trail.');
    setTimeout(() => {
      navigate(-1);
    }, 1200);
  };

  return (
    <div className="h-full flex flex-col justify-between overflow-hidden gap-3 bg-white rounded-2xl border border-brand-line p-3 sm:p-5 shadow-card max-w-md mx-auto w-full">
      {/* 1. Header: Back & Title */}
      <div className="flex items-center gap-2.5 border-b border-brand-line pb-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-xl border border-brand-line flex items-center justify-center hover:bg-slate-50 text-slate-600"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm sm:text-base font-extrabold text-brand-ink">Tambah Temuan</h1>
          <p className="text-[10px] text-brand-muted">Formulir ketidaksesuaian standar mutu</p>
        </div>
      </div>

      {savedMessage && (
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
          {savedMessage}
        </div>
      )}

      {/* 2. Form Fields (Mockup Screen 7) */}
      <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto qas-scroll space-y-3 text-xs pr-1">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-9 px-3 rounded-xl border border-brand-line bg-white outline-none focus:border-brand-red font-semibold text-slate-700"
          >
            <option value="Ketidaksesuaian Proses">Ketidaksesuaian Proses</option>
            <option value="Kepatuhan Dokumen">Kepatuhan Dokumen</option>
            <option value="Kondisi Fisik Unit">Kondisi Fisik Unit</option>
            <option value="Fasilitas & Keamanan">Fasilitas & Keamanan</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
            Deskripsi Temuan <span className="text-brand-red">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Jelaskan temuan secara detail..."
            className="w-full p-2.5 rounded-xl border border-brand-line outline-none focus:border-brand-red"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Level Temuan</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setLevel('RENDAH')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                level === 'RENDAH'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-300'
                  : 'bg-white border-brand-line text-slate-600'
              }`}
            >
              Rendah
            </button>
            <button
              type="button"
              onClick={() => setLevel('SEDANG')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                level === 'SEDANG'
                  ? 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-300'
                  : 'bg-white border-brand-line text-slate-600'
              }`}
            >
              Sedang
            </button>
            <button
              type="button"
              onClick={() => setLevel('TINGGI')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                level === 'TINGGI'
                  ? 'bg-red-50 text-brand-red border-red-300 ring-1 ring-red-300'
                  : 'bg-white border-brand-line text-slate-600'
              }`}
            >
              Tinggi
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rekomendasi Perbaikan</label>
          <input
            type="text"
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            placeholder="Masukkan rekomendasi perbaikan..."
            className="w-full h-9 px-3 rounded-xl border border-brand-line outline-none focus:border-brand-red"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Foto Bukti (Opsional)</label>
          <div className="border border-dashed border-brand-line rounded-xl p-4 text-center bg-slate-50/60 hover:bg-slate-50 cursor-pointer">
            <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-slate-700 block">Tambah Foto</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">JPG/PNG (maks. 5MB)</span>
          </div>
        </div>

        <div className="pt-2">
          <Button variant="primary" size="md" icon={Save} type="submit" className="w-full">
            Simpan Temuan
          </Button>
        </div>
      </form>
    </div>
  );
};
