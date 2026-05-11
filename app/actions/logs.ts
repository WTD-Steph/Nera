"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { dbfEstimateMl } from "@/lib/compute/dbf-estimate";
import type { LogRow } from "@/lib/compute/stats";
import { asiSpilledMl } from "@/lib/compute/spillage";

const SUBTYPES = [
  "feeding",
  "pumping",
  "diaper",
  "sleep",
  "bath",
  "temp",
  "med",
  "hiccup",
  "tummy",
] as const;
type Subtype = (typeof SUBTYPES)[number];

function isValidSubtype(s: string): s is Subtype {
  return (SUBTYPES as readonly string[]).includes(s);
}

/**
 * Resolve end timestamp for ongoing actions. Priority:
 *   1. paused_at — user already paused; that moment IS the actual end
 *      (offset would double-shift). Pause wins to preserve durations.
 *   2. now() − end_offset_min × 60s — user picked "berapa menit lalu"
 *      because they forgot to tap Selesai right when baby woke / activity
 *      ended. Default offset 0 → now().
 */
function computeEndIso(
  formData: FormData,
  pausedAt: string | null | undefined,
): string {
  if (pausedAt) return pausedAt;
  const raw = String(formData.get("end_offset_min") ?? "0").trim();
  const offset = Math.max(0, Number(raw) || 0);
  return new Date(Date.now() - offset * 60000).toISOString();
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function str(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw === "" ? null : raw;
}

function bool(formData: FormData, key: string): boolean {
  return String(formData.get(key) ?? "") === "1";
}

function isoOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  // <input type="datetime-local"> submits "YYYY-MM-DDTHH:mm" with no
  // timezone. Vercel server runs in UTC; without the offset, new Date()
  // would treat 09:00 as 09:00 UTC instead of 09:00 Jakarta. Force the
  // input to be parsed as Asia/Jakarta (+07:00).
  const withTz = /[+-]\d{2}:\d{2}$|Z$/i.test(raw) ? raw : `${raw}:00+07:00`;
  const d = new Date(withTz);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Read optional spillage fields for bottle feeding rows. Mutates
 * payload with amount_spilled_ml + spilled_attribution when applicable.
 * Mix tanpa explicit attribution → default 'proporsional'.
 */
function applySpillageToPayload(
  formData: FormData,
  payload: Record<string, unknown>,
  content: "asi" | "sufor" | "mix",
): void {
  const spilledRaw = num(formData, "amount_spilled_ml");
  if (spilledRaw !== null && spilledRaw > 0) {
    payload.amount_spilled_ml = spilledRaw;
    if (content === "mix") {
      const attrRaw = String(formData.get("spilled_attribution") ?? "");
      payload.spilled_attribution =
        attrRaw === "asi" || attrRaw === "sufor" || attrRaw === "proporsional"
          ? attrRaw
          : "proporsional";
    } else {
      payload.spilled_attribution = null;
    }
  } else {
    payload.amount_spilled_ml = null;
    payload.spilled_attribution = null;
  }
}

export async function createLogAction(formData: FormData) {
  const subtype = String(formData.get("subtype") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");

  if (!isValidSubtype(subtype)) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Subtype tidak valid.")}`);
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const timestamp =
    isoOrNull(formData, "timestamp") ?? new Date().toISOString();

  const payload: Record<string, unknown> = {
    baby_id: baby.id,
    subtype,
    timestamp,
    created_by: user.id,
    notes: str(formData, "notes"),
  };

  if (subtype === "feeding") {
    const mode = String(formData.get("feeding_mode") ?? "sufor");
    if (mode === "sufor") {
      const content = String(formData.get("bottle_content") ?? "sufor");
      if (content !== "sufor" && content !== "asi" && content !== "mix") {
        redirect(
          `${returnTo}?logerror=${encodeURIComponent("Pilih ASI/Sufor/Mix.")}`,
        );
      }
      payload.bottle_content = content;
      if (content === "mix") {
        const asiMl = num(formData, "amount_asi_ml") ?? 0;
        const suforMl = num(formData, "amount_sufor_ml") ?? 0;
        if (asiMl <= 0 && suforMl <= 0) {
          redirect(
            `${returnTo}?logerror=${encodeURIComponent("Mix botol: minimal salah satu sisi > 0.")}`,
          );
        }
        payload.amount_asi_ml = asiMl;
        payload.amount_sufor_ml = suforMl;
        payload.amount_ml = asiMl + suforMl;
      } else {
        const amount = num(formData, "amount_ml");
        if (amount === null || amount <= 0) {
          redirect(
            `${returnTo}?logerror=${encodeURIComponent("Jumlah susu harus diisi.")}`,
          );
        }
        payload.amount_ml = amount;
        // Mirror untuk konsistensi: asi-only → asi_ml = total, sufor → sufor_ml
        if (content === "asi") payload.amount_asi_ml = amount;
        else payload.amount_sufor_ml = amount;
      }
      applySpillageToPayload(formData, payload, content);
    } else {
      const l = num(formData, "duration_l_min");
      const r = num(formData, "duration_r_min");
      if ((l === null || l <= 0) && (r === null || r <= 0)) {
        redirect(
          `${returnTo}?logerror=${encodeURIComponent("Isi durasi DBF kiri atau kanan.")}`,
        );
      }
      payload.duration_l_min = l;
      payload.duration_r_min = r;
      // Effectiveness picker (efektif / sedang / kurang_efektif) — same
      // semantics as endOngoingDbfAction. Skip / empty = NULL (default
      // 100%). Saved per-row.
      const effRaw = String(formData.get("effectiveness") ?? "").trim();
      if (
        effRaw === "efektif" ||
        effRaw === "sedang" ||
        effRaw === "kurang_efektif"
      ) {
        payload.effectiveness = effRaw;
      }
      // Per-row rate snapshot. Forward-only behavior: if user provides
      // explicit override, use it; else snapshot the current Profile-
      // derived rate so future Profile changes don't retroactively alter
      // this row's estimate.
      const rateRaw = String(formData.get("dbf_rate_override") ?? "").trim();
      if (rateRaw !== "") {
        const rate = Number(rateRaw);
        if (Number.isFinite(rate) && rate > 0 && rate <= 30) {
          payload.dbf_rate_override = rate;
        }
      } else {
        // Snapshot current Profile-derived rate
        const dbfMin = (l ?? 0) + (r ?? 0);
        if (dbfMin > 0) {
          // Need recent logs to compute pumping rate (most recent
          // meaningful pump). Cheap query — just last few pumping rows.
          const { data: pumpLogs } = await supabase
            .from("logs")
            .select(
              "subtype, amount_l_ml, amount_r_ml, start_l_at, end_l_at, start_r_at, end_r_at, end_timestamp, timestamp",
            )
            .eq("baby_id", baby.id)
            .eq("subtype", "pumping")
            .not("end_timestamp", "is", null)
            .order("timestamp", { ascending: false })
            .limit(20);
          const est = dbfEstimateMl(dbfMin, (pumpLogs ?? []) as LogRow[], {
            fixedMlPerMin: baby.dbf_ml_per_min,
            pumpingMultiplier: baby.dbf_pumping_multiplier,
          });
          payload.dbf_rate_override = est.mlPerMin;
        }
      }
    }
  } else if (subtype === "pumping") {
    const l = num(formData, "amount_l_ml");
    const r = num(formData, "amount_r_ml");
    if ((l === null || l <= 0) && (r === null || r <= 0)) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Isi jumlah pumping kiri atau kanan.")}`,
      );
    }
    // ml === 0 / null → that side wasn't pumped. Drop ml + timestamps
    // for that side so we don't store fake defaults from the form.
    const lActive = l !== null && l > 0;
    const rActive = r !== null && r > 0;
    payload.amount_l_ml = lActive ? l : null;
    payload.amount_r_ml = rActive ? r : null;
    const startL = lActive ? isoOrNull(formData, "start_l_at") : null;
    const endL = lActive ? isoOrNull(formData, "end_l_at") : null;
    const startR = rActive ? isoOrNull(formData, "start_r_at") : null;
    const endR = rActive ? isoOrNull(formData, "end_r_at") : null;
    payload.start_l_at = startL;
    payload.end_l_at = endL;
    payload.start_r_at = startR;
    payload.end_r_at = endR;
    // Overall session window from per-side min(starts) → max(ends).
    const starts = [startL, startR].filter((v): v is string => !!v).sort();
    const ends = [endL, endR].filter((v): v is string => !!v).sort();
    if (starts[0]) payload.timestamp = starts[0];
    if (ends[ends.length - 1]) payload.end_timestamp = ends[ends.length - 1];
  } else if (subtype === "diaper") {
    const hasPee = bool(formData, "has_pee");
    const hasPoop = bool(formData, "has_poop");
    if (!hasPee && !hasPoop) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Pilih minimal pipis atau BAB.")}`,
      );
    }
    payload.has_pee = hasPee;
    payload.has_poop = hasPoop;
    if (hasPoop) {
      payload.poop_color = str(formData, "poop_color");
      payload.poop_consistency = str(formData, "poop_consistency");
    }
  } else if (subtype === "sleep") {
    const endTs = isoOrNull(formData, "end_timestamp");
    payload.end_timestamp = endTs;
    // Empty Bangun = baby still sleeping → treat as ongoing so the row
    // shows in OngoingCard + can be ended via the regular flow. The
    // home page will also auto-open NightLamp via ?darklamp=sleep.
    if (endTs === null) {
      payload.started_with_stopwatch = true;
    }
    const quality = String(formData.get("sleep_quality") ?? "").trim();
    if (quality === "nyenyak" || quality === "gelisah" || quality === "sering_bangun") {
      payload.sleep_quality = quality;
    }
  } else if (subtype === "temp") {
    const t = num(formData, "temp_celsius");
    if (t === null || t < 30 || t > 45) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Suhu harus 30–45°C.")}`,
      );
    }
    payload.temp_celsius = t;
  } else if (subtype === "med") {
    const name = str(formData, "med_name");
    if (!name) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Nama obat harus diisi.")}`,
      );
    }
    payload.med_name = name;
    payload.med_dose = str(formData, "med_dose");
  } else if (subtype === "bath") {
    payload.bath_pijat_ilu = formData.get("bath_pijat_ilu") === "1";
    payload.bath_clean_tali_pusat =
      formData.get("bath_clean_tali_pusat") === "1";
  } else if (subtype === "hiccup" || subtype === "tummy") {
    payload.end_timestamp = isoOrNull(formData, "end_timestamp");
  }

  const { error } = await supabase.from("logs").insert(payload as never);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal simpan log: ${error.message}`)}`,
    );
  }

  // ASI stock allocation: when an ASI bottle feed is logged, deduct the
  // ml from pumping batches. Default policy: oldest first (FIFO).
  // If the user picked a specific batch via the modal, allocate from
  // that batch first, then fall back to FIFO across the rest if the
  // feed exceeds the picked batch's remaining stock.
  // Deduct ASI ml only — works for both 'asi' (full) and 'mix' (partial,
  // pakai amount_asi_ml saja, sisanya sufor tidak nge-touch stock).
  const asiDrunk =
    subtype === "feeding" &&
    (payload.bottle_content === "asi" ||
      payload.bottle_content === "mix") &&
    typeof payload.amount_asi_ml === "number" &&
    payload.amount_asi_ml > 0
      ? payload.amount_asi_ml
      : 0;
  const asiSpilled =
    subtype === "feeding" && asiDrunk > 0
      ? asiSpilledMl({
          bottle_content:
            (payload.bottle_content as "asi" | "sufor" | "mix") ?? null,
          amount_ml: (payload.amount_ml as number) ?? null,
          amount_asi_ml: (payload.amount_asi_ml as number) ?? null,
          amount_sufor_ml: (payload.amount_sufor_ml as number) ?? null,
          amount_spilled_ml: (payload.amount_spilled_ml as number) ?? null,
          spilled_attribution:
            (payload.spilled_attribution as
              | "asi"
              | "sufor"
              | "proporsional"
              | null) ?? null,
        })
      : 0;
  const asiToDeduct = asiDrunk + asiSpilled;
  if (asiToDeduct > 0) {
    const pickedBatchId = String(formData.get("asi_batch_id") ?? "").trim();
    const { data: batches } = await supabase
      .from("logs")
      .select("id, amount_l_ml, amount_r_ml, consumed_ml")
      .eq("baby_id", baby.id)
      .eq("subtype", "pumping")
      .not("end_timestamp", "is", null)
      .order("timestamp", { ascending: true });

    type Batch = NonNullable<typeof batches>[number];
    const all: Batch[] = batches ?? [];
    const ordered: Batch[] = pickedBatchId
      ? [
          ...all.filter((b) => b.id === pickedBatchId),
          ...all.filter((b) => b.id !== pickedBatchId),
        ]
      : all;

    let remaining = asiToDeduct;
    for (const b of ordered) {
      if (remaining <= 0) break;
      const produced = (b.amount_l_ml ?? 0) + (b.amount_r_ml ?? 0);
      const consumed = b.consumed_ml ?? 0;
      const free = produced - consumed;
      if (free <= 0) continue;
      const take = Math.min(remaining, free);
      await supabase
        .from("logs")
        .update({ consumed_ml: consumed + take })
        .eq("id", b.id);
      remaining -= take;
    }
  }

  revalidatePath("/");
  revalidatePath("/history");
  // Auto-open NightLamp when manual sleep log was saved with empty
  // Bangun → baby still sleeping → user wants to monitor stopwatch.
  const isOngoingSleep =
    subtype === "sleep" && payload.end_timestamp === null;
  const queryString = isOngoingSleep
    ? `?logsaved=${subtype}&darklamp=sleep`
    : `?logsaved=${subtype}`;
  redirect(`${returnTo}${queryString}`);
}

