"use client";

import { useState } from "react";

/**
 * Pijat I-L-U animated diagram.
 *
 * Technique reference (consensus IBCLC / IDAI / AAP / Liddle Kidz Foundation):
 * - Bayi telentang, kedua tangan parent dihangatkan dulu, tekanan ringan-sedang
 *   pakai 2-3 jari datar.
 * - Stroke mengikuti arah peristaltik usus besar (searah jarum jam dari sudut
 *   pandang bayi): ascending colon (kanan bayi, naik) → transverse colon
 *   (atas, kanan ke kiri) → descending colon (kiri bayi, turun) → exit.
 *
 * 3 huruf:
 *   I  : stroke turun di sisi KIRI bayi (descending colon).
 *   L  : stroke dari kanan-atas ke kiri-atas, lalu turun di sisi KIRI bayi
 *        (transverse + descending colon). Bentuk seperti "L" terbalik.
 *   U  : stroke naik di sisi KANAN bayi, ke atas, lalu turun di sisi KIRI
 *        (ascending + transverse + descending — full loop colon). Bentuk
 *        seperti "U" terbalik.
 *
 * Tiap stroke 5-10 repetisi pelan, durasi total 5-10 menit. Waktu ideal:
 * 30-60 menit pasca menyusu, atau saat bayi tenang. Hentikan kalau bayi
 * tampak tidak nyaman.
 *
 * Catatan SVG: dilihat dari atas dengan kepala bayi di atas, kaki di bawah.
 * Sisi KIRI bayi = sisi KANAN gambar (anatomical convention).
 */
export function IluMassageDiagram({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 300"
      className={className}
      role="img"
      aria-label="Diagram animasi Pijat I-L-U"
    >
      {/* Soft torso outline */}
      <ellipse
        cx="110"
        cy="150"
        rx="78"
        ry="115"
        fill="#fef3f7"
        stroke="#f9a8c5"
        strokeWidth="2"
      />

      {/* Belly button reference */}
      <circle cx="110" cy="150" r="3" fill="#9ca3af" />

      {/* Anatomy labels */}
      <text
        x="110"
        y="22"
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="11"
        fontFamily="system-ui, sans-serif"
      >
        ↑ kepala
      </text>
      <text
        x="110"
        y="290"
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="11"
        fontFamily="system-ui, sans-serif"
      >
        ↓ kaki
      </text>
      <text
        x="38"
        y="155"
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="10"
        fontFamily="system-ui, sans-serif"
      >
        kanan
      </text>
      <text
        x="38"
        y="167"
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="10"
        fontFamily="system-ui, sans-serif"
      >
        bayi
      </text>
      <text
        x="184"
        y="155"
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="10"
        fontFamily="system-ui, sans-serif"
      >
        kiri
      </text>
      <text
        x="184"
        y="167"
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="10"
        fontFamily="system-ui, sans-serif"
      >
        bayi
      </text>

      {/* Faint guide grid for I/L/U paths (always visible, low opacity) */}
      <g stroke="#fce7f3" strokeWidth="6" strokeLinecap="round" fill="none">
        <line x1="155" y1="80" x2="155" y2="220" />
        <path d="M 65 80 L 155 80 L 155 220" />
        <path d="M 65 220 L 65 80 L 155 80 L 155 220" />
      </g>

      {/* Phase I: trace down on baby's left (right side of svg) */}
      {/* Total cycle 9s: phase = 0–3s, hidden 3–9s */}
      <path
        d="M 155 80 L 155 220"
        stroke="#db2777"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        pathLength={100}
        strokeDasharray={100}
      >
        <animate
          attributeName="stroke-dashoffset"
          values="100;0;0;100;100"
          keyTimes="0;0.30;0.33;0.34;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </path>
      {/* Leading dot for I */}
      <circle r="7" fill="#be185d" opacity="0">
        <animateMotion
          dur="9s"
          repeatCount="indefinite"
          keyTimes="0;0.30;0.33;1"
          keyPoints="0;1;1;1"
          path="M 155 80 L 155 220"
        />
        <animate
          attributeName="opacity"
          values="0;1;1;0;0"
          keyTimes="0;0.01;0.30;0.33;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Phase L: across top + down right (3–6s of 9s cycle) */}
      <path
        d="M 65 80 L 155 80 L 155 220"
        stroke="#db2777"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        pathLength={100}
        strokeDasharray={100}
      >
        <animate
          attributeName="stroke-dashoffset"
          values="100;100;0;0;100;100"
          keyTimes="0;0.34;0.63;0.66;0.67;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </path>
      <circle r="7" fill="#be185d" opacity="0">
        <animateMotion
          dur="9s"
          repeatCount="indefinite"
          keyTimes="0;0.34;0.63;1"
          keyPoints="0;0;1;1"
          path="M 65 80 L 155 80 L 155 220"
        />
        <animate
          attributeName="opacity"
          values="0;0;1;1;0;0"
          keyTimes="0;0.34;0.35;0.63;0.66;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Phase U: full loop from lower-left, up, across, down (6–9s) */}
      <path
        d="M 65 220 L 65 80 L 155 80 L 155 220"
        stroke="#db2777"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        pathLength={100}
        strokeDasharray={100}
      >
        <animate
          attributeName="stroke-dashoffset"
          values="100;100;0;0;100"
          keyTimes="0;0.67;0.96;0.99;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </path>
      <circle r="7" fill="#be185d" opacity="0">
        <animateMotion
          dur="9s"
          repeatCount="indefinite"
          keyTimes="0;0.67;0.96;1"
          keyPoints="0;0;1;1"
          path="M 65 220 L 65 80 L 155 80 L 155 220"
        />
        <animate
          attributeName="opacity"
          values="0;0;1;1;0"
          keyTimes="0;0.67;0.68;0.96;0.99"
          dur="9s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Phase indicator letter (lower right) */}
      <text
        x="190"
        y="40"
        fontSize="32"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
        fill="#db2777"
      >
        I
        <animate
          attributeName="opacity"
          values="1;1;0;0;0"
          keyTimes="0;0.33;0.34;0.99;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </text>
      <text
        x="190"
        y="40"
        fontSize="32"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
        fill="#db2777"
      >
        L
        <animate
          attributeName="opacity"
          values="0;0;1;1;0;0"
          keyTimes="0;0.33;0.34;0.66;0.67;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </text>
      <text
        x="190"
        y="40"
        fontSize="32"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
        fill="#db2777"
      >
        U
        <animate
          attributeName="opacity"
          values="0;0;1;1;0"
          keyTimes="0;0.66;0.67;0.99;1"
          dur="9s"
          repeatCount="indefinite"
        />
      </text>
    </svg>
  );
}

