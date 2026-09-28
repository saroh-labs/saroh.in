import type { OrderRead } from "./read";

/**
 * Who took a shipment and how to follow it (B10, DEC-045): the courier's
 * name, their tracking number and, if they gave one, a tracking link. All
 * three are typed by the team — Saroh books no courier and sends nothing —
 * and kept on the order (`Order.courierName`, `trackingNumber`,
 * `trackingUrl`, B2b).
 */

/** The couriers offered as chips; any name the order already has joins them. */
export const COURIERS = ["Delhivery", "Blue Dart", "Our own driver"] as const;

/** Taken by the business's own driver: there is no number to follow. */
export const OWN_DRIVER = "Our own driver";

/** The API's limit on the courier's name and number. */
export const COURIER_FIELD_MAX = 80;

export const isTrackingLink = (v: string) => /^https?:\/\/\S+\.\S+/.test(v);

export interface Shipment {
    courier: string | null;
    number: string | null;
    url: string | null;
    /** Our own driver took it: no number is asked for. */
    ownDriver: boolean;
    /** Whether this person may still fill in or change them. */
    canChange: boolean;
}

/**
 * What the order says about its courier, or null when it has none to say:
 * an order whose type is never handed to a courier (a pick-up, a local
 * delivery since the switch), or one not handed over yet.
 *
 * A local delivery handed to a courier before the switch (B2c) keeps its
 * "Handed to courier" step and reads like a shipment. One from before B10
 * named the courier only on its handover step, so that is read when the
 * order has no courier of its own. Once such an order is delivered its
 * steps no longer include the handover, and what it has is shown, not
 * offered for change (the API refuses it).
 */
export function shipmentOf(
    order: Pick<
        OrderRead,
        | "steps"
        | "stage"
        | "stepIndex"
        | "status"
        | "courierName"
        | "trackingNumber"
        | "trackingUrl"
        | "events"
    >,
    canStage: boolean,
): Shipment | null {
    const handover = order.steps.findIndex(
        (s) => s.stage === "HANDED_TO_COURIER",
    );
    const at =
        typeof order.stepIndex === "number"
            ? order.stepIndex
            : order.steps.findIndex((s) => s.stage === order.stage);
    const reached = handover >= 0 && at >= handover;
    const number = order.trackingNumber ?? null;
    const url = order.trackingUrl ?? null;
    const legacyNote =
        !order.courierName && !number
            ? ([...order.events]
                  .reverse()
                  .find(
                      (e) =>
                          e.kind === "STAGE" &&
                          e.toStage === "HANDED_TO_COURIER" &&
                          !e.undoneAt,
                  )?.note ?? null)
            : null;
    const courier = order.courierName ?? legacyNote;
    if (!reached && !(handover < 0 && (courier || number || url))) {
        return null;
    }
    return {
        courier,
        number,
        url,
        ownDriver: courier === OWN_DRIVER,
        canChange: canStage && reached && order.status !== "CANCELLED",
    };
}

/**
 * The chip for any other courier (B10's follow-up, taken in B8): picking it
 * asks for the courier's name, which is what the order keeps.
 */
export const OTHER_COURIER = "Other";

/**
 * The chips to offer: the usual couriers, the order's own if it's another,
 * and "Other" to type one in.
 */
export function courierChoices(current: string | null): string[] {
    const usual: string[] = [...COURIERS];
    const all =
        current && !usual.includes(current) && current !== OTHER_COURIER
            ? [current, ...usual]
            : usual;
    return [...all, OTHER_COURIER];
}

/**
 * The courier's name a draft records: the chip, or for "Other" what was
 * typed beside it. Empty when "Other" has no name yet — the panel asks.
 */
export function courierName(chip: string, typed: string): string {
    return chip === OTHER_COURIER ? typed.trim() : chip;
}

export interface CourierDraft {
    courier: string;
    number: string;
    link: string;
}

export interface CourierFields {
    courierName?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
}

/**
 * What a draft records, trimmed. Our own driver has no number or link, so
 * those go empty. Against `before` (a change after the handover), only what
 * differs is sent — each change is its own line on the timeline.
 */
export function courierFields(
    draft: CourierDraft,
    before?: Pick<Shipment, "courier" | "number" | "url">,
): CourierFields {
    const own = draft.courier === OWN_DRIVER;
    const next = {
        courierName: draft.courier.trim() || null,
        trackingNumber: own ? null : draft.number.trim() || null,
        trackingUrl: own ? null : draft.link.trim() || null,
    };
    if (!before) {
        return Object.fromEntries(
            Object.entries(next).filter(([, v]) => v !== null),
        );
    }
    const was = {
        courierName: before.courier,
        trackingNumber: before.number,
        trackingUrl: before.url,
    };
    return Object.fromEntries(
        (Object.keys(next) as (keyof typeof next)[])
            .filter((k) => next[k] !== was[k])
            .map((k) => [k, next[k]]),
    );
}

/** "Delhivery · 1487 2290 3314", as the card and the toast say it. */
export function shipmentWords(fields: {
    courier: string | null;
    number: string | null;
}): string {
    return [fields.courier, fields.number].filter(Boolean).join(" · ");
}