export async function startOngoingLogAction(formData: FormData) {
  const subtype = String(formData.get("subtype") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");

  if (
    subtype !== "sleep" &&
    subtype !== "pumping" &&
    subtype !== "feeding" &&
    subtype !== "hiccup" &&
    subtype !== "tummy"
  ) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Subtype tidak mendukung ongoing.")}`);
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  // Guard against duplicate ongoing of same subtype. Frontend hides the
  // start button when ongoingSubtypes has the type, but a stale page or
  // double-tap can still race. Reject server-side.
  const { data: existingOngoing } = await supabase
    .from("logs")
    .select("id")
    .eq("baby_id", baby.id)
    .eq("subtype", subtype)
    .is("end_timestamp", null)
    .eq("started_with_stopwatch", true)
    .limit(1);
  if (existingOngoing && existingOngoing.length > 0) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Sudah ada sesi ${subtype} berlangsung — selesaikan dulu.`)}`,
    );
  }

  // Backdate option: form may include start_offset_min (0/5/10/15/30)
  // for "Mulai dari X menit lalu". Default 0 → now.
  const offsetMin = (() => {
    const raw = String(formData.get("start_offset_min") ?? "0");
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 60) return 0;
    return Math.round(n);
  })();
  const startMs = Date.now() - offsetMin * 60 * 1000;
  const now = new Date(startMs).toISOString();
  const insertPayload: Record<string, unknown> = {
    baby_id: baby.id,
    subtype,
    timestamp: now,
    end_timestamp: null,
    created_by: user.id,
    started_with_stopwatch: true,
  };

  // Pumping AND DBF (subtype='feeding') side picker: 'kiri' | 'kanan' |
  // 'both'. Set start_X_at on the chosen side(s) so we can show the
  // correct mid-session buttons. DBF is the only ongoing variant of
  // feeding (sufor/bottle is point-in-time, no Mulai flow).
  if (subtype === "pumping" || subtype === "feeding") {
    const sideField = subtype === "pumping" ? "pumping_side" : "dbf_side";
    const side = String(formData.get(sideField) ?? "both");
    if (side === "kiri") {
      insertPayload.start_l_at = now;
    } else if (side === "kanan") {
      insertPayload.start_r_at = now;
    } else {
      insertPayload.start_l_at = now;
      insertPayload.start_r_at = now;
    }
  }

  const { error } = await supabase.from("logs").insert(insertPayload as never);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal mulai: ${error.message}`)}`,
    );
  }

  // Combo: when starting DBF, optionally also start pumping on the
  // opposite side in the same atomic flow. Common scenario: nursing
  // baby di Kiri sambil capture letdown reflex pump di Kanan.
  if (subtype === "feeding") {
    const comboPumpSide = String(formData.get("combo_pump_side") ?? "");
    if (comboPumpSide === "kiri" || comboPumpSide === "kanan") {
      const pumpPayload: Record<string, unknown> = {
        baby_id: baby.id,
        subtype: "pumping",
        timestamp: now,
        end_timestamp: null,
        created_by: user.id,
        started_with_stopwatch: true,
      };
      if (comboPumpSide === "kiri") {
        pumpPayload.start_l_at = now;
      } else {
        pumpPayload.start_r_at = now;
      }
      await supabase.from("logs").insert(pumpPayload as never);
      // Best-effort: combo pump insert error doesn't roll back DBF.
    }
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?ongoingstarted=${subtype}`);
}

export async function endOngoingSleepAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  const qualityRaw = String(formData.get("sleep_quality") ?? "").trim();
  const sleepQuality =
    qualityRaw === "nyenyak" ||
    qualityRaw === "gelisah" ||
    qualityRaw === "sering_bangun"
      ? qualityRaw
      : null;
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { data: row } = await supabase
    .from("logs")
    .select("paused_at")
    .eq("id", id)
    .single();
  const endIso = computeEndIso(formData, row?.paused_at ?? null);

  const updates: Record<string, unknown> = {
    end_timestamp: endIso,
    paused_at: null,
  };
  if (sleepQuality) updates.sleep_quality = sleepQuality;

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id)
    .eq("subtype", "sleep")
    .is("end_timestamp", null);

  if (error) {
    redirect(`${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`);
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=sleep`);
}

