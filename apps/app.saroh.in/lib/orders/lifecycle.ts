import type {
    AllergenRef,
    AllergyNote,
    Fulfilment,
    KitchenStage,
    OrderRead,
    OrderReadEvent,
    OrderReadLine,
} from "@/lib/orders/read";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

/**
 * The order lifecycle as the API enforces it (`order-state.ts`), so the
 * screen only offers moves the server will accept.
 *
 * Both machines run FORWARD ONLY: nothing goes back from shipped to
 * processing, or from paid to unpaid. That is why a payment recorded by hand
 * or a cancel asks first. The goods move through the kitchen stage below
 * instead (ADR-008), which is undone by its event rather than walked back.
 */
export const STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    PENDING: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
};

export const PAYMENT_TRANSITIONS: Record<
    PaymentStatus,
    readonly PaymentStatus[]
> = {
    UNPAID: ["PAID", "FAILED"],
    FAILED: ["PAID"],
    PAID: ["REFUNDED"],
    REFUNDED: [],
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
    PENDING: "New",
    PROCESSING: "Being prepared",
    SHIPPED: "Sent",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
    UNPAID: "Not paid",
    PAID: "Paid",
    FAILED: "Payment failed",
    REFUNDED: "Refunded",
};

export type OrderStanding =
    "UNFULFILLED" | "FULFILLED" | "REFUNDED" | "CANCELLED";

/**
 * The one word an order is summed up by — the same precedence the orders list
 * uses (`order-standing.ts`): money first, then cancellation, then the goods.
 */
export function standingOf(
    status: OrderStatus,
    paymentStatus: PaymentStatus,
): OrderStanding {
    if (paymentStatus === "REFUNDED") return "REFUNDED";
    if (status === "CANCELLED") return "CANCELLED";
    return status === "PENDING" || status === "PROCESSING"
        ? "UNFULFILLED"
        : "FULFILLED";
}

export function canCancel(status: OrderStatus): boolean {
    return STATUS_TRANSITIONS[status].includes("CANCELLED");
}

/* ------------------------------------------------------------------------
 * The kitchen flow under the status (ADR-008, "Saroh Order Detail" 1d).
 * The API decides what may happen next (`next`); these only say it.
 * --------------------------------------------------------------------- */

/** How long a Ready step or a refund is held before it is recorded. */
export const HOLD_MS = 10_000;

/** The counter's target: past this an order has waited too long. */
export const WAIT_TARGET_MIN = 20;

export const STAGE_LABEL: Record<KitchenStage, string> = {
    NEW: "New",
    PREPARING: "Preparing",
    READY: "Ready",
    COLLECTED: "Collected",
    HANDED_TO_COURIER: "Handed to courier",
    DELIVERED: "Delivered",
};

/** The button that takes an order to `to`. */
export const STEP_LABEL: Record<KitchenStage, string> = {
    NEW: "New",
    PREPARING: "Start preparing",
    READY: "Mark ready",
    COLLECTED: "Mark collected",
    HANDED_TO_COURIER: "Hand to courier",
    DELIVERED: "Mark delivered",
};

/** Every stage an order of this kind passes through, in order. */
export function flowOf(fulfilment: Fulfilment): KitchenStage[] {
    return fulfilment === "DELIVERY"
        ? ["NEW", "PREPARING", "READY", "HANDED_TO_COURIER", "DELIVERED"]
        : ["NEW", "PREPARING", "READY", "COLLECTED"];
}

/**
 * The one word the order is summed up by, beside its number. A refund in full
 * leads; a partial one does not change it (the rest of the order stands).
 */
export function kitchenStanding(order: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    refundStanding: OrderRead["refundStanding"];
}): OrderStanding {
    if (order.refundStanding === "REFUNDED") return "REFUNDED";
    return standingOf(order.status, order.paymentStatus);
}

/** Whether the kitchen still has something to do with it. */
export function isOpen(order: {
    status: OrderStatus;
    stage: KitchenStage;
    fulfilment: Fulfilment;
    refundStanding: OrderRead["refundStanding"];
}): boolean {
    if (order.status === "CANCELLED" || order.refundStanding === "REFUNDED") {
        return false;
    }
    const flow = flowOf(order.fulfilment);
    return order.stage !== flow[flow.length - 1];
}

/**
 * "Waiting 16 min" — how long an open order has waited since it was placed.
 * The kitchen works oldest-first; past the counter's target it is late.
 */
