import { BadRequestException, ConflictException } from "@nestjs/common";

import type {
    FulfilmentType,
    OrderFulfilment,
    OrderStage,
    OrderStatus,
} from "./dto";
import { FULFILMENT_TYPES } from "./dto";

/**
 * How an order leaves, and the steps it takes to get there (DEC-045).
 *
 * Pure, like `order-stage.ts`: no Nest DI, no Prisma. One table holds each
 * type's steps, handover, default late threshold, ticket and done word, and
 * the kitchen moves it makes, each mapped onto the order statuses that
 * already exist (ADR-008's "status values stay"). A step word changes here
 * and nowhere else: the app draws what the API sends, and keeps no copy.
 *
 * Every reader goes through {@link typeOf}; nothing compares the raw enum.
 * The types came in by expand and contract over three releases
 * (`docs/architecture/ORDER_FULFILMENT_ROLLOUT.md`):
 *
 *   1 · expand (B2a)   values added beside the legacy COLLECT and DELIVERY
 *   2 · switch (B2c)   rows backfilled; writes and the new types open
 *   3 · contract (B2d) COLLECT and DELIVERY dropped
 *                      (`20261013100000_order_fulfilment_contract`)
 *
 * What stays of the old way is a stage, not a value: a local delivery
 * handed to a courier before the switch keeps HANDED_TO_COURIER and moves
 * on from it (the legacy move below).
 */

export { FULFILMENT_TYPES } from "./dto";
export type { FulfilmentType } from "./dto";

/** The ways a storefront itself offers; the rest follow the product. */
export const STOREFRONT_FULFILMENT_TYPES = [
    "PICKUP",
    "LOCAL_DELIVERY",
    "SHIPPING",
] as const satisfies readonly FulfilmentType[];
export type StorefrontFulfilmentType =
    (typeof STOREFRONT_FULFILMENT_TYPES)[number];

/** One kitchen move, and the status move it is. */
export interface StageMove {
    from: OrderStage;
    to: OrderStage;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    /**
     * A move the status table's legacy PATCH never makes (Digital's paid →
     * sent, PENDING → DELIVERED in one step): the kitchen table vouches for
     * it, so the status table isn't asked.
     */
    direct?: true;
}

/** A step as the screen draws it: the stage it stands for and its word. */
export interface FulfilmentStep {
    stage: OrderStage;
    label: string;
}

interface TypeRule {
    /** "Pick-up" — the type's name on screen. */
    label: string;
    /** "a pick-up order" — for a sentence. */
    noun: string;
    steps: readonly FulfilmentStep[];
    /** The stages at which it has left the business (and after). */
    handedOver: readonly OrderStage[];
    /** The stage that ends it. */
    done: OrderStage;
    doneWord: string;
    /**
     * When an open order counts as late, in minutes from when it was placed
     * (default 16). The storefront's own setting replaces it (B17). Null:
     * never late (Digital), or judged by its visits (appointments).
     */
    lateAfterMinutes: number | null;
    /** What the printed ticket is called; null when nothing is printed. */
    ticketName: string | null;
    /** Finished by its visits (bookings), not by kitchen moves. */
    visits: boolean;
    moves: readonly StageMove[];
}

const PREPARE: readonly StageMove[] = [
    {
        from: "NEW",
        to: "PREPARING",
        fromStatus: "PENDING",
        toStatus: "PROCESSING",
    },
    {
        from: "PREPARING",
        to: "READY",
        fromStatus: "PROCESSING",
        toStatus: "PROCESSING",
    },
];

const BOOKED_ATTENDED: readonly FulfilmentStep[] = [
    { stage: "NEW", label: "Booked" },
    { stage: "DELIVERED", label: "Attended" },
];