export async function endOngoingPumpingAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  const l = num(formData, "amount_l_ml");
  const r = num(formData, "amount_r_ml");

  if (!id) redirect(returnTo);
  if ((l === null || l <= 0) && (r === null || r <= 0)) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent("Isi jumlah pumping kiri atau kanan.")}`,
    );
  }

  const supabase = createClient();
  // Read current per-side state so we can close any side that was
  // started but not yet ended (user pressed Selesai without Pindah).
  // If paused, freeze end at paused_at so duration excludes pause time.
  const { data: existing } = await supabase
    .from("logs")
    .select("start_l_at, end_l_at, start_r_at, end_r_at, paused_at")
    .eq("id", id)
    .single();
  const now = computeEndIso(formData, existing?.paused_at ?? null);
  const lActive = l !== null && l > 0;
  const rActive = r !== null && r > 0;
  const updates: Record<string, unknown> = {
    end_timestamp: now,
    amount_l_ml: lActive ? l : null,
    amount_r_ml: rActive ? r : null,
    paused_at: null,
  };
  if (existing?.start_l_at && !existing.end_l_at && lActive) {
    updates.end_l_at = now;
  }
  if (existing?.start_r_at && !existing.end_r_at && rActive) {
    updates.end_r_at = now;
  }
  // ml=0 → side wasn't actually pumped: scrub its start/end too
  if (!lActive) {
    updates.start_l_at = null;
    updates.end_l_at = null;
  }
  if (!rActive) {
    updates.start_r_at = null;
    updates.end_r_at = null;
  }

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id)
    .eq("subtype", "pumping")
    .is("end_timestamp", null);

  if (error) {
    redirect(`${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`);
  }

  revalidatePath("/");
  revalidatePath("/history");
  // Pass pump_id so home page can show rate-comparison banner.
  redirect(`${returnTo}?logsaved=pumping&pump_id=${id}`);
}

export async function pumpingPindahAction(formData: FormData) {
  // Subtype-agnostic: works for both pumping and feeding (DBF) ongoing
  // logs. End the active side, start the other side. Default Pindah
  // time = now; user can backdate via pindah_offset_min form field
  // ('lupa klik pindah X menit lalu').
  const id = String(formData.get("id") ?? "");
  const fromSide = String(formData.get("from_side") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id || (fromSide !== "kiri" && fromSide !== "kanan")) {
    redirect(returnTo);
  }
  const offsetMin = (() => {
    const raw = String(formData.get("pindah_offset_min") ?? "0");
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 60) return 0;
    return Math.round(n);
  })();

  const supabase = createClient();
  let pivotIso = new Date(Date.now() - offsetMin * 60_000).toISOString();
  // Validate: pivot must be >= active side's start. If user backdated
  // before the active start, clamp to start (no zero-duration sliver).
  const { data: existing } = await supabase
    .from("logs")
    .select("start_l_at, start_r_at, end_l_at, end_r_at")
    .eq("id", id)
    .single();
  const activeStart =
    fromSide === "kiri" ? existing?.start_l_at : existing?.start_r_at;
  if (activeStart && new Date(pivotIso).getTime() < new Date(activeStart).getTime()) {
    pivotIso = activeStart;
  }

  const updates: Record<string, unknown> =
    fromSide === "kiri"
      ? { end_l_at: pivotIso, start_r_at: pivotIso }
      : { end_r_at: pivotIso, start_l_at: pivotIso };

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id)
    .is("end_timestamp", null);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal pindah: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  redirect(returnTo);
}

/**
 * Pumping-specific: start the OTHER side without ending the active one.
 * Both sides pump simultaneously after this. Mirror of pindah but
 * kiri-end-kanan-start semantics replaced with kanan-start only.
 */
export async function pumpingTambahAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const addSide = String(formData.get("add_side") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id || (addSide !== "kiri" && addSide !== "kanan")) {
    redirect(returnTo);
  }
  const offsetMin = (() => {
    const raw = String(formData.get("tambah_offset_min") ?? "0");
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 60) return 0;
    return Math.round(n);
  })();

  const supabase = createClient();
  const startIso = new Date(Date.now() - offsetMin * 60_000).toISOString();

  const updates: Record<string, unknown> =
    addSide === "kiri" ? { start_l_at: startIso } : { start_r_at: startIso };

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id)
    .eq("subtype", "pumping")
    .is("end_timestamp", null);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal tambah sisi: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  redirect(returnTo);
}

export async function endOngoingDbfAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { data: existing } = await supabase
    .from("logs")
    .select("start_l_at, end_l_at, start_r_at, end_r_at, paused_at")
    .eq("id", id)
    .single();
  if (!existing) redirect(returnTo);

  const now = computeEndIso(formData, existing.paused_at ?? null);
  const endL = existing.end_l_at ?? (existing.start_l_at ? now : null);
  const endR = existing.end_r_at ?? (existing.start_r_at ? now : null);
  // Effectiveness assessment (efektif / sedang / kurang_efektif).
  // NULL when user skipped → defaults to 100% (efektif) in computations.
  const effectivenessRaw = String(formData.get("effectiveness") ?? "").trim();
  const effectiveness =
    effectivenessRaw === "efektif" ||
    effectivenessRaw === "sedang" ||
    effectivenessRaw === "kurang_efektif"
      ? effectivenessRaw
      : null;

  const updates: Record<string, unknown> = {
    end_timestamp: now,
    paused_at: null,
    effectiveness,
  };
  if (existing.start_l_at && !existing.end_l_at) updates.end_l_at = now;
  if (existing.start_r_at && !existing.end_r_at) updates.end_r_at = now;

  const minutesBetween = (a: string, b: string) =>
    Math.max(
      0,
      Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000),
    );
  let durLMin = 0;
  let durRMin = 0;
  if (existing.start_l_at && endL) {
    durLMin = minutesBetween(existing.start_l_at, endL);
    updates.duration_l_min = durLMin;
  }
  if (existing.start_r_at && endR) {
    durRMin = minutesBetween(existing.start_r_at, endR);
    updates.duration_r_min = durRMin;
  }

  // Snapshot current Profile-derived rate at end → forward-only behavior.
  // If user later changes Profile multiplier/fixed, this row keeps its
  // rate at end-time. To recompute with new rate, edit row + clear
  // override field (or use mass edit).
  const dbfMin = durLMin + durRMin;
  if (dbfMin > 0) {
    const baby2 = await getCurrentBaby();
    if (baby2) {
      const { data: pumpLogs } = await supabase
        .from("logs")
        .select(
          "subtype, amount_l_ml, amount_r_ml, start_l_at, end_l_at, start_r_at, end_r_at, end_timestamp, timestamp",
        )
        .eq("baby_id", baby2.id)
        .eq("subtype", "pumping")
        .not("end_timestamp", "is", null)
        .order("timestamp", { ascending: false })
        .limit(20);
      const est = dbfEstimateMl(dbfMin, (pumpLogs ?? []) as LogRow[], {
        fixedMlPerMin: baby2.dbf_ml_per_min,
        pumpingMultiplier: baby2.dbf_pumping_multiplier,
      });
      updates.dbf_rate_override = est.mlPerMin;
    }
  }

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id)
    .eq("subtype", "feeding")
    .is("end_timestamp", null);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");

  // Top-up recommendation: if effective ml < per-feed expected by ≥15ml
  // and ≥20%, redirect with ?topup=X param so home page can show the
  // suggestion banner. Conservative — most newborns don't need top-up
  // routinely, only on poor effectiveness or short sessions.
  redirect(
    `${returnTo}?logsaved=feeding&dbf_id=${id}&dbf_dur=${durLMin + durRMin}`,
  );
}

/**
 * Log Haakaa-style passive collection on the OPPOSITE side during DBF.
 * Inserts a pumping batch row with amount_X_ml + per-side timestamps
 * matching the DBF window — auto-flows into ASI stock for FIFO allocation.
 */
export async function logDbfTampunganAction(formData: FormData) {
  const dbfId = String(formData.get("dbf_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const ml = Number(formData.get("ml") ?? 0);
  const returnTo = String(formData.get("return_to") ?? "/");

  if (!dbfId) redirect(returnTo);
  if (!Number.isFinite(ml) || ml <= 0 || ml > 500) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent("Tampungan: ml harus 1–500.")}`,
    );
  }
  if (side !== "kiri" && side !== "kanan") redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const { data: dbfRow } = await supabase
    .from("logs")
    .select("timestamp, end_timestamp, baby_id, subtype")
    .eq("id", dbfId)
    .single();
  if (!dbfRow || dbfRow.subtype !== "feeding" || dbfRow.baby_id !== baby.id) {
    redirect(returnTo);
  }

  const startAt = dbfRow.timestamp;
  const endAt = dbfRow.end_timestamp ?? new Date().toISOString();

  const payload: Record<string, unknown> = {
    baby_id: baby.id,
    subtype: "pumping",
    timestamp: startAt,
    end_timestamp: endAt,
    created_by: user.id,
    started_with_stopwatch: false,
    notes: `Tampungan ${side} (Haakaa) saat DBF`,
  };
  if (side === "kiri") {
    payload.amount_l_ml = ml;
    payload.start_l_at = startAt;
    payload.end_l_at = endAt;
  } else {
    payload.amount_r_ml = ml;
    payload.start_r_at = startAt;
    payload.end_r_at = endAt;
  }

  const { error } = await supabase.from("logs").insert(payload as never);
  // returnTo may already carry query string (e.g. ?dbf_id=...&tampungan_skip=1
  // so other post-DBF banners stay). Pick separator accordingly.
  const sep = returnTo.includes("?") ? "&" : "?";
  if (error) {
    redirect(
      `${returnTo}${sep}logerror=${encodeURIComponent(`Gagal simpan tampungan: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/stock");
  redirect(`${returnTo}${sep}logsaved=tampungan`);
}

export async function endOngoingHiccupAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { data: row } = await supabase
    .from("logs")
    .select("paused_at")
    .eq("id", id)
    .single();
  const endIso = computeEndIso(formData, row?.paused_at ?? null);

  const { error } = await supabase
    .from("logs")
    .update({ end_timestamp: endIso, paused_at: null } as never)
    .eq("id", id)
    .eq("subtype", "hiccup")
    .is("end_timestamp", null);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=hiccup`);
}

export async function endOngoingTummyAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { data: row } = await supabase
    .from("logs")
    .select("paused_at")
    .eq("id", id)
    .single();
  const endIso = computeEndIso(formData, row?.paused_at ?? null);

  const { error } = await supabase
    .from("logs")
    .update({ end_timestamp: endIso, paused_at: null } as never)
    .eq("id", id)
    .eq("subtype", "tummy")
    .is("end_timestamp", null);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=tummy`);
}

