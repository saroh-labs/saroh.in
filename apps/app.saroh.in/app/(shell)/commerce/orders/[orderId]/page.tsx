import { badgeVariants } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { OrderActions } from "@/components/commerce/order-actions";
import { PageContainer } from "@/components/shared/page-container";
import { ViewerDate } from "@/components/shared/viewer-date";
import {
    isRefundable,
    OrderPayments,
} from "@/components/stores/order-payments";
import { OrderReviews } from "@/components/stores/order-reviews";
import { RefundButton } from "@/components/stores/refund-button";
import { formatMoneyMajor } from "@/lib/format/money";
import type { OrderStanding } from "@/lib/orders/lifecycle";
import {
    PAYMENT_LABEL,
    standingOf,
    STATUS_LABEL,
} from "@/lib/orders/lifecycle";
import type { OrderDetail } from "@/lib/orders/service";
import { getOrder } from "@/lib/orders/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import type { OrderPaymentsSummary } from "@/lib/payments/service";
import { getOrderPayments } from "@/lib/payments/service";
import { invitationState } from "@/lib/product-reviews/service";
import { requireSession } from "@/lib/session";
import type { Store } from "@/lib/stores/service";
import { listStores } from "@/lib/stores/service";

export const metadata = { title: "Order" };

const STANDING: Record<
    OrderStanding,
    { label: string; variant: "draft" | "success" | "neutral" }
> = {
    UNFULFILLED: { label: "Unfulfilled", variant: "draft" },
    FULFILLED: { label: "Fulfilled", variant: "success" },
    REFUNDED: { label: "Refunded", variant: "neutral" },
    CANCELLED: { label: "Cancelled", variant: "neutral" },
};

/**
 * Sell → Orders → one order, after the "Saroh Orders Screen" design.
 *
 * Items and totals on the left, who and how it was paid on the right, and the
 * next thing to do with it in the header. The design also draws a delivery
 * address and a per-line variant; an order does not carry either yet, so
 * those are left out rather than drawn empty.
 *
 * The storefront travels in the address (`?storefront=`); a link without it
 * is still honoured by asking each storefront until one has the order.
 */
