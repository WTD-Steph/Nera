// Source: prototype Claude artifact, di-paste oleh Stephanus pada 2026-04-30.
// Catatan: paste asli ter-truncate di tengah AIAnalysisModal.askClaude
// (sekitar baris error handling di akhir try/catch). Bagian yang HILANG:
//   - akhir AIAnalysisModal.askClaude (catch block, finally)
//   - render JSX AIAnalysisModal (tombol preset prompt, custom prompt input,
//     loading state, response render)
//   - LogModal (form input untuk semua subtype log)
//   - Onboarding screen (first-time profile creation)
//   - Komponen App utama (state root, tab routing, mount modals)
//   - useEffect persistensi ke window.storage / localStorage
//
// File ini dipakai sebagai *functional spec*, bukan code yang harus di-port
// apa adanya. PROJECT_BRIEF.md memetakan setiap feature ke design produksi.
//
// =====================================================================
// CATATAN STATE ARTIFACT YANG PENTING UNTUK MIGRATION:
// - Storage: window.storage[STORAGE_KEY] = { profile, logs[], milestones{}, immunizations{} }
// - logs[] subtypes: sufor, dbf, pumping, pipis, poop, sleep, bath, temp, med, growth
//   (NB: 'growth' adalah subtype log di artifact; di produksi dipindah ke
//    tabel growth_measurements terpisah — lihat PROJECT_BRIEF.md §Schema)
// - milestones / immunizations: object map { [id]: ISO timestamp string }
// - Field-field per subtype (mapping ke kolom Postgres dijabarkan di brief):
//     sufor:   amount (ml)
//     dbf:     durationL, durationR (menit)
//     pumping: amountL, amountR (ml)
//     pipis:   (no extra)
//     poop:    warna, konsistensi
//     sleep:   endTimestamp (nullable saat sleep masih berlangsung)
//     bath:    (no extra)
//     temp:    value (°C)
//     med:     name, dose
//     growth:  weight (kg), height (cm), headCirc (cm, opsional)
//   Semua subtype: notes (opsional)
// =====================================================================

import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Baby, Droplet, Moon, Milk, Thermometer, Syringe, TrendingUp, History, Settings, Plus, Download, Trash2, Check, X, Heart, Smile, ChevronRight, AlertCircle, Bath, Pill, Activity, Sparkles } from 'lucide-react';

// ======================== CONSTANTS ========================
const STORAGE_KEY = 'baby_tracker_v1';

const DEFAULT_DATA = {
  profile: { name: '', gender: '', dob: '', birthWeight: 0, birthHeight: 0 },
  logs: [],
  milestones: {},
  immunizations: {},
};

const WHO_W_GIRL = [
  { m: 0, p3: 2.4, p15: 2.8, p50: 3.2, p85: 3.7, p97: 4.2 },
  { m: 1, p3: 3.2, p15: 3.6, p50: 4.2, p85: 4.8, p97: 5.5 },
  { m: 2, p3: 4.0, p15: 4.5, p50: 5.1, p85: 5.8, p97: 6.6 },
  { m: 3, p3: 4.5, p15: 5.1, p50: 5.8, p85: 6.6, p97: 7.5 },
  { m: 4, p3: 5.0, p15: 5.6, p50: 6.4, p85: 7.3, p97: 8.2 },
  { m: 5, p3: 5.4, p15: 6.1, p50: 6.9, p85: 7.8, p97: 8.8 },
  { m: 6, p3: 5.7, p15: 6.4, p50: 7.3, p85: 8.3, p97: 9.3 },
  { m: 7, p3: 6.0, p15: 6.7, p50: 7.6, p85: 8.6, p97: 9.8 },
  { m: 8, p3: 6.3, p15: 7.0, p50: 7.9, p85: 9.0, p97: 10.2 },
  { m: 9, p3: 6.5, p15: 7.3, p50: 8.2, p85: 9.3, p97: 10.5 },
  { m: 10, p3: 6.7, p15: 7.5, p50: 8.5, p85: 9.6, p97: 10.9 },
  { m: 11, p3: 6.9, p15: 7.7, p50: 8.7, p85: 9.9, p97: 11.2 },
  { m: 12, p3: 7.0, p15: 7.9, p50: 8.9, p85: 10.1, p97: 11.5 },
];

