import type { OrderRow } from "./business-service";
import { STEP_LABEL } from "./lifecycle";
import { orderHref } from "./links";
import { onlinePaymentWords } from "./online-payment";
import type { FulfilmentType, KitchenStage, OrderRead } from "./read";

/**
 * What the Orders list's row menu and quick view offer (plan B, B5), from
 * the row or the order read and what the caller may do. Pure, so the rules
 * are pinned by tests and the components only draw them.
 *
 * The plan's rule: an item the caller can't use is not drawn at all; one the
 * order doesn't allow is drawn disabled, with the reason in words.
 */

/**
 * What the caller may do, from the actions the API resolved for them
 * (`orderPowers` in `access.ts`, B16).
 */
export interface OrderAbilities {
    /** Move steps and print (`order:stage`). */
    stage: boolean;
    /** Take a new order, and make its pay link (`order:create`). */
    create: boolean;
    /** Make or replace a pay link (`order:create` or `order:edit`). */
    payLink: boolean;
    /** Refund and cancel (`order:refund`). */
    refund: boolean;
    /** Export the list (`order:export`). */
    export: boolean;
    /** A provider can open the checkout window (DEC-054). */
    payOnline: boolean;
}

/**
 * How the next step is taken:
 * - `move`: straight from the list, with Undo;
 * - `page`: on Order Detail, which asks for more first — the courier and
 *   number for a hand-over (B10).
 */
export interface NextStep {
    to: KitchenStage;
    label: string;
    via: "move" | "page";
}

const isAppointment = (t: FulfilmentType) =>
    t === "APPOINTMENT_IN_PERSON" || t === "APPOINTMENT_ONLINE";

/** Where Order Detail opens with a panel up, or printing its ticket. */
export function orderPageHref(
    storeId: string,
    orderId: string,
    then?: "refund" | "courier" | "print",
): string {
    const base = orderHref(storeId, orderId);
    if (!then) return base;
    return then === "print" ? `${base}&print=1` : `${base}&panel=${then}`;
}

/** What Order Detail was opened to do, from the list (`orderPageHref`). */
export type Arrival = "refund" | "courier" | "print" | null;

/** Read `?panel=` and `?print=1` back off Order Detail's address. */
export function arrivalOf(params: {
    panel?: string | string[];
    print?: string | string[];
}): Arrival {
    const panel = Array.isArray(params.panel) ? params.panel[0] : params.panel;
    if (panel === "refund" || panel === "courier") return panel;
    const print = Array.isArray(params.print) ? params.print[0] : params.print;
    return print === "1" ? "print" : null;
}

/**
 * Why the order can't take a step now, or null when it can: the same rule
 * as Order Detail's button (nothing moves before it is paid, unless it was
 * taken to pay later and has started), plus done, refunded and cancelled.
 * An order the customer pays at the handover (website, "Pay when you
 * collect", "Pay on delivery") is made and brought first: only its
 * handover waits for the money.
 */
function stepBlock(order: {
    status: string;
    paymentStatus: string;
    stage: string;
    refunded: boolean;
    done: boolean;
    payOnHandover?: boolean;
    to?: KitchenStage;
}): string | null {
    if (order.status === "CANCELLED") return "It's cancelled.";
    if (order.refunded) return "It's refunded in full.";
    if (order.done) return "Nothing left to do.";
    if (order.payOnHandover && order.paymentStatus !== "PAID") {
        return order.to === "COLLECTED" || order.to === "DELIVERED"
            ? "Not paid yet."
            : null;
    }
    if (
        order.paymentStatus === "FAILED" ||
        (order.paymentStatus === "UNPAID" && order.stage === "NEW")
    ) {
        return "Not paid yet.";
    }
    return null;
}

function stepFor(to: KitchenStage | undefined): NextStep | null {
    if (!to) return null;
    return {
        to,
        label: STEP_LABEL[to],
        via: to === "HANDED_TO_COURIER" ? "page" : "move",
    };
}