export async function pauseOngoingLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase
    .from("logs")
    .update({ paused_at: new Date().toISOString() } as never)
    .eq("id", id)
    .is("end_timestamp", null)
    .is("paused_at", null);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal pause: ${error.message}`)}`,
    );
  }
  // No redirect on success → in-place re-render so NightLamp stays open
  // (otherwise full page reload would unmount the dark mode + flash rose
  // theme-color back into the iOS status bar).
  revalidatePath("/");
}

export async function resumeFromPauseAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();

  // Resume needs to exclude the pause window from total duration.
  // Shift `timestamp` (and any still-active per-side starts) forward by
  // the pause duration so duration-from-start computations stay correct
  // both during the live tick and at end_timestamp.
  const { data: row } = await supabase
    .from("logs")
    .select(
      "timestamp, paused_at, start_l_at, end_l_at, start_r_at, end_r_at",
    )
    .eq("id", id)
    .is("end_timestamp", null)
    .not("paused_at", "is", null)
    .single();
  if (!row) redirect(returnTo);

  const pauseMs =
    Date.now() - new Date(row.paused_at as string).getTime();
  const shift = (iso: string | null): string | null =>
    iso === null
      ? null
      : new Date(new Date(iso).getTime() + pauseMs).toISOString();

  const updates: Record<string, unknown> = {
    paused_at: null,
    timestamp: shift(row.timestamp as string),
  };
  // Only shift per-side starts that are still active (no end yet).
  if (row.start_l_at && !row.end_l_at) {
    updates.start_l_at = shift(row.start_l_at as string);
  }
  if (row.start_r_at && !row.end_r_at) {
    updates.start_r_at = shift(row.start_r_at as string);
  }

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal lanjut: ${error.message}`)}`,
    );
  }
  // Same as pause — no redirect on success so NightLamp stays mounted.
  revalidatePath("/");
}

