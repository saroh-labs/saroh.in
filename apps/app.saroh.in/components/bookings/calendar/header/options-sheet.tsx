"use client";

import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    Eye,
    Globe,
    LayoutGrid,
    Link2,
    List,
    Play,
    UserRound,
    Users,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { GOOGLE_CALENDAR_HREF } from "@/lib/google-calendar/words";
import type { ShowFor, StartView } from "@/lib/services/bookings-opens";
import type { GoogleShow } from "@/lib/services/calendar-href";
import { SwitchRow } from "@saroh/ui/check-row";
import { RadioCards } from "@saroh/ui/choice-group";

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
        sub: "Calendar or List, and the day or week, as you last used them on each phone or computer",
    },
    { value: "day", label: "Day", sub: "Always opens on the day, by the hour" },
    { value: "week", label: "Week", sub: "Always opens on Mon to Sun" },
    {
        value: "list",
        label: "Agenda",
        sub: "Always opens on the day as a list of times",
    },
    {
        value: "register",
        label: "List",
        sub: "Always opens on the list of every booking",
    },
];

/** Where the sheet is: its rows, or one of the choices a row opens. */
type Page = "main" | "start" | "showFor" | "busy" | "connected" | "colours";

/**
 * The "…" options of the view (U2; BKVCalendarBPhone's "…" panel,
 * BKDCalendarDay's ⋯ popover), the same on Calendar and List: this view
 * first (show cancelled bookings, All bookings on the Calendar, Hours and
 * time off, Google busy times, what the colours mean on the Calendar),
 * then your settings as rows that show what each is set to and open its
 * choices (Start Bookings on, Show bookings for). A row's choices open in
 * the same sheet, with Back.
 */
