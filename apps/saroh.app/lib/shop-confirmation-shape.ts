import type {
    OrderConfirmationData,
    OrderConfirmationLine,
    OrderConfirmationLookup,
} from "@saroh/site-blocks";

/**
 * The order confirmation page's answer (round-2 P4), checked and rebuilt
 * field by field before the page sees it: nothing the API didn't mean to
 * send reaches the customer's page. Kept apart from the read, which needs
 * the request's headers, so it is tested without them.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
const isString = (v: unknown): v is string => typeof v === "string";
const orNull = (v: unknown): string | null | undefined =>
    v === null ? null : isString(v) ? v : undefined;

function lineOf(v: unknown): OrderConfirmationLine | null {
    if (!isRecord(v)) return null;
    const variant = orNull(v.variant);
    if (
        !isString(v.name) ||
        variant === undefined ||
        typeof v.quantity !== "number" ||
        !Number.isInteger(v.quantity) ||
        !isString(v.amount)
    ) {
        return null;
    }
    return { name: v.name, variant, quantity: v.quantity, amount: v.amount };
}

function fulfilmentOf(v: unknown): OrderConfirmationData["fulfilment"] | null {
    if (!isRecord(v) || !isString(v.type) || !isString(v.label)) return null;
    let pickup: OrderConfirmationData["fulfilment"]["pickup"] = null;
    if (v.pickup !== null) {
        if (!isRecord(v.pickup) || !isString(v.pickup.name)) return null;
        const address = orNull(v.pickup.address);
        if (address === undefined) return null;
        // When the place is open (UX-025); absent from an older API.
        const hours = isString(v.pickup.hours) ? v.pickup.hours : null;
        pickup = {
            name: v.pickup.name,
            address,
            ...(hours ? { hours } : {}),
        };
    }
    let deliverTo: OrderConfirmationData["fulfilment"]["deliverTo"] = null;
    if (v.deliverTo !== null) {
        if (!isRecord(v.deliverTo)) return null;
        const name = orNull(v.deliverTo.name);
        const lines = v.deliverTo.lines;
        if (
            name === undefined ||
            !Array.isArray(lines) ||
            !lines.every(isString)
        ) {
            return null;
        }
        deliverTo = { name, lines: [...lines] };
    }
    return { type: v.type, label: v.label, pickup, deliverTo };
}

/** The confirmation, rebuilt from what the API sent, or null. */
export function confirmationOf(body: unknown): OrderConfirmationData | null {
    if (!isRecord(body) || !Array.isArray(body.lines)) return null;
    const lines = body.lines.map(lineOf);
    if (lines.some((l) => l === null)) return null;
    const delivery = orNull(body.delivery);
    const discount = orNull(body.discount);
    const fulfilment = fulfilmentOf(body.fulfilment);
    if (
        !isString(body.orderNumber) ||
        !isString(body.placedAt) ||
        !isString(body.currency) ||
        !isString(body.subtotal) ||
        !isString(body.total) ||
        delivery === undefined ||
        discount === undefined ||
        typeof body.refunded !== "boolean" ||
        !fulfilment
    ) {
        return null;
    }
    return {
        orderNumber: body.orderNumber,
        placedAt: body.placedAt,
        currency: body.currency,
        lines: lines as OrderConfirmationLine[],
        subtotal: body.subtotal,
        delivery,
        discount,
        // The code that took it off (DEC-104); absent from an older API.
        discountCode:
            isString(body.discountCode) &&
            /^[A-Z0-9_-]{1,32}$/.test(body.discountCode)
                ? body.discountCode
                : null,
        total: body.total,
        fulfilment,
        refunded: body.refunded,
        // Placed to be paid at the handover; absent from an older API.
        toPay: isString(body.toPay) ? body.toPay : null,
    };
}

/** The page's lookup, from the API's status and body. */
export function confirmationLookup(
    status: number,
    body: unknown,
): OrderConfirmationLookup {
    if (status === 401) return { ok: false, reason: "signed-out" };
    if (status === 404) return { ok: false, reason: "missing" };
    if (status !== 200) return { ok: false, reason: "unavailable" };
    const order = confirmationOf(body);
    return order ? { ok: true, order } : { ok: false, reason: "unavailable" };
}

/** An order reference as the API makes them: letters, digits, - and _. */
export function isOrderRef(ref: string): boolean {
    return /^[A-Za-z0-9_-]{1,64}$/.test(ref);
}
