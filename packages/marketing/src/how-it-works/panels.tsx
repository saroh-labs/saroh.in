import { Check, Sparkles, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { SourceChips } from "../kit/chip";
import type { DrawnPhotoKind } from "../kit/drawn-photo";
import { DrawnPhoto } from "../kit/drawn-photo";
import type { SiteLook } from "../kit/site-drawing";
import { siteVars } from "../kit/site-drawing";
import { TimeStamp } from "../kit/time-stamp";

import { Rich } from "./rich";

/*
 * The drawn crops on /features (board HWDesk): each a small piece of a real
 * Saroh screen, with the app's own labels. Every word and figure comes in as
 * a prop, from the page's content file and its world: nothing here names a
 * business, so saroh.tech draws the same slots from its own world.
 */

const SITE_HEAD =
    "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)]";

/** A crop's frame: white card, a header row, then the rows that matter. */
export function Panel({
    title,
    meta,
    action,
    children,
    className,
}: {
    title?: ReactNode;
    meta?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex h-[300px] flex-col overflow-hidden rounded-mk-card bg-card text-left text-foreground shadow-mk-panel",
                className,
            )}
        >
            {title ? (
                <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                    <span className="truncate text-[14px] font-semibold">
                        {title}
                    </span>
                    {action ?? (
                        <span className="shrink-0 text-[13px] text-muted-foreground">
                            {meta}
                        </span>
                    )}
                </div>
            ) : null}
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    );
}

/** A small control, as the app draws one: an outline pill or an Ink button. */
function Pill({
    children,
    ink = false,
    className,
}: {
    children: ReactNode;
    ink?: boolean;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold",
                ink
                    ? "bg-foreground text-background"
                    : "border border-border-strong bg-card text-foreground",
                className,
            )}
        >
            {children}
        </span>
    );
}

/** "Live", "Paid", "Connected": the app's green status chip. */
export function OkChip({
    children,
    mono = false,
}: {
    children: ReactNode;
    mono?: boolean;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-mk-ok-tint px-2.5 text-[13px] font-semibold text-mk-ok",
                mono && "font-mono",
            )}
        >
            <span aria-hidden className="size-1.5 rounded-full bg-mk-ok" />
            {children}
        </span>
    );
}

function Field({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-mk-copy">
                {label}
            </span>
            <span
                className={cn(
                    "rounded-lg border border-border-strong px-3 py-2 text-[14px]",
                    mono && "font-mono",
                )}
            >
                {value}
            </span>
        </div>
    );
}