/**
 * The quick view's next action ("Mark ready"), from the order read's
 * `next.stages` — the API's say, as Order Detail's — or null when there is
 * none to take here. An appointment's visits are marked on Order Detail
 * (DESIGN-NOTES), so it has none.
 */
export function quickNext(
    order: Pick<
        OrderRead,
        | "status"
        | "paymentStatus"
        | "stage"
        | "refundStanding"
        | "fulfilmentType"
        | "next"
    > &
        Partial<Pick<OrderRead, "payOnHandover">>,
    can: Pick<OrderAbilities, "stage">,
): NextStep | null {
    if (!can.stage || isAppointment(order.fulfilmentType)) return null;
    const step = stepFor(order.next.stages[0]);
    if (!step) return null;
    const blocked = stepBlock({
        status: order.status,
        paymentStatus: order.paymentStatus,
        stage: order.stage,
        refunded: order.refundStanding === "REFUNDED",
        done: false,
        payOnHandover: order.payOnHandover,
        to: step.to,
    });
    return blocked ? null : step;
}

export type RowMenuItem =
    | {
          kind: "next";
          label: string;
          step: NextStep | null;
          /** Why it can't be taken now; null when it can. */
          disabled: string | null;
      }
    | { kind: "print"; label: string; href: string }
    | {
          kind: "pay-link";
          label: string;
          /** A link is out: making one stops that one working. */
          replaces: boolean;
          disabled: string | null;
      }
    | { kind: "open"; label: string; href: string }
    | { kind: "refund"; label: string; href: string; disabled: string | null }
    | { kind: "cancel"; label: string; disabled: string | null };

type MenuRow = Pick<
    OrderRow,
    | "id"
    | "store"
    | "status"
    | "paymentStatus"
    | "stage"
    | "steps"
    | "stepIndex"
    | "fulfilmentType"
    | "payment"
    | "standing"
    | "total"
    | "unpaidAmount"
    | "ticketName"
    | "payLinkCreatedAt"
> &
    Partial<Pick<OrderRow, "payOnHandover">>;

/** The row's next step, from its type's steps and where it stands. */
export function rowNext(row: MenuRow): {
    step: NextStep | null;
    disabled: string | null;
} {
    const last = row.steps.length - 1;
    const done = row.steps.length === 0 || row.stepIndex >= last;
    const step = done ? null : stepFor(row.steps[row.stepIndex + 1]?.stage);
    const disabled = stepBlock({
        status: row.status,
        paymentStatus: row.paymentStatus,
        stage: row.stage,
        refunded: row.payment === "REFUNDED",
        done: step === null,
        payOnHandover: row.payOnHandover,
        to: step?.to,
    });
    return { step, disabled };
}

/**
 * The row menu, in the design's order: the next step, Print ticket, the pay
 * link, Open full page, then — apart — Refund, or Cancel for an order
 * nothing was paid on.
 *
 * Money items need the row's money (`order:read`), so the kitchen's view
 * (`order:stage` alone) never gets them.
 */