export function OptionsSheet({
    open,
    onOpenChange,
    trigger,
    title,
    summary,
    cancelled,
    hours,
    listHref,
    colours = true,
    start,
    onStart,
    showFor,
    onShowFor,
    me,
    whoNow,
    zone,
    google = null,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactElement;
    /** "This day", "This week", "This list". */
    title: string;
    summary: ReactNode;
    cancelled: {
        shown: boolean;
        onChange: (on: boolean) => void;
        /** "1 cancelled today". */
        line: string;
    };
    /** Hours and time off: "Meera's hours and time off" for one person. */
    hours: { href: string; label: string };
    /** All bookings, the List (owner, 22 Nov): on the Calendar's sheet. */
    listHref?: string;
    /** What the colours mean: the Calendar's; the List has no colours. */
    colours?: boolean;
    start: StartView;
    onStart: (start: StartView) => void;
    showFor: ShowFor;
    onShowFor: (showFor: ShowFor) => void;
    /** The viewer's own name on the diary, for "Just me"; null if not on it. */
    me: string | null;
    /** Who is shown now, for "The last person I picked": "everyone". */
    whoNow: string;
    /** "IST": every time on the view is in it, said here on a phone. */
    zone?: string;
    /**
     * Google busy times (BKVGoogle), while Google Calendar is on: the layer
     * in What to show, and who on the diary has connected.
     */
    google?: {
        show: GoogleShow;
        onChange: (show: GoogleShow) => void;
        /** The viewer is on the diary, so "Just mine" means something. */
        mine: boolean;
        you: string | null;
        team: readonly {
            key: string;
            name: string;
            state: "CONNECTED" | "LAPSED" | "PAUSED" | "NONE";
        }[];
    } | null;
}) {
    const phone = usePhone();
    const tap = phone ? "Tap" : "Click";
    const [page, setPage] = useState<Page>("main");
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
    const back = () => setPage("main");
    const change = (o: boolean) => {
        if (!o) setPage("main");
        onOpenChange(o);
    };

    const sub = (label: string, body: ReactNode, line?: string): ReactNode => (
        <div data-options-page={page}>
            <button type="button" onClick={back} className={LINK_ROW}>
                <span className={ICON}>
                    <ChevronLeft aria-hidden />
                </span>
                <span className="flex-1">Back</span>
            </button>
            <div data-ph-unmask="" className={cn(LABEL, "mt-3")}>
                {label}
            </div>
            {line ? (
                <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
                    {line}
                </p>
            ) : null}
            {body}
        </div>
    );

    const pick =
        <V extends string>(on: (v: V) => void) =>
        (v: V) => {
            on(v);
            back();
        };

    let body: ReactNode;
    if (page === "start") {
        body = sub(
            "Start Bookings on",
            <Choices
                label="Start Bookings on"
                value={start}
                options={STARTS}
                onChange={pick(onStart)}
                className="mt-1.5"
            />,
        );
    } else if (page === "showFor") {
        body = sub(
            "Show bookings for",
            <Choices
                label="Show bookings for"
                value={showFor}
                options={opens}
                onChange={pick(onShowFor)}
                className="mt-1.5"
            />,
        );
    } else if (page === "busy" && google) {
        body = sub(
            "Whose busy times",
            <Choices
                label="Whose busy times"
                value={google.show === "mine" ? "mine" : "all"}
                options={[
                    {
                        value: "all",
                        label: "Everyone's",
                        sub: "Everyone's Google busy times on the diary",
                    },
                    {
                        value: "mine",
                        label: "Just mine",
                        sub: "Only your own Google busy times",
                    },
                ]}
                onChange={pick((v: "all" | "mine") => google.onChange(v))}
                className="mt-1.5"
            />,
        );
    } else if (page === "connected" && google) {
        body = sub(
            "Who's connected",
            <Connected google={google} />,
            "Connecting is each person's own, in Settings.",
        );
    } else if (page === "colours") {
        body = sub(
            "What the colours mean",
            <ColourKey tap={tap} phone={phone} />,
        );
    } else {
        const startNow = STARTS.find((o) => o.value === start)?.label ?? "";
        const showNow = opens.find((o) => o.value === showFor)?.label ?? "";
        body = (
            <>
                {zone && phone ? (
                    <p
                        data-zone-line=""
                        className="m-0 flex items-center gap-1.5 pb-2 text-[12.5px] text-muted-foreground"
                    >
                        <Globe aria-hidden className="size-[13px]" />
                        Times in {zone}
                    </p>
                ) : null}
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
                            <span data-ph-unmask="" className="block">
                                Show cancelled bookings
                            </span>
                            <span className="block text-[12px] font-normal text-muted-foreground max-[759px]:text-[12.5px]">
                                {cancelled.line}
                            </span>
                        </span>
                    </SwitchRow>
                </div>
                {listHref ? (
                    <IntentLink
                        href={listHref}
                        className={LINK_ROW}
                        onClick={close}
                    >
                        <span className={ICON}>
                            <List aria-hidden />
                        </span>
                        <span className="flex-1">All bookings</span>
                        <ChevronRight aria-hidden className={CHEVRON} />
                    </IntentLink>
                ) : null}
                <IntentLink
                    href={hours.href}
                    className={LINK_ROW}
                    onClick={close}
                >
                    <span className={ICON}>
                        <Clock aria-hidden />
                    </span>
                    <span className="flex-1">{hours.label}</span>
                    <ChevronRight aria-hidden className={CHEVRON} />
                </IntentLink>

                {google ? (
                    <GoogleRows google={google} onOpen={setPage} />
                ) : null}

                {colours ? (
                    <PageRow
                        icon={<LayoutGrid aria-hidden />}
                        label="What the colours mean"
                        onOpen={() => setPage("colours")}
                    />
                ) : null}

                <div data-ph-unmask="" className={cn(LABEL, "mt-3.5")}>
                    Your settings
                </div>
                <PageRow
                    icon={<Play aria-hidden />}
                    label="Start Bookings on"
                    value={startNow}
                    onOpen={() => setPage("start")}
                />
                <PageRow
                    icon={<UserRound aria-hidden />}
                    label="Show bookings for"
                    value={showNow}
                    onOpen={() => setPage("showFor")}
                />
            </>
        );
    }

    return (
        <HeaderOverlay
            open={open}
            onOpenChange={change}
            trigger={trigger}
            title={title}
            subtitle={typeof summary === "string" ? summary : undefined}
            width={380}
            align="end"
            half
        >
            <div className="max-[759px]:pb-6">{body}</div>
        </HeaderOverlay>
    );
}

const CHEVRON = "size-3.5 text-muted-foreground max-[759px]:size-4";

