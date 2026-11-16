import {
    ArrowRight,
    Check,
    History,
    Maximize2,
    MoreHorizontal,
    Pencil,
    Sparkles,
    X,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import { SourceChips } from "../../kit/chip";
import { ring } from "../../ring";

/** Each part of the business keeps one dot colour wherever Ask AI names it. */
const DOT: Record<string, string> = {
    Orders: "hsl(var(--foreground))",
    Customers: "#8A6A3B",
    Stock: "#2F6B4A",
    Bookings: "#7B3F75",
    Billing: "hsl(var(--brand-500))",
    Products: "hsl(var(--brand-500))",
    Calendar: "#7B3F75",
};

/** "Read from" and the parts an answer read: the kit's SourceChips. */
export function ReadFrom({
    sources,
    label,
    tail,
    className,
}: {
    sources: readonly string[];
    label: string;
    tail?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1",
                className,
            )}
        >
            <SourceChips
                label={label}
                sources={sources.map((name) => ({ name, dot: DOT[name] }))}
            />
            {tail ? (
                <span className="text-mk-note text-muted-foreground">
                    {tail}
                </span>
            ) : null}
        </div>
    );
}

/** The Ask AI panel's frame: its title and the icons along its top. */
export function AskPanel({
    title,
    icons = 5,
    label,
    children,
    className,
}: {
    title?: string;
    icons?: 0 | 3 | 5;
    label?: string;
    children: ReactNode;
    className?: string;
}) {
    const all = [Pencil, History, MoreHorizontal, Maximize2, X];
    const shown =
        icons === 3 ? [History, Maximize2, X] : icons === 5 ? all : [];
    return (
        <div
            role={label ? "img" : undefined}
            aria-label={label}
            className={cn(
                "overflow-hidden rounded-mk-card border border-border bg-card shadow-[0_1px_2px_rgba(40,30,15,0.06),0_24px_50px_-24px_rgba(40,30,15,0.3)]",
                className,
            )}
        >
            {title ? (
                <div className="flex h-[58px] items-center gap-2.5 border-b border-mk-line-row px-[18px] text-[16px] font-semibold">
                    <Sparkles aria-hidden className="size-[18px]" />
                    {title}
                    <span
                        aria-hidden
                        className="ml-auto flex gap-1 text-mk-copy"
                    >
                        {shown.map((Icon, i) => (
                            <span
                                key={i}
                                className="inline-flex size-[34px] items-center justify-center"
                            >
                                <Icon className="size-[17px]" />
                            </span>
                        ))}
                    </span>
                </div>
            ) : null}
            <div className="grid gap-3.5 p-4 min-[760px]:px-[18px]">
                {children}
            </div>
        </div>
    );
}

/** What she asked: right-aligned, on paper. */
export function Asked({ children }: { children: ReactNode }) {
    return (
        <div className="max-w-[88%] justify-self-end rounded-xl bg-mk-hover px-3.5 py-2.5 text-[15px] leading-snug">
            {children}
        </div>
    );
}

/** "Checked your Orders … just now". */
export function Checked({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-[13px] text-mk-copy">
            <Check aria-hidden className="size-4" />
            {children}
        </div>
    );
}

/** A suggestion row in the panel; an action ("…") reads as one. */
export function Suggestion({
    t,
    h,
    act,
    onPick,
}: {
    t: string;
    h?: string;
    act?: boolean;
    /** Makes it a real button, highlighted as the invitation (the steps' player). */
    onPick?: () => void;
}) {
    const Tag = onPick ? "button" : "div";
    return (
        <Tag
            {...(onPick ? { type: "button" as const, onClick: onPick } : {})}
            className={cn(
                "flex min-h-11 w-full items-center gap-2.5 border-t border-mk-line-row px-1 text-left text-[14.5px] text-foreground first:border-t-0",
                act && "font-semibold",
                onPick &&
                    cn(
                        "cursor-pointer rounded-lg border-0 bg-mk-tint px-3 shadow-[inset_0_0_0_1px_hsl(var(--brand-500)/0.45)] hover:bg-mk-hover",
                        ring({ offset: 2 }),
                    ),
            )}
        >
            {act ? (
                <Sparkles aria-hidden className="size-4 text-brand-700" />
            ) : null}
            <span className="min-w-0 flex-1">{t}</span>
            {h ? (
                <span className="shrink-0 rounded-full bg-mk-hover px-2 py-0.5 text-[12.5px] font-medium text-mk-copy">
                    {h}
                </span>
            ) : null}
            {onPick ? (
                <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full bg-brand-500 motion-safe:animate-pulse"
                />
            ) : null}
            <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
            />
        </Tag>
    );
}

/** A confirm card: its head, then what it will do, then its buttons. */
export function ConfirmCard({
    head,
    title,
    kv,
    note,
    buttons,
    done = false,
    onConfirm,
}: {
    head: ReactNode;
    title: string;
    kv: readonly (readonly [string, ReactNode])[];
    note?: string;
    buttons: readonly ReactNode[];
    done?: boolean;
    /** Makes the first button a real one that confirms (the steps' player). */
    onConfirm?: () => void;
}) {
    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border",
                done ? "border-border" : "border-foreground",
            )}
        >
            <div
                className={cn(
                    "flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold",
                    done
                        ? "bg-mk-ok-tint text-mk-ok"
                        : "bg-foreground text-background",
                )}
            >
                {done ? <Check aria-hidden className="size-4" /> : null}
                {head}
            </div>
            <div className="grid gap-2.5 p-3.5">
                <div className="text-[16px] font-semibold">{title}</div>
                <dl className="m-0 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5 text-[14px]">
                    {kv.map(([k, v]) => (
                        <div key={k} className="contents">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="m-0 font-medium">{v}</dd>
                        </div>
                    ))}
                </dl>
                {note ? (
                    <p className="m-0 text-[13.5px] leading-snug text-mk-copy">
                        {note}
                    </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                    {buttons.map((b, i) => {
                        const look = cn(
                            "inline-flex items-center gap-1.5 rounded-[9px] px-3.5 text-[14px] font-semibold",
                            onConfirm ? "min-h-11" : "h-10",
                            i === 0 && !done
                                ? "bg-foreground text-background"
                                : "border border-border-strong bg-card",
                        );
                        return i === 0 && onConfirm && !done ? (
                            <button
                                key={i}
                                type="button"
                                onClick={onConfirm}
                                className={cn(
                                    look,
                                    "cursor-pointer border-none",
                                    ring({ offset: 2 }),
                                )}
                            >
                                {b}
                            </button>
                        ) : (
                            <span key={i} className={look}>
                                {b}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