/**
 * Sweep ongoing sessions yang paused lebih dari 10 menit → auto-end
 * dengan end_timestamp = paused_at (tidak ikut hitung pause time).
 * Dipanggil dari home page sebelum query data → user yang baru buka
 * app pertama kali setelah lama pause akan lihat sesinya udah selesai.
 *
 * Bukan true cron — hanya fire saat ada page render. Untuk auto-end
 * yang benar-benar background (user tidak buka app), butuh Vercel Cron
 * atau pg_cron — defer.
 */
export async function expireStalePausedLogs(babyId: string) {
  const supabase = createClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  // Skip pumping: end_timestamp tanpa amount_l_ml/amount_r_ml = data
  // pump hilang. User harus manually Selesai supaya bisa input ml.
  // Skip feeding (DBF) juga supaya effectiveness picker tetap muncul.
  const { data: stale } = await supabase
    .from("logs")
    .select("id, subtype, paused_at, start_l_at, end_l_at, start_r_at, end_r_at")
    .eq("baby_id", babyId)
    .is("end_timestamp", null)
    .not("paused_at", "is", null)
    .lt("paused_at", cutoff)
    .in("subtype", ["sleep", "hiccup", "tummy"]);
  if (!stale || stale.length === 0) return;
  for (const r of stale) {
    if (!r.paused_at) continue;
    const updates: Record<string, unknown> = {
      end_timestamp: r.paused_at,
    };
    if (r.start_l_at && !r.end_l_at) updates.end_l_at = r.paused_at;
    if (r.start_r_at && !r.end_r_at) updates.end_r_at = r.paused_at;
    await supabase
      .from("logs")
      .update(updates as never)
      .eq("id", r.id);
  }
}