export function waiting(
    placedAt: string,
    now: number,
): { text: string; minutes: number; late: boolean } {
    const minutes = Math.max(
        0,
        Math.floor((now - Date.parse(placedAt)) / 60_000),
    );
    const text =
        minutes < 60
            ? `${minutes} min`
            : minutes < 24 * 60
              ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
              : Math.floor(minutes / (24 * 60)) === 1
                ? "1 day"
                : `${Math.floor(minutes / (24 * 60))} days`;
    return {
        text: `Waiting ${text}`,
        minutes,
        late: minutes >= WAIT_TARGET_MIN,
    };
}

export interface AllergyCheck {
    /** The customer's allergens that something in the order has or may have. */
    hits: AllergenRef[];
    /** Per line id: "May contain sesame" / "Contains sesame". */
    lines: Record<string, string>;
    /** "Sourdough loaf — may contain sesame", one per clashing line. */
    named: string[];
}

const listed = (names: string[]) =>
    names.length < 2
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The customer's allergy notes against what each line contains or may
 * contain — by allergen id, never by spelling (ADR-008). A line that
 * contains an allergen says so over one that only may.
 */
export function allergyCheck(
    lines: Pick<OrderReadLine, "id" | "name" | "allergens">[],
    notes: AllergyNote[],
): AllergyCheck {
    const theirs = new Map<string, AllergenRef>();
    for (const n of notes) for (const a of n.allergens) theirs.set(a.id, a);
    const hit = new Map<string, AllergenRef>();
    const out: AllergyCheck = { hits: [], lines: {}, named: [] };
    for (const line of lines) {
        const has = line.allergens.contains.filter((a) => theirs.has(a.id));
        const may = line.allergens.mayContain.filter((a) => theirs.has(a.id));
        const words = (list: AllergenRef[]) =>
            listed(list.map((a) => a.name.toLowerCase()));
        const text = has.length
            ? `Contains ${words(has)}`
            : may.length
              ? `May contain ${words(may)}`
              : "";
        if (!text) continue;
        for (const a of [...has, ...may]) hit.set(a.id, a);
        out.lines[line.id] = text;
        out.named.push(
            `${line.name ?? "A product that no longer exists"} — ${text.toLowerCase()}`,
        );
    }
    out.hits = Array.from(hit.values());
    return out;
}

/** A note as the contact's detail read sends it. */
export interface DetailAllergyNote {
    body: string;
    /** As written: one per name. */
    allergens: AllergenRef[];
    /**
     * Each named allergen's id on every storefront with the same name — what
     * an order from any storefront is checked against (#508 R6).
     */
    matchAllergens?: AllergenRef[];
}

/**
 * The notes `allergyCheck` reads: each note that names an allergen, with the
 * ids from every storefront so a second storefront's "Peanuts" still hits.
 * Falls back to the note's own ids if the API has not sent the wider list.
 */
export function allergyNotesFrom(rows: DetailAllergyNote[]): AllergyNote[] {
    return rows
        .filter((n) => n.allergens.length > 0)
        .map((n) => ({
            body: n.body,
            allergens: n.matchAllergens?.length
                ? n.matchAllergens
                : n.allergens,
        }));
}

export function allergenWords(list: AllergenRef[]): string {
    return listed(list.map((a) => a.name.toLowerCase()));
}

/** What a timeline step says. `money` formats an amount in minor units. */
export function eventText(
    e: OrderReadEvent,
    money: (cents: number) => string | null,
): string {
    const stage = (s: string | null) =>
        s && s in STAGE_LABEL ? STAGE_LABEL[s as KitchenStage] : (s ?? "");
    switch (e.kind) {
        case "STAGE": {
            const base =
                e.toStage === "HANDED_TO_COURIER" && e.note
                    ? `Handed to ${e.note}`
                    : stage(e.toStage);
            return e.undoneAt ? `${base} — undone` : base;
        }
        case "UNDO":
            return `Undone — back to ${stage(e.toStage).toLowerCase()}`;
        case "EDIT":
            return e.note ? `Edited · ${e.note}` : "Edited";
        case "REFUND": {
            const amount =
                typeof e.amountCents === "number" ? money(e.amountCents) : null;
            return amount ? `Refunded ${amount}` : "Refunded";
        }
        case "STATUS": {
            if (e.toStatus === "CANCELLED") return "Cancelled";
            const label =
                e.toStatus && e.toStatus in STATUS_LABEL
                    ? STATUS_LABEL[e.toStatus as OrderStatus]
                    : (e.toStatus ?? "");
            return `Marked ${label.toLowerCase()}`;
        }
        default:
            return e.note ?? "Changed";
    }
}

/** How many of a line can still be refunded. */
export function refundableQuantity(line: OrderReadLine): number {
    return Math.max(0, line.quantity - line.refundedQuantity);
}
