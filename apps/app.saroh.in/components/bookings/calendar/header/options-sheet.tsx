"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, Clock, Eye, List } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { SwitchRow } from "@/components/shared/check-row";
import { RadioCards } from "@/components/shared/choice-group";
import type { ShowFor, StartView } from "@/lib/services/bookings-opens";

import { CLOSED_HATCH, OFF_HATCH } from "../geometry";
import { HeaderOverlay } from "./header-overlay";
import { usePhone } from "./use-phone";

/** The eyebrow over each part: the `.label` utility. */
const LABEL = "label";
/** A row of the sheet: 42px on the desk, 52px with a rule on a phone. */
const ROW =
    "flex min-h-[42px] w-full items-center gap-3 rounded-[8px] px-2.5 text-left text-[13.5px] font-medium text-foreground max-[759px]:min-h-[52px] max-[759px]:gap-3.5 max-[759px]:rounded-none max-[759px]:border-b max-[759px]:border-border max-[759px]:px-1 max-[759px]:text-[15px]";
const LINK_ROW = cn(
    ROW,
    "cursor-pointer transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[759px]:hover:bg-transparent",
);
const ICON =
    "flex w-5 shrink-0 justify-center text-muted-foreground max-[759px]:w-6 max-[759px]:text-foreground/80 [&_svg]:size-[18px] max-[759px]:[&_svg]:size-5";

const STARTS: readonly { value: StartView; label: string; sub: string }[] = [
    {
        value: "last",
        label: "Where I left it",
        sub: "The view you used last, on each phone or computer",
    },
    { value: "day", label: "Day", sub: "Always opens on the day, by the hour" },
    { value: "week", label: "Week", sub: "Always opens on Mon to Sun" },
    {
        value: "list",
        label: "List",
        sub: "Always opens on the list of bookings",
    },
];

/**
 * The "…" options of the view (U2; the "This day" sheet of BKMBookingsDay,
 * BKDCalendarDay's ⋯ popover): show cancelled bookings, All bookings,
 * Hours and time off, where Bookings starts and whose bookings it opens
 * on, and what the colours mean. The calendar's old row of extras (the
 * cancelled toggle, the colour key, the links) live here now.
 */
