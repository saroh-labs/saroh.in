import { cn } from "../lib/utils";
import { laterVisitsText } from "./model";
import { confirmClasses, onDarkMuted } from "./styles";

/** What both confirm surfaces — the aside and the phone bar — show. */
export interface ConfirmSummary {
    /**
     * What the amount is ("Deposit now", "Pay at the desk"), or "" for no
     * payment line at all: a service that can't be paid for here (#822).
     */
    dueLabel: string;
    due: string;
    /** Why it cannot go yet, or "" when it can. */
    block: string;
    /**
     * The block is only what is left to do — a name not typed yet, before
     * they've tried to book — so it reads as a next step, not an error
     * (UX-083).
     */
    quiet?: boolean;
    submitError: string | null;
    submitting: boolean;
    onConfirm: () => void;
}

/** The booking so far, beside the steps on a wide screen. */
export function SummaryAside({
    serviceName,
    visits = 1,
    whenText,
    name,
    hasService,
    confirmLabel,
    rules,
    dueLabel,
    due,
    block,
    quiet = false,
    submitError,
    submitting,
    onConfirm,
}: ConfirmSummary & {
    serviceName: string | null;
    /** More than one: a treatment, whose first visit is booked here (E10). */
    visits?: number;
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
                {summaryRows({ serviceName, visits, whenText, name }).map(
                    ([k, v]) => (
                        <div
                            key={k}
                            className="flex gap-2.5 border-b border-[color-mix(in_srgb,hsl(var(--site-bg))_12%,transparent)] py-1.5 text-sm"
                        >
                            <dt className={cn("flex-[0_0_64px]", onDarkMuted)}>
                                {k}
                            </dt>
                            <dd className="min-w-0 flex-1 font-medium">{v}</dd>
                        </div>
                    ),
                )}
            </dl>
            {dueLabel ? (
                <div className="mt-3 flex items-baseline">
                    <span className={cn("flex-1 text-sm", onDarkMuted)}>
                        {dueLabel}
                    </span>
                    <span className="font-site-heading text-[30px] font-semibold tabular-nums tracking-[-0.02em]">
                        {due}
                    </span>
                </div>
            ) : null}
            {(block && hasService) || submitError ? (
                <p
                    role="status"
                    className={cn(
                        "mt-2.5 text-[13px]",
                        quiet && !submitError
                            ? onDarkMuted
                            : "text-site-accent",
                    )}
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

/**
 * The aside's rows. A treatment (E10) names its visits, calls the time its
 * first visit, and says when the rest are booked.
 */
function summaryRows({
    serviceName,
    visits,
    whenText,
    name,
}: {
    serviceName: string | null;
    visits: number;
    whenText: string;
    name: string;
}): [string, string][] {
    const then = laterVisitsText(visits);
    return [
        [
            "What",
            serviceName
                ? `${serviceName}${visits > 1 ? ` · ${visits} visits` : ""}`
                : "—",
        ],
        [then ? "First visit" : "When", whenText || "—"],
        ...(then ? [["Then", then] as [string, string]] : []),
        ["Who", name.trim() || "—"],
    ];
}

/** The same, as a bar pinned to the bottom of a phone. */
export function PhoneBar({
    hasService,
    whenText,
    barLabel,
    dueLabel,
    due,
    block,
    quiet = false,
    submitError,
    submitting,
    onConfirm,
}: ConfirmSummary & {
    hasService: boolean;
    whenText: string;
    barLabel: string;
}) {
    return (
        <div className="bg-site-fg text-site-bg fixed inset-x-0 bottom-[var(--site-consent-offset,0px)] z-50 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_hsl(var(--site-fg)/0.22)]">
            {hasService ? (
                <p
                    role="status"
                    className={cn(
                        "mb-2 truncate text-[12.5px]",
                        submitError || (block && !quiet)
                            ? "text-site-accent"
                            : "text-site-bg",
                    )}
                >
                    {submitError ?? ((quiet ? whenText : block) || whenText)}
                </p>
            ) : null}
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    {dueLabel ? (
                        <>
                            <p className={cn("truncate text-xs", onDarkMuted)}>
                                {dueLabel}
                            </p>
                            <p className="font-site-heading text-2xl font-semibold tabular-nums leading-[1.1] tracking-[-0.02em]">
                                {due}
                            </p>
                        </>
                    ) : null}
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
