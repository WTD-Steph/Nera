import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";
import {
  buildCsvReport,
  type BabyMeta,
  type GrowthRow,
  type LogRow,
} from "@/lib/report/builder";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const baby = await getCurrentBaby();
  if (!baby) {
    return NextResponse.json({ error: "no baby" }, { status: 409 });
  }

  const babyMeta: BabyMeta = {
    id: baby.id,
    name: baby.name,
    gender: baby.gender,
    dob: baby.dob,
    birth_weight_kg: baby.birth_weight_kg,
    birth_height_cm: baby.birth_height_cm,
  };

  const [logsRes, growthRes, milestoneRes, immunizationRes] = await Promise.all(
    [
      supabase
        .from("logs")
        .select(
          "id, subtype, timestamp, end_timestamp, amount_ml, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, notes",
        )
        .eq("baby_id", baby.id)
        .order("timestamp", { ascending: true }),
      supabase
        .from("growth_measurements")
        .select("measured_at, weight_kg, height_cm, head_circ_cm, notes")
        .eq("baby_id", baby.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("milestone_progress")
        .select("milestone_key, achieved_at")
        .eq("baby_id", baby.id),
      supabase
        .from("immunization_progress")
        .select("vaccine_key, given_at")
        .eq("baby_id", baby.id),
    ],
  );

  const milestones = new Map<string, string>();
  for (const m of milestoneRes.data ?? []) {
    milestones.set(m.milestone_key, m.achieved_at);
  }
  const immunizations = new Map<string, string>();
  for (const v of immunizationRes.data ?? []) {
    immunizations.set(v.vaccine_key, v.given_at);
  }

  const csv = buildCsvReport({
    baby: babyMeta,
    logs: (logsRes.data ?? []) as LogRow[],
    growth: (growthRes.data ?? []) as GrowthRow[],
    milestones,
    immunizations,
  });

  // UTF-8 BOM untuk Excel ID compat
  const body = "﻿" + csv;
  const filename = `${baby.name}_tracker_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
