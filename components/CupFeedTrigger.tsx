"use client";

import { useState } from "react";
import { CupFeedCoach } from "@/components/CupFeedCoach";
import type { CupFeedPace } from "@/lib/constants/cup-feed";

export function CupFeedTrigger({
  pace,
  className,
  children,
}: {
  pace: CupFeedPace;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>
      {open ? <CupFeedCoach pace={pace} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