/** The table (DEC-045; the designs' `FULFIL`). */
export const FULFILMENT_RULES: Readonly<Record<FulfilmentType, TypeRule>> = {
    PICKUP: {
        label: "Pick-up",
        noun: "a pick-up order",
        steps: [
            { stage: "NEW", label: "New" },
            { stage: "PREPARING", label: "Preparing" },
            { stage: "READY", label: "Ready" },
            { stage: "COLLECTED", label: "Collected" },
        ],
        handedOver: ["COLLECTED"],
        done: "COLLECTED",
        doneWord: "Collected",
        lateAfterMinutes: 120,
        ticketName: "Order ticket",
        visits: false,
        moves: [
            ...PREPARE,
            {
                from: "READY",
                to: "COLLECTED",
                fromStatus: "PROCESSING",
                toStatus: "DELIVERED",
            },
        ],
    },
    LOCAL_DELIVERY: {
        label: "Local delivery",
        noun: "a local delivery",
        steps: [
            { stage: "NEW", label: "New" },
            { stage: "PREPARING", label: "Preparing" },
            { stage: "READY", label: "Ready" },
            { stage: "OUT_FOR_DELIVERY", label: "Out for delivery" },
            { stage: "DELIVERED", label: "Delivered" },
        ],
        // HANDED_TO_COURIER is its handover too: every delivery before the
        // switch release went that way, and keeps its history.
        handedOver: ["OUT_FOR_DELIVERY", "HANDED_TO_COURIER", "DELIVERED"],
        done: "DELIVERED",
        doneWord: "Delivered",
        lateAfterMinutes: 24 * 60,
        ticketName: "Packing slip",
        visits: false,
        moves: [
            ...PREPARE,
            {
                from: "READY",
                to: "OUT_FOR_DELIVERY",
                fromStatus: "PROCESSING",
                toStatus: "SHIPPED",
            },
            {
                from: "OUT_FOR_DELIVERY",
                to: "DELIVERED",
                fromStatus: "SHIPPED",
                toStatus: "DELIVERED",
            },
            // Legacy: a delivery already with a courier on switch day (B2c)
            // moves on from where it is. Never offered from READY, and kept
            // for good (B2d too) — old orders keep their stage.
            {
                from: "HANDED_TO_COURIER",
                to: "DELIVERED",
                fromStatus: "SHIPPED",
                toStatus: "DELIVERED",
            },
        ],
    },
    SHIPPING: {
        label: "Shipping",
        noun: "a shipping order",
        steps: [
            { stage: "NEW", label: "New" },
            { stage: "PREPARING", label: "Preparing" },
            { stage: "READY", label: "Ready" },
            { stage: "HANDED_TO_COURIER", label: "Handed to courier" },
            { stage: "DELIVERED", label: "Delivered" },
        ],
        handedOver: ["HANDED_TO_COURIER", "DELIVERED"],
        done: "DELIVERED",
        doneWord: "Delivered",
        lateAfterMinutes: 48 * 60,
        ticketName: "Packing slip",
        visits: false,
        moves: [
            ...PREPARE,
            {
                from: "READY",
                to: "HANDED_TO_COURIER",
                fromStatus: "PROCESSING",
                toStatus: "SHIPPED",
            },
            {
                from: "HANDED_TO_COURIER",
                to: "DELIVERED",
                fromStatus: "SHIPPED",
                toStatus: "DELIVERED",
            },
        ],
    },
    DIGITAL: {
        label: "Digital",
        noun: "a digital order",
        // NEW is drawn "Paid": the first move needs the payment anyway.
        steps: [
            { stage: "NEW", label: "Paid" },
            { stage: "SENT", label: "Sent" },
        ],
        handedOver: ["SENT"],
        done: "SENT",
        doneWord: "Sent",
        lateAfterMinutes: null,
        ticketName: null,
        visits: false,
        moves: [
            {
                from: "NEW",
                to: "SENT",
                fromStatus: "PENDING",
                toStatus: "DELIVERED",
                direct: true,
            },
        ],
    },
    APPOINTMENT_IN_PERSON: {
        label: "Appointment, in person",
        noun: "an appointment",
        steps: BOOKED_ATTENDED,
        // The first attended visit, which the visits (E9) record.
        handedOver: ["DELIVERED"],
        done: "DELIVERED",
        doneWord: "Attended",
        lateAfterMinutes: null,
        ticketName: null,
        visits: true,
        moves: [],
    },
    APPOINTMENT_ONLINE: {
        label: "Appointment, online",
        noun: "an appointment",
        steps: BOOKED_ATTENDED,
        handedOver: ["DELIVERED"],
        done: "DELIVERED",
        doneWord: "Attended",
        lateAfterMinutes: null,
        ticketName: null,
        visits: true,
        moves: [],
    },
};

const isType = (v: string): v is FulfilmentType =>
    (FULFILMENT_TYPES as readonly string[]).includes(v);

/**
 * The type a stored (or sent) value is. Since the contract release (B2d)
 * the column holds only the six types, so the legacy words COLLECT and
 * DELIVERY are unknown here like anything else: a bug, not a guess.
 */
export function typeOf(stored: string): FulfilmentType {
    if (isType(stored)) return stored;
    throw new Error(`Unknown order fulfilment: ${stored}`);
}

/**
 * Whether the order goes to the customer's address: its bill-to address
 * and its GST place of supply come from the delivery address (U5).
 */
