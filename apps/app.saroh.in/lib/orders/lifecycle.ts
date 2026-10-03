import type { StepTone } from "@/lib/orders/list-row";
import { rowProgress } from "@/lib/orders/list-row";
import type {
    AllergenRef,
    AllergyNote,
    FulfilmentStep,
    FulfilmentType,
    KitchenStage,
    OrderRead,
    OrderReadEvent,
    OrderReadLine,
} from "@/lib/orders/read";
import { REFUND_REASONS } from "@/lib/orders/refund-choice";
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

export const STAGE_LABEL: Record<KitchenStage, string> = {
    NEW: "New",
    PREPARING: "Preparing",
    READY: "Ready",
    COLLECTED: "Collected",
    HANDED_TO_COURIER: "Handed to courier",
    DELIVERED: "Delivered",
    OUT_FOR_DELIVERY: "Out for delivery",
    SENT: "Sent",
};

/** The button that takes an order to `to`. */
export const STEP_LABEL: Record<KitchenStage, string> = {
    NEW: "New",
    PREPARING: "Start preparing",
    READY: "Mark ready",
    COLLECTED: "Mark collected",
    HANDED_TO_COURIER: "Hand to courier",
    DELIVERED: "Mark delivered",
    OUT_FOR_DELIVERY: "Send out for delivery",
    SENT: "Mark sent",
};

/**
 * The steps an order passes through, in the words of its type — as the API
 * sends them (`steps`, DEC-045). The app keeps no table of its own.
 */
export function stepsOf(order: Pick<OrderRead, "steps">): FulfilmentStep[] {
    return order.steps;
}

/** Every stage an order passes through, in order. */
export function flowOf(order: Parameters<typeof stepsOf>[0]): KitchenStage[] {
    return stepsOf(order).map((s) => s.stage);
}

/**
 * Whether the order goes to the customer's address — a local delivery or a
 * shipment — so it has a delivery address and a delivery charge. Read from
 * the type (DEC-045).
 */
export function goesToAddress(order: {
    fulfilmentType: FulfilmentType;
}): boolean {
    return (
        order.fulfilmentType === "LOCAL_DELIVERY" ||
        order.fulfilmentType === "SHIPPING"
    );
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
    steps: OrderRead["steps"];
    refundStanding: OrderRead["refundStanding"];
}): boolean {
    if (order.status === "CANCELLED" || order.refundStanding === "REFUNDED") {
        return false;
    }
    const flow = flowOf(order);
    return order.stage !== flow[flow.length - 1];
}

/** "16 min", "3 h 42 min", "2 h", "1 day", "2 days". */
export function durationWords(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 24 * 60) {
        const m = minutes % 60;
        return `${Math.floor(minutes / 60)} h${m ? ` ${m} min` : ""}`;
    }
    const days = Math.floor(minutes / (24 * 60));
    return days === 1 ? "1 day" : `${days} days`;
}

/**
 * "Waiting 16 min" — how long an open order has waited since it was placed,
 * and "Late · 2 h 5 min" once the API says it is late. Late is the API's
 * (DEC-045): its type's threshold, the storefront's own once B17 lands. The
 * app keeps no threshold, so an API before B2b never says late here.
 */
