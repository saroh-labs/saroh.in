import { BadRequestException } from "@nestjs/common";

import type {
    FulfilmentType,
    LegacyFulfilment,
    OrderFulfilment,
    OrderStage,
    OrderStatus,
} from "./dto";
import { FULFILMENT_TYPES, ORDER_FULFILMENTS } from "./dto";

/**
 * How an order leaves, and the steps it takes to get there (DEC-045).
 *
 * Pure, like `order-stage.ts`: no Nest DI, no Prisma. One table holds each
 * type's steps, handover, default late threshold, ticket and done word, and
 * the kitchen moves it makes, each mapped onto the order statuses that
 * already exist (ADR-008's "status values stay"). A step word changes here
 * and nowhere else: the app draws what the API sends, and keeps no copy.
 *
 * The column can still hold the legacy words COLLECT and DELIVERY (an order
 * release 1 wrote while release 2 rolled out, until B2d converts it), so
 * every reader goes through {@link typeOf}; nothing compares the raw enum. The
 * types come in by expand and contract over three releases
 * (`docs/architecture/ORDER_FULFILMENT_ROLLOUT.md`):
 *
 *   1 · expand (B2a)   values added; writes only COLLECT, DELIVERY and
 *                      today's stages; reads both vocabularies
 *   2 · switch (B2c)   rows backfilled; {@link WRITES_NEW_FULFILMENT_VALUES}
 *                      on; the new types and stages open
 *   3 · contract (B2d) COLLECT and DELIVERY dropped
 */

export { FULFILMENT_TYPES } from "./dto";
export type { FulfilmentType, LegacyFulfilment } from "./dto";

/**
 * The write switch. Off in release 1: create, edit and the kitchen stored
 * only the values the image before it could read. On from release 2 (B2c),
 * whose migration (`20261011100000_order_fulfilment_switch`) rewrites every
 * row first: every write is a type's own name, a local delivery goes out for
 * delivery, and Shipping and Digital can be created. Rolling back is
 * deploying release 1's tag, which reads all of it. A constant, not an
 * environment flag: it must follow the migration, not the environment.
 */
export const WRITES_NEW_FULFILMENT_VALUES = true;

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
            // Legacy: a delivery already with a courier on switch day moves
            // on from where it is. Never offered from READY once the switch
            // is on, and kept after B2d — old orders keep their stage.
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

const LEGACY_TYPE: Readonly<Record<LegacyFulfilment, FulfilmentType>> = {
    COLLECT: "PICKUP",
    DELIVERY: "LOCAL_DELIVERY",
};

const isType = (v: string): v is FulfilmentType =>
    (FULFILMENT_TYPES as readonly string[]).includes(v);

/**
 * The type a stored (or sent) value means: COLLECT → PICKUP, DELIVERY →
 * LOCAL_DELIVERY, a type as itself. Anything else is a bug, not a guess.
 */
export function typeOf(stored: string): FulfilmentType {
    if (stored in LEGACY_TYPE) return LEGACY_TYPE[stored as LegacyFulfilment];
    if (isType(stored)) return stored;
    throw new Error(`Unknown order fulfilment: ${stored}`);
}

/**
 * The legacy word for a type, for the `fulfilment` field an app built
 * before B2a reads: whatever goes to an address is DELIVERY, the rest
 * COLLECT. Sent beside `fulfilmentType` until the contract release.
 */
export function legacyWord(type: FulfilmentType): LegacyFulfilment {
    return shipsToAddress(type) ? "DELIVERY" : "COLLECT";
}

/**
 * Whether the order goes to the customer's address: its bill-to address
 * and its GST place of supply come from the delivery address (U5).
 */
export function shipsToAddress(type: FulfilmentType): boolean {
    return type === "LOCAL_DELIVERY" || type === "SHIPPING";
}

/**
 * What a create or an edit stores for a type. With the switch on, the type
 * itself, except an appointment: it is made by booking it and finished by
 * its visits (E9 writes it), never typed into an order. With the switch
 * off, only the two types a legacy word names can be written, and they are
 * written in that word; the rest are refused.
 */