const WHO_H_GIRL = [
  { m: 0, p3: 45.4, p15: 47.3, p50: 49.1, p85: 51.0, p97: 52.9 },
  { m: 1, p3: 49.8, p15: 51.7, p50: 53.7, p85: 55.6, p97: 57.6 },
  { m: 2, p3: 53.0, p15: 55.0, p50: 57.1, p85: 59.1, p97: 61.1 },
  { m: 3, p3: 55.6, p15: 57.7, p50: 59.8, p85: 61.9, p97: 64.0 },
  { m: 4, p3: 57.8, p15: 59.9, p50: 62.1, p85: 64.3, p97: 66.4 },
  { m: 5, p3: 59.6, p15: 61.8, p50: 64.0, p85: 66.2, p97: 68.5 },
  { m: 6, p3: 61.2, p15: 63.5, p50: 65.7, p85: 68.0, p97: 70.3 },
  { m: 7, p3: 62.7, p15: 65.0, p50: 67.3, p85: 69.6, p97: 71.9 },
  { m: 8, p3: 64.0, p15: 66.4, p50: 68.7, p85: 71.1, p97: 73.5 },
  { m: 9, p3: 65.3, p15: 67.7, p50: 70.1, p85: 72.6, p97: 75.0 },
  { m: 10, p3: 66.5, p15: 69.0, p50: 71.5, p85: 73.9, p97: 76.4 },
  { m: 11, p3: 67.7, p15: 70.3, p50: 72.8, p85: 75.3, p97: 77.8 },
  { m: 12, p3: 68.9, p15: 71.4, p50: 74.0, p85: 76.6, p97: 79.2 },
];

const WHO_W_BOY = [
  { m: 0, p3: 2.5, p15: 2.9, p50: 3.3, p85: 3.9, p97: 4.3 },
  { m: 1, p3: 3.4, p15: 3.9, p50: 4.5, p85: 5.1, p97: 5.7 },
  { m: 2, p3: 4.4, p15: 4.9, p50: 5.6, p85: 6.3, p97: 7.1 },
  { m: 3, p3: 5.1, p15: 5.7, p50: 6.4, p85: 7.2, p97: 7.9 },
  { m: 4, p3: 5.6, p15: 6.2, p50: 7.0, p85: 7.8, p97: 8.6 },
  { m: 5, p3: 6.1, p15: 6.7, p50: 7.5, p85: 8.4, p97: 9.2 },
  { m: 6, p3: 6.4, p15: 7.1, p50: 7.9, p85: 8.8, p97: 9.7 },
  { m: 7, p3: 6.7, p15: 7.4, p50: 8.3, p85: 9.2, p97: 10.2 },
  { m: 8, p3: 7.0, p15: 7.7, p50: 8.6, p85: 9.6, p97: 10.5 },
  { m: 9, p3: 7.2, p15: 7.9, p50: 8.9, p85: 9.9, p97: 10.9 },
  { m: 10, p3: 7.5, p15: 8.2, p50: 9.2, p85: 10.2, p97: 11.2 },
  { m: 11, p3: 7.7, p15: 8.4, p50: 9.4, p85: 10.5, p97: 11.5 },
  { m: 12, p3: 7.8, p15: 8.6, p50: 9.6, p85: 10.8, p97: 11.8 },
];

const WHO_H_BOY = [
  { m: 0, p3: 46.1, p15: 48.0, p50: 49.9, p85: 51.8, p97: 53.7 },
  { m: 1, p3: 50.8, p15: 52.8, p50: 54.7, p85: 56.7, p97: 58.6 },
  { m: 2, p3: 54.4, p15: 56.4, p50: 58.4, p85: 60.4, p97: 62.4 },
  { m: 3, p3: 57.3, p15: 59.4, p50: 61.4, p85: 63.5, p97: 65.5 },
  { m: 4, p3: 59.7, p15: 61.8, p50: 63.9, p85: 66.0, p97: 68.0 },
  { m: 5, p3: 61.7, p15: 63.8, p50: 65.9, p85: 68.0, p97: 70.1 },
  { m: 6, p3: 63.3, p15: 65.5, p50: 67.6, p85: 69.8, p97: 71.9 },
  { m: 7, p3: 64.8, p15: 67.0, p50: 69.2, p85: 71.3, p97: 73.5 },
  { m: 8, p3: 66.2, p15: 68.4, p50: 70.6, p85: 72.8, p97: 75.0 },
  { m: 9, p3: 67.5, p15: 69.7, p50: 72.0, p85: 74.2, p97: 76.5 },
  { m: 10, p3: 68.7, p15: 71.0, p50: 73.3, p85: 75.6, p97: 77.9 },
  { m: 11, p3: 69.9, p15: 72.2, p50: 74.5, p85: 76.9, p97: 79.2 },
  { m: 12, p3: 71.0, p15: 73.4, p50: 75.7, p85: 78.1, p97: 80.5 },
];

