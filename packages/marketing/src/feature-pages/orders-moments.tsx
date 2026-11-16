import { ArrowRight, Globe, MessageCircle, Store } from "lucide-react";
import Link from "next/link";
import { cn } from "../cn";
import type { DrawnPhotoKind } from "../kit/drawn-photo";
import { DrawnPhoto } from "../kit/drawn-photo";
import { PhoneClip, PhoneFold } from "../kit/phone-fold";
import { Container } from "../layout/container";

/**
 * The Orders page's own moments (boards FODesk / FOPhone2), drawn from an
 * edition's world: where orders come from and the New order sheet, then
 * one order opened (its steps, items, history and money) and what it moves
 * (stock, the customer, the invoice). The data names the business; this
 * file names none, so saroh.tech draws the same slots from its own world.
 * On a phone the pictures are cut and the secondary lists fold (PHONE.md),
 * every word still in the HTML.
 */
export interface OrdersMomentsData {
    take: {
        title: string;
        lead: string;
        phoneLead: string;
        sourcesFold: string;
        sources: readonly {
            icon: "chat" | "site" | "counter";
            title: string;
            body: string;
            meta: string;
            product?: {
                name: string;
                price: string;
                photo?: DrawnPhotoKind;
                button: string;
            };
        }[];
        sheet: {
            label: string;
            title: string;
            sub: string;
            groups: readonly {
                label: string;
                options: readonly string[];
                /** The chosen option's index; -1 draws them as a field. */
                chosen: number;
            }[];
            action: string;
        };
    };
    open: {
        title: string;
        lead: string;
        more: string;
        record: {
            label: string;
            id: string;
            state: string;
            pickup: string;
            placed: string;
            actions: readonly [string, string];
            steps: readonly string[];
            at: number;
            item: {
                name: string;
                line: string;
                qty: string;
                total: string;
                photo?: DrawnPhotoKind;
                flag: string;
            };
            history: readonly { what: string; when: string }[];
            money: {
                rows: readonly (readonly [string, string])[];
                total: readonly [string, string];
                paid: readonly [string, string];
                invoice: { title: string; line: string };
                by: readonly [string, string];
                lands: string;
            };
            itemsTitle: string;
            historyTitle: string;
            moneyTitle: string;
        };
        around: {
            title: string;
            rows: readonly {
                title: string;
                body: string;
                href: string;
                from?: string;
                to?: string;
                what?: string;
                who?: string;
                whoLine?: string;
                invoice?: readonly [string, string];
            }[];
        };
    };
}

const ICON = { chat: MessageCircle, site: Globe, counter: Store } as const;
const CARD =
    "rounded-mk-card border border-border bg-card shadow-[0_1px_2px_rgba(40,30,15,0.05)]";
const H2 = "m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]";
const META = "text-[13px] leading-snug text-mk-copy";

function Sheet({ s }: { s: OrdersMomentsData["take"]["sheet"] }) {
    return (
        <div
            role="img"
            aria-label={s.label}
            className={cn(
                CARD,
                "grid gap-4 p-5 shadow-mk-card min-[760px]:p-6",
            )}
        >
            <p className="m-0 grid gap-0.5">
                <b className="font-display text-[20px] tracking-[-0.02em]">
                    {s.title}
                </b>
                <span className={META}>{s.sub}</span>
            </p>
            {s.groups.map((g) => (
                <div key={g.label} className="grid gap-2">
                    <span className="text-[13px] font-semibold">{g.label}</span>
                    <span className="flex flex-wrap gap-2">
                        {g.options.map((o, i) => (
                            <span
                                key={o}
                                className={cn(
                                    "inline-flex min-h-8 items-center rounded-[8px] border px-3 text-[13px]",
                                    i === g.chosen
                                        ? "border-foreground font-semibold"
                                        : "border-border text-mk-copy",
                                    g.chosen === -1 &&
                                        "w-full bg-background text-foreground",
                                )}
                            >
                                {o}
                            </span>
                        ))}
                    </span>
                </div>
            ))}
            <span className="ml-auto inline-flex h-10 items-center rounded-[10px] bg-foreground px-4 text-[14px] font-semibold text-background">
                {s.action}
            </span>
        </div>
    );
}