export async function resumeOngoingLogAction(formData: FormData) {
  // "Lanjutkan" — re-open a finished sleep / pumping / DBF log as
  // ongoing. Use case: baby woke briefly then went back to sleep and
  // user doesn't want a second log entry; or user accidentally tapped
  // Selesai before the session was actually done.
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { data: row } = await supabase
    .from("logs")
    .select("baby_id, subtype, end_timestamp, end_l_at, end_r_at")
    .eq("id", id)
    .single();
  if (!row || !row.end_timestamp) redirect(returnTo);
  if (
    row.subtype !== "sleep" &&
    row.subtype !== "pumping" &&
    row.subtype !== "feeding"
  ) {
    redirect(returnTo);
  }

  // Block if another ongoing of same logical type already exists. For
  // 'feeding' (DBF) we narrow further: only block if it's a per-side
  // ongoing (matches the DBF detection used on home).
  const { data: existingOngoing } = await supabase
    .from("logs")
    .select("id, start_l_at, start_r_at")
    .eq("baby_id", row.baby_id)
    .eq("subtype", row.subtype)
    .is("end_timestamp", null);
  const blocked = (existingOngoing ?? []).some((r) => {
    if (row.subtype === "feeding") {
      return r.start_l_at !== null || r.start_r_at !== null;
    }
    return true;
  });
  if (blocked) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Sudah ada sesi ${row.subtype} berlangsung — selesaikan dulu.`)}`,
    );
  }

  // Compute which end_X_at to clear. For sleep: only end_timestamp.
  // For pumping/DBF: re-open the side that ended last (most recent
  // end_X_at). If both ended at the same moment (e.g. Selesai with
  // both sides active), clear both → both sides resume.
  const updates: Record<string, unknown> = { end_timestamp: null };
  if (row.subtype === "pumping" || row.subtype === "feeding") {
    const lEnd = row.end_l_at;
    const rEnd = row.end_r_at;
    if (lEnd && rEnd) {
      if (lEnd === rEnd) {
        updates.end_l_at = null;
        updates.end_r_at = null;
      } else if (new Date(lEnd).getTime() > new Date(rEnd).getTime()) {
        updates.end_l_at = null;
      } else {
        updates.end_r_at = null;
      }
    } else if (lEnd) {
      updates.end_l_at = null;
    } else if (rEnd) {
      updates.end_r_at = null;
    }
  }

  const { error } = await supabase
    .from("logs")
    .update(updates as never)
    .eq("id", id);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal lanjut: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=${row.subtype}`);
}

export async function updateLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("ID log hilang.")}`);
  }

  const subtype = String(formData.get("subtype") ?? "");
  if (!isValidSubtype(subtype)) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Subtype tidak valid.")}`);
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  // Read the existing row so we can detect ASI re-allocation needs and
  // refuse edits on rows that don't belong to current baby.
  const { data: existing } = await supabase
    .from("logs")
    .select(
      "id, baby_id, subtype, bottle_content, amount_ml, amount_asi_ml, amount_sufor_ml, amount_spilled_ml, spilled_attribution, end_timestamp",
    )
    .eq("id", id)
    .single();

  if (!existing || existing.baby_id !== baby.id) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Log tidak ditemukan.")}`);
  }

  const timestamp =
    isoOrNull(formData, "timestamp") ?? new Date().toISOString();

  // Build the update payload from form fields. Same field shape as
  // createLogAction, but without baby_id/created_by/started_with_stopwatch.
  const payload: Record<string, unknown> = {
    timestamp,
    notes: str(formData, "notes"),
  };

  // Reset subtype-specific columns first to avoid stale fields when
  // the user e.g. switches feeding sufor → DBF.
  const resetByType: Record<Subtype, Record<string, unknown>> = {
    feeding: {
      amount_ml: null,
      duration_l_min: null,
      duration_r_min: null,
      bottle_content: null,
      // Reset per-side DBF timestamps too — set fresh below if provided
      start_l_at: null,
      end_l_at: null,
      start_r_at: null,
      end_r_at: null,
      // Reset effectiveness — re-set from form below for DBF mode
      effectiveness: null,
    },
    pumping: {
      amount_l_ml: null,
      amount_r_ml: null,
      start_l_at: null,
      end_l_at: null,
      start_r_at: null,
      end_r_at: null,
    },
    diaper: {
      has_pee: false,
      has_poop: false,
      poop_color: null,
      poop_consistency: null,
    },
    sleep: { end_timestamp: null, sleep_quality: null },
    bath: {},
    temp: { temp_celsius: null },
    med: { med_name: null, med_dose: null },
    hiccup: { end_timestamp: null },
    tummy: { end_timestamp: null },
  };
  Object.assign(payload, resetByType[subtype]);

  if (subtype === "feeding") {
    const mode = String(formData.get("feeding_mode") ?? "sufor");
    if (mode === "sufor") {
      const content = String(formData.get("bottle_content") ?? "sufor");
      if (content !== "sufor" && content !== "asi" && content !== "mix") {
        redirect(
          `${returnTo}?logerror=${encodeURIComponent("Pilih ASI/Sufor/Mix.")}`,
        );
      }
      payload.bottle_content = content;
      if (content === "mix") {
        const asiMl = num(formData, "amount_asi_ml") ?? 0;
        const suforMl = num(formData, "amount_sufor_ml") ?? 0;
        if (asiMl <= 0 && suforMl <= 0) {
          redirect(
            `${returnTo}?logerror=${encodeURIComponent("Mix botol: minimal salah satu sisi > 0.")}`,
          );
        }
        payload.amount_asi_ml = asiMl;
        payload.amount_sufor_ml = suforMl;
        payload.amount_ml = asiMl + suforMl;
      } else {
        const amount = num(formData, "amount_ml");
        if (amount === null || amount <= 0) {
          redirect(
            `${returnTo}?logerror=${encodeURIComponent("Jumlah susu harus diisi.")}`,
          );
        }
        payload.amount_ml = amount;
        // Mirror untuk konsistensi: asi-only → asi_ml = total, sufor → sufor_ml
        if (content === "asi") payload.amount_asi_ml = amount;
        else payload.amount_sufor_ml = amount;
      }
      applySpillageToPayload(formData, payload, content);
    } else {
      // DBF mode in EDIT modal: per-side Mulai/Selesai datetimes →
      // auto-compute duration. Falls back to direct duration input
      // if no per-side fields provided (legacy).
      const startL = isoOrNull(formData, "dbf_start_l_at");
      const endL = isoOrNull(formData, "dbf_end_l_at");
      const startR = isoOrNull(formData, "dbf_start_r_at");
      const endR = isoOrNull(formData, "dbf_end_r_at");
      const usePerSide =
        startL !== null || endL !== null || startR !== null || endR !== null;
      const minutesBetween = (a: string, b: string) => {
        const ms = new Date(b).getTime() - new Date(a).getTime();
        return ms > 0 ? Math.round(ms / 60000) : 0;
      };
      let l: number | null = null;
      let r: number | null = null;
      if (usePerSide) {
        if (startL && endL) {
          payload.start_l_at = startL;
          payload.end_l_at = endL;
          l = minutesBetween(startL, endL);
          payload.duration_l_min = l;
        }
        if (startR && endR) {
          payload.start_r_at = startR;
          payload.end_r_at = endR;
          r = minutesBetween(startR, endR);
          payload.duration_r_min = r;
        }
        const allStarts = [startL, startR].filter((v): v is string => !!v);
        const allEnds = [endL, endR].filter((v): v is string => !!v);
        if (allStarts.length > 0) {
          payload.timestamp = allStarts.sort()[0]!;
        }
        if (allEnds.length > 0) {
          payload.end_timestamp = allEnds.sort()[allEnds.length - 1]!;
        }
      } else {
        l = num(formData, "duration_l_min");
        r = num(formData, "duration_r_min");
        payload.duration_l_min = l;
        payload.duration_r_min = r;
      }
      if ((l === null || l <= 0) && (r === null || r <= 0)) {
        redirect(
          `${returnTo}?logerror=${encodeURIComponent("Isi durasi DBF kiri atau kanan.")}`,
        );
      }
      // Effectiveness picker — persist as nullable enum. Empty / unknown
      // value = NULL (default 100%). Same shape as endOngoingDbfAction.
      const effRaw = String(formData.get("effectiveness") ?? "").trim();
      if (
        effRaw === "efektif" ||
        effRaw === "sedang" ||
        effRaw === "kurang_efektif"
      ) {
        payload.effectiveness = effRaw;
      } else {
        payload.effectiveness = null;
      }
      // Per-row rate override (ml/menit) — applies to this DBF row only.
      // Empty/null = clear override (revert to baby-level setting).
      const rateRaw = String(formData.get("dbf_rate_override") ?? "").trim();
      if (rateRaw === "") {
        payload.dbf_rate_override = null;
      } else {
        const rate = Number(rateRaw);
        if (Number.isFinite(rate) && rate > 0 && rate <= 30) {
          payload.dbf_rate_override = rate;
        }
      }
    }
  } else if (subtype === "pumping") {
    const l = num(formData, "amount_l_ml");
    const r = num(formData, "amount_r_ml");
    if ((l === null || l <= 0) && (r === null || r <= 0)) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Isi jumlah pumping kiri atau kanan.")}`,
      );
    }
    const lActive = l !== null && l > 0;
    const rActive = r !== null && r > 0;
    payload.amount_l_ml = lActive ? l : null;
    payload.amount_r_ml = rActive ? r : null;
    const startL = lActive ? isoOrNull(formData, "start_l_at") : null;
    const endL = lActive ? isoOrNull(formData, "end_l_at") : null;
    const startR = rActive ? isoOrNull(formData, "start_r_at") : null;
    const endR = rActive ? isoOrNull(formData, "end_r_at") : null;
    payload.start_l_at = startL;
    payload.end_l_at = endL;
    payload.start_r_at = startR;
    payload.end_r_at = endR;
    const starts = [startL, startR].filter((v): v is string => !!v).sort();
    const ends = [endL, endR].filter((v): v is string => !!v).sort();
    if (starts[0]) payload.timestamp = starts[0];
    if (ends[ends.length - 1]) payload.end_timestamp = ends[ends.length - 1];
  } else if (subtype === "diaper") {
    const hasPee = bool(formData, "has_pee");
    const hasPoop = bool(formData, "has_poop");
    if (!hasPee && !hasPoop) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Pilih minimal pipis atau BAB.")}`,
      );
    }
    payload.has_pee = hasPee;
    payload.has_poop = hasPoop;
    if (hasPoop) {
      payload.poop_color = str(formData, "poop_color");
      payload.poop_consistency = str(formData, "poop_consistency");
    }
  } else if (subtype === "sleep") {
    payload.end_timestamp = isoOrNull(formData, "end_timestamp");
    const quality = String(formData.get("sleep_quality") ?? "").trim();
    if (
      quality === "nyenyak" ||
      quality === "gelisah" ||
      quality === "sering_bangun"
    ) {
      payload.sleep_quality = quality;
    }
  } else if (subtype === "temp") {
    const t = num(formData, "temp_celsius");
    if (t === null || t < 30 || t > 45) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Suhu harus 30–45°C.")}`,
      );
    }
    payload.temp_celsius = t;
  } else if (subtype === "med") {
    const name = str(formData, "med_name");
    if (!name) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Nama obat harus diisi.")}`,
      );
    }
    payload.med_name = name;
    payload.med_dose = str(formData, "med_dose");
  } else if (subtype === "bath") {
    payload.bath_pijat_ilu = formData.get("bath_pijat_ilu") === "1";
    payload.bath_clean_tali_pusat =
      formData.get("bath_clean_tali_pusat") === "1";
  } else if (subtype === "hiccup" || subtype === "tummy") {
    payload.end_timestamp = isoOrNull(formData, "end_timestamp");
  }

  // ASI re-allocation: refund based on existing.amount_asi_ml (covers
  // both 'asi' full and 'mix' partial). Fallback ke amount_ml untuk
  // legacy rows (sebelum mix migration) yang ngga punya amount_asi_ml.
  // Termasuk asi portion dari spillage lama.
  const oldAsiDrunk =
    existing.subtype === "feeding" &&
    (existing.bottle_content === "asi" || existing.bottle_content === "mix")
      ? typeof existing.amount_asi_ml === "number" && existing.amount_asi_ml > 0
        ? existing.amount_asi_ml
        : existing.bottle_content === "asi" &&
            typeof existing.amount_ml === "number"
          ? existing.amount_ml
          : 0
      : 0;
  const oldAsiSpilled =
    existing.subtype === "feeding" && oldAsiDrunk > 0
      ? asiSpilledMl({
          bottle_content:
            (existing.bottle_content as "asi" | "sufor" | "mix") ?? null,
          amount_ml: existing.amount_ml,
          amount_asi_ml: existing.amount_asi_ml,
          amount_sufor_ml: existing.amount_sufor_ml,
          amount_spilled_ml: existing.amount_spilled_ml,
          spilled_attribution: existing.spilled_attribution as
            | "asi"
            | "sufor"
            | "proporsional"
            | null,
        })
      : 0;
  const oldAsiMl = oldAsiDrunk + oldAsiSpilled;

  if (oldAsiMl > 0) {
    const { data: batches } = await supabase
      .from("logs")
      .select("id, amount_l_ml, amount_r_ml, consumed_ml, timestamp")
      .eq("baby_id", baby.id)
      .eq("subtype", "pumping")
      .gt("consumed_ml", 0)
      .order("timestamp", { ascending: false });

    let toRefund = oldAsiMl;
    for (const b of batches ?? []) {
      if (toRefund <= 0) break;
      const consumed = b.consumed_ml ?? 0;
      const give = Math.min(toRefund, consumed);
      if (give <= 0) continue;
      await supabase
        .from("logs")
        .update({ consumed_ml: consumed - give })
        .eq("id", b.id);
      toRefund -= give;
    }
  }

  const { error } = await supabase
    .from("logs")
    .update(payload as never)
    .eq("id", id);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal update log: ${error.message}`)}`,
    );
  }

  // Re-allocate ASI for the new row state — pakai amount_asi_ml supaya
  // mix mode hanya deduct porsi ASIP-nya saja (sufor ngga touch stock).
  // Include asi spillage di deduction (stock keluar dari freezer = asi
  // diminum + asi tumpah).
  const newAsiDrunk =
    subtype === "feeding" &&
    (payload.bottle_content === "asi" || payload.bottle_content === "mix") &&
    typeof payload.amount_asi_ml === "number" &&
    payload.amount_asi_ml > 0
      ? payload.amount_asi_ml
      : 0;
  const newAsiSpilled =
    subtype === "feeding" && newAsiDrunk > 0
      ? asiSpilledMl({
          bottle_content:
            (payload.bottle_content as "asi" | "sufor" | "mix") ?? null,
          amount_ml: (payload.amount_ml as number) ?? null,
          amount_asi_ml: (payload.amount_asi_ml as number) ?? null,
          amount_sufor_ml: (payload.amount_sufor_ml as number) ?? null,
          amount_spilled_ml: (payload.amount_spilled_ml as number) ?? null,
          spilled_attribution:
            (payload.spilled_attribution as
              | "asi"
              | "sufor"
              | "proporsional"
              | null) ?? null,
        })
      : 0;
  const newAsiMl = newAsiDrunk + newAsiSpilled;
  if (newAsiMl > 0) {
    const { data: batches } = await supabase
      .from("logs")
      .select("id, amount_l_ml, amount_r_ml, consumed_ml")
      .eq("baby_id", baby.id)
      .eq("subtype", "pumping")
      .not("end_timestamp", "is", null)
      .order("timestamp", { ascending: true });

    let remaining = newAsiMl;
    for (const b of batches ?? []) {
      if (remaining <= 0) break;
      const produced = (b.amount_l_ml ?? 0) + (b.amount_r_ml ?? 0);
      const consumed = b.consumed_ml ?? 0;
      const free = produced - consumed;
      if (free <= 0) continue;
      const take = Math.min(remaining, free);
      await supabase
        .from("logs")
        .update({ consumed_ml: consumed + take })
        .eq("id", b.id);
      remaining -= take;
    }
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=${subtype}`);
}

/**
 * Bulk-update dbf_rate_override across multiple DBF rows. Used by the
 * mass-edit affordance on the home page when filtered to act=dbf.
 *
 * Rate empty → clears overrides for all selected rows (revert to
 * Profile chain).
 */
export async function bulkUpdateDbfRateAction(formData: FormData) {
  const idsRaw = String(formData.get("ids") ?? "");
  const rateRaw = String(formData.get("dbf_rate_override") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/");

  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Tidak ada row.")}`);
  }

  const newRate: number | null = (() => {
    if (rateRaw === "") return null;
    const n = Number(rateRaw);
    if (!Number.isFinite(n) || n <= 0 || n > 30) return null;
    return n;
  })();
  // Treat invalid input as null (clear) — matches the input validation
  // on the per-row override field.

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { error } = await supabase
    .from("logs")
    .update({ dbf_rate_override: newRate } as never)
    .in("id", ids)
    .eq("baby_id", baby.id)
    .eq("subtype", "feeding");

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal update: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(returnTo);
}