const IMUNISASI_LIST = [
  { id: 'hb0', name: 'Hepatitis B-0', month: 0 },
  { id: 'bcg', name: 'BCG', month: 1 },
  { id: 'opv1', name: 'Polio (OPV) 1', month: 1 },
  { id: 'dpt1', name: 'DPT-HB-Hib 1', month: 2 },
  { id: 'opv2', name: 'Polio (OPV) 2', month: 2 },
  { id: 'pcv1', name: 'PCV 1', month: 2 },
  { id: 'rota1', name: 'Rotavirus 1', month: 2 },
  { id: 'dpt2', name: 'DPT-HB-Hib 2', month: 3 },
  { id: 'opv3', name: 'Polio (OPV) 3', month: 3 },
  { id: 'pcv2', name: 'PCV 2', month: 3 },
  { id: 'rota2', name: 'Rotavirus 2', month: 3 },
  { id: 'dpt3', name: 'DPT-HB-Hib 3', month: 4 },
  { id: 'opv4', name: 'Polio (OPV) 4', month: 4 },
  { id: 'ipv', name: 'IPV', month: 4 },
  { id: 'pcv3', name: 'PCV 3', month: 4 },
  { id: 'rota3', name: 'Rotavirus 3', month: 4 },
  { id: 'flu1', name: 'Influenza', month: 6 },
  { id: 'mr', name: 'MR / Campak', month: 9 },
  { id: 'je', name: 'Japanese Encephalitis', month: 9 },
  { id: 'varisela', name: 'Varisela', month: 12 },
  { id: 'hepa1', name: 'Hepatitis A', month: 12 },
];

const MILESTONES_LIST = [
  { id: 'm1a', month: 1, text: 'Mengangkat kepala sebentar saat tengkurap' },
  { id: 'm1b', month: 1, text: 'Bereaksi terhadap suara/cahaya' },
  { id: 'm1c', month: 1, text: 'Menatap wajah pengasuh' },
  { id: 'm2a', month: 2, text: 'Senyum sosial' },
  { id: 'm2b', month: 2, text: 'Mengoceh — suara seperti "ah/uh"' },
  { id: 'm2c', month: 2, text: 'Mengikuti gerak benda dengan mata' },
  { id: 'm3a', month: 3, text: 'Mengangkat kepala 45° saat tengkurap' },
  { id: 'm3b', month: 3, text: 'Menggenggam mainan yang diberikan' },
  { id: 'm3c', month: 3, text: 'Mengangkat kepala tegak saat ditegakkan' },
  { id: 'm4a', month: 4, text: 'Tertawa keras' },
  { id: 'm4b', month: 4, text: 'Berbalik tengkurap–telentang' },
  { id: 'm4c', month: 4, text: 'Memperhatikan tangannya sendiri' },
  { id: 'm5a', month: 5, text: 'Meraih dan menggenggam benda dengan tepat' },
  { id: 'm5b', month: 5, text: 'Memasukkan benda ke mulut' },
  { id: 'm6a', month: 6, text: 'Duduk dengan bantuan' },
  { id: 'm6b', month: 6, text: 'Mengoceh "ba/da/pa"' },
  { id: 'm6c', month: 6, text: 'Mengenali wajah orang dekat' },
  { id: 'm6d', month: 6, text: 'Siap memulai MPASI' },
  { id: 'm7a', month: 7, text: 'Duduk sendiri sebentar tanpa bantuan' },
  { id: 'm7b', month: 7, text: 'Memindahkan benda dari tangan ke tangan' },
  { id: 'm8a', month: 8, text: 'Merangkak / ngesot' },
  { id: 'm8b', month: 8, text: 'Mengucap "mama/dada/papa" tanpa arti' },
  { id: 'm9a', month: 9, text: 'Berdiri dengan pegangan' },
  { id: 'm9b', month: 9, text: 'Melambai / dadah' },
  { id: 'm9c', month: 9, text: 'Bermain ciluk-ba' },
  { id: 'm10a', month: 10, text: 'Berjalan rambatan' },
  { id: 'm10b', month: 10, text: 'Mengambil benda kecil dengan jepitan jari' },
  { id: 'm11a', month: 11, text: 'Berdiri sendiri sebentar' },
  { id: 'm11b', month: 11, text: 'Mengucap kata pertama yang bermakna' },
  { id: 'm12a', month: 12, text: 'Berjalan dengan/tanpa bantuan' },
  { id: 'm12b', month: 12, text: 'Minum dari gelas' },
  { id: 'm12c', month: 12, text: 'Menunjuk benda yang diinginkan' },
];