export function shipsToAddress(type: FulfilmentType): boolean {
    return type === "LOCAL_DELIVERY" || type === "SHIPPING";
}

/**
 * What a create or an edit stores for a type: the type itself, except an
 * appointment, which is made by booking it and finished by its visits (E9
 * writes it), never typed into an order.
 */
export function storedValueFor(type: FulfilmentType): OrderFulfilment {
    if (FULFILMENT_RULES[type].visits) {
        throw new BadRequestException({
            message:
                "An appointment is made by booking it, not by adding an order.",
            field: "fulfilment",
        });
    }
    return type;
}

/** The moves a type makes. */
export function movesFor(type: FulfilmentType): readonly StageMove[] {
    return FULFILMENT_RULES[type].moves;
}

/**
 * The steps an order of this type shows, at this stage. A local delivery
 * handed to a courier the old way (before the switch release) shows
 * "Handed to courier" where "Out for delivery" would be, so the step it is
 * at is on the list.
 */
export function stepsFor(
    type: FulfilmentType,
    stage: OrderStage,
): FulfilmentStep[] {
    const steps = [...FULFILMENT_RULES[type].steps];
    const legacyHandover =
        type === "LOCAL_DELIVERY" && stage === "HANDED_TO_COURIER";
    return legacyHandover
        ? steps.map((s): FulfilmentStep =>
              s.stage === "OUT_FOR_DELIVERY"
                  ? { stage: "HANDED_TO_COURIER", label: "Handed to courier" }
                  : s,
          )
        : steps;
}

/**
 * Where on its steps an order stands. A stage that isn't one of the type's
 * steps (one the legacy status PATCH wrote) reads as done if it ends an
 * order, else as the first step.
 */
export function stepIndexOf(
    steps: readonly FulfilmentStep[],
    stage: OrderStage,
): number {
    const at = steps.findIndex((s) => s.stage === stage);
    if (at >= 0) return at;
    return ["COLLECTED", "DELIVERED", "SENT"].includes(stage)
        ? steps.length - 1
        : 0;
}

/** Whether the order has left the business: from its handover on. */
export function isHandedOver(type: FulfilmentType, stage: OrderStage): boolean {
    return FULFILMENT_RULES[type].handedOver.includes(stage);
}

/**
 * Whether the order goes by courier, at the stage it is at: its steps have a
 * "Handed to courier". A shipment does; so does a local delivery handed
 * over the old way, before the switch release. A pick-up, a
 * digital order and an appointment never do. Its courier's name and tracking
 * number belong to that step (DEC-045).
 */
export function goesByCourier(stored: string, stage: OrderStage): boolean {
    return stepsFor(typeOf(stored), stage).some(
        (s) => s.stage === "HANDED_TO_COURIER",
    );
}

/** What every order read answers about how it leaves. */
export interface FulfilmentView {
    fulfilmentType: FulfilmentType;
    /** "Pick-up", "Local delivery"… */
    fulfilmentLabel: string;
    steps: FulfilmentStep[];
    stepIndex: number;
    /** Null when nothing is printed (Digital, appointments). */
    ticketName: string | null;
}

/** The fields an order read carries, from the stored value and stage. */
export function fulfilmentView(
    stored: string,
    stage: OrderStage,
): FulfilmentView {
    const type = typeOf(stored);
    const steps = stepsFor(type, stage);
    return {
        fulfilmentType: type,
        fulfilmentLabel: FULFILMENT_RULES[type].label,
        steps,
        stepIndex: stepIndexOf(steps, stage),
        ticketName: FULFILMENT_RULES[type].ticketName,
    };
}

/**
 * A stored list read as the storefront's ways, in table order: anything
 * that isn't a storefront's own way is left out.
 *
 * Given the row's two toggles, an empty list is read from them instead
 * (O-3): the image before B2a, still serving while the migration deploys,
 * creates a settings row without the column, which takes its `[]` default
 * rather than the backfill. A list saved empty on purpose turned both
 * toggles off with it (`fulfilmentPatch`), so it still reads as none.
 */
export function storefrontTypesOf(
    stored: readonly string[],
    toggles?: { collectionEnabled: boolean; shippingEnabled: boolean },
): StorefrontFulfilmentType[] {
    if (stored.length === 0 && toggles) {
        return storefrontTypesFrom({ ...toggles, localDelivery: false });
    }
    const types = new Set(stored.map(typeOf));
    return STOREFRONT_FULFILMENT_TYPES.filter((t) => types.has(t));
}

/**
 * The ways a storefront offers before it saves any settings — the column
 * defaults: collection off, shipping on.
 */