/** A row that opens its choices in the sheet, saying what it is set to. */
function PageRow({
    icon,
    label,
    value,
    onOpen,
}: {
    icon: ReactNode;
    label: string;
    /** What it is set to now: "Where I left it". */
    value?: string;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={value ? `${label}: ${value}. Change` : label}
            className={LINK_ROW}
        >
            <span className={ICON}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span data-ph-unmask="" className="block">
                    {label}
                </span>
                {value ? (
                    <span className="block text-[12px] font-normal text-muted-foreground max-[759px]:text-[12.5px]">
                        {value}
                    </span>
                ) : null}
            </span>
            <ChevronRight aria-hidden className={CHEVRON} />
        </button>
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

/** What the colours mean, one swatch a line (the Calendar's only). */
function ColourKey({ tap, phone }: { tap: string; phone: boolean }) {
    return (
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
                swatch={cn("border border-border bg-card", CLOSED_HATCH)}
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
    );
}

const STATE_WORDS = {
    CONNECTED: "Connected",
    LAPSED: "Needs reconnecting",
    PAUSED: "Paused: your plan's calendar connections are used up",
    NONE: "Not connected",
} as const;

type Google = NonNullable<Parameters<typeof OptionsSheet>[0]["google"]>;

/**
 * What to show › Google busy times, Whose busy times and Who's connected
 * (BKVGoogle): the layer is a switch; the other two are rows that say how
 * they stand and open their page. Busy times are drawn as busy only, never
 * what the event is.
 */
function GoogleRows({
    google,
    onOpen,
}: {
    google: Google;
    onOpen: (page: Page) => void;
}) {
    const on = google.show !== "off";
    const connected = google.team.filter((p) => p.state === "CONNECTED").length;
    return (
        <div data-google-layer="" className="mt-3.5">
            <div data-ph-unmask="" className={LABEL}>
                What to show
            </div>
            <div className={ROW}>
                <span className={ICON}>
                    <CalendarDays aria-hidden />
                </span>
                <SwitchRow
                    checked={on}
                    onChange={(next) => google.onChange(next ? "all" : "off")}
                    name="Google busy times"
                    className="flex-1 justify-between text-[13.5px] font-medium max-[759px]:text-[15px]"
                >
                    <span className="min-w-0 flex-1">
                        <span data-ph-unmask="" className="block">
                            Google busy times
                        </span>
                        <span
                            data-ph-unmask=""
                            className="block text-[12px] font-normal text-muted-foreground max-[759px]:text-[12.5px]"
                        >
                            Shown as busy, never what the event is
                        </span>
                    </span>
                </SwitchRow>
            </div>
            {on && google.mine ? (
                <PageRow
                    icon={<Users aria-hidden />}
                    label="Whose busy times"
                    value={google.show === "mine" ? "Just mine" : "Everyone's"}
                    onOpen={() => onOpen("busy")}
                />
            ) : null}
            <PageRow
                icon={<Link2 aria-hidden />}
                label="Who's connected"
                value={`${connected} of ${google.team.length} connected`}
                onOpen={() => onOpen("connected")}
            />
        </div>
    );
}

/** Who on the diary has connected Google Calendar, and where to connect. */
function Connected({ google }: { google: Google }) {
    return (
        <>
            <ul className="mt-1.5 grid gap-0.5">
                {google.team.map((p) => (
                    <li
                        key={p.key}
                        className="flex min-h-10 items-center gap-2 px-0.5 text-[13.5px] max-[759px]:min-h-12 max-[759px]:border-b max-[759px]:border-border max-[759px]:text-[14.5px]"
                    >
                        <span
                            data-ph-mask=""
                            className="min-w-0 flex-1 truncate font-medium"
                        >
                            {p.key === google.you ? `You, ${p.name}` : p.name}
                        </span>
                        <span
                            data-ph-unmask=""
                            className="shrink-0 text-[12.5px] text-muted-foreground"
                        >
                            {STATE_WORDS[p.state]}
                            {p.state === "LAPSED" && p.key !== google.you
                                ? " · only they can"
                                : ""}
                        </span>
                    </li>
                ))}
            </ul>
            <IntentLink
                href={GOOGLE_CALENDAR_HREF}
                className={cn(LINK_ROW, "mt-1")}
            >
                <span data-ph-unmask="" className="flex-1">
                    Open Settings › Integrations › Google Calendar
                </span>
                <ChevronRight aria-hidden className={CHEVRON} />
            </IntentLink>
        </>
    );
}