export function IluMassageInfo({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pijat I-L-U"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              Pijat I-L-U
            </h2>
            <p className="text-[11px] text-gray-500">
              Bantu redakan kembung & kentut
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <IluMassageDiagram className="mx-auto h-64 w-full" />

        <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-gray-700">
          <p>
            Bayi telentang, hangatkan tangan dulu. Pakai 2–3 jari datar,
            tekanan ringan–sedang. Stroke mengikuti arah jarum jam (peristaltik
            usus besar):
          </p>
          <ul className="space-y-1 pl-4">
            <li>
              <span className="font-semibold text-rose-700">I</span> · Turun di
              sisi <span className="font-semibold">kiri bayi</span> (dari bawah
              tulang rusuk ke pangkal paha).
            </li>
            <li>
              <span className="font-semibold text-rose-700">L</span> · Dari{" "}
              kanan atas ke kiri atas, lalu turun di sisi{" "}
              <span className="font-semibold">kiri bayi</span>.
            </li>
            <li>
              <span className="font-semibold text-rose-700">U</span> · Naik di
              sisi <span className="font-semibold">kanan bayi</span>, ke atas,
              lalu turun di sisi <span className="font-semibold">kiri bayi</span>{" "}
              (jejak penuh usus besar).
            </li>
          </ul>
          <p className="text-[11px] text-gray-500">
            Tiap stroke 5–10 repetisi · total 5–10 menit. Waktu ideal:
            30–60 menit setelah menyusu, atau saat bayi tenang. Hentikan jika
            bayi tidak nyaman.
          </p>
          <p className="text-[10px] italic text-gray-400">
            Sumber: konsensus IBCLC / IDAI / AAP / Liddle Kidz pediatric massage.
          </p>
        </div>
      </div>
    </div>
  );
}

export function IluInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-700 hover:bg-rose-200"
        aria-label="Lihat cara Pijat I-L-U"
        title="Lihat cara"
      >
        ?
      </button>
      {open ? <IluMassageInfo onClose={() => setOpen(false)} /> : null}
    </>
  );
}
