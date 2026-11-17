import type { OrdersMomentsData } from "@saroh/marketing/feature-pages/orders-moments";

import { WORLD } from "./world";

/**
 * The Orders page's own moments (saroh.in's FODesk / FOPhone2, the same
 * shape as its `content/feature-orders.ts`): where orders come from, the
 * New order sheet, and one order opened with what it moves. Global takes
 * orders at the counter and by phone, paid at pick-up or by card, so no
 * website source and no payment link. Every name, number and figure is
 * Thistlewick's (`world.ts`, examples not in the seed).
 */
const shop = WORLD.lead;
const order = (id: string) => {
    const o = shop.orders?.find((x) => x.id === id);
    if (!o) throw new Error(`${shop.name} has no ${id} in world.ts`);
    return o;
};
const item = (key: string) => {
    const i = shop.items.find((x) => x.key === key);
    if (!i) throw new Error(`${shop.name} has no item ${key} in world.ts`);
    return i;
};
const first = (name: string) => name.split(" ")[0] ?? name;
const street = shop.place.split(",")[0] ?? shop.place;

const maya = order("ORD-041");
const ben = order("ORD-045");
const loaf = item("sourdough");
const six = item("cinnamon-six");
const focaccia = item("focaccia");
const bun = item("cinnamon-bun");
/** "Phoned in at 9:14 am, …" → "9:14 am". */
const at = (s: string) => /\d{1,2}:\d\d (am|pm)/.exec(s)?.[0] ?? "";
/** "Today 11 am" → "11 am". */
const pickupAt = (s: string) => /\d{1,2}(:\d\d)? (am|pm)/.exec(s)?.[0] ?? "";

export const ORDERS_MOMENTS: OrdersMomentsData = {
    take: {
        title: "From a call and the counter, into one list.",
        lead: "You don't keep a second notebook for orders that come by phone. Type them in with New order, the same way the counter does, and they sit in one list, due first.",
        phoneLead:
            "Type phoned-in orders in with New order. They sit in one list, due first.",
        sourcesFold: "Where orders come from",
        sources: [
            {
                icon: "chat",
                title: "A call or a message",
                body: "Take it down, press New order, pick the customer and the items. It holds the stock there and then.",
                meta: `${ben.id} · ${ben.customer} · ${at(ben.placed)}`,
            },
            {
                icon: "counter",
                title: "The counter",
                body: "Cash or the card machine. Handed over on the spot.",
                meta: `${shop.owner}, at the counter`,
            },
        ],
        sheet: {
            label: `The New order sheet in Saroh, an example: ${ben.customer}'s ${focaccia.name.toLowerCase()} and buns, phoned in`,
            title: "New order",
            sub: "At the counter or on the phone.",
            groups: [
                {
                    label: "Who it's for",
                    options: [ben.customer, "Someone new", "Walk-in"],
                    chosen: 0,
                },
                {
                    label: "Items",
                    options: [`${focaccia.name} × 1`, `${bun.name} × 2`],
                    chosen: -1,
                },
                {
                    label: "How it leaves",
                    options: [`Pick-up · ${street} · ${pickupAt(ben.pickup)}`],
                    chosen: 0,
                },
                {
                    label: "How it's paid",
                    options: ["Cash", "Card machine", "Pay at pick-up"],
                    chosen: 2,
                },
            ],
            action: `Make order · ${ben.total}`,
        },
    },
    open: {
        title: "Open one, and it tells you what's next.",
        lead: `${first(maya.customer)}'s phoned-in order for an ${pickupAt(maya.pickup)} pick-up: what she asked for, everything that's happened to it, and how she'll pay.`,
        more: "See the whole order",
        record: {
            label: `Order ${maya.id} in Saroh, an example: ${maya.customer}'s ${loaf.name.toLowerCase()} and cinnamon buns, preparing`,
            id: maya.id,
            state: "Preparing",
            pickup: `Pick-up ${pickupAt(maya.pickup)}`,
            placed: `Sun, ${at(maya.placed)} · By phone · Pick-up at ${street}`,
            actions: ["Print order ticket", "Mark ready"],
            steps: ["New", "Preparing", "Ready", "Collected"],
            at: 1,
            item: {
                name: loaf.name,
                line: `${loaf.unit ?? ""} · the darker bake`,
                qty: `1 × ${loaf.price}`,
                total: loaf.price,
                photo: loaf.photo,
                flag: "Allergic to sesame · on the order and on her page",
            },
            history: [
                { what: "Preparing", when: `Today · ${shop.owner}` },
                {
                    what: "Placed by phone",
                    when: `Sun, ${at(maya.placed)} · ${shop.owner}`,
                },
            ],
            money: {
                rows: [
                    [`${loaf.name}, ${loaf.unit ?? ""}`, loaf.price],
                    [`${six.name}, ${six.unit ?? ""}`, six.price],
                ],
                total: ["Total", maya.total],
                paid: ["To pay", `${maya.total} at pick-up`],
                invoice: {
                    title: "Invoice at pick-up",
                    line: "Made from the order when it's paid",
                },
                by: ["Pays by", "Card or cash, at pick-up"],
                lands: `A card payment lands in ${shop.owner}'s own ${WORLD.money.provider} account; cash goes in the till.`,
            },
            itemsTitle: "Items",
            historyTitle: "What happened",
            moneyTitle: "Money",
        },
        around: {
            title: `What ${maya.id} moves.`,
            rows: [
                {
                    title: "Stock follows the order",
                    body: `Cakes are made to order and never counted. Bread and buns are: ${first(maya.customer)}'s loaf and box are held the moment the order is made.`,
                    from: "4",
                    to: "3",
                    what: `${six.name} boxes at ${street}`,
                    href: "/features/products",
                },
                {
                    title: "The customer is remembered",
                    body: "The order joins her page, with her sesame allergy kept on it for next time.",
                    who: maya.customer,
                    whoLine: "Allergic to sesame",
                    href: "/features/customers",
                },
                {
                    title: "The invoice is made",
                    body: "Numbered in order, in your currency, the moment it's paid.",
                    invoice: [
                        "Next: INV-0006",
                        `${maya.customer} · ${maya.total}`,
                    ],
                    href: "/features/billing",
                },
            ],
        },
    },
};
