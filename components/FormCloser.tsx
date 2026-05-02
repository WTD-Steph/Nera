"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * Place inside a <form>. Watches useFormStatus pending → not-pending
 * transition (i.e. submission completed) and calls onClose. Use to
 * auto-close modals after server-action submit. Fires for both success
 * and error paths since both end pending state — error UI surfaces via
 * page redirect param.
 */
export function FormCloser({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      onClose();
    }
  }, [pending, onClose]);

  return null;
}