export const NEW_STOREFRONT_TYPES: StorefrontFulfilmentType[] = ["SHIPPING"];

/**
 * The ways a storefront offers, from its two toggles and whether it has
 * ever delivered — the rule the backfill used (20261009130001), applied
 * when an app from before B17's chips saves a toggle. Always in table
 * order.
 */
export function storefrontTypesFrom(settings: {
    collectionEnabled: boolean;
    shippingEnabled: boolean;
    localDelivery: boolean;
}): StorefrontFulfilmentType[] {
    return STOREFRONT_FULFILMENT_TYPES.filter((t) =>
        t === "PICKUP"
            ? settings.collectionEnabled
            : t === "SHIPPING"
              ? settings.shippingEnabled
              : settings.localDelivery,
    );
}

/**
 * The ways a product can be set to (B12): a storefront's three, and
 * Digital, which follows the product rather than the storefront. Never an
 * appointment — a service is booked, and is never a Product (DEC-050) —
 * and never a legacy word.
 */
export const PRODUCT_FULFILMENT_TYPES = [
    ...STOREFRONT_FULFILMENT_TYPES,
    "DIGITAL",
] as const satisfies readonly FulfilmentType[];
export type ProductFulfilmentType = (typeof PRODUCT_FULFILMENT_TYPES)[number];

const isProductType = (t: FulfilmentType): t is ProductFulfilmentType =>
    (PRODUCT_FULFILMENT_TYPES as readonly string[]).includes(t);

/**
 * A product's stored list, as its ways in table order: anything a product
 * can't be set to is left out. Empty stays empty: every way its storefronts
 * offer.
 */
export function productTypesOf(
    stored: readonly string[],
): ProductFulfilmentType[] {
    const types = new Set(stored.map(typeOf));
    return PRODUCT_FULFILMENT_TYPES.filter((t) => types.has(t));
}

/** What an order line says about how its product may leave. */
export interface ItemFulfilment {
    /** The product's name, for the sentence that refuses it. */
    name: string;
    /** `Product.fulfilmentTypes` as stored; empty means no limit of its own. */
    fulfilmentTypes: readonly string[];
}

/**
 * The types an order of these items can take at a storefront offering
 * `storefront` (B12; default 15): those every item allows, and the
 * storefront offers when it is one of its own ways. An item with no list
 * of its own allows whatever the storefront offers; Digital is offered
 * only when every item lists it. In table order. The API answers this to
 * New order (B13), the change sheet (B9) and the shop (G13); the app keeps
 * no copy.
 */
export function allowedTypes(
    items: readonly ItemFulfilment[],
    storefront: readonly StorefrontFulfilmentType[],
): ProductFulfilmentType[] {
    return PRODUCT_FULFILMENT_TYPES.filter(
        (t) =>
            (t === "DIGITAL"
                ? items.length > 0
                : (storefront as readonly string[]).includes(t)) &&
            items.every((item) => itemAllows(item, t)),
    );
}

/** Whether a line's product allows a type: its own list, or no list. */
function itemAllows(item: ItemFulfilment, type: FulfilmentType): boolean {
    const own = productTypesOf(item.fulfilmentTypes);
    if (own.length === 0) return type !== "DIGITAL";
    return isProductType(type) && own.includes(type);
}

