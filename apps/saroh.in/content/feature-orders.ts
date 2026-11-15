import type { OrdersMomentsData } from "@/components/feature-pages/orders-moments";

import { RYE_MONDAY, WORLD } from "./world";

/**
 * The Orders page's own moments (boards FODesk / FOPhone2): the order
 * taken from WhatsApp, the site and the counter, the New order sheet, and
 * ORD-1045 opened, with what it moves. Every name, number and money figure
 * is the world's (`world.ts`, LOCKED); saroh.tech builds the same shape
 * from its own world.
 */
const rye = WORLD.lead;
const order = (id: string) => {
    const o = rye.orders?.find((x) => x.id === id);
    if (!o) throw new Error(`${rye.name} has no ${id} in world.ts`);
    return o;
};
const item = (key: string) => {
    const i = rye.items.find((x) => x.key === key);
    if (!i) throw new Error(`${rye.name} has no item ${key} in world.ts`);
    return i;
};
const first = (name: string) => name.split(" ")[0] ?? name;

const neha = order("ORD-1045");
const kavya = order("ORD-1048");
const blackForest = item("black-forest");
const roseCake = item("rose-pistachio");
const bunBox = item("bun-box");
const counter = rye.staff?.[0]?.name ?? "";
const stock = RYE_MONDAY.askAt945;
/** "Paid by link at 9:31 am" → "9:31 am". */
const at = (s: string) => /\d{1,2}:\d\d (am|pm)/.exec(s)?.[0] ?? "";
/** "Today 5 pm (moved from 4 pm at 9:20 am)" → "5 pm". */
const pickupAt = /\d{1,2}(:\d\d)? (am|pm)/.exec(neha.pickup)?.[0] ?? "";
const movedFrom = /moved from (\d{1,2}(?::\d\d)? (?:am|pm))/.exec(
    neha.pickup,
)?.[1];

const movedAt = /at (\d{1,2}:\d\d (?:am|pm))\)/.exec(neha.pickup)?.[1] ?? "";