export function waiting(
    order: {
        placedAt: string;
        late?: boolean;
        lateAfterMinutes?: number | null;
        fulfilmentLabel?: string;
    },
    now: number,
): {
    text: string;
    minutes: number;
    late: boolean;
    /** "Pick-up orders count as late after 2 h"; null without a rule. */
    rule: string | null;
} {
    const minutes = Math.max(
        0,
        Math.floor((now - Date.parse(order.placedAt)) / 60_000),
    );
    const late = order.late === true;
    const after = order.lateAfterMinutes;
    return {
        text: `${late ? "Late ·" : "Waiting"} ${durationWords(minutes)}`,
        minutes,
        late,
        rule:
            typeof after === "number" && order.fulfilmentLabel
                ? `${order.fulfilmentLabel} orders count as late after ${durationWords(after)}`
                : null,
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
 * The customer's allergies — their Needs attention Allergy entries, as
 * `allergyNotesOf` gives them (Z2a: never the notes) — against what each
 * line contains or may contain, by allergen id, never by spelling
 * (ADR-008). A line that contains an allergen says so over one that only may.
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
            // A change of how it leaves (B9) says it whole: "Changed from
            // Pick-up to Local delivery".
            if (e.note?.startsWith("Changed from ")) return e.note;
            return e.note ? `Edited · ${e.note}` : "Edited";
        case "REFUND": {
            const amount =
                typeof e.amountCents === "number" ? money(e.amountCents) : null;
            const said = amount ? `Refunded ${amount}` : "Refunded";
            // Why (B8): one of the sheet's reasons reads in the sentence,
            // "Refunded ₹50 · late"; words typed for Other stay as typed.
            const why = e.note?.trim();
            if (!why) return said;
            const listed = REFUND_REASONS.some((r) => r.label === why);
            return `${said} · ${listed ? why.charAt(0).toLowerCase() + why.slice(1) : why}`;
        }
        case "STATUS": {
            if (e.toStatus === "CANCELLED") {
                // Why, when a cancel gave one (B9): "Cancelled · late".
                const why = e.note?.trim();
                if (!why) return "Cancelled";
                const listed = REFUND_REASONS.some((r) => r.label === why);
                return `Cancelled · ${listed ? why.charAt(0).toLowerCase() + why.slice(1) : why}`;
            }
            // A treatment fulfilled by its visits says so whole (B14):
            // "All 3 visits attended".
            if (e.note?.trim()) return e.note.trim();
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

/**
 * What a refund of these lines could put back on the shelf ("Put N back in
 * stock", #511): each line's refundable units, up to what it sold and hasn't
 * had back. Nothing for a line not handed over yet — refunding it gives its
 * units back to the shelf on its own.
 */
export function putBackOf(
    lines: readonly OrderReadLine[],
): { itemId: string; quantity: number }[] {
    return lines.flatMap((l) => {
        const quantity = Math.min(refundableQuantity(l), l.returnable ?? 0);
        return quantity > 0 ? [{ itemId: l.id, quantity }] : [];
    });
}

/**
 * The pill beside the order's number, as the "Saroh Order Detail" design
 * draws it: the step the order is at in its type's words ("New", "Ready",
 * "Collected"), or Refunded / Cancelled, toned as the Orders list tones the
 * same step (`rowProgress`), so the list and the page never disagree.
 */
export function headerStep(
    order: Pick<
        OrderRead,
        | "status"
        | "paymentStatus"
        | "refundStanding"
        | "stage"
        | "steps"
        | "fulfilmentLabel"
    >,
): { label: string; tone: StepTone } {
    const index = order.steps.findIndex((s) => s.stage === order.stage);
    const p = rowProgress({
        standing: kitchenStanding(order),
        steps: order.steps,
        stepIndex: index === -1 ? 0 : index,
        fulfilmentLabel: order.fulfilmentLabel,
    });
    return { label: p.word, tone: p.tone };
}

/**
 * How the order leaves, in the header's words (the design): "Pick-up at
 * Hill Road" for a pick-up, else the type's own word ("Local delivery",
 * "Shipping"), with the town a delivery goes to when the address says.
 */
export function howWords(
    order: Pick<
        OrderRead,
        "fulfilmentType" | "fulfilmentLabel" | "store" | "deliveryAddress"
    >,
): string {
    if (order.fulfilmentType === "PICKUP") {
        return `${order.fulfilmentLabel} at ${order.store.name}`;
    }
    const city = goesToAddress(order) ? order.deliveryAddress?.city : null;
    return `${order.fulfilmentLabel}${city ? ` to ${city}` : ""}`;
}
