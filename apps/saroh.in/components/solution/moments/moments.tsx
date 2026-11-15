import { cn } from "@saroh/marketing/cn";
import { CroppedCard } from "@saroh/marketing/kit/cropped-card";
import { BrowserFrame, PhoneFrame } from "@saroh/marketing/kit/frames";
import { MoneyPath } from "@saroh/marketing/kit/money-path";
import { SiteDrawing, siteVars } from "@saroh/marketing/kit/site-drawing";
import { ring } from "@saroh/marketing/ring";
import {
    Bot,
    CalendarDays,
    Check,
    FileText,
    Globe,
    Mail,
    MessageCircle,
    Package,
    Phone,
    ReceiptIndianRupee,
    ShoppingBag,
    TriangleAlert,
    User,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
    AiAppMoment,
    AskMoment,
    BillMoment,
    EnquiryMoment,
    HomeMoment,
    MomentData,
    MomentIcon,
    MomentTone,
    OrderMoment,
    PaymentMoment,
    PostMoment,
    ShelfMoment,
    SiteOrderMoment,
    WaitingMoment,
} from "./types";

/*
 * The moment library (board SLLibrary), as components: each draws one
 * moment of a trade's day from its data (`types.ts`) and holds no words of
 * its own, so any trade's day, in either edition, is built from these.
 */

const ICONS: Record<MomentIcon, typeof Check> = {
    order: ShoppingBag,
    customer: User,
    stock: Package,
    bill: ReceiptIndianRupee,
    calendar: CalendarDays,
    check: Check,
    warn: TriangleAlert,
    doc: FileText,
    chat: Bot,
    mail: Mail,
    site: Globe,
    phone: Phone,
    whatsapp: MessageCircle,
};

export function MomentIconMark({
    icon,
    className,
}: {
    icon: MomentIcon;
    className?: string;
}) {
    const I = ICONS[icon];
    return (
        <I
            aria-hidden
            className={cn("size-[18px]", className)}
            strokeWidth={1.8}
        />
    );
}

const TONE: Record<MomentTone, string> = {
    new: "bg-[#F6E7CD] text-[#7A4708]",
    prep: "bg-[#E7ECF4] text-[#2B4A7A]",
    ready: "bg-mk-ok-tint text-mk-ok",
    paid: "bg-mk-ok-tint text-mk-ok",
    warn: "bg-[#FBE4E0] text-[#A02A16]",
    plain: "bg-muted text-mk-copy",
};