const LOG_TYPES = {
  sufor:   { label: 'Sufor',   icon: Milk,        color: 'bg-blue-500',   text: 'text-blue-700',   light: 'bg-blue-50' },
  dbf:     { label: 'DBF',     icon: Heart,       color: 'bg-pink-500',   text: 'text-pink-700',   light: 'bg-pink-50' },
  pumping: { label: 'Pumping', icon: Droplet,     color: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-50' },
  pipis:   { label: 'Pipis',   icon: Droplet,     color: 'bg-yellow-500', text: 'text-yellow-700', light: 'bg-yellow-50' },
  poop:    { label: 'Poop',    icon: Smile,       color: 'bg-amber-600',  text: 'text-amber-700',  light: 'bg-amber-50' },
  sleep:   { label: 'Tidur',   icon: Moon,        color: 'bg-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-50' },
  bath:    { label: 'Mandi',   icon: Bath,        color: 'bg-cyan-500',   text: 'text-cyan-700',   light: 'bg-cyan-50' },
  temp:    { label: 'Suhu',    icon: Thermometer, color: 'bg-red-500',    text: 'text-red-700',    light: 'bg-red-50' },
  med:     { label: 'Obat',    icon: Pill,        color: 'bg-green-600',  text: 'text-green-700',  light: 'bg-green-50' },
  growth:  { label: 'Tumbuh',  icon: TrendingUp,  color: 'bg-rose-500',   text: 'text-rose-700',   light: 'bg-rose-50' },
};

// ======================== HELPERS ========================
const fmtTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const fmtDate = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const todayStart = () => {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
};

const formatAge = (dob, atMs = Date.now()) => {
  if (!dob) return '';
  const ms = atMs - new Date(dob).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) return 'belum lahir';
  if (days === 0) return 'baru lahir';
  if (days < 7) return `${days} hari`;
  if (days < 60) {
    const wk = Math.floor(days / 7);
    const rem = days % 7;
    return rem ? `${wk} mgu ${rem} hr` : `${wk} minggu`;
  }
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(1)} bulan`;
  return `${(months/12).toFixed(1)} tahun`;
};

const ageInMonths = (dob, atMs = Date.now()) => {
  return (atMs - new Date(dob).getTime()) / (1000 * 86400 * 30.44);
};

const timeSince = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hrs < 24) return rm > 0 ? `${hrs}j ${rm}m lalu` : `${hrs}j lalu`;
  return `${Math.floor(hrs/24)} hari lalu`;
};

const fmtDuration = (mins) => {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}j ${m}m` : `${h}j`;
};

const tsToInputValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

const inputToISO = (v) => v ? new Date(v).toISOString() : '';

const getTypeForSubtype = (s) => {
  if (['sufor','dbf','pumping'].includes(s)) return 'feeding';
  if (['pipis','poop'].includes(s)) return 'diaper';
  if (s === 'sleep') return 'sleep';
  if (s === 'growth') return 'growth';
  return 'health';
};

// ======================== UI PRIMITIVES ========================
function ModalShell({ close, title, children }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/40 backdrop-blur-sm" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
          <button onClick={close} className="text-gray-400 hover:text-gray-700 p-1 -ml-1">
            <X className="w-5 h-5" />
          </button>
          <div className="font-semibold text-gray-800 text-sm">{title}</div>
          <span className="w-7" />
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, step = 1 }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const dec = () => { const nv = Math.max(0, +v - step); setV(nv); onChange(nv); };
  const inc = () => { const nv = +v + step; setV(nv); onChange(nv); };
  return (
    <div className="flex items-center gap-2">
      <button onClick={dec} className="w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold text-lg transition-transform">−</button>
      <input
        type="number"
        value={v}
        step={step}
        onChange={e => { setV(e.target.value); onChange(parseFloat(e.target.value) || 0); }}
        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 focus:border-rose-400 outline-none text-center font-semibold text-gray-800"
      />
      <button onClick={inc} className="w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold text-lg transition-transform">+</button>
    </div>
  );
}

function SelectChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.v;
        const l = typeof opt === 'string' ? opt : opt.l;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${value === v ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ======================== LOG ROW ========================
function LogRow({ log }) {
  const meta = LOG_TYPES[log.subtype] || { label: log.subtype, icon: Activity, color: 'bg-gray-400', text: 'text-gray-600', light: 'bg-gray-50' };
  const Icon = meta.icon;

  let detail = '';
  if (log.subtype === 'sufor') detail = `${log.amount} ml`;
  else if (log.subtype === 'dbf') detail = `L ${log.durationL || 0}m / R ${log.durationR || 0}m`;
  else if (log.subtype === 'pumping') detail = `L ${log.amountL || 0} / R ${log.amountR || 0} ml`;
  else if (log.subtype === 'sleep') {
    if (log.endTimestamp) {
      const dur = Math.round((new Date(log.endTimestamp) - new Date(log.timestamp)) / 60000);
      detail = fmtDuration(dur);
    } else {
      detail = 'sedang tidur';
    }
  }
  else if (log.subtype === 'poop') detail = [log.warna, log.konsistensi].filter(Boolean).join(' • ');
  else if (log.subtype === 'temp') detail = `${log.value}°C`;
  else if (log.subtype === 'growth') detail = `${log.weight}kg / ${log.height}cm`;
  else if (log.subtype === 'med') detail = [log.name, log.dose].filter(Boolean).join(' ');

  return (
    <div className="flex items-center gap-3 p-2.5">
      <div className={`w-9 h-9 rounded-xl ${meta.color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
          {detail && <span className="text-xs text-gray-500 truncate">• {detail}</span>}
        </div>
        <div className="text-[11px] text-gray-400">
          {fmtTime(log.timestamp)} • {timeSince(log.timestamp)}
        </div>
      </div>
    </div>
  );
}

// ======================== COMPUTE HELPERS ========================
function computeTodayStats(logs) {
  const start = todayStart();
  const today = logs.filter(l => new Date(l.timestamp).getTime() >= start);
  const s = { suforML: 0, suforCount: 0, dbfMin: 0, dbfCount: 0, pumpML: 0, pumpCount: 0, pipisCount: 0, poopCount: 0, sleepMin: 0, sleepCount: 0 };
  today.forEach(l => {
    if (l.subtype === 'sufor') { s.suforML += +l.amount || 0; s.suforCount++; }
    else if (l.subtype === 'dbf') { s.dbfMin += (+l.durationL || 0) + (+l.durationR || 0); s.dbfCount++; }
    else if (l.subtype === 'pumping') { s.pumpML += (+l.amountL || 0) + (+l.amountR || 0); s.pumpCount++; }
    else if (l.subtype === 'pipis') s.pipisCount++;
    else if (l.subtype === 'poop') s.poopCount++;
    else if (l.subtype === 'sleep') {
      if (l.endTimestamp) s.sleepMin += (new Date(l.endTimestamp) - new Date(l.timestamp)) / 60000;
      s.sleepCount++;
    }
  });
  s.suforML = Math.round(s.suforML); s.dbfMin = Math.round(s.dbfMin); s.sleepMin = Math.round(s.sleepMin); s.pumpML = Math.round(s.pumpML);
  return s;
}

function computeLastByType(logs) {
  const sorted = [...logs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  const find = (pred) => sorted.find(pred);
  return {
    milk: find(l => l.subtype === 'sufor' || l.subtype === 'dbf'),
    pipis: find(l => l.subtype === 'pipis'),
    poop: find(l => l.subtype === 'poop'),
    sleep: find(l => l.subtype === 'sleep'),
  };
}

// ===== SISA FILE: lihat catatan di header =====
// Komponen visual + main App dipotong oleh batas paste 50KB.
// Stephanus akan paste ulang sisa-nya kalau dibutuhkan; PROJECT_BRIEF.md
// sudah cukup spesifik untuk lanjut ke PR scaffold tanpa file ini lengkap.
