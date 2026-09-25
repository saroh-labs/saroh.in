import { cn } from "../lib/utils";
import { confirmClasses, onDarkMuted } from "./styles";

/** What both confirm surfaces — the aside and the phone bar — show. */
export interface ConfirmSummary {
    dueLabel: string;
    due: string;
    /** Why it cannot go yet, or "" when it can. */
    block: string;
    submitError: string | null;
    submitting: boolean;
    onConfirm: () => void;
}

/** The booking so far, beside the steps on a wide screen. */
export function SummaryAside({
    serviceName,
    whenText,
    name,
    hasService,
    confirmLabel,
    rules,
    dueLabel,
    due,
    block,
    submitError,
    submitting,
    onConfirm,
}: ConfirmSummary & {
    serviceName: string | null;
    whenText: string;
    name: string;
    hasService: boolean;
    confirmLabel: string;
    rules: string;
}) {
    return (
        <aside
            aria-label="Your booking"
            className="bg-site-fg text-site-bg sticky top-4 min-w-0 flex-[1_1_300px] rounded-[calc(var(--site-radius)+14px)] p-[22px] shadow-[0_4px_12px_hsl(var(--site-fg)/0.10)]"
        >
            <p className="text-site-accent mb-3 text-[11px] font-semibold uppercase tracking-[0.1em]">
                Your booking
            </p>
            <dl>
                {(
                    [
                        ["What", serviceName ?? "—"],
                        ["When", whenText || "—"],
                        ["Who", name.trim() || "—"],
                    ] as const
                ).map(([k, v]) => (
                    <div
                        key={k}
                        className="flex gap-2.5 border-b border-[color-mix(in_srgb,hsl(var(--site-bg))_12%,transparent)] py-1.5 text-sm"
                    >
                        <dt className={cn("flex-[0_0_64px]", onDarkMuted)}>
                            {k}
                        </dt>
                        <dd className="min-w-0 flex-1 font-medium">{v}</dd>
                    </div>
                ))}
            </dl>
            <div className="mt-3 flex items-baseline">
                <span className={cn("flex-1 text-sm", onDarkMuted)}>
                    {dueLabel}
                </span>
                <span className="font-display text-[30px] font-semibold tabular-nums tracking-[-0.02em]">
                    {due}
                </span>
            </div>
            {(block && hasService) || submitError ? (
                <p
                    role="status"
                    className="text-site-accent mt-2.5 text-[13px]"
                >
                    {submitError ?? block}
                </p>
            ) : null}
            <button
                type="button"
                onClick={onConfirm}
                aria-disabled={!!block || submitting}
                className={cn(
                    confirmClasses(!!block || submitting),
                    "mt-4 w-full text-base",
                )}
            >
                {submitting ? "Booking…" : confirmLabel}
            </button>
            {rules ? (
                <p
                    className={cn(
                        "mt-2.5 text-xs leading-normal",
                        onDarkMuted,
                        "opacity-80",
                    )}
                >
                    {rules}
                </p>
            ) : null}
        </aside>
    );
}

/** The same, as a bar pinned to the bottom of a phone. */
export function PhoneBar({
    hasService,
    whenText,
    barLabel,
    dueLabel,
    due,
    block,
    submitError,
    submitting,
    onConfirm,
}: ConfirmSummary & {
    hasService: boolean;
    whenText: string;
    barLabel: string;
}) {
    return (
        <div className="bg-site-fg text-site-bg fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_hsl(var(--site-fg)/0.22)]">
            {hasService ? (
                <p
                    role="status"
                    className={cn(
                        "mb-2 truncate text-[12.5px]",
                        block || submitError
                            ? "text-site-accent"
                            : "text-site-bg",
                    )}
                >
                    {submitError ?? (block || whenText)}
                </p>
            ) : null}
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-xs", onDarkMuted)}>
                        {dueLabel}
                    </p>
                    <p className="font-display text-2xl font-semibold tabular-nums leading-[1.1] tracking-[-0.02em]">
                        {due}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onConfirm}
                    aria-disabled={!!block || submitting}
                    className={cn(
                        confirmClasses(!!block || submitting),
                        "flex-none px-[22px] text-[15px]",
                    )}
                >
                    {submitting ? "Booking…" : barLabel}
                </button>
            </div>
        </div>
    );
}