export const ORDERS_MOMENTS: OrdersMomentsData = {
    take: {
        title: "From your website, WhatsApp and the counter, into one list.",
        lead: "You don’t keep a second notebook for WhatsApp orders. Type them in with New order, the same way the counter does, and they sit beside the ones your site took.",
        phoneLead:
            "Type WhatsApp orders in with New order. They sit beside the ones your site took.",
        sourcesFold: "Where orders come from",
        sources: [
            {
                icon: "chat",
                title: "WhatsApp or a call",
                body: "Read the message, press New order, pick the customer and the items. It holds the stock there and then.",
                meta: `${neha.id} · ${neha.customer} · ${at(neha.placed)}`,
            },
            {
                icon: "site",
                title: "Your website",
                body: "Every product on your site has its own Add to bag. The order lands at the top, already paid.",
                meta: `${kavya.id} · ${kavya.customer} · ${at(kavya.placed)}`,
                product: {
                    name: roseCake.name,
                    price: `${roseCake.price} · ${roseCake.unit ?? ""}`,
                    photo: roseCake.photo,
                    button: "Add to bag",
                },
            },
            {
                icon: "counter",
                title: "The counter",
                body: `Cash, ${WORLD.money.method} at the counter or the card machine. Handed over on the spot.`,
                meta: `${counter}, at the counter`,
            },
        ],
        sheet: {
            label: `The New order sheet in Saroh, an example: ${neha.customer}'s ${blackForest.name.toLowerCase()}, typed in from WhatsApp`,
            title: "New order",
            sub: "At the counter or on the phone.",
            groups: [
                {
                    label: "Who it’s for",
                    options: [
                        `${neha.customer} · ${neha.note ?? ""}`,
                        "Someone new",
                        "Walk-in",
                    ],
                    chosen: 0,
                },
                {
                    label: "Items",
                    options: [`${blackForest.name}, ${blackForest.unit} × 1`],
                    chosen: -1,
                },
                {
                    label: "How it leaves",
                    options: [
                        `Pick-up · ${rye.place.split(",")[0]} · ${movedFrom ?? pickupAt}`,
                        "Local delivery",
                    ],
                    chosen: 0,
                },
                {
                    label: "How it’s paid",
                    options: [
                        "Cash",
                        `${WORLD.money.method} at the counter`,
                        "Card machine",
                        "Payment link",
                        "Pay on collection",
                    ],
                    chosen: 3,
                },
            ],
            action: `Make order and send link · ${neha.total}`,
        },
    },
    open: {
        title: "Open one, and it tells you what’s next.",
        lead: `${first(neha.customer)}’s WhatsApp order for a ${pickupAt} pick-up: what she asked for, everything that’s happened to it, the invoice it made and where her money went.`,
        more: "See the whole order",
        record: {
            label: `Order ${neha.id} in Saroh, an example: ${neha.customer}'s ${blackForest.name.toLowerCase()}, paid, preparing`,
            id: neha.id,
            state: "Preparing",
            pickup: `Pick-up ${pickupAt}`,
            placed: `Today, ${at(neha.placed)} · From WhatsApp · Pick-up at ${rye.place.split(",")[0]}`,
            actions: ["Print order ticket", "Mark ready"],
            steps: ["New", "Preparing", "Ready", "Collected"],
            at: 1,
            item: {
                name: blackForest.name,
                line: `${blackForest.unit} · No nuts on top`,
                qty: `1 × ${blackForest.price}`,
                total: blackForest.price,
                photo: blackForest.photo,
                flag: `${neha.note ? neha.note.charAt(0).toUpperCase() + neha.note.slice(1) : ""} · printed on the kitchen ticket`,
            },
            history: [
                { what: "Preparing", when: `Today · ${counter}` },
                {
                    what: `Paid ${neha.total} by payment link`,
                    when: `Today, ${at(neha.paid)} · ${first(neha.customer)}`,
                },
                {
                    what: `Edited · pick-up ${movedFrom ?? ""} → ${pickupAt}`,
                    when: `Today, ${movedAt} · ${rye.owner}`,
                },
                {
                    what: "Placed from a WhatsApp message",
                    when: `Today, ${at(neha.placed)} · ${rye.owner}`,
                },
            ],
            money: {
                rows: [
                    [blackForest.name, blackForest.price],
                    ["Pick-up", "Free"],
                ],
                total: ["Total", neha.total],
                paid: ["Paid", neha.total],
                invoice: {
                    title: `Tax invoice ${neha.invoice}`,
                    line: `${WORLD.money.taxName} included`,
                },
                by: ["Paid by", "Payment link"],
                lands: `Lands in ${rye.owner}’s own ${WORLD.money.provider} account, on its payout schedule.`,
            },
            itemsTitle: "Items",
            historyTitle: "What happened",
            moneyTitle: "Money",
        },
        around: {
            title: `What ${neha.id} moves.`,
            rows: [
                {
                    title: "Stock follows the order",
                    body: `Cakes are made to order, so ${first(neha.customer)}’s isn’t counted. Boxed items are: today’s ${bunBox.name.toLowerCase()}es are held the moment each order is made.`,
                    from: String(stock.bunBoxesInStock),
                    to: String(stock.bunBoxesInStock - stock.bunBoxesNeeded),
                    what: `${bunBox.name}es at ${rye.place.split(",")[0]}`,
                    href: "/features/products",
                },
                {
                    title: "The customer is remembered",
                    body: `The order joins her page, with her ${neha.note ?? ""} kept on it for next time.`,
                    who: neha.customer,
                    whoLine: neha.note ?? "",
                    href: "/features/customers",
                },
                {
                    title: "The invoice is made",
                    body: "Numbered in order, with the right tax on each line, the moment it’s paid.",
                    invoice: [neha.invoice, `${neha.customer} · ${neha.total}`],
                    href: "/features/billing",
                },
            ],
        },
    },
};