export default async function OrderPage({
    params,
    searchParams,
}: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ orderId }, { storefront }, stores] = await Promise.all([
        params,
        searchParams,
        listStores(),
    ]);
    const found = await findOrder(stores, orderId, storefront);
    if (!found) notFound();
    const { store, order } = found;

    const [payments, reviewState, organization] = await Promise.all([
        getOrderPayments(order.id).catch(() => null),
        // Unknown on failure: the section is left out rather than guessing.
        invitationState(order.id).catch(() => null),
        resolveActiveOrganization(),
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    const standing = STANDING[standingOf(order.status, order.paymentStatus)];
    const money = (amount: string | number) =>
        formatMoneyMajor(amount, order.currency) ?? String(amount);
    const customerName =
        [order.customer?.firstName, order.customer?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || null;

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        "Sell",
                        <Link
                            key="orders"
                            href="/commerce/orders"
                            className="hover:text-foreground"
                        >
                            Orders
                        </Link>,
                        order.orderId,
                    ]}
                    title={
                        <span className="font-mono tracking-normal">
                            #{order.orderId}
                        </span>
                    }
                    description={
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                                className={badgeVariants({
                                    variant: standing.variant,
                                })}
                            >
                                {standing.label}
                            </span>
                            <span>
                                Placed{" "}
                                <ViewerDate
                                    iso={order.createdAt}
                                    variant="datetime"
                                    className="font-mono text-[12px]"
                                />{" "}
                                · {store.name}
                            </span>
                        </span>
                    }
                    actions={
                        <>
                            {isRefundable(payments) ? (
                                <RefundButton orderId={order.id} />
                            ) : null}
                            <OrderActions
                                storeId={store.id}
                                orderId={order.id}
                                orderRef={`#${order.orderId}`}
                                status={order.status}
                                paymentStatus={order.paymentStatus}
                            />
                        </>
                    }
                />

                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="flex min-w-0 flex-col gap-4">
                        <Card title="Items">
                            <ul>
                                {order.items.map((item) => (
                                    <li
                                        key={item.id}
                                        className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3"
                                    >
                                        <span
                                            aria-hidden
                                            className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-muted text-[11px] font-semibold text-neutral-600 dark:text-muted-foreground"
                                        >
                                            {initials(
                                                item.product?.name ?? "?",
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[13.5px] font-medium">
                                                {item.product?.name ??
                                                    "A product that no longer exists"}
                                            </div>
                                            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                                                {money(item.price)} each
                                            </div>
                                        </div>
                                        <span className="font-mono text-[12px] text-muted-foreground">
                                            × {item.quantity}
                                        </span>
                                        <span className="min-w-[72px] text-right font-display text-[13.5px] font-semibold tabular-nums tracking-[-0.02em]">
                                            {money(lineTotal(item))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <dl className="flex flex-col gap-2 px-4 py-3.5 text-[13px]">
                                <Sum
                                    label="Subtotal"
                                    value={money(order.subtotal)}
                                />
                                {Number(order.tax) > 0 ? (
                                    <Sum label="Tax" value={money(order.tax)} />
                                ) : null}
                                <Sum
                                    label="Delivery"
                                    value={
                                        Number(order.shipping) > 0
                                            ? money(order.shipping)
                                            : "Free"
                                    }
                                />
                                {Number(order.discount) > 0 ? (
                                    <Sum
                                        label={
                                            order.discountCode
                                                ? `Discount · ${order.discountCode.code} (${order.discountCode.rule})`
                                                : "Discount"
                                        }
                                        value={`− ${money(order.discount)}`}
                                    />
                                ) : null}
                                <div className="mt-0.5 flex items-center border-t border-border pt-2.5">
                                    <dt className="text-[13.5px] font-semibold">
                                        Total
                                    </dt>
                                    <dd className="ml-auto font-display text-[18px] font-semibold tabular-nums tracking-[-0.025em]">
                                        {money(order.total)}
                                    </dd>
                                </div>
                            </dl>
                        </Card>

                        <Card title="Timeline">
                            <ol className="flex flex-col gap-[13px] px-4 py-3.5">
                                {timeline(order, payments).map((ev) => (
                                    <li
                                        key={`${ev.at}-${ev.text}`}
                                        className="flex items-start gap-[11px]"
                                    >
                                        <span
                                            aria-hidden
                                            className="mt-[5px] size-2 shrink-0 rounded-full bg-foreground/25"
                                        />
                                        <div className="min-w-0">
                                            <div className="text-[13px]">
                                                {ev.text}
                                            </div>
                                            <ViewerDate
                                                iso={ev.at}
                                                variant="datetime"
                                                className="mt-0.5 block font-mono text-[11px] text-muted-foreground"
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </Card>
                    </div>

                    <div className="flex min-w-0 flex-col gap-4">
                        <Card title="Customer" padded>
                            {order.customer ? (
                                <>
                                    <div className="mb-3 flex items-center gap-[11px]">
                                        <span
                                            aria-hidden
                                            className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold"
                                        >
                                            {initials(
                                                customerName ??
                                                    order.customer.email,
                                            )}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-[13.5px] font-semibold">
                                                {customerName ??
                                                    order.customer.email}
                                            </div>
                                            <div className="truncate text-[12.5px] text-muted-foreground">
                                                {order.customer.email}
                                            </div>
                                        </div>
                                    </div>
                                    <Link
                                        href={`/stores/${store.id}/customers/${order.customerId}`}
                                        className="text-[12.5px] font-medium underline-offset-4 hover:underline print:hidden"
                                    >
                                        Open customer
                                    </Link>
                                </>
                            ) : (
                                <p className="text-[12.5px] text-muted-foreground">
                                    This customer&apos;s record is gone. The
                                    order keeps what was bought.
                                </p>
                            )}
                        </Card>

                        <Card title="Payment" padded>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span
                                    className={badgeVariants({
                                        variant:
                                            order.paymentStatus === "PAID"
                                                ? "success"
                                                : order.paymentStatus ===
                                                    "FAILED"
                                                  ? "warning"
                                                  : "neutral",
                                    })}
                                >
                                    {PAYMENT_LABEL[order.paymentStatus]}
                                </span>
                                <span className="text-[12px] text-muted-foreground">
                                    Goods: {STATUS_LABEL[order.status]}
                                </span>
                            </div>
                            <OrderPayments
                                summary={payments}
                                paymentStatus={order.paymentStatus}
                            />
                        </Card>

                        {reviewState ? (
                            <OrderReviews
                                orderId={order.id}
                                state={reviewState}
                                canWrite={
                                    may("product-review:write") &&
                                    may("order:read")
                                }
                            />
                        ) : null}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}

function Card({
    title,
    padded,
    children,
}: {
    title: string;
    padded?: boolean;
    children: ReactNode;
}) {
    return (
        <section className="overflow-hidden rounded-[12px] border border-border bg-card">
            <h2
                className={
                    padded
                        ? "px-4 pb-0 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                        : "border-b border-muted px-4 py-[13px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                }
            >
                {title}
            </h2>
            <div className={padded ? "p-4 pt-3" : undefined}>{children}</div>
        </section>
    );
}

function Sum({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center text-neutral-600 dark:text-muted-foreground">
            <dt>{label}</dt>
            <dd className="ml-auto font-display font-medium tabular-nums text-foreground">
                {value}
            </dd>
        </div>
    );
}

function initials(name: string): string {
    const letters = name
        .split(/[\s&@.]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
    return letters || "?";
}

/** A line's total in minor units and back, so it never drifts on floats. */
function lineTotal(item: { price: string; quantity: number }): string {
    const minor = Math.round(Number(item.price) * 100) * item.quantity;
    return (minor / 100).toFixed(2);
}

/**
 * What has happened to the order, from what is actually recorded: when it
 * was placed, each payment attempt and refund, and when it last changed.
 * There is no event log for status moves yet, so the timeline does not
 * pretend to know which move happened when.
 */
function timeline(
    order: OrderDetail,
    payments: OrderPaymentsSummary | null,
): { at: string; text: string }[] {
    const events: { at: string; text: string }[] = [
        { at: order.createdAt, text: "Order placed" },
    ];
    for (const intent of payments?.intents ?? []) {
        for (const a of intent.attempts) {
            events.push({
                at: a.createdAt,
                text: `Payment attempt via ${intent.provider} · ${a.status.toLowerCase()}`,
            });
        }
        for (const r of intent.refunds) {
            events.push({
                at: r.createdAt,
                text: `Refund · ${r.status.toLowerCase()}`,
            });
        }
    }
    if (order.updatedAt && order.updatedAt !== order.createdAt) {
        events.push({
            at: order.updatedAt,
            text: `Last changed — now ${STATUS_LABEL[order.status].toLowerCase()}, ${PAYMENT_LABEL[order.paymentStatus].toLowerCase()}`,
        });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
}

async function findOrder(
    stores: Store[],
    orderId: string,
    storefront: string | undefined,
): Promise<{ store: Store; order: OrderDetail } | null> {
    const named = stores.find((s) => s.id === storefront);
    if (named) {
        const order = await getOrder(named.id, orderId).catch(() => null);
        if (order) return { store: named, order };
    }
    const others = stores.filter((s) => s !== named);
    const hits = await Promise.all(
        others.map((s) => getOrder(s.id, orderId).catch(() => null)),
    );
    for (let i = 0; i < hits.length; i++) {
        const order = hits[i];
        if (order) return { store: others[i], order };
    }
    return null;
}
