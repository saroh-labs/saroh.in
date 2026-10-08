import { formatMoney } from "@/lib/format/money";
import { providerName } from "@/lib/payments/providers";
import type { OrderPaymentsSummary } from "@/lib/payments/service";

import { eventText } from "./lifecycle";
import type { OrderRead } from "./read";
import { visitTimelineSteps } from "./visits";

/** One line of Order Detail's "What happened". */
export interface TimelineLine {
    key: string;
    what: string;
    at: string;
    who: string | null;
}

/**
 * Order Detail's "What happened", newest first: the order's own steps, the
 * payments taken through a provider, a treatment's visits as each was
 * marked attended (B14), and when and where it was placed. Pure.
 */
export function orderTimelineSteps(
    order: OrderRead,
    payments: OrderPaymentsSummary | null,
    currency: string,
    firstName: (name: string | null | undefined) => string,
): TimelineLine[] {
    const first = firstName(order.customer?.name);
    return [
        ...order.events.map((e) => ({
            key: e.id,
            what: eventText(e, (c) => formatMoney(c, currency)),
            at: e.at,
            who: e.actor?.name ? firstName(e.actor.name) : null,
        })),
        ...(payments?.intents ?? [])
            .filter((i) => i.status === "SUCCEEDED")
            .map((i) => ({
                key: `pay-${i.id}`,
                what: `Paid by ${providerName(i.provider)}`,
                at: i.createdAt,
                who: null,
            })),
        ...visitTimelineSteps(order.visits).map((s) => ({
            ...s,
            who: s.who ? firstName(s.who) : null,
        })),
        {
            key: "placed",
            what: order.placedOnline
                ? `Ordered on your website, from ${order.store.name}${
                      order.payOnHandover
                          ? order.fulfilmentType === "PICKUP"
                              ? " · to pay on collection"
                              : " · to pay on delivery"
                          : ""
                  }`
                : `Placed at ${order.store.name}`,
            at: order.placedAt,
            // The customer placed it themselves at the site's checkout (G13).
            who: order.placedOnline
                ? "by the customer"
                : order.customer
                  ? first
                  : null,
        },
    ].sort((a, b) => b.at.localeCompare(a.at));
}