export function rowMenu(row: MenuRow, can: OrderAbilities): RowMenuItem[] {
    const items: RowMenuItem[] = [];
    const money = row.total !== undefined;

    if (can.stage && !isAppointment(row.fulfilmentType)) {
        const next = rowNext(row);
        items.push({
            kind: "next",
            label: next.step?.label ?? "Next step",
            step: next.step,
            disabled: next.disabled,
        });
    }

    if (row.ticketName) {
        items.push({
            kind: "print",
            label: `Print ${row.ticketName.toLowerCase()}`,
            href: orderPageHref(row.store.id, row.id, "print"),
        });
    }

    if (can.payLink && money) {
        const replaces = Boolean(row.payLinkCreatedAt);
        const owed =
            row.status !== "CANCELLED" &&
            (row.paymentStatus === "UNPAID" ||
                row.paymentStatus === "FAILED") &&
            Number(row.unpaidAmount ?? 0) > 0;
        items.push({
            kind: "pay-link",
            label: replaces ? "New pay link" : "Make a pay link",
            replaces,
            disabled: !owed
                ? "Nothing is owed on it."
                : !can.payOnline
                  ? "Connect a payment provider first."
                  : null,
        });
    }

    items.push({
        kind: "open",
        label: "Open full page",
        href: orderPageHref(row.store.id, row.id),
    });

    // Cancel is a refund in full and Refund hands money back: both are
    // `order:refund`'s (B16), as on Order Detail.
    if (money && row.payment === "UNPAID") {
        if (can.refund) {
            items.push({
                kind: "cancel",
                label: "Cancel order…",
                disabled:
                    row.status === "CANCELLED"
                        ? "It's cancelled."
                        : row.status === "PENDING" ||
                            row.status === "PROCESSING"
                          ? null
                          : "It's been handed over.",
            });
        }
    } else if (money && can.refund) {
        items.push({
            kind: "refund",
            label: "Refund…",
            href: orderPageHref(row.store.id, row.id, "refund"),
            disabled: row.payment === "REFUNDED" ? "Refunded in full." : null,
        });
    }

    return items;
}

/**
 * What the pay-link item does. A link already out is replaced, after the
 * confirm ("the link you sent before stops working"), even when this menu
 * made it a moment ago — re-copying the old address would leave the item
 * saying "New pay link" and making none. With none out, one is made.
 */
export function payLinkAction(item: { replaces: boolean }): "replace" | "make" {
    return item.replaces ? "replace" : "make";
}

/**
 * The quick view's steps as chips: done, the one it is at, still to come —
 * or, for an order that ended, every step still to come and then
 * "Refunded" or "Cancelled".
 */
export function quickSteps(
    order: Pick<OrderRead, "steps" | "stepIndex" | "refundStanding" | "status">,
): { label: string; state: "done" | "now" | "todo" | "ended" }[] {
    const ended =
        order.refundStanding === "REFUNDED"
            ? "Refunded"
            : order.status === "CANCELLED"
              ? "Cancelled"
              : null;
    // An order that ended stands at none of its steps (the design's).
    const at = ended ? -1 : order.stepIndex;
    const chips = order.steps.map((s, i) => ({
        label: s.label,
        state:
            at === -1 || i > at
                ? ("todo" as const)
                : i === at
                  ? ("now" as const)
                  : ("done" as const),
    }));
    return ended
        ? [...chips, { label: ended, state: "ended" as const }]
        : chips;
}

/**
 * The quick view's Payment line, only with money: "Refund on its way"
 * (B9), "Refunded", "Waiting for Razorpay · ₹480 to collect" (#122),
 * "₹480 not paid yet", "Payment failed", "Paid by hand", "Partly refunded"
 * or "Paid".
 */
export function quickPayment(
    order: Pick<OrderRead, "paymentStatus" | "refundStanding" | "money"> &
        Partial<Pick<OrderRead, "onlinePayment">>,
    format: (amount: string) => string,
): string | null {
    const m = order.money;
    if (!m) return null;
    // Accepted by the provider, not confirmed yet (B9, DEC-067).
    if ((m.refundsOnTheWay ?? []).length > 0) return "Refund on its way";
    if (order.refundStanding === "REFUNDED") return "Refunded";
    // Failed, waiting for the provider or not finished (#122): the API
    // sends it only while something is owed.
    if (order.onlinePayment) {
        const words = onlinePaymentWords(order.onlinePayment, true);
        return `${words.word} · ${format(m.due)} to collect`;
    }
    if (order.paymentStatus === "FAILED") {
        return `Payment failed · ${format(m.due)} to collect`;
    }
    if (order.paymentStatus === "UNPAID" && Number(m.due) > 0) {
        return `${format(m.due)} not paid yet`;
    }
    if (order.refundStanding === "PARTLY_REFUNDED") {
        return `Paid · ${format(m.refunded)} refunded`;
    }
    return m.recordedByHand ? "Paid by hand" : "Paid";
}