/** "Pick-up", "Pick-up and Local delivery", "A, B and C". */
function typeList(types: readonly FulfilmentType[]): string {
    const words = types.map((t) => FULFILMENT_RULES[t].label);
    return words.length <= 1
        ? (words[0] ?? "")
        : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Refuses an order of `type` when one of its items' products doesn't allow
 * it (B12): 409 naming the first such item and what it does allow. Only a
 * product's own list refuses — an item with none leaves the order as it
 * was before B12 (an empty list behaves as today), and the storefront's
 * ways are not checked here.
 */
export function assertItemsAllow(
    items: readonly ItemFulfilment[],
    type: FulfilmentType,
): void {
    for (const item of items) {
        const own = productTypesOf(item.fulfilmentTypes);
        if (own.length === 0 || (isProductType(type) && own.includes(type)))
            continue;
        throw new ConflictException({
            message: `${item.name} isn't sold for ${FULFILMENT_RULES[type].label}. It allows ${typeList(own)} only.`,
            field: "fulfilment",
        });
    }
}

/**
 * The stored values a filter by type matches: each type once, in table
 * order. Since the contract release (B2d) a type is stored as itself.
 */
export function storedValuesOf(values: readonly string[]): OrderFulfilment[] {
    const types = new Set(values.map(typeOf));
    return FULFILMENT_TYPES.filter((v) => types.has(v));
}

/**
 * When a storefront's orders count as late, in minutes from when each was
 * placed, per way it offers (default 16; DEC-045). Each storefront sets its
 * own on its settings (B17); `late-thresholds.ts` reads them.
 */
export type LateThresholds = Readonly<Record<StorefrontFulfilmentType, number>>;

/** The defaults: 2 hours, 24 hours and 48 hours (default 16). */
export const DEFAULT_LATE_THRESHOLDS: LateThresholds = {
    PICKUP: FULFILMENT_RULES.PICKUP.lateAfterMinutes ?? 120,
    LOCAL_DELIVERY: FULFILMENT_RULES.LOCAL_DELIVERY.lateAfterMinutes ?? 1440,
    SHIPPING: FULFILMENT_RULES.SHIPPING.lateAfterMinutes ?? 2880,
};

/**
 * The statuses and steps at which an order can be late: open (not
 * delivered, not cancelled) and not yet handed over. The Orders list's SQL
 * (`lateSql`) reads the same two lists, so a row and the Late filter never
 * disagree.
 */
export const LATE_STATUSES = ["PENDING", "PROCESSING"] as const;
export const LATE_STAGES = [
    "NEW",
    "PREPARING",
    "READY",
] as const satisfies readonly OrderStage[];

/**
 * After how many minutes an order of this type counts as late, under a
 * storefront's thresholds. Null: never (Digital), or judged by its visits
 * (appointments).
 */
export function lateAfterMinutesOf(
    type: FulfilmentType,
    thresholds: LateThresholds = DEFAULT_LATE_THRESHOLDS,
): number | null {
    if (FULFILMENT_RULES[type].lateAfterMinutes === null) return null;
    return thresholds[type as StorefrontFulfilmentType];
}

/** What every order read says about lateness. */
export interface LateView {
    /** The type's threshold at this storefront; null when it is never late. */
    lateAfterMinutes: number | null;
    /** Open, not handed over, and placed longer ago than the threshold. */
    late: boolean;
    /** Whole minutes past the threshold (at least 1); null when not late. */
    lateBy: number | null;
}

/** The facts the late rule reads from an order. */
export interface LateFacts {
    /** The stored fulfilment value. */
    fulfilment: string;
    stage: string;
    status: string;
    paymentStatus: string;
    /** When it was placed: `Order.createdAt`, paid or not (DEC-045). */
    placedAt: Date;
}

/**
 * Whether an order is late, and by how much (DEC-045). The clock starts when
 * the order was placed, for every order — a pay-later order paid an hour ago
 * is judged from when it was placed. Only an open order not yet handed over
 * can be late; Digital never is, and appointments go by their visits.
 *
 * Computed at read time and never stored, so a changed threshold re-labels
 * open orders on the next read. It measures elapsed minutes, which are the
 * same in every zone: the business's zone (DEC-033) decides how a moment is
 * shown, not how long ago it was.
 */
export function lateOf(
    order: LateFacts,
    now: Date,
    thresholds: LateThresholds = DEFAULT_LATE_THRESHOLDS,
): LateView {
    const lateAfterMinutes = lateAfterMinutesOf(
        typeOf(order.fulfilment),
        thresholds,
    );
    const open =
        (LATE_STATUSES as readonly string[]).includes(order.status) &&
        (LATE_STAGES as readonly string[]).includes(order.stage) &&
        order.paymentStatus !== "REFUNDED";
    const pastMs =
        now.getTime() -
        order.placedAt.getTime() -
        (lateAfterMinutes ?? 0) * 60_000;
    // Strictly past the threshold, as the list's SQL (`createdAt < now -
    // threshold`): an order placed exactly two hours ago isn't late yet.
    const late = open && lateAfterMinutes !== null && pastMs > 0;
    return {
        lateAfterMinutes,
        late,
        lateBy: late ? Math.max(1, Math.floor(pastMs / 60_000)) : null,
    };
}

/**
 * The stored values that are ever late, each with the storefront type whose
 * threshold it reads — for a query that judges late in SQL (the Orders
 * list). Digital and appointments are never here.
 */
export function lateStoredValues(): [
    OrderFulfilment,
    StorefrontFulfilmentType,
][] {
    return FULFILMENT_TYPES.flatMap(
        (v): [OrderFulfilment, StorefrontFulfilmentType][] => {
            const type = typeOf(v);
            return FULFILMENT_RULES[type].lateAfterMinutes === null
                ? []
                : [[v, type as StorefrontFulfilmentType]];
        },
    );
}
