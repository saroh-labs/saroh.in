import type { WorldOrder } from "@saroh/marketing/world";

import { home } from "@/content/home";
import { RYE_MONDAY, WORLD } from "@/content/world";

import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { TextLink } from "@saroh/marketing/text-link";
import { Fold } from "./fold";
import { Tag } from "./tag";

const W = home.orders;

/** "Today 5 pm (moved …)" → "5 pm": the time a row shows. */
export const dueAt = (pickup: string) =>
    /\d{1,2}(:\d\d)? (am|pm)/.exec(pickup)?.[0] ?? pickup;

/** How the Orders list labels a row's money. */
export function payState(o: WorldOrder): "paid" | "pickup" | "unpaid" {
    if (o.paid.startsWith("Paid")) return "paid";
    if (o.paid.includes("pick-up")) return "pickup";
    return "unpaid";
}

/** The rows the chapter shows: today's, due first, one of each state. */
const ROWS = ["ORD-1041", "ORD-1045", "ORD-1044"];

function OrdersCard() {
    const orders = ROWS.flatMap(
        (id) => WORLD.lead.orders?.filter((o) => o.id === id) ?? [],
    );
    return (
        <figure
            aria-label={`${WORLD.lead.name}'s orders due today, an example`}
            className="m-0 overflow-hidden rounded-mk-card bg-card shadow-[0_1px_2px_rgba(40,30,15,0.06),0_12px_32px_-12px_rgba(40,30,15,0.16)]"
        >
            <div className="flex items-center gap-3 border-b border-mk-line-row px-4 py-3.5 min-[760px]:px-5">
                <b className="text-[16px]">{W.list}</b>
                <span className="text-[13px] text-muted-foreground">
                    {W.due}
                </span>
                <Tag className="ml-auto">
                    {orders.length} {W.toPack}
                </Tag>
            </div>
            <ul className="m-0 list-none p-0">
                {orders.map((o) => {
                    const state = payState(o);
                    return (
                        <li
                            key={o.id}
                            className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-t border-mk-line-row px-4 py-3 text-[15px] first:border-t-0 min-[760px]:grid-cols-[92px_1fr_64px_76px_96px] min-[760px]:px-5 min-[760px]:text-[14px]"
                        >
                            <span className="block leading-snug min-[760px]:contents">
                                <b className="block font-semibold min-[760px]:order-2">
                                    {o.customer}{" "}
                                    {o.note ? (
                                        <span className="text-[13px] font-normal text-muted-foreground">
                                            {o.note}
                                        </span>
                                    ) : null}
                                </b>
                                <span className="font-mono text-[14px] text-muted-foreground min-[760px]:hidden">
                                    {o.id} · {dueAt(o.pickup)} · {o.total}
                                </span>
                                <span className="hidden font-mono text-[13px] min-[760px]:order-1 min-[760px]:block">
                                    {o.id}
                                </span>
                                <span className="hidden font-mono text-[13px] min-[760px]:order-3 min-[760px]:block">
                                    {dueAt(o.pickup)}
                                </span>
                                <span className="hidden font-mono text-[13px] min-[760px]:order-4 min-[760px]:block">
                                    {o.total}
                                </span>
                            </span>
                            <Tag
                                className="min-[760px]:order-5"
                                tone={
                                    state === "paid"
                                        ? "ok"
                                        : state === "unpaid"
                                          ? "warn"
                                          : "plain"
                                }
                            >
                                {W.status[state]}
                            </Tag>
                        </li>
                    );
                })}
            </ul>
        </figure>
    );
}

function ClassCard({ className }: { className?: string }) {
    const c = RYE_MONDAY.class;
    return (
        <div
            className={cn(
                "rounded-mk-card bg-card px-[18px] py-3.5 shadow-[0_1px_2px_rgba(40,30,15,0.06),0_12px_32px_-12px_rgba(40,30,15,0.16)]",
                className,
            )}
        >
            <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3">
                <b className="text-[16px]">{c.name}</b>
                <span className="font-mono text-[13px] text-muted-foreground">
                    {c.when}
                </span>
            </p>
            <p aria-hidden className="m-0 mt-3 flex gap-1.5">
                {Array.from({ length: c.places }, (_, i) => (
                    <i
                        key={i}
                        className={cn(
                            "h-2.5 flex-1 rounded-full",
                            i < c.booked ? "bg-foreground" : "bg-border",
                        )}
                    />
                ))}
            </p>
            <p className="m-0 mt-2.5 text-[14px] text-mk-copy">
                {c.booked} of {c.places} {W.placesBooked} · {c.price} {W.aPlace}
            </p>
        </div>
    );
}

/**
 * Chapter 2, "Orders and bookings" (`#orders`): today's list, three rows,
 * and the Saturday class beside it. On a phone the class folds under "See
 * the whole list" (in the HTML, closed).
 */
export function OrdersChapter() {
    return (
        <Container
            as="section"
            id="orders"
            aria-labelledby="orders-title"
            className="grid scroll-mt-24 gap-6 pt-10 min-[760px]:pt-[72px] min-[960px]:grid-cols-[minmax(0,1fr)_420px] min-[960px]:items-center min-[960px]:gap-20"
        >
            <div className="min-[960px]:order-2">
                <h2
                    id="orders-title"
                    className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                >
                    {W.title}
                </h2>
                <p className="m-0 mt-4 text-[16px] leading-relaxed text-mk-copy min-[760px]:text-[17px]">
                    <span className="max-[759px]:hidden">{W.body}</span>
                    <span className="min-[760px]:hidden">{W.short}</span>
                </p>
                <TextLink
                    href="/features/orders"
                    tone="ink"
                    arrow
                    className="mt-4 max-[759px]:hidden"
                >
                    {W.link}
                </TextLink>
            </div>
            <div className="min-[960px]:order-1">
                <div className="relative min-[760px]:rounded-mk-card min-[760px]:bg-mk-hover min-[760px]:px-7 min-[760px]:pb-24 min-[760px]:pt-5">
                    <OrdersCard />
                    <ClassCard className="absolute bottom-3.5 right-6 hidden w-[330px] min-[760px]:block" />
                </div>
                <Fold summary={W.more} className="mt-2 min-[760px]:hidden">
                    <ClassCard className="mt-2 shadow-none" />
                </Fold>
                <TextLink
                    href="/features/orders"
                    tone="ink"
                    arrow
                    className="min-[760px]:hidden"
                >
                    {W.link}
                </TextLink>
            </div>
        </Container>
    );
}
