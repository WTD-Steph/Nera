import { startOngoingLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";

export function StartOngoingButton({
  subtype,
  label,
  emoji,
}: {
  subtype: "sleep" | "pumping";
  label: string;
  emoji: string;
}) {
  return (
    <form action={startOngoingLogAction}>
      <input type="hidden" name="subtype" value={subtype} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className="flex w-full flex-col items-center gap-1 rounded-2xl border border-rose-200 bg-white p-3 shadow-sm transition-transform active:scale-95"
      >
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <span className="text-[11px] font-semibold text-rose-700">{label}</span>
      </SubmitButton>
    </form>
  );
}