export function TonePill({
    tone,
    children,
    className,
}: {
    tone: MomentTone;
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-6 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold",
                TONE[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}

/**
 * A moment's second picture: drawn on a desk; on a phone folded in a closed
 * `<details>` behind `label` (PHONE.md: one visual per scene, the rest in
 * the HTML behind a tap). Without a label it is drawn on both.
 */
function PhoneFold({
    label,
    children,
}: {
    label?: string;
    children: ReactNode;
}) {
    if (!label) return <>{children}</>;
    return (
        <>
            <div className="contents max-[759px]:hidden">{children}</div>
            <details className="group min-[760px]:hidden">
                <summary
                    className={`inline-flex min-h-11 w-fit cursor-pointer list-none items-center rounded-sm font-semibold text-foreground underline decoration-border-strong decoration-1 underline-offset-[3px] [&::-webkit-details-marker]:hidden ${ring()}`}
                >
                    {label}
                </summary>
                <div className="mt-3">{children}</div>
            </details>
        </>
    );
}

/** A white card on a scene: 16px corners, one soft shadow. */
const CARD = "rounded-mk-card bg-card text-foreground shadow-mk-card";
const ROW = "border-t border-[#EEEBE4] first:border-t-0";
const META = "text-[13px] leading-snug text-mk-copy";

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
    return (
        <dl className="m-0 mt-3 grid gap-0">
            {rows.map(([k, v]) => (
                <div
                    key={k}
                    className="flex justify-between gap-4 border-t border-[#EEEBE4] py-2 text-[14px]"
                >
                    <dt className="text-mk-copy">{k}</dt>
                    <dd className="m-0 font-mono text-[14px]">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function CardHead({
    title,
    at,
    dot = true,
}: {
    title: string;
    at?: string;
    dot?: boolean;
}) {
    return (
        <p className="m-0 flex items-center gap-2 text-[13px] font-semibold text-foreground">
            {dot ? (
                <span
                    aria-hidden
                    className="size-2 rounded-full bg-brand-500"
                />
            ) : null}
            {title}
            {at ? (
                <span className="ml-auto font-mono text-[13px] font-medium text-mk-copy">
                    {at}
                </span>
            ) : null}
        </p>
    );
}

/* ------------------------------------------------------------------ home */

export function HomeList({ m }: { m: HomeMoment }) {
    return (
        <div className="grid gap-1 px-5 pb-5 pt-2">
            <p className="m-0 font-display text-[22px] font-bold tracking-[-0.03em]">
                {m.greeting}
            </p>
            <p className="m-0 text-[13px] text-mk-copy">{m.place}</p>
            <p className="m-0 mt-4 flex justify-between border-b border-border pb-2 text-[13px] font-semibold">
                {m.needsTitle}
                <span className="font-mono">{m.needs.length}</span>
            </p>
            <ul className="m-0 grid list-none gap-2 p-0 pt-2">
                {m.needs.map((n) => (
                    <li
                        key={n.title}
                        className="flex gap-3 rounded-mk-crop bg-background p-3"
                    >
                        <span
                            className={cn(
                                "grid size-9 shrink-0 place-items-center rounded-[9px]",
                                n.warn
                                    ? "bg-[#FBE4E0] text-[#A02A16]"
                                    : "bg-[#F1EBDF] text-foreground",
                            )}
                        >
                            <MomentIconMark icon={n.icon} />
                        </span>
                        <span className="grid min-w-0 gap-0.5">
                            <b className="text-[14.5px] font-semibold leading-snug">
                                {n.title}
                            </b>
                            <span className={META}>{n.line}</span>
                            {n.action ? (
                                <span className="mt-1.5 inline-flex h-7 w-fit items-center rounded-full bg-foreground px-3 text-[12px] font-semibold text-background">
                                    {n.action}
                                </span>
                            ) : null}
                        </span>
                    </li>
                ))}
            </ul>
            {m.today?.length ? (
                <>
                    <p className="m-0 mt-4 flex justify-between border-b border-border pb-2 text-[13px] font-semibold">
                        {m.todayTitle}
                        <span className="font-normal text-mk-copy">
                            {m.todayDay}
                        </span>
                    </p>
                    <ul className="m-0 list-none p-0">
                        {m.today.map((t) => (
                            <li
                                key={t.at + t.line}
                                className="flex gap-3 border-b border-[#EEEBE4] py-2 text-[13px]"
                            >
                                <span className="w-12 shrink-0 font-mono">
                                    {t.at}
                                </span>
                                <span className="min-w-0">{t.line}</span>
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
        </div>
    );
}

/** Home on the business's phone: the trade page's hero picture. */
export function HomePhone({ m }: { m: HomeMoment }) {
    return (
        <>
            <div className="max-[759px]:hidden">
                <PhoneFrame label={m.label} time={m.clock} width={360}>
                    <HomeList m={m} />
                </PhoneFrame>
            </div>
            {/* A phone shows Home cropped to what needs her; the rest folds. */}
            <div
                className="w-full min-[760px]:hidden"
                role="group"
                aria-label={m.label}
            >
                <CroppedCard
                    height={250}
                    more={
                        m.more && m.today?.length
                            ? {
                                  label: m.more,
                                  content: (
                                      <HomeList
                                          m={{
                                              ...m,
                                              needs: [],
                                              greeting: "",
                                              place: "",
                                          }}
                                      />
                                  ),
                              }
                            : undefined
                    }
                >
                    <HomeList m={{ ...m, today: undefined }} />
                </CroppedCard>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ shelf */

export function Shelf({ m }: { m: ShelfMoment }) {
    return (
        <PhoneFold label={m.more}>
            <div
                role="img"
                aria-label={m.label}
                className={cn(CARD, "px-4 py-1.5")}
            >
                {m.title ? (
                    <p className="m-0 pt-3 font-display text-[18px] font-bold">
                        {m.title}
                    </p>
                ) : null}
                {m.rows.map((r) => (
                    <div
                        key={r.name}
                        className={cn(ROW, "flex items-center gap-3 py-2.5")}
                    >
                        <span className="grid min-w-0 gap-0.5">
                            <b className="text-[14.5px] font-semibold">
                                {r.name}
                            </b>
                            <span className={META}>{r.line}</span>
                        </span>
                        <span
                            className={cn(
                                "ml-auto shrink-0 font-mono text-[14px]",
                                r.low && "font-semibold text-mk-warn",
                            )}
                        >
                            {r.level}
                        </span>
                    </div>
                ))}
                {m.foot ? (
                    <p className={cn(META, "m-0 pb-3")}>{m.foot}</p>
                ) : null}
            </div>
        </PhoneFold>
    );
}

/* ------------------------------------------------------------------ order */

function OrderRows({ rows }: { rows: OrderMoment["rows"] }) {
    return (
        <ul className="m-0 list-none p-0">
            {rows.map((r, i) => (
                <li
                    key={r.line}
                    className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-[#EEEBE4] px-5 py-3",
                        i === 0 &&
                            "bg-[#FFF9EE] shadow-[inset_3px_0_0_hsl(var(--brand-500))]",
                    )}
                >
                    <b className="text-[15px] font-semibold">{r.customer}</b>
                    <TonePill tone={r.tone} className="justify-self-end">
                        {r.status}
                    </TonePill>
                    <span className="text-[13.5px] text-mk-copy">{r.line}</span>
                    <span className="text-right font-mono text-[14px]">
                        {r.total}
                    </span>
                    <span className="col-span-2 text-[13px] text-muted-foreground">
                        {r.note}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function OrderList({ m }: { m: OrderMoment }) {
    return (
        <>
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
                <b className="font-display text-[22px] tracking-[-0.02em]">
                    {m.title}
                </b>
                <span className="text-[14px] text-mk-copy">{m.open}</span>
            </div>
            <OrderRows rows={m.rows} />
        </>
    );
}

function Message({ m }: { m: OrderMoment["message"] }) {
    return (
        <div className="max-w-[320px] rounded-[18px_18px_18px_4px] bg-[#E7F0E2] px-4 py-3.5 text-[15px] leading-snug text-[#1E2A1C] shadow-[0_14px_30px_-18px_rgba(28,40,20,0.4)]">
            <p className="m-0 mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-[#2F5A2A]">
                <MomentIconMark
                    icon={m.channel === "phone" ? "phone" : "whatsapp"}
                    className="size-4"
                />
                {m.from}
            </p>
            <p className="m-0">{m.text}</p>
            <p className="m-0 mt-1.5 text-right font-mono text-[12px] text-[#4E6A48]">
                {m.at}
            </p>
        </div>
    );
}

function OrderDetail({ d }: { d: OrderMoment["detail"] }) {
    return (
        <div className={cn(CARD, "p-5")}>
            <CardHead title={d.title} at={d.at} />
            <p className="m-0 mt-3 font-display text-[20px] font-bold tracking-[-0.02em]">
                {d.item}
            </p>
            <p className={cn(META, "m-0 mt-1 text-[14px]")}>{d.how}</p>
            <p className="m-0 mt-3 rounded-[10px] bg-[#F7F3EA] px-3 py-2.5 text-[14px] leading-snug">
                {d.note}
            </p>
            {d.flag ? (
                <TonePill tone="warn" className="mt-3 h-7">
                    <MomentIconMark icon="warn" className="size-[15px]" />
                    {d.flag}
                </TonePill>
            ) : null}
            <p className="m-0 mt-3 flex items-center gap-2.5 border-t border-[#EEEBE4] pt-3 text-[14px] text-mk-copy">
                <span
                    aria-hidden
                    className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#EADFCB] text-[13px] font-bold text-[#5A4126]"
                >
                    {d.initials}
                </span>
                {d.customer}
            </p>
        </div>
    );
}

export function OrderTaken({ m }: { m: OrderMoment }) {
    return (
        <>
            <div className="grid items-start gap-5 max-[759px]:hidden min-[1000px]:grid-cols-[minmax(0,1fr)_320px] min-[1000px]:gap-10">
                <BrowserFrame label={m.label} address={m.address}>
                    <OrderList m={m} />
                </BrowserFrame>
                <div className="grid gap-4 min-[760px]:max-[999px]:grid-cols-2">
                    <Message m={m.message} />
                    <OrderDetail d={m.detail} />
                </div>
            </div>
            {/* A phone: the message, then the order cropped; the whole list folds. */}
            <div className="grid gap-4 min-[760px]:hidden">
                <Message m={m.message} />
                <CroppedCard
                    height={230}
                    more={{
                        label: m.more,
                        content: <OrderRows rows={m.rows} />,
                    }}
                >
                    <OrderDetail d={m.detail} />
                </CroppedCard>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ site order */

export function SiteOrder({ m }: { m: SiteOrderMoment }) {
    return (
        <div className="relative grid gap-5 min-[1000px]:block min-[1000px]:pb-16">
            <div className="min-[1000px]:mr-[200px]">
                <PhoneFold label={m.more}>
                    <SiteDrawing
                        label={m.label}
                        look={m.look}
                        address={m.address}
                        name={m.name}
                        nav={[...m.nav]}
                        cta={m.cta}
                        hero={m.hero}
                        items={[...m.items]}
                    />
                </PhoneFold>
            </div>
            <div
                className={cn(
                    CARD,
                    "p-5 min-[1000px]:absolute min-[1000px]:bottom-0 min-[1000px]:right-0 min-[1000px]:w-[340px]",
                )}
            >
                <CardHead title={m.card.title} at={m.card.at} />
                <p className="m-0 mt-3 font-display text-[20px] font-bold tracking-[-0.02em]">
                    {m.card.item}
                </p>
                <p className={cn(META, "m-0 mt-1 text-[14px]")}>
                    {m.card.meta}
                </p>
                <Rows rows={m.card.lines} />
                <p className="m-0 mt-3 flex flex-wrap items-center gap-2.5">
                    <TonePill tone="paid">
                        <MomentIconMark icon="check" className="size-[14px]" />
                        {m.card.paid}
                    </TonePill>
                    <span className="text-[14px] text-mk-copy">
                        {m.card.after}
                    </span>
                </p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ post */

/** The post card in the business's own look (`--site-*`), never Saroh's. */
function PostCard({ m }: { m: PostMoment }) {
    return (
        <div
            role="img"
            aria-label={`${m.card.item}, ${m.chosen}, ${m.card.business}`}
            style={siteVars(m.look)}
            className="relative aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-[calc(var(--site-radius)*2)] bg-[hsl(var(--site-accent))] shadow-[0_30px_60px_-16px_rgba(40,15,20,0.45)] min-[760px]:-rotate-2"
        >
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_35%,hsl(var(--site-surface))_0_16%,transparent_17%),radial-gradient(circle_at_70%_40%,hsl(var(--site-surface))_0_14%,transparent_15%),radial-gradient(circle_at_48%_68%,hsl(var(--site-surface))_0_15%,transparent_16%)] opacity-60" />
            <span className="absolute right-4 top-4 grid place-items-center rounded-full bg-[hsl(var(--site-bg))] px-3 py-2 text-center font-mono text-[15px] font-semibold text-[hsl(var(--site-fg))]">
                {m.card.price}
                {m.card.unit ? (
                    <small className="text-[12px] font-normal">
                        {m.card.unit}
                    </small>
                ) : null}
            </span>
            <span className="absolute inset-x-0 bottom-0 grid gap-1 bg-[hsl(var(--site-fg))] px-5 py-4 text-[hsl(var(--site-bg))]">
                <span className="text-[12px] uppercase tracking-[0.08em] opacity-80">
                    {m.card.business}
                </span>
                <b
                    className="text-[22px] leading-tight"
                    style={{ fontFamily: "var(--site-font-heading)" }}
                >
                    {m.card.item}
                </b>
                <span className="text-[12px] opacity-80">{m.card.site}</span>
            </span>
        </div>
    );
}

export function PostShared({ m }: { m: PostMoment }) {
    return (
        <div className="grid items-center gap-8 min-[1000px]:grid-cols-[minmax(0,420px)_1fr]">
            <div className="max-[759px]:order-2">
                <PhoneFold label={m.more}>
                    <div
                        className={cn(CARD, "grid gap-3 p-5")}
                        aria-label={m.label}
                        role="group"
                    >
                        <p className="m-0 grid gap-0.5">
                            <b className="text-[15px] font-semibold">
                                {m.item}
                            </b>
                            <span className={META}>{m.itemLine}</span>
                        </p>
                        <p className="m-0 text-[13px] font-semibold">
                            {m.pickTitle}
                        </p>
                        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                            {m.styles.map((s) => (
                                <li
                                    key={s}
                                    className={cn(
                                        "rounded-[10px] border px-3 py-2 text-[13px]",
                                        s === m.chosen
                                            ? "border-foreground font-semibold"
                                            : "border-border text-mk-copy",
                                    )}
                                >
                                    {s}
                                </li>
                            ))}
                        </ul>
                        <p className="m-0 text-[13px] font-semibold">
                            {m.captionTitle}
                        </p>
                        <p className="m-0 rounded-[10px] border border-border p-3 text-[14px] leading-snug">
                            {m.caption}
                            <span className="mt-1.5 block text-[12px] text-muted-foreground">
                                {m.captionNote}
                            </span>
                        </p>
                        <p className="m-0 flex flex-wrap gap-2">
                            {m.channels.map((c, i) => (
                                <span
                                    key={c}
                                    className={cn(
                                        "inline-flex h-9 items-center rounded-[10px] px-3 text-[13px] font-semibold",
                                        i === 0
                                            ? "bg-foreground text-background"
                                            : "border border-border",
                                    )}
                                >
                                    {c}
                                </span>
                            ))}
                        </p>
                    </div>
                </PhoneFold>
            </div>
            <div className="flex justify-center">
                <PostCard m={m} />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ payment */

export function PaymentLands({ m }: { m: PaymentMoment }) {
    return (
        <MoneyPath
            label={m.label}
            from={m.from}
            via={m.via}
            to={m.to}
            wires={m.wires}
            saroh={m.saroh}
            status={
                <span className="grid gap-2">
                    <TonePill tone="paid">
                        <MomentIconMark icon="check" className="size-[14px]" />
                        {m.paid} · <span className="font-mono">{m.at}</span>
                    </TonePill>
                    <span>{m.after}</span>
                </span>
            }
        />
    );
}

/* ------------------------------------------------------------------ bill */

export function Bill({ m }: { m: BillMoment }) {
    const bill = (
        <div role="img" aria-label={m.label} className={cn(CARD, "px-6 py-5")}>
            <p className="m-0 flex items-center justify-between border-b border-[#EEEBE4] pb-3">
                <b className="font-display text-[20px] tracking-[-0.02em]">
                    {m.title}
                </b>
                <TonePill tone={m.tone}>{m.state}</TonePill>
            </p>
            <p className={cn(META, "m-0 mt-2.5")}>{m.from}</p>
            <div className="mt-2">
                {[
                    ...m.lines,
                    ...m.tax.map(
                        (t): { name: string; sub?: string; amount: string } =>
                            t,
                    ),
                ].map((l) => (
                    <p
                        key={l.name}
                        className="m-0 flex justify-between gap-4 py-2 text-[14px] text-mk-copy"
                    >
                        <span>
                            {l.name}
                            {l.sub ? (
                                <small className="block text-[12px] text-muted-foreground">
                                    {l.sub}
                                </small>
                            ) : null}
                        </span>
                        <b className="whitespace-nowrap font-mono text-[14px] font-medium text-foreground">
                            {l.amount}
                        </b>
                    </p>
                ))}
                <p className="m-0 mt-1.5 flex justify-between border-t border-foreground pt-3 text-[14px] font-semibold">
                    <span>{m.totalLabel}</span>
                    <b className="font-mono">{m.total}</b>
                </p>
            </div>
            {m.foot ? <p className={cn(META, "m-0 mt-2")}>{m.foot}</p> : null}
        </div>
    );
    if (!m.aside) return bill;
    return (
        <div className="grid items-start gap-8 min-[1000px]:grid-cols-[400px_1fr] min-[1000px]:gap-12">
            <div className="max-[759px]:order-2">
                <PhoneFold label={m.more}>{bill}</PhoneFold>
            </div>
            <div>
                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                    {m.aside.title}
                </h3>
                <p className="m-0 mt-3 max-w-[480px] text-[16px] leading-relaxed text-mk-copy">
                    {m.aside.body}
                </p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ ai app */

export function AiAppTask({ m }: { m: AiAppMoment }) {
    return (
        <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
            <div
                role="img"
                aria-label={m.label}
                className={cn(CARD, "overflow-hidden")}
            >
                <p className="m-0 flex items-center gap-2 border-b border-border px-5 py-3 text-[14px] font-semibold">
                    <MomentIconMark icon="chat" />
                    {m.app}
                    <TonePill tone="paid" className="ml-auto">
                        <MomentIconMark icon="check" className="size-[14px]" />
                        {m.connected}
                    </TonePill>
                </p>
                <div className="grid gap-3 p-5">
                    <p className="m-0 ml-auto max-w-[85%] rounded-[16px_16px_4px_16px] bg-[#F1EBDF] px-4 py-3 text-[15px] leading-snug">
                        {m.ask}
                    </p>
                    <ul className="m-0 grid list-none gap-1.5 rounded-mk-crop border border-border p-3">
                        {m.acts.map((a) => (
                            <li
                                key={a}
                                className="flex items-center gap-2 text-[13px] text-mk-copy"
                            >
                                <MomentIconMark
                                    icon="check"
                                    className="size-4 text-mk-ok"
                                />
                                {a}
                            </li>
                        ))}
                    </ul>
                    <p className="m-0 max-w-[90%] text-[15px] leading-relaxed">
                        {m.answer}
                    </p>
                </div>
            </div>
            {m.drafts ? (
                <PhoneFold label={m.more}>
                    <div className={cn(CARD, "grid gap-1 p-5")}>
                        <p className="m-0 pb-2 text-[13px] font-semibold">
                            {m.drafts.title}
                        </p>
                        {m.drafts.rows.map((r) => (
                            <p
                                key={r.name}
                                className="m-0 flex items-center gap-3 border-t border-[#EEEBE4] py-2.5"
                            >
                                <span className="grid min-w-0 gap-0.5">
                                    <b className="text-[14.5px] font-semibold">
                                        {r.name}
                                    </b>
                                    <span className={META}>{r.line}</span>
                                </span>
                                <TonePill tone="new" className="ml-auto">
                                    {r.state}
                                </TonePill>
                            </p>
                        ))}
                        {m.drafts.action ? (
                            <span className="mt-2 inline-flex h-10 w-fit items-center rounded-[10px] bg-foreground px-4 text-[14px] font-semibold text-background">
                                {m.drafts.action}
                            </span>
                        ) : null}
                        <p className={cn(META, "m-0 mt-2")}>{m.drafts.foot}</p>
                    </div>
                </PhoneFold>
            ) : null}
        </div>
    );
}

/* ------------------------------------------------------------------ ask */

/** Drawn on the night band (`lamp`): its own panel colours. */
export function AskAnswer({ m }: { m: AskMoment }) {
    return (
        <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_320px]">
            <div
                role="group"
                aria-label={m.label}
                className="grid gap-4 rounded-mk-card border border-mk-lamp-line bg-mk-lamp-2 p-5 text-mk-lamp-fg"
            >
                <p className="m-0 ml-auto max-w-[85%] rounded-[16px_16px_4px_16px] bg-mk-lamp-line px-4 py-3 text-[15px]">
                    {m.question}
                </p>
                <p className="m-0 text-[15px] leading-relaxed">{m.answer}</p>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[300px] border-collapse text-[14px]">
                        <thead>
                            <tr>
                                {m.head.map((h, i) => (
                                    <th
                                        key={h}
                                        scope="col"
                                        className={cn(
                                            "border-b border-mk-lamp-line py-2 font-medium text-mk-lamp-meta",
                                            i ? "text-right" : "text-left",
                                        )}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[...m.rows, ...(m.total ? [m.total] : [])].map(
                                (r, ri) => (
                                    <tr
                                        key={r[0]}
                                        className={cn(
                                            m.total &&
                                                ri === m.rows.length &&
                                                "font-semibold",
                                        )}
                                    >
                                        {r.map((c, i) => (
                                            <td
                                                key={i}
                                                className={cn(
                                                    "border-b border-mk-lamp-line py-2",
                                                    i
                                                        ? "text-right font-mono"
                                                        : "",
                                                )}
                                            >
                                                {c}
                                            </td>
                                        ))}
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="m-0 flex flex-wrap items-center gap-2.5 text-[13px] text-mk-lamp-meta">
                    {m.sourcesLabel}
                    {m.sources.map((s) => (
                        <span
                            key={s}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-mk-lamp-line bg-mk-lamp px-3 font-medium text-mk-lamp-fg"
                        >
                            <span
                                aria-hidden
                                className="size-2 rounded-full bg-mk-lamp-saff"
                            />
                            {s}
                        </span>
                    ))}
                    {m.open ? (
                        <span className="ml-auto underline underline-offset-4">
                            {m.open}
                        </span>
                    ) : null}
                </p>
            </div>
            {m.change ? (
                <PhoneFold label={m.more}>
                    <div className="grid gap-3 rounded-mk-card border border-mk-lamp-line bg-mk-lamp-2 p-5 text-mk-lamp-fg">
                        <p className="m-0 ml-auto rounded-[16px_16px_4px_16px] bg-mk-lamp-line px-4 py-3 text-[15px]">
                            {m.change.ask}
                        </p>
                        {/* A white card on the night band: its own ink, not the band's remapped words. */}
                        <div className="rounded-mk-crop bg-card p-4 text-[hsl(var(--foreground))]">
                            <p className="m-0 text-[13px] font-semibold text-[hsl(var(--mk-body))]">
                                {m.change.title}
                            </p>
                            <p className="m-0 mt-1 text-[15px] font-semibold">
                                {m.change.item}
                            </p>
                            <p className="m-0 mt-1 font-mono text-[15px]">
                                <s className="text-muted-foreground">
                                    {m.change.from}
                                </s>{" "}
                                → <b>{m.change.to}</b>
                            </p>
                            <p className="m-0 mt-2 text-[13px] leading-snug text-[hsl(var(--mk-body))]">
                                {m.change.note}
                            </p>
                            <p className="m-0 mt-3 flex gap-2">
                                <span className="inline-flex h-9 items-center rounded-[10px] bg-foreground px-4 text-[13px] font-semibold text-background">
                                    {m.change.confirm}
                                </span>
                                <span className="inline-flex h-9 items-center rounded-[10px] border border-border px-4 text-[13px] font-semibold">
                                    {m.change.cancel}
                                </span>
                            </p>
                        </div>
                        <p className="m-0 text-[13px] text-mk-lamp-meta">
                            {m.change.undo}
                        </p>
                    </div>
                </PhoneFold>
            ) : null}
            {m.foot ? (
                <p className="m-0 text-[14px] text-mk-lamp-meta min-[1000px]:col-span-2">
                    {m.foot}
                </p>
            ) : null}
        </div>
    );
}

/* ------------------------------------------------------------------ waiting */

export function WaitingSlip({ m }: { m: WaitingMoment }) {
    return (
        <div
            role="img"
            aria-label={m.label}
            className={cn(CARD, "grid gap-1 p-5")}
        >
            <p className="m-0 flex items-center justify-between pb-2">
                <b className="font-display text-[18px]">{m.business}</b>
                <span className="font-mono text-[13px] text-mk-copy">
                    {m.when}
                </span>
            </p>
            {m.rows.map((r) => (
                <p
                    key={r.title}
                    className="m-0 flex gap-3 border-t border-[#EEEBE4] py-2.5"
                >
                    <span
                        className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-[8px]",
                            r.tone === "paid"
                                ? "bg-mk-ok-tint text-mk-ok"
                                : r.tone === "warn"
                                  ? "bg-[#FBE4E0] text-[#A02A16]"
                                  : "bg-[#F1EBDF]",
                        )}
                    >
                        <MomentIconMark icon={r.icon} className="size-4" />
                    </span>
                    <span className="grid gap-0.5">
                        <b className="text-[14.5px] font-semibold">{r.title}</b>
                        <span className={META}>{r.line}</span>
                    </span>
                </p>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ enquiry */

export function EnquiryFollowUp({ m }: { m: EnquiryMoment }) {
    return (
        <div className="grid items-start gap-5 min-[1000px]:grid-cols-2">
            <div role="img" aria-label={m.label} className={cn(CARD, "p-5")}>
                <CardHead title={m.title} at={m.at} />
                <p className="m-0 mt-3 font-display text-[20px] font-bold tracking-[-0.02em]">
                    {m.customer}
                </p>
                <p className={cn(META, "m-0 mt-1 text-[14px]")}>{m.what}</p>
                <p className="m-0 mt-3 rounded-[10px] bg-[#F7F3EA] px-3 py-2.5 text-[14px] leading-snug">
                    {m.said}
                </p>
                <Rows rows={m.lines} />
            </div>
            <div className={cn(CARD, "p-5")}>
                <p className="m-0 flex items-center justify-between">
                    <b className="font-display text-[18px]">{m.follow.title}</b>
                    <TonePill tone="paid">{m.follow.state}</TonePill>
                </p>
                <p className="m-0 mt-2 text-[15px] font-semibold">
                    {m.follow.reply}
                </p>
                <p className={cn(META, "m-0")}>{m.follow.replyMeta}</p>
                <ol className="m-0 mt-3 grid list-none gap-2 p-0">
                    {m.follow.steps.map((s) => (
                        <li
                            key={s.at}
                            className={cn(
                                "grid gap-0.5 border-l-2 pl-3",
                                s.next ? "border-brand-500" : "border-border",
                            )}
                        >
                            <b className="font-mono text-[13px] font-medium">
                                {s.at}
                            </b>
                            <span className="text-[14px]">{s.line}</span>
                        </li>
                    ))}
                </ol>
                <p className="m-0 mt-3 flex items-center gap-2 text-[13px] text-mk-copy">
                    <MomentIconMark icon="calendar" className="size-4" />
                    {m.follow.next}
                </p>
            </div>
        </div>
    );
}

/** One moment, by its kind. */
export function Moment({ m }: { m: MomentData }) {
    switch (m.kind) {
        case "home":
            return (
                <div
                    className={cn(CARD, "max-w-[420px] pt-3")}
                    role="img"
                    aria-label={m.label}
                >
                    <HomeList m={m} />
                </div>
            );
        case "shelf":
            return <Shelf m={m} />;
        case "order":
            return <OrderTaken m={m} />;
        case "site-order":
            return <SiteOrder m={m} />;
        case "post":
            return <PostShared m={m} />;
        case "payment":
            return <PaymentLands m={m} />;
        case "bill":
            return <Bill m={m} />;
        case "ai-app":
            return <AiAppTask m={m} />;
        case "ask":
            return <AskAnswer m={m} />;
        case "waiting":
            return <WaitingSlip m={m} />;
        case "enquiry":
            return <EnquiryFollowUp m={m} />;
    }
}