export async function deleteLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();

  // Read the row first so we can roll back consumed_ml on pumping
  // batches when deleting an ASI bottle feed. Without this, deleting
  // a feed leaves the batch's consumed_ml inflated → stock display
  // shows less than reality.
  const { data: row } = await supabase
    .from("logs")
    .select("baby_id, subtype, bottle_content, amount_ml")
    .eq("id", id)
    .single();

  if (
    row &&
    row.subtype === "feeding" &&
    row.bottle_content === "asi" &&
    typeof row.amount_ml === "number" &&
    row.amount_ml > 0
  ) {
    // Original allocation drew from oldest batches first (FIFO). When
    // rolling back, refill in reverse — most recently allocated first
    // (newest non-empty batches). Best-effort heuristic since we don't
    // store per-feed→batch links; works correctly when only one feed
    // touched a batch, and degrades gracefully otherwise.
    const { data: batches } = await supabase
      .from("logs")
      .select("id, amount_l_ml, amount_r_ml, consumed_ml, timestamp")
      .eq("baby_id", row.baby_id)
      .eq("subtype", "pumping")
      .gt("consumed_ml", 0)
      .order("timestamp", { ascending: false });

    let toRefund = row.amount_ml;
    for (const b of batches ?? []) {
      if (toRefund <= 0) break;
      const consumed = b.consumed_ml ?? 0;
      const give = Math.min(toRefund, consumed);
      if (give <= 0) continue;
      await supabase
        .from("logs")
        .update({ consumed_ml: consumed - give })
        .eq("id", b.id);
      toRefund -= give;
    }
  }

  const { error } = await supabase.from("logs").delete().eq("id", id);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent("Gagal hapus log.")}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(returnTo);
}