export function storedValueFor(
    type: FulfilmentType,
    writesNew: boolean = WRITES_NEW_FULFILMENT_VALUES,
): OrderFulfilment {
    if (writesNew && FULFILMENT_RULES[type].visits) {
        throw new BadRequestException({
            message:
                "An appointment is made by booking it, not by adding an order.",
            field: "fulfilment",
        });
    }
    if (writesNew) return type;
    if (type === "PICKUP" || type === "LOCAL_DELIVERY") return legacyWord(type);
    throw new BadRequestException({
        message: `${FULFILMENT_RULES[type].label} isn't available yet.`,
        field: "fulfilment",
    });
}

/**
 * The moves a type makes now. With the switch off a local delivery is still
 * handed over as today (READY → HANDED_TO_COURIER); moves OUT of the new
 * stages stay, so an order written by the switch release still moves on.
 */
export function movesFor(
    type: FulfilmentType,
    writesNew: boolean = WRITES_NEW_FULFILMENT_VALUES,
): readonly StageMove[] {
    const moves = FULFILMENT_RULES[type].moves;
    if (writesNew || type !== "LOCAL_DELIVERY") return moves;
    return moves.map((m) =>
        m.from === "READY" && m.to === "OUT_FOR_DELIVERY"
            ? { ...m, to: "HANDED_TO_COURIER" as const }
            : m,
    );
}

/**
 * The steps an order of this type shows, at this stage. A local delivery
 * handed to a courier the old way (or, before the switch, about to be)
 * shows "Handed to courier" where "Out for delivery" would be, so the step
 * it is at, or is offered next, is on the list.
 */
export function stepsFor(
    type: FulfilmentType,
    stage: OrderStage,
    writesNew: boolean = WRITES_NEW_FULFILMENT_VALUES,
): FulfilmentStep[] {
    const steps = [...FULFILMENT_RULES[type].steps];
    const legacyHandover =
        type === "LOCAL_DELIVERY" &&
        (stage === "HANDED_TO_COURIER" ||
            (!writesNew && stage !== "OUT_FOR_DELIVERY"));
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
 * "Handed to courier". A shipment does; so does a local delivery before the
 * switch release, or one handed over the old way after it. A pick-up, a
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
    /** The legacy word (COLLECT or DELIVERY), until B2d. */
    fulfilment: LegacyFulfilment;
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
        fulfilment: legacyWord(type),
        fulfilmentType: type,
        fulfilmentLabel: FULFILMENT_RULES[type].label,
        steps,
        stepIndex: stepIndexOf(steps, stage),
        ticketName: FULFILMENT_RULES[type].ticketName,
    };
}

/**
 * A stored list read as the storefront's ways, in table order: a legacy
 * word is read as its type, and anything that isn't a storefront's own way
 * is left out.
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
 * The stored values a filter by type matches: each type, and its legacy
 * word until the contract release drops it, so Pick-up finds COLLECT
 * orders. Accepts either vocabulary.
 */
export function storedValuesOf(values: readonly string[]): OrderFulfilment[] {
    const types = new Set(values.map(typeOf));
    return ORDER_FULFILMENTS.filter((v) => types.has(typeOf(v)));
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
    /** The stored fulfilment value, in either vocabulary. */
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
 * threshold it reads, under both vocabularies — for a query that judges late
 * in SQL (the Orders list). Digital and appointments are never here.
 */
export function lateStoredValues(): [
    OrderFulfilment,
    StorefrontFulfilmentType,
][] {
    return ORDER_FULFILMENTS.flatMap(
        (v): [OrderFulfilment, StorefrontFulfilmentType][] => {
            const type = typeOf(v);
            return FULFILMENT_RULES[type].lateAfterMinutes === null
                ? []
                : [[v, type as StorefrontFulfilmentType]];
        },
    );
}