function Record({ r }: { r: OrdersMomentsData["open"]["record"] }) {
    return (
        <div
            role="img"
            aria-label={r.label}
            className={cn(
                CARD,
                "grid gap-4 p-5 shadow-mk-card min-[760px]:p-6",
            )}
        >
            <div className="flex flex-wrap items-center gap-3">
                <b className="font-display text-[26px] tracking-[-0.03em]">
                    {r.id}
                </b>
                <span className="rounded-full bg-mk-hover px-2.5 py-1 text-[12px] font-semibold">
                    {r.state}
                </span>
                <span className="ml-auto hidden gap-2 min-[760px]:flex">
                    <span className="inline-flex h-9 items-center rounded-[10px] border border-border px-3 text-[13px] font-semibold">
                        {r.actions[0]}
                    </span>
                    <span className="inline-flex h-9 items-center rounded-[10px] bg-foreground px-3 text-[13px] font-semibold text-background">
                        {r.actions[1]}
                    </span>
                </span>
            </div>
            <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-mk-copy">
                <b className="rounded-full bg-mk-hover px-2.5 py-1 font-semibold text-foreground">
                    {r.pickup}
                </b>
                {r.placed}
            </p>
            <ol className="m-0 flex list-none items-center gap-2 p-0 text-[13px]">
                {r.steps.map((st, i) => (
                    <li
                        key={st}
                        className={cn(
                            "flex flex-1 items-center gap-2 whitespace-nowrap",
                            i > r.at && "text-mk-copy",
                            i === r.steps.length - 1 && "flex-none",
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-2.5 shrink-0 rounded-full",
                                i <= r.at
                                    ? "bg-foreground"
                                    : "border border-border-strong",
                            )}
                        />
                        <span className={cn(i === r.at && "font-semibold")}>
                            {st}
                        </span>
                        {i < r.steps.length - 1 ? (
                            <span
                                aria-hidden
                                className={cn(
                                    "h-px flex-1",
                                    i < r.at ? "bg-foreground" : "bg-border",
                                )}
                            />
                        ) : null}
                    </li>
                ))}
            </ol>
            <div className="grid gap-4 min-[760px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="grid content-start gap-4">
                    <div className={cn(CARD, "grid gap-2 p-4 shadow-none")}>
                        <b className="text-[14px]">{r.itemsTitle}</b>
                        <p className="m-0 flex items-center gap-3">
                            {r.item.photo ? (
                                <DrawnPhoto
                                    kind={r.item.photo}
                                    className="size-11 shrink-0 rounded-md"
                                />
                            ) : null}
                            <span className="grid min-w-0 flex-1 gap-0.5">
                                <span className="text-[14px] font-semibold">
                                    {r.item.name}
                                </span>
                                <span className={META}>{r.item.line}</span>
                            </span>
                            <span className="font-mono text-[13px] text-mk-copy">
                                {r.item.qty}
                            </span>
                            <b className="font-mono text-[14px]">
                                {r.item.total}
                            </b>
                        </p>
                        <span className="w-fit rounded-full bg-[#FBE4E0] px-2.5 py-1 text-[12px] font-semibold text-[#A02A16]">
                            {r.item.flag}
                        </span>
                    </div>
                    <div className={cn(CARD, "grid gap-2 p-4 shadow-none")}>
                        <b className="text-[14px]">{r.historyTitle}</b>
                        <ol className="m-0 grid list-none gap-2 p-0">
                            {r.history.map((h, i) => (
                                <li key={h.what} className="flex gap-2.5">
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "mt-1.5 size-2 shrink-0 rounded-full",
                                            i === 0
                                                ? "bg-foreground"
                                                : "bg-border-strong",
                                        )}
                                    />
                                    <span className="grid gap-0.5">
                                        <span className="text-[13px] font-semibold">
                                            {h.what}
                                        </span>
                                        <span className="text-[12px] text-mk-copy">
                                            {h.when}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
                <div
                    className={cn(
                        CARD,
                        "grid content-start gap-2 p-4 shadow-none",
                    )}
                >
                    <b className="text-[14px]">{r.moneyTitle}</b>
                    {r.money.rows.map(([k, v]) => (
                        <p
                            key={k}
                            className="m-0 flex justify-between text-[13px] text-mk-copy"
                        >
                            {k}
                            <span className="font-mono text-foreground">
                                {v}
                            </span>
                        </p>
                    ))}
                    <p className="m-0 flex justify-between border-t border-border pt-2 text-[14px] font-semibold">
                        {r.money.total[0]}
                        <span className="font-mono">{r.money.total[1]}</span>
                    </p>
                    <p className="m-0 flex justify-between text-[13px] text-mk-copy">
                        {r.money.paid[0]}
                        <span className="font-mono text-foreground">
                            {r.money.paid[1]}
                        </span>
                    </p>
                    <p className="m-0 grid gap-0.5 rounded-[10px] border border-border p-3">
                        <span className="text-[13px] font-semibold">
                            {r.money.invoice.title}
                        </span>
                        <span className="text-[12px] text-mk-copy">
                            {r.money.invoice.line}
                        </span>
                    </p>
                    <p className="m-0 flex justify-between text-[13px] text-mk-copy">
                        {r.money.by[0]}
                        <span className="text-foreground">{r.money.by[1]}</span>
                    </p>
                    <p className="m-0 rounded-[10px] bg-[#1E3B2C] p-3 text-[13px] leading-snug text-white">
                        {r.money.lands}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function OrdersMoments({ data }: { data: OrdersMomentsData }) {
    const { take, open } = data;
    return (
        <>
            <Container
                as="section"
                aria-labelledby="orders-take"
                className="grid gap-8 pt-12 min-[760px]:pt-[120px]"
            >
                <div className="grid max-w-[640px] gap-4">
                    <h2 id="orders-take" className={H2}>
                        {take.title}
                    </h2>
                    <p className="m-0 text-mk-kit-lead text-mk-copy">
                        <span className="max-[759px]:hidden">{take.lead}</span>
                        <span className="min-[760px]:hidden">
                            {take.phoneLead}
                        </span>
                    </p>
                </div>
                <div className="grid items-center gap-6 min-[1000px]:grid-cols-[minmax(0,400px)_minmax(0,1fr)] min-[1000px]:gap-16">
                    <PhoneFold
                        summary={take.sourcesFold}
                        className="max-[999px]:order-2"
                    >
                        <ul className="m-0 grid list-none gap-3 p-0 max-[759px]:mt-3">
                            {take.sources.map((src) => {
                                const Icon = ICON[src.icon];
                                return (
                                    <li
                                        key={src.title}
                                        className={cn(CARD, "grid gap-2 p-4")}
                                    >
                                        <p className="m-0 flex items-center gap-3">
                                            <span className="grid size-8 place-items-center rounded-[8px] bg-mk-hover">
                                                <Icon
                                                    aria-hidden
                                                    className="size-4"
                                                />
                                            </span>
                                            <b className="text-[15px]">
                                                {src.title}
                                            </b>
                                        </p>
                                        <p className="m-0 text-[14px] leading-snug text-mk-copy">
                                            {src.body}
                                        </p>
                                        {src.product ? (
                                            <p className="m-0 flex items-center gap-3 rounded-[10px] bg-mk-hover p-2.5">
                                                {src.product.photo ? (
                                                    <DrawnPhoto
                                                        kind={src.product.photo}
                                                        className="size-10 shrink-0 rounded-md"
                                                    />
                                                ) : null}
                                                <span className="grid flex-1 gap-0.5">
                                                    <b className="text-[14px]">
                                                        {src.product.name}
                                                    </b>
                                                    <span className="text-[12px] text-mk-copy">
                                                        {src.product.price}
                                                    </span>
                                                </span>
                                                <span className="rounded-[8px] bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background">
                                                    {src.product.button}
                                                </span>
                                            </p>
                                        ) : null}
                                        <span className="font-mono text-[12px] text-mk-copy">
                                            {src.meta}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </PhoneFold>
                    <PhoneClip height={250} label={take.sheet.title}>
                        <Sheet s={take.sheet} />
                    </PhoneClip>
                </div>
            </Container>

            <Container
                as="section"
                aria-labelledby="orders-open"
                className="grid gap-8 pt-12 min-[760px]:pt-[120px]"
            >
                <div className="grid max-w-[640px] gap-4">
                    <h2 id="orders-open" className={H2}>
                        {open.title}
                    </h2>
                    <p className="m-0 text-mk-kit-lead text-mk-copy">
                        {open.lead}
                    </p>
                </div>
                <PhoneClip height={250} label={open.more}>
                    <Record r={open.record} />
                </PhoneClip>
                <div className="grid gap-4">
                    <h3 className="m-0 font-display text-mk-kit-h3 font-bold max-[759px]:hidden">
                        {open.around.title}
                    </h3>
                    <PhoneFold summary={open.around.title}>
                        <ul className="m-0 grid list-none p-0">
                            {open.around.rows.map((row) => (
                                <li key={row.title}>
                                    <Link
                                        href={row.href}
                                        className="grid gap-2 border-t border-border py-4 text-foreground no-underline hover:bg-mk-hover/50 min-[760px]:grid-cols-[220px_minmax(0,1fr)_220px_24px] min-[760px]:items-center min-[760px]:gap-6"
                                    >
                                        <b className="font-display text-[19px] leading-tight">
                                            {row.title}
                                        </b>
                                        <span className="text-[14px] leading-snug text-mk-copy">
                                            {row.body}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            {row.from && row.to ? (
                                                <>
                                                    <s className="font-display text-[20px] text-mk-copy">
                                                        {row.from}
                                                    </s>
                                                    <ArrowRight
                                                        aria-hidden
                                                        className="size-4"
                                                    />
                                                    <b className="font-display text-[28px]">
                                                        {row.to}
                                                    </b>
                                                    <span className="text-[12px] leading-tight text-mk-copy">
                                                        {row.what}
                                                    </span>
                                                </>
                                            ) : row.who ? (
                                                <span className="grid gap-0.5">
                                                    <b className="text-[14px]">
                                                        {row.who}
                                                    </b>
                                                    <span className="text-[12px] text-mk-copy">
                                                        {row.whoLine}
                                                    </span>
                                                </span>
                                            ) : row.invoice ? (
                                                <span className="grid gap-0.5 rounded-[6px] border border-border bg-card px-3 py-2 shadow-mk-card">
                                                    <b className="font-mono text-[13px]">
                                                        {row.invoice[0]}
                                                    </b>
                                                    <span className="text-[12px] text-mk-copy">
                                                        {row.invoice[1]}
                                                    </span>
                                                </span>
                                            ) : null}
                                        </span>
                                        <ArrowRight
                                            aria-hidden
                                            className="hidden size-5 min-[760px]:block"
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </PhoneFold>
                </div>
            </Container>
        </>
    );
}