/** Rows of label and value: an order's card. */
export function Facts({
    rows,
}: {
    rows: readonly { label: string; value: ReactNode; strong?: boolean }[];
}) {
    return (
        <dl className="m-0">
            {rows.map((r) => (
                <div
                    key={r.label}
                    className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
                >
                    <dt className="text-[13px] text-mk-copy">{r.label}</dt>
                    <dd
                        className={cn(
                            "m-0 text-right text-[14px] font-semibold",
                            r.strong &&
                                "font-display text-[20px] font-bold text-mk-ok",
                        )}
                    >
                        {r.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

// ── Your shop and bookings ──────────────────────────────────────────────

export function ProductPanel({
    w,
    name,
    price,
    stock,
    address,
}: {
    w: {
        title: string;
        meta: string;
        name: string;
        price: string;
        stock: string;
        save: string;
    };
    name: string;
    price: string;
    stock: string;
    /** "Shows on **ryeandco.in/shop** when you save." */
    address: string;
}) {
    return (
        <Panel title={w.title} meta={w.meta}>
            <div className="grid gap-3 p-4">
                <Field label={w.name} value={name} />
                <div className="grid grid-cols-2 gap-3">
                    <Field label={w.price} value={price} mono />
                    <Field label={w.stock} value={stock} mono />
                </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-background px-4 py-3">
                <p className="m-0 text-[13px] leading-snug text-mk-copy">
                    <Rich text={address} />
                </p>
                <Pill ink>{w.save}</Pill>
            </div>
        </Panel>
    );
}

export function ClassPanel({
    look,
    business,
    meta,
    name,
    when,
    booked,
    places,
    placesLine,
    pay,
}: {
    look: SiteLook;
    business: string;
    meta: string;
    name: string;
    when: string;
    booked: number;
    places: number;
    placesLine: string;
    pay: string;
}) {
    return (
        <div
            style={siteVars(look)}
            className="flex h-[300px] flex-col overflow-hidden rounded-mk-card bg-[hsl(var(--site-bg))] font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))] shadow-mk-panel"
        >
            <div className="flex min-h-[44px] items-center justify-between border-b border-[hsl(var(--site-fg)/0.12)] px-4">
                <span className={cn(SITE_HEAD, "text-[16px]")}>{business}</span>
                <span className="text-[13px] text-[hsl(var(--site-muted))]">
                    {meta}
                </span>
            </div>
            <div className="grid gap-3 p-4">
                <div>
                    <p className={cn(SITE_HEAD, "m-0 text-[20px]")}>{name}</p>
                    <p className="m-0 text-[14px] text-[hsl(var(--site-muted))]">
                        {when}
                    </p>
                </div>
                <div aria-hidden className="flex gap-2">
                    {Array.from({ length: places }, (_, i) => (
                        <span
                            key={i}
                            className={cn(
                                "h-9 flex-1 rounded-[var(--site-radius)] border border-[hsl(var(--site-fg)/0.25)]",
                                i < booked
                                    ? "bg-[hsl(var(--site-fg))]"
                                    : "bg-[hsl(var(--site-surface))]",
                            )}
                        />
                    ))}
                </div>
                <p className="m-0 text-[13px] text-[hsl(var(--site-muted))]">
                    {placesLine}
                </p>
                <span className="flex h-11 items-center justify-center rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] text-[15px] font-medium text-[hsl(var(--site-accent-fg))]">
                    {pay}
                </span>
            </div>
        </div>
    );
}

export function HomePanel({
    title,
    meta,
    rows,
}: {
    title: string;
    meta: string;
    rows: readonly {
        title: string;
        line: string;
        warn?: boolean;
        action?: string;
    }[];
}) {
    return (
        <Panel title={title} meta={meta}>
            <ul className="m-0 list-none p-0">
                {rows.map((r) => (
                    <li
                        key={r.title}
                        className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-2 shrink-0 rounded-full",
                                r.warn ? "bg-mk-warn" : "bg-foreground",
                            )}
                        />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="text-[14px]">{r.title}</span>
                            <span className="text-[13px] text-muted-foreground">
                                {r.line}
                            </span>
                        </span>
                        {r.action ? <Pill>{r.action}</Pill> : null}
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

// ── Your site ───────────────────────────────────────────────────────────

/** Three template thumbnails, the first in the business's look. */
export function TemplatePanel({
    title,
    meta,
    caption,
    look,
}: {
    title: string;
    meta: string;
    caption: string;
    look: SiteLook;
}) {
    const thumb = (picked: boolean, top: string, chip: string) => (
        <span
            className={cn(
                "grid h-[150px] grid-rows-[60px_1fr] overflow-hidden rounded-lg border",
                picked
                    ? "border-2 border-foreground"
                    : "border-border bg-background",
            )}
        >
            <span style={{ background: top }} />
            <span className="grid content-start gap-1.5 p-2.5">
                <span className="h-1.5 w-4/5 rounded-full bg-border-strong" />
                <span className="h-1.5 w-1/2 rounded-full bg-border-strong" />
                <span
                    className="mt-1 h-3 w-2/5 rounded-sm"
                    style={{ background: chip }}
                />
            </span>
        </span>
    );
    return (
        <Panel title={title} meta={meta}>
            <div aria-hidden className="grid grid-cols-3 gap-2.5 p-4">
                {thumb(true, `hsl(${look.surface})`, `hsl(${look.accent})`)}
                {thumb(false, "#E8DCC8", "#6E8F72")}
                {thumb(false, "#2E2A26", "#C9A04A")}
            </div>
            <div className="flex items-center justify-between px-4">
                <span className="text-[13px] font-semibold">{caption}</span>
                <span aria-hidden className="flex gap-1.5">
                    {[look.bg, look.accent, look.fg].map((c, i) => (
                        <span
                            // A look may share a colour (Global's default accent is its ink).
                            key={i}
                            className="size-4 rounded-full border border-border"
                            style={{ background: `hsl(${c})` }}
                        />
                    ))}
                </span>
            </div>
        </Panel>
    );
}

/** An address as the app shows it: mono, with its state on the right. */
export function AddressBar({
    host,
    suffix,
    state,
}: {
    host: string;
    suffix?: string;
    state: string;
}) {
    return (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border-strong bg-card px-3.5 py-2.5">
            <span className="truncate font-mono text-[14px]">
                {host}
                {suffix ? (
                    <span className="text-muted-foreground">{suffix}</span>
                ) : null}
            </span>
            <OkChip mono>{state}</OkChip>
        </div>
    );
}

/** "rye-and-co.saroh.app" → its name and ".saroh.app", the way the app greys it. */
export function splitHost(site: string): { host: string; suffix?: string } {
    const i = site.indexOf(".");
    return i > 0
        ? { host: site.slice(0, i), suffix: site.slice(i) }
        : { host: site };
}

export function AddressPanel({
    w,
    site,
    domain,
}: {
    w: {
        title: string;
        live: string;
        then: string;
        connected: string;
        comes: string;
    };
    site: string;
    domain?: string;
}) {
    return (
        <Panel title={w.title}>
            <div className="grid gap-3 p-4">
                <AddressBar {...splitHost(site)} state={w.live} />
                {domain ? (
                    <>
                        <span className="text-[13px] text-muted-foreground">
                            {w.then}
                        </span>
                        <AddressBar
                            host={`www.${domain}`}
                            state={w.connected}
                        />
                    </>
                ) : null}
                <p className="m-0 text-[13px] leading-snug text-mk-copy">
                    <Rich text={w.comes} />
                </p>
            </div>
        </Panel>
    );
}

/** The top of a merchant's site, in its own look. */
export function SiteTop({
    look,
    name,
    nav,
    line,
}: {
    look: SiteLook;
    name: string;
    nav: readonly string[];
    line: string;
}) {
    return (
        <div
            style={siteVars(look)}
            className="bg-[hsl(var(--site-bg))] px-4 pb-0 pt-3 font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))]"
        >
            <div className="flex items-center justify-between gap-3">
                <span className={cn(SITE_HEAD, "text-[15px]")}>{name}</span>
                <span className="text-[13px] text-[hsl(var(--site-muted))]">
                    {nav.join(" · ")}
                </span>
            </div>
            <p
                className={cn(
                    SITE_HEAD,
                    "m-0 mt-2 text-[22px] leading-[1.1] tracking-[-0.01em]",
                )}
            >
                {line}
            </p>
            <span
                aria-hidden
                className="mt-3 block h-[72px] rounded-t-[var(--site-radius)] bg-[hsl(var(--site-accent)/0.55)]"
            />
        </div>
    );
}

export function DraftPanel({
    w,
    look,
    name,
    nav,
    line,
}: {
    w: { changes: string; publish: string; versions: string };
    look: SiteLook;
    name: string;
    nav: readonly string[];
    line: string;
}) {
    return (
        <Panel>
            <SiteTop look={look} name={name} nav={nav} line={line} />
            <div className="flex items-center justify-between gap-3 bg-background px-4 py-3">
                <p className="m-0 text-[13px] leading-snug text-mk-copy">
                    <Rich text={w.changes} />
                </p>
                <Pill ink>{w.publish}</Pill>
            </div>
            <p className="m-0 px-4 py-2.5 text-[13px] text-muted-foreground">
                {w.versions}
            </p>
        </Panel>
    );
}

// ── Your posts ──────────────────────────────────────────────────────────

export function SharePanel({
    title,
    meta,
    button,
    items,
    look,
}: {
    title: string;
    meta: string;
    button: string;
    items: readonly { name: string; price: string; photo?: DrawnPhotoKind }[];
    look: SiteLook;
}) {
    return (
        <Panel title={title} meta={meta}>
            <ul className="m-0 list-none p-0">
                {items.map((item) => (
                    <li
                        key={item.name}
                        className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
                    >
                        {item.photo ? (
                            <DrawnPhoto
                                kind={item.photo}
                                className="size-12 shrink-0 rounded-lg"
                            />
                        ) : (
                            <span
                                aria-hidden
                                className="size-12 shrink-0 rounded-lg"
                                style={{
                                    background: `hsl(${look.accent} / 0.6)`,
                                }}
                            />
                        )}
                        <span className="grid min-w-0 flex-1 gap-0.5">
                            <b className="text-[14px] font-semibold">
                                {item.name}
                            </b>
                            <span className="text-[13px] text-muted-foreground">
                                {item.price}
                            </span>
                        </span>
                        <Pill>
                            <Upload aria-hidden className="size-3.5" />
                            {button}
                        </Pill>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

export function CardsPanel({
    title,
    meta,
    kinds,
    offer,
    note,
    look,
    item,
    price,
}: {
    title: string;
    meta: string;
    kinds: readonly string[];
    offer: string;
    note: string;
    look: SiteLook;
    item: string;
    price: string;
}) {
    return (
        <Panel title={title} meta={meta}>
            <ul
                style={siteVars(look)}
                className="m-0 grid list-none grid-cols-4 gap-2 p-4"
            >
                {kinds.map((kind, i) => (
                    <li key={kind} className="grid justify-items-center gap-2">
                        <span
                            className={cn(
                                "relative grid aspect-[4/5] w-full content-end overflow-hidden rounded-md p-1.5",
                                i === 1 && "ring-2 ring-foreground",
                                i === 2
                                    ? "bg-[hsl(var(--site-accent))] text-[hsl(var(--site-accent-fg))]"
                                    : "bg-[hsl(var(--site-surface))] text-[hsl(var(--site-fg))]",
                            )}
                        >
                            {i === 0 || i === 1 ? (
                                <span
                                    aria-hidden
                                    className="absolute inset-x-0 top-0 h-3/5 bg-[hsl(var(--site-accent)/0.55)]"
                                />
                            ) : null}
                            <span
                                className={cn(
                                    SITE_HEAD,
                                    "relative text-[12px] leading-tight",
                                    i === 2 && "text-[14px]",
                                )}
                            >
                                {i === 2 ? offer : i === 1 ? price : item}
                            </span>
                        </span>
                        <span className="text-[13px] font-semibold">
                            {kind}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="m-0 px-4 text-[13px] leading-snug text-mk-copy">
                {note}
            </p>
        </Panel>
    );
}

export function ShareToPanel({
    title,
    apps,
    social,
}: {
    title: string;
    apps: readonly string[];
    /** Saroh Social's line and its slots, only while it may be claimed. */
    social?: {
        line: string;
        addOn: string;
        slots: readonly { day: string; at: string; where: string }[];
    };
}) {
    return (
        <Panel title={title}>
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-4">
                {apps.map((app) => (
                    <li key={app} className="grid justify-items-center gap-1.5">
                        <span
                            aria-hidden
                            className="grid size-11 place-items-center rounded-xl bg-foreground text-[14px] font-bold text-background"
                        >
                            {app[0]}
                        </span>
                        <span className="text-[13px]">{app}</span>
                    </li>
                ))}
            </ul>
            {social ? (
                <div className="grid gap-2 px-4">
                    <p className="m-0 text-[13px] font-semibold">
                        {social.line}{" "}
                        <span className="font-normal text-muted-foreground">
                            {social.addOn}
                        </span>
                    </p>
                    {social.slots.map((s) => (
                        <p
                            key={s.where}
                            className="m-0 flex gap-2 rounded-lg bg-background px-3 py-2 text-[13px]"
                        >
                            <b className="font-mono font-medium">
                                {s.day} <TimeStamp at={s.at} />
                            </b>
                            <span className="text-mk-copy">{s.where}</span>
                        </p>
                    ))}
                </div>
            ) : null}
        </Panel>
    );
}

// ── Your money ──────────────────────────────────────────────────────────

export function PaymentsPanel({
    title,
    rows,
}: {
    title: string;
    rows: readonly {
        name: string;
        line: string;
        state: string;
        on?: boolean;
    }[];
}) {
    return (
        <Panel title={title}>
            <ul className="m-0 list-none p-0">
                {rows.map((r) => (
                    <li
                        key={r.name}
                        className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
                    >
                        <span
                            aria-hidden
                            className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-[13px] font-bold text-background"
                        >
                            {r.name[0]}
                        </span>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                            <b className="text-[14px] font-semibold">
                                {r.name}
                            </b>
                            <span className="text-[13px] text-muted-foreground">
                                {r.line}
                            </span>
                        </span>
                        {r.on ? (
                            <OkChip>{r.state}</OkChip>
                        ) : (
                            <Pill>{r.state}</Pill>
                        )}
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

export function PayingPanel({
    label,
    business,
    amount,
    line,
    paid,
}: {
    label: string;
    business: string;
    amount: string;
    line: string;
    paid: string;
}) {
    return (
        <Panel>
            <div className="grid justify-items-center gap-1.5 p-4 text-center">
                <span
                    aria-hidden
                    className="grid size-11 place-items-center rounded-full bg-mk-ledger font-display text-[16px] font-bold text-mk-ledger-fg"
                >
                    {business[0]}
                </span>
                <span className="text-[13px] text-muted-foreground">
                    {label}
                </span>
                <b className="text-[16px] font-semibold">{business}</b>
                <span className="font-mono text-[30px] font-medium leading-tight">
                    {amount}
                </span>
                <span className="text-[13px] text-mk-copy">{line}</span>
                <span className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-mk-ok text-[14px] font-semibold text-white">
                    <Check aria-hidden className="size-4" />
                    {paid}
                </span>
            </div>
        </Panel>
    );
}

export function PaidPanel({
    order,
    paid,
    rows,
}: {
    order: string;
    paid: string;
    rows: readonly { label: string; value: ReactNode; strong?: boolean }[];
}) {
    return (
        <Panel
            title={<span className="font-mono">{order}</span>}
            action={<OkChip>{paid}</OkChip>}
        >
            <Facts rows={rows} />
        </Panel>
    );
}

// ── Your AI and agents ──────────────────────────────────────────────────

export function AskListPanel({
    title,
    button,
    about,
    questions,
}: {
    title: string;
    button: string;
    about: string;
    questions: readonly { q: string; from: string }[];
}) {
    return (
        <Panel
            title={title}
            action={
                <Pill>
                    <Sparkles aria-hidden className="size-3.5" />
                    {button}
                </Pill>
            }
        >
            <p className="m-0 px-4 pt-3">
                <span className="inline-block rounded-md bg-background px-2 py-1 text-[13px] text-mk-copy">
                    {about}
                </span>
            </p>
            <ul className="m-0 mt-2 list-none p-0">
                {questions.map((x) => (
                    <li
                        key={x.q}
                        className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 first:border-t-0"
                    >
                        <span className="text-[14px]">{x.q}</span>
                        <span className="shrink-0 text-[13px] text-muted-foreground">
                            {x.from}
                        </span>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

export function AnswerPanel({
    question,
    reply,
    head,
    rows,
    readFrom,
    sources,
}: {
    question: string;
    reply: string;
    head: readonly string[];
    rows: readonly (readonly string[])[];
    readFrom: string;
    sources: readonly string[];
}) {
    return (
        <Panel>
            <div className="grid gap-3 p-4">
                <p className="m-0 justify-self-end rounded-xl bg-foreground px-3.5 py-2 text-[14px] text-background">
                    {question}
                </p>
                <p className="m-0 text-[14px]">{reply}</p>
                <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-border text-[13px]">
                    <thead>
                        <tr className="bg-background text-left text-muted-foreground">
                            {head.map((h, i) => (
                                <th
                                    key={h}
                                    className={cn(
                                        "px-3 py-2 font-medium",
                                        i > 0 && "text-right",
                                    )}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r[0]}>
                                {r.map((cell, i) => (
                                    <td
                                        key={i}
                                        className={cn(
                                            "border-t border-border px-3 py-2",
                                            i > 0 && "text-right font-mono",
                                        )}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <SourceChips
                    label={readFrom}
                    sources={sources.map((name) => ({ name }))}
                />
            </div>
        </Panel>
    );
}

export function AssistantPanel({
    title,
    on,
    meta,
    ask,
    reply,
    added,
    undo,
}: {
    title: string;
    on: string;
    meta: string;
    ask: string;
    reply: string;
    added: string;
    undo: string;
}) {
    return (
        <Panel
            title={title}
            action={
                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <OkChip>{on}</OkChip>
                    {meta}
                </span>
            }
        >
            <div className="grid gap-3 bg-background p-4">
                <p className="m-0 justify-self-end rounded-xl bg-mk-hover px-3.5 py-2 text-[14px]">
                    {ask}
                </p>
                <p className="m-0 font-serif text-[15px] leading-snug">
                    {reply}
                </p>
                <p className="m-0 flex items-center justify-between gap-2 rounded-lg bg-mk-ok-tint px-3 py-2.5 text-[13px] font-semibold text-mk-ok">
                    <span className="flex items-center gap-2">
                        <Check aria-hidden className="size-4" />
                        {added}
                    </span>
                    <span className="text-foreground underline underline-offset-2">
                        {undo}
                    </span>
                </p>
            </div>
        </Panel>
    );
}

// ── Your data and API ───────────────────────────────────────────────────

export function InsightsPanel({
    title,
    meta,
    question,
    line,
    weeks,
}: {
    title: string;
    meta: string;
    question: string;
    line: string;
    weeks: readonly string[];
}) {
    // The bars only show the week rising; the figure is the line above.
    const heights = [50, 60, 55, 70, 88, 100];
    return (
        <Panel title={title} meta={meta}>
            <div className="grid gap-1 p-4">
                <span className="text-[13px] text-muted-foreground">
                    {question}
                </span>
                <b className="text-[14px] font-semibold">{line}</b>
                <div
                    aria-hidden
                    className="mt-3 grid h-[104px] grid-cols-6 items-end gap-2"
                >
                    {heights.map((h, i) => (
                        <span
                            key={i}
                            className={cn(
                                "rounded-t-md",
                                i === heights.length - 1
                                    ? "bg-foreground"
                                    : "bg-mk-hover",
                            )}
                            style={{ height: `${h}%` }}
                        />
                    ))}
                </div>
                <div className="grid grid-cols-6 gap-2 text-center text-[12px] text-muted-foreground">
                    {weeks.map((wk) => (
                        <span key={wk}>{wk}</span>
                    ))}
                </div>
            </div>
        </Panel>
    );
}

export function KeyPanel({
    title,
    button,
    name,
    token,
    scopes,
    made,
}: {
    title: string;
    button: string;
    name: string;
    token: string;
    scopes: readonly string[];
    made: string;
}) {
    return (
        <Panel title={title} action={<Pill ink>{button}</Pill>}>
            <div className="grid gap-3 p-4">
                <div className="grid gap-1 rounded-lg border border-border bg-background px-3.5 py-3">
                    <b className="text-[14px] font-semibold">{name}</b>
                    <code className="font-mono text-[13px]">{token}</code>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {scopes.map((s) => (
                        <Pill key={s} className="font-medium">
                            {s}
                        </Pill>
                    ))}
                </div>
                <p className="m-0 text-[13px] leading-snug text-mk-copy">
                    {made}
                </p>
            </div>
        </Panel>
    );
}

export function WebhookPanel({
    title,
    events,
    signed,
}: {
    title: string;
    events: readonly { name: string; line: string; took: string }[];
    signed: string;
}) {
    return (
        <Panel title={title}>
            <ul className="m-0 list-none p-0">
                {events.map((e) => (
                    <li
                        key={e.name}
                        className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 first:border-t-0"
                    >
                        <span className="grid gap-0.5">
                            <code className="font-mono text-[13px] font-medium">
                                {e.name}
                            </code>
                            <span className="text-[13px] text-mk-copy">
                                {e.line}
                            </span>
                        </span>
                        <span className="shrink-0 font-mono text-[13px] text-mk-ok">
                            {e.took}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="m-0 px-4 pt-1 text-[13px] text-muted-foreground">
                {signed}
            </p>
        </Panel>
    );
}