export function OptionsSheet({
    open,
    onOpenChange,
    trigger,
    title,
    summary,
    cancelled,
    allBookingsHref,
    hours,
    start,
    onStart,
    showFor,
    onShowFor,
    me,
    whoNow,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactElement;
    /** "This day", "This week", "This list". */
    title: string;
    summary: string;
    cancelled: {
        shown: boolean;
        onChange: (on: boolean) => void;
        /** "1 cancelled today". */
        line: string;
    };
    allBookingsHref: string;
    /** Hours and time off: "Meera's hours and time off" for one person. */
    hours: { href: string; label: string };
    start: StartView;
    onStart: (start: StartView) => void;
    showFor: ShowFor;
    onShowFor: (showFor: ShowFor) => void;
    /** The viewer's own name on the diary, for "Just me"; null if not on it. */
    me: string | null;
    /** Who is shown now, for "The last person I picked": "everyone". */
    whoNow: string;
}) {
    const phone = usePhone();
    const tap = phone ? "Tap" : "Click";
    const opens: { value: ShowFor; label: string; sub: string }[] = [
        {
            value: "last",
            label: "The last person I picked",
            sub: `Everyone, until you pick someone. Now: ${whoNow}`,
        },
        {
            value: "all",
            label: "Everyone",
            sub: "Always opens on everyone’s bookings",
        },
        ...(me
            ? [
                  {
                      value: "me" as const,
                      label: "Just me",
                      sub: `Always opens on ${me}’s bookings (yours)`,
                  },
              ]
            : []),
    ];
    const close = () => onOpenChange(false);

    return (
        <HeaderOverlay
            open={open}
            onOpenChange={onOpenChange}
            trigger={trigger}
            title={title}
            subtitle={summary}
            width={380}
            align="end"
        >
            <div className="max-[759px]:pb-6">
                <div className={ROW}>
                    <span className={ICON}>
                        <Eye aria-hidden />
                    </span>
                    <SwitchRow
                        checked={cancelled.shown}
                        onChange={cancelled.onChange}
                        name="Show cancelled bookings"
                        className="flex-1 justify-between text-[13.5px] font-medium max-[759px]:text-[15px]"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block">
                                Show cancelled bookings
                            </span>
                            <span className="block text-[12px] font-normal text-muted-foreground max-[759px]:text-[12.5px]">
                                {cancelled.line}
                            </span>
                        </span>
                    </SwitchRow>
                </div>
                <Link
                    href={allBookingsHref}
                    className={LINK_ROW}
                    onClick={close}
                >
                    <span className={ICON}>
                        <List aria-hidden />
                    </span>
                    <span className="flex-1">All bookings</span>
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 text-muted-foreground max-[759px]:size-4"
                    />
                </Link>
                <Link href={hours.href} className={LINK_ROW} onClick={close}>
                    <span className={ICON}>
                        <Clock aria-hidden />
                    </span>
                    <span className="flex-1">{hours.label}</span>
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 text-muted-foreground max-[759px]:size-4"
                    />
                </Link>

                <Choices
                    label="Start Bookings on"
                    value={start}
                    options={STARTS}
                    onChange={onStart}
                    className="mt-3 max-[759px]:mt-3.5"
                />
                <Choices
                    label="Show bookings for"
                    value={showFor}
                    options={opens}
                    onChange={onShowFor}
                    className="mt-3.5"
                />

                <div className={cn(LABEL, "mt-3.5")}>What the colours mean</div>
                <ul className="mt-1.5 grid gap-0.5 max-[759px]:mt-0 max-[759px]:gap-0">
                    <Key swatch="bg-diary-one" name="A booking for one person">
                        {tap} it to see who, mark them arrived or take payment.
                    </Key>
                    <Key swatch="bg-diary-class" name="A group class">
                        Shows how many places are booked.
                    </Key>
                    <Key
                        swatch="border-[1.5px] border-dashed border-success bg-success-subtle"
                        name="Free time"
                    >
                        {tap} it to book someone in
                        {phone ? "." : ", or block it."}
                    </Key>
                    <Key
                        swatch={cn(
                            "border border-border bg-card",
                            CLOSED_HATCH,
                        )}
                        name="Closed"
                    >
                        Outside their hours. {tap} it to open it for bookings.
                    </Key>
                    <Key
                        swatch={cn("border border-border bg-card", OFF_HATCH)}
                        name="Time off"
                    >
                        Nobody can book them then.
                    </Key>
                    <Key swatch="!h-0.5 bg-destructive" name="Now">
                        The red line on today.
                    </Key>
                </ul>
            </div>
        </HeaderOverlay>
    );
}

/** A labelled set of radio cards ("Start Bookings on", "Show bookings for"). */
function Choices<V extends string>({
    label,
    value,
    options,
    onChange,
    className,
}: {
    label: string;
    value: V;
    options: readonly { value: V; label: string; sub: string }[];
    onChange: (value: V) => void;
    className?: string;
}) {
    return (
        <div className={className}>
            <div className={LABEL}>{label}</div>
            <RadioCards
                label={label}
                value={value}
                onChange={onChange}
                options={options.map((o) => ({
                    value: o.value,
                    label: o.label,
                    note: o.sub,
                }))}
                className="mt-1.5 gap-1.5"
                rowClassName="min-h-12 gap-3 rounded-[10px] px-3 py-1.5 text-[13.5px] font-semibold has-[[data-state=checked]]:shadow-[inset_0_0_0_1px_hsl(var(--foreground))] max-[759px]:min-h-14 max-[759px]:rounded-[12px] max-[759px]:px-3.5 max-[759px]:py-2 max-[759px]:text-[14.5px]"
            />
        </div>
    );
}

function Key({
    swatch,
    name,
    children,
}: {
    swatch: string;
    name: string;
    children: ReactNode;
}) {
    return (
        <li className="flex items-center gap-3 px-0.5 py-1.5 max-[759px]:min-h-12 max-[759px]:border-b max-[759px]:border-border max-[759px]:last:border-b-0">
            <span
                aria-hidden
                className={cn(
                    "h-3.5 w-[22px] shrink-0 rounded-[4px] max-[759px]:h-[18px] max-[759px]:w-7 max-[759px]:rounded-[5px]",
                    swatch,
                )}
            />
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold max-[759px]:text-[14.5px]">
                    {name}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground max-[759px]:text-[12.5px]">
                    {children}
                </span>
            </span>
        </li>
    );
}
