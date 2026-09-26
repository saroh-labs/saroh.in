"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import type { OrderFilter, Tile } from "@/lib/customer-workspace/view";
import {
    bookingRow,
    deliveryAddress,
    favourites,
    howTheyGet,
    nextCredit,
    offersText,
    orderTiles,
    packLines,
    upcomingOf,
} from "@/lib/customer-workspace/view";
import { dayText } from "@/lib/subscriptions/view";

import { Bar, CARD, Empty, LABEL } from "./parts";

/**
 * Overview, as the design lays it out by business kind. A shop: four
 * figures, what they usually buy, how they get their orders. A bookings
 * business: classes left (membership first, then packs) and the next
 * booking with attended / no-shows / late cancels. Both: offers and news.
 * A block this viewer does not read is not drawn.
 */
export function Overview({
    d,
    now,
    canStop,
    stopping,
    canConsent,
    onStop,
    onOrders,
    onBookings,
}: {
    d: CustomerDetail;
    now: Date;
    canStop: boolean;
    stopping: boolean;
    canConsent: boolean;
    onStop: () => void;
    onOrders: (filter: OrderFilter) => void;
    onBookings: () => void;
}) {
    const rows = d.orders?.rows ?? [];
    const orders = d.orders !== undefined;
    return (
        <div className="flex flex-col gap-4">
            {orders && d.orders && rows.length === 0 ? (
                <Empty title="No orders yet">
                    Totals, favourites and how they get their orders fill in
                    from their first order. Orders reach this page through a
                    store customer linked to them.
                </Empty>
            ) : null}
            {d.bookings !== undefined ? (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
                    {d.stats.classesLeft !== undefined ? (
                        <ClassesLeft d={d} now={now} />
                    ) : null}
                    <NextBooking d={d} now={now} onAll={onBookings} />
                </div>
            ) : null}
            {orders && rows.length > 0 ? (
                <>
                    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))]">
                        {orderTiles(d, now).map((t) => (
                            <OrderTile
                                key={t.label}
                                tile={t}
                                onOpen={onOrders}
                            />
                        ))}
                    </div>
                    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
                        <section className={CARD} aria-label="Usually buys">
                            <div className={cn(LABEL, "mb-2")}>
                                Usually buys
                            </div>
                            {favourites(rows).map((f) => (
                                <div
                                    key={f.productId}
                                    className="flex gap-2.5 border-b border-foreground/10 py-[7px] text-[13.5px]"
                                >
                                    <Link
                                        href={`/commerce/products/${f.productId}`}
                                        className="min-w-0 flex-1 text-brand hover:text-foreground"
                                    >
                                        {f.name}
                                    </Link>
                                    <span className="text-muted-foreground">
                                        {f.note}
                                    </span>
                                </div>
                            ))}
                        </section>
                        <section
                            className={CARD}
                            aria-label="How they get orders"
                        >
                            <div className={cn(LABEL, "mb-2")}>
                                How they get orders
                            </div>
                            <div className="text-[13.5px]">
                                {howTheyGet(rows)}
                            </div>
                            <div className={cn(LABEL, "mb-1.5 mt-3.5")}>
                                Delivery address
                            </div>
                            <div className="text-[13.5px] leading-[1.5]">
                                {deliveryAddress(rows)}
                            </div>
                        </section>
                    </div>
                </>
            ) : null}
            {d.consent ? (
                <section className={CARD} aria-label="Offers and news">
                    <div className={cn(LABEL, "mb-1.5")}>Offers and news</div>
                    <div className="text-[13.5px]">
                        {offersText(d.consent, d.timezone, now)}
                    </div>
                    <p className="mt-[5px] text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                        Only the customer can say yes. You can record that they
                        asked to stop, and no offers go to them by email after
                        that.
                    </p>
                    {canStop ? (
                        <Button
                            variant="outline"
                            disabled={!canConsent || stopping}
                            title={
                                canConsent
                                    ? undefined
                                    : "Owners and admins only"
                            }
                            onClick={onStop}
                            className="mt-2.5 h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                        >
                            They asked to stop
                        </Button>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}

function OrderTile({
    tile,
    onOpen,
}: {
    tile: Tile;
    onOpen: (filter: OrderFilter) => void;
}) {
    const body = (
        <>
            <div className="text-[11.5px] text-muted-foreground">
                {tile.label}
            </div>
            <div className="mt-1 font-display text-[22px] font-semibold tabular-nums leading-[1.2]">
                {tile.value}
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {tile.note}
            </div>
        </>
    );
    const box =
        "rounded-xl border border-border bg-card px-[15px] py-[13px] text-left";
    const opens = tile.opens;
    return opens ? (
        <button
            type="button"
            onClick={() => onOpen(opens)}
            className={cn(
                box,
                "transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
        >
            {body}
        </button>
    ) : (
        <div className={box}>{body}</div>
    );
}

function ClassesLeft({ d, now }: { d: CustomerDetail; now: Date }) {
    const cl = d.stats.classesLeft;
    const m = cl?.allowance ?? null;
    const packs = packLines(d.packs?.rows ?? [], d.timezone, now);
    return (
        <section className={CARD} aria-label="Classes left">
            <div className="flex items-baseline gap-2">
                <span className={cn(LABEL, "flex-1")}>Classes left</span>
                <Link
                    href="/class-packs"
                    className="text-[12.5px] font-semibold text-brand hover:text-foreground"
                >
                    Sell a pack
                </Link>
            </div>
            {cl ? (
                <>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                        <span className="font-display text-[28px] font-semibold tabular-nums tracking-[-0.02em]">
                            {cl.total}
                        </span>
                        <span className="text-[12.5px] text-muted-foreground">
                            {nextCredit(d)}
                        </span>
                    </div>
                    {m ? (
                        <Link
                            href={`/billing/subscriptions/${m.subscriptionId}`}
                            className="mt-2.5 block border-t border-foreground/10 pb-2 pt-2.5 text-foreground hover:text-brand"
                        >
                            <div className="flex items-baseline gap-2.5">
                                <span className="flex-1 text-[13.5px] font-semibold">
                                    {m.plan}
                                </span>
                                <span className="text-[13px] font-semibold tabular-nums">
                                    {m.paused
                                        ? "On hold"
                                        : `${m.left} of ${m.perMonth}`}
                                </span>
                            </div>
                            <Bar
                                pct={(100 * m.left) / Math.max(1, m.perMonth)}
                                tone="ok"
                            />
                            <div
                                className={cn(
                                    "mt-[5px] text-[12px]",
                                    m.paused
                                        ? "text-destructive-subtle-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {m.paused
                                    ? "Paused — classes start again when it resumes."
                                    : `Classes this month · resets ${dayText(m.resetsAt, d.timezone, now)}, unused ones don't carry over`}
                            </div>
                        </Link>
                    ) : null}
                    {packs.map((p) => (
                        <div
                            key={p.name + p.sub}
                            className="border-t border-foreground/10 pb-2 pt-2.5"
                        >
                            <div className="flex items-baseline gap-2.5">
                                <span className="flex-1 text-[13.5px] font-semibold">
                                    {p.name}
                                </span>
                                <span className="text-[13px] font-semibold tabular-nums">
                                    {p.left}
                                </span>
                            </div>
                            <Bar pct={p.pct} tone={p.bar} />
                            <div
                                className={cn(
                                    "mt-[5px] text-[12px]",
                                    p.warn
                                        ? "text-brand"
                                        : "text-muted-foreground",
                                )}
                            >
                                {p.sub}
                            </div>
                        </div>
                    ))}
                    {!m && !packs.length ? (
                        <p className="mt-2 text-pretty text-[13px] text-muted-foreground">
                            No membership or packs. Classes are paid one at a
                            time until they buy one.
                        </p>
                    ) : null}
                </>
            ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">
                    Classes left couldn&apos;t be read just now.
                </p>
            )}
        </section>
    );
}

function NextBooking({
    d,
    now,
    onAll,
}: {
    d: CustomerDetail;
    now: Date;
    onAll: () => void;
}) {
    const next = d.bookings ? upcomingOf(d.bookings.upcoming)[0] : undefined;
    const row = next ? bookingRow(next, true, now) : null;
    const stats: {
        label: string;
        n: number | null | undefined;
        bad: boolean;
    }[] = [
        { label: "Attended", n: d.stats.attended, bad: false },
        { label: "No-shows", n: d.stats.noShows, bad: true },
        { label: "Late cancels", n: d.stats.lateCancels, bad: true },
    ];
    return (
        <section className={CARD} aria-label="Next booking">
            <div className={LABEL}>Next booking</div>
            {d.bookings === null ? (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Bookings couldn&apos;t be read just now.
                </p>
            ) : (
                <>
                    <div className="mt-1.5 text-[15px] font-semibold">
                        {row ? `${row.day} at ${row.at}` : "Nothing booked"}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {row
                            ? [row.what, row.pay].filter(Boolean).join(" · ")
                            : "They book on the booking page or at the desk."}
                    </div>
                </>
            )}
            <div className="mt-3.5 flex flex-wrap gap-[18px] border-t border-foreground/10 pt-3">
                {stats.map((s) => (
                    <div key={s.label}>
                        <div
                            className={cn(
                                "text-[17px] font-semibold tabular-nums",
                                s.bad && s.n
                                    ? "text-destructive-subtle-foreground"
                                    : "text-foreground",
                            )}
                        >
                            {typeof s.n === "number" ? s.n : "—"}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground">
                            {s.label}
                        </div>
                    </div>
                ))}
            </div>
            <Button
                variant="outline"
                onClick={onAll}
                className="mt-3.5 h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
            >
                See all bookings
            </Button>
        </section>
    );
}
