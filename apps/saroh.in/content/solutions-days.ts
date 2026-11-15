import type { WorldBusiness, WorldOrder } from "@saroh/marketing/world";

import type {
    DayHour as AnyDayHour,
    TradeDay as AnyTradeDay,
    UsedLink as AnyUsedLink,
} from "@saroh/marketing/solutions/day";
import type {
    MomentData,
    MomentTone,
    OrderMoment,
} from "@saroh/marketing/solutions/moment-types";
import type { Words } from "@saroh/marketing/solutions/words";

import type { FeatureSlug } from "./types";
import { RYE_MONDAY, WORLD } from "./world";

/** The day's shapes (`@saroh/marketing/solutions/day`), over saroh.in's features. */
export type UsedLink = AnyUsedLink<FeatureSlug>;
export type DayHour = AnyDayHour<FeatureSlug>;
export type TradeDay = AnyTradeDay<FeatureSlug>;

/**
 * The written days (DEC-221, owner 17 Nov 2026): a trade page tells its day
 * only where one is written here. Each hour's anchor is an hour of the
 * business's `day` in `world.ts` (the hour strip's lines are the world's);
 * this file holds the scene's words and its moments' data. Every name,
 * number, order and bill comes from the world, read through the helpers
 * below or written to match it (`solutions-days.test.ts` holds that).
 *
 * Boards: SOTradeDesk / SOTradePhone2 (home bakers, Rye & Co.) and
 * SLFloristDesk / SLFloristPhone2 (florists, Petal Lane).
 */

/* ------------------------------------------------------------------ shared words */

/* ------------------------------------------------------------------ Rye & Co. */

const rye = WORLD.lead;
/** "Monday 16 Nov 2026" → "Mon 16 Nov". */
const DATE = WORLD.today.replace(/^(\w{3})\w* (\d+ \w+) \d+$/, "$1 $2");
const money = WORLD.money;

function order(b: WorldBusiness, id: string): WorldOrder {
    const o = b.orders?.find((x) => x.id === id);
    if (!o) throw new Error(`${b.name} has no ${id} in world.ts`);
    return o;
}
function item(b: WorldBusiness, key: string) {
    const i = b.items.find((x) => x.key === key);
    if (!i) throw new Error(`${b.name} has no item ${key} in world.ts`);
    return i;
}
const priced = (b: WorldBusiness, key: string) => {
    const i = item(b, key);
    return `${i.price}${i.unit ? ` · ${i.unit}` : ""}`;
};
function row(
    b: WorldBusiness,
    id: string,
    status: string,
    tone: MomentTone,
    how: string,
    note: string,
): OrderMoment["rows"][number] {
    const o = order(b, id);
    return {
        customer: o.customer,
        status,
        tone,
        line: `${o.id} · ${o.items} · ${how}`,
        total: o.total,
        note,
    };
}

const neha = order(rye, "ORD-1045");
const anjali = order(rye, "ORD-1044");
const kavya = order(rye, "ORD-1048");
const bunBox = item(rye, "bun-box");
const brownies = RYE_MONDAY.stock[0];
const christmas = RYE_MONDAY.christmas.items.map((k) => item(rye, k));

/** 9 pm's Ask AI answer: in Hinglish while that claim is on, else in English. */
const top = RYE_MONDAY.topSeller;
const week = RYE_MONDAY.week;
const ASK_ROWS = [
    [bunBox.name, String(top.sold), "₹16,560"],
    [item(rye, "sourdough").name, "31", "₹6,820"],
    [item(rye, "rose-pistachio").name, "4", "₹5,800"],
    [item(rye, "black-forest").name, "6", "₹5,700"],
    ["Everything else", "", "₹13,320"],
] as const;
const askBase = {
    kind: "ask",
    more: "See the price change",
    label: `Ask AI in Saroh at 9 pm, an example: what sold most this week at ${rye.name}`,
    head: ["Item", "Sold", "Sales"],
    rows: ASK_ROWS,
    total: [`This week, ${week.orders} orders`, "", week.takings],
    sourcesLabel: "Read from",
    sources: ["Orders", "Products"],
    open: "Open in Orders",
} as const;
const RYE_ASK: Record<"hinglish" | "english", MomentData> = {
    hinglish: {
        ...askBase,
        question: "Is hafte sabse zyada kya bika?",
        answer: `${bunBox.name}: ${top.sold} box bike, ₹16,560. Poore hafte ki sales ${week.takings} rahi, ${week.orders} orders mein, pichhle hafte se 12% zyada.`,
        change: {
            ask: `Bun box ${RYE_MONDAY.priceChange.to} kar do`,
            title: "Change a price",
            item: bunBox.name,
            from: RYE_MONDAY.priceChange.from,
            to: RYE_MONDAY.priceChange.to,
            note: `Orders already placed keep ${RYE_MONDAY.priceChange.from}.`,
            confirm: "Confirm",
            cancel: "Not now",
            undo: "Changed it by mistake? Undo stays there all day.",
        },
    },
    english: {
        ...askBase,
        question: "What sold most this week?",
        answer: `${bunBox.name}: ${top.sold} boxes, ₹16,560. The week’s sales were ${week.takings} from ${week.orders} orders, ${week.change}.`,
        change: {
            ask: `Make the bun box ${RYE_MONDAY.priceChange.to}`,
            title: "Change a price",
            item: bunBox.name,
            from: RYE_MONDAY.priceChange.from,
            to: RYE_MONDAY.priceChange.to,
            note: `Orders already placed keep ${RYE_MONDAY.priceChange.from}.`,
            confirm: "Confirm",
            cancel: "Not now",
            undo: "Changed it by mistake? Undo stays there all day.",
        },
    },
};
/** Under 9 pm's answer: the plan part only while its claim is on. */
const RYE_ASK_FOOT: Words = [
    { text: "Ask AI is on Grow and Pro.", claim: "ask-ai-plans" },
    "Example figures.",
];

const RYE_DAY: TradeDay = {
    slug: "home-bakers",
    business: rye,
    intro: `Follow Monday at ${rye.name}, an example bakery on Hill Road, from the ovens at 7 to the last question at night.`,
    phoneIntro: `Follow Monday at ${rye.name}, an example bakery on Hill Road.`,
    follow: `Follow ${rye.owner}’s day`,
    date: DATE,
    example: `${rye.name}, an example bakery`,
    stripTitle: "Her day, hour by hour",
    problemsLine: `If you bake from home or a small shop, you’ll know most of these. Each one has an hour in ${rye.owner}’s day where Saroh takes care of it.`,
    hero: {
        kind: "home",
        more: "See today’s list",
        label: `${rye.owner}’s Home in Saroh at 7:02 am, an example: three cake orders to bake, one order not paid, brownie boxes running low`,
        clock: "7:02",
        greeting: `Good morning, ${rye.owner}`,
        place: `${rye.name} · Hill Road`,
        needsTitle: "Needs you",
        needs: [
            {
                icon: "order",
                title: "3 cake orders to bake today",
                line: "Collect at 11 am, 2 pm and 5 pm",
            },
            {
                icon: "bill",
                title: "1 order isn’t paid",
                line: `${anjali.customer} · ${anjali.total} · collects at 5 pm`,
                action: "Send pay link",
                warn: true,
            },
            {
                icon: "stock",
                title: "Brownie boxes are running low",
                line: `${brownies.left} left of ${brownies.of} from yesterday’s bake`,
                action: "See stock",
            },
        ],
        todayTitle: "Today",
        todayDay: "Mon",
        today: ["ORD-1041", "ORD-1043", "ORD-1044"].map((id) => {
            const o = order(rye, id);
            return {
                at: o.pickup.replace("Today ", ""),
                line: `Collect · ${o.customer} · ${o.items.replace(/ \d.*$/, "")}`,
            };
        }),
    },
    start: {
        anchor: "7am",
        line: `Before the ovens are warm, ${rye.owner} knows the three things that need her today, and what’s left from yesterday’s bake.`,
        mood: "",
        moments: [
            {
                kind: "shelf",
                more: "See what’s left from yesterday",
                label: `What’s left from yesterday’s bake at ${rye.name}, an example`,
                rows: [
                    {
                        name: item(rye, "brownie-box").name,
                        line: `Box of 6 · ${brownies.of} baked yesterday`,
                        level: `${brownies.left} left`,
                        low: true,
                    },
                    {
                        name: bunBox.name,
                        line: "Box of 6 · counted",
                        level: String(RYE_MONDAY.stock[1].left),
                    },
                    {
                        name: "Cakes",
                        line: "Made to order, never counted",
                        level: "To order",
                    },
                ],
            },
        ],
        used: [{ feature: "dashboard" }, { feature: "products" }],
    },
    hours: [
        {
            anchor: "9am",
            mood: "The buns are proving. Her phone buzzes on the flour bin.",
            title: "A WhatsApp order, written in once.",
            lead: `${neha.customer} messages for a black forest cake, 500 g, eggless, for 4 pm today. ${rye.owner} keeps chatting on WhatsApp and writes the order into Orders at 9:14 am: the time and the message for the cake go in the note. ${neha.customer.split(" ")[0]} moves pick-up to 5 pm and pays the link at 9:31 am; bill ${neha.invoice} writes itself. Her nut allergy is already on her page, so it prints on the kitchen ticket too.`,
            moments: [
                {
                    kind: "order",
                    label: `${rye.name}’s order list in Saroh at 9:14 am, an example: five open orders from WhatsApp, a call, a DM and the counter`,
                    address: "app.saroh.in · Orders",
                    title: "Orders",
                    open: "5 open",
                    rows: [
                        row(
                            rye,
                            "ORD-1045",
                            "New",
                            "new",
                            "Pick-up",
                            `Note: WhatsApp · paid 9:31 am · ${neha.invoice} · for today, 5 pm`,
                        ),
                        row(
                            rye,
                            "ORD-1041",
                            "Preparing",
                            "prep",
                            "Pick-up",
                            "Pays at pick-up · for today, 11 am",
                        ),
                        row(
                            rye,
                            "ORD-1047",
                            "Preparing",
                            "prep",
                            "Pick-up",
                            "Note: Instagram DM, 9:42 am · no sesame · for today, 12 pm",
                        ),
                        row(
                            rye,
                            "ORD-1044",
                            "Preparing",
                            "prep",
                            "Pick-up",
                            "Phone call · unpaid · for today, 5 pm",
                        ),
                        row(
                            rye,
                            "ORD-1046",
                            "Ready",
                            "ready",
                            "Pick-up",
                            "Note: Phone call · paid · for today, 9:45 am",
                        ),
                    ],
                    message: {
                        channel: "whatsapp",
                        from: neha.customer,
                        text: "Hi! Black forest, 500 g, for 4 pm today please, eggless. “Happy birthday, Maa” on top",
                        at: "8:52 am",
                    },
                    detail: {
                        title: `Order ${neha.id}`,
                        at: "9:14 am",
                        item: "Black forest cake, 500 g",
                        how: `Pick-up · today, 5 pm (moved from 4 pm) · paid 9:31 am · ${neha.invoice}`,
                        note: "Eggless. “Happy birthday, Maa” on top. Ordered on WhatsApp.",
                        flag: "No nuts",
                        initials: "NG",
                        customer: `${neha.customer} · nut allergy saved on her page`,
                    },
                    more: "See the whole order list",
                },
            ],
            used: [{ feature: "orders" }, { feature: "customers" }],
        },
        {
            anchor: "10am",
            mood: "The shop’s open. Her website has been open all night.",
            title: "A cake is ordered on her own website.",
            lead: `${rye.name}’s site is the bakery template in her colours, fonts and logo, live at ${rye.site}. Her cakes and prices come straight from Saroh. ${kavya.customer.split(" ")[0]} orders a birthday cake for Saturday while ${rye.owner} is icing, and it lands in Orders with the bill already written.`,
            moments: [
                {
                    kind: "site-order",
                    more: "See the website",
                    label: `${rye.name}’s website at ${rye.site}, an example, in the bakery template`,
                    look: rye.look ?? ({} as never),
                    address: rye.site,
                    name: rye.name,
                    nav: ["Shop", "Cakes", "Visit us"],
                    cta: "Order a cake",
                    hero: {
                        title: "Baked on Hill Road from six every morning.",
                        line: "Breads, buns and celebration cakes. Order a cake by 8 pm and collect it the next day.",
                    },
                    items: ["rose-pistachio", "bun-box", "sourdough"].map(
                        (k) => ({
                            name: item(rye, k).name,
                            price: priced(rye, k),
                        }),
                    ),
                    card: {
                        title: "New order from your website",
                        at: "10:14 am",
                        item: "Rose pistachio cake, 1 kg",
                        meta: `${kavya.customer} · collect ${kavya.pickup} · “Happy birthday” on top`,
                        lines: [
                            ["Order", kavya.id],
                            [`Paid by ${money.method}`, kavya.total],
                            [`${money.taxName} bill`, kavya.invoice],
                        ],
                        paid: "Paid",
                        after: "On Saturday’s bake list",
                    },
                },
            ],
            used: [
                { feature: "website" },
                { feature: "products" },
                {
                    label: "Bakery template",
                    href: "/templates/bakery",
                    needs: "templates",
                },
            ],
        },
        {
            anchor: "1pm",
            mood: "The lunch rush is over. Ten minutes before the next batch.",
            title: "The bun box becomes a post, in her own look.",
            lead: `She taps Share on the ${bunBox.name.toLowerCase()}. Saroh draws it as a ready post in her website’s colours, fonts and logo, with the caption written. She picks a card and posts it to Instagram from her phone.`,
            moments: [
                {
                    kind: "post",
                    more: "See the share sheet",
                    label: `Sharing the ${bunBox.name.toLowerCase()} from Saroh, an example`,
                    look: rye.look ?? ({} as never),
                    item: bunBox.name,
                    itemLine: `${bunBox.price} · ${bunBox.unit} · ${RYE_MONDAY.stock[1].left} in stock`,
                    pickTitle: "Pick a card",
                    styles: ["Photo", "Price tag", "Offer", "Simple"],
                    chosen: "Price tag",
                    captionTitle: "Caption",
                    caption: `Cardamom buns, out of the oven at 7. Boxes of 6 for ${bunBox.price} until they’re gone. Order on our site, link in bio.`,
                    captionNote: "Written from the product. Change anything.",
                    channels: ["Instagram", "WhatsApp", "Facebook"],
                    card: {
                        business: `${rye.name} · Bakery`,
                        item: bunBox.name,
                        price: bunBox.price,
                        unit: bunBox.unit,
                        site: rye.site,
                    },
                },
            ],
            after: [
                "Cakes, bun boxes, offers and her blog posts all turn into cards like these.",
                { text: "Sharing a post is free.", claim: "share-every-plan" },
                {
                    text: "With Saroh Social, an add-on, Saroh posts and schedules them for you.",
                    claim: "social-posting",
                },
            ],
            used: [{ feature: "social" }],
        },
        {
            anchor: "4pm",
            mood: `${anjali.customer.split(" ")[0]} collects her cake at five. The pay link went at seven.`,
            title: `${anjali.total} lands in her account. Saroh never touches it.`,
            lead: `${anjali.customer.split(" ")[0]} pays the link by ${money.method}. The money goes from her bank to ${rye.name}’s own ${money.provider} account, then to ${rye.owner}’s bank. Saroh sees that it’s paid, marks the order and writes the bill.`,
            moments: [
                {
                    kind: "payment",
                    label: `How ${anjali.customer.split(" ")[0]}’s ${anjali.total} reaches ${rye.owner}’s bank, an example`,
                    from: {
                        label: `${anjali.customer.split(" ")[0]}’s phone`,
                        title: anjali.total,
                        line: `Pay ${rye.name} by ${money.method} from the pay link`,
                    },
                    via: {
                        label: `Her own ${money.provider} account`,
                        title: rye.name,
                        line: `Her own merchant account. Or ${money.otherProviders}.`,
                    },
                    to: {
                        label: `${rye.owner}’s bank`,
                        title: "Current a/c",
                        line: `On ${money.provider}’s usual settlement schedule`,
                    },
                    wires: [money.method, "Settled"],
                    saroh: {
                        title: "Saroh",
                        line: `Sees the payment, marks ${anjali.id} paid and writes its bill. It never holds the money and never takes a cut of it.`,
                    },
                    paid: "Paid",
                    at: "4:06 pm",
                    after: "The “1 order isn’t paid” row on her Home is gone.",
                },
                {
                    kind: "bill",
                    more: "See the bill",
                    label: `Bill ${anjali.invoice} for ${anjali.customer}, an example, with ${money.taxName}`,
                    title: `Bill ${anjali.invoice}`,
                    state: "Paid",
                    tone: "paid",
                    from: `${rye.name} · GSTIN ${money.taxId} · ${anjali.customer}`,
                    lines: [
                        {
                            name: "Rose pistachio cake, 1 kg · HSN 1905",
                            amount: "₹1,380.95",
                        },
                    ],
                    tax: [
                        { name: "CGST 2.5%", amount: "₹34.52" },
                        { name: "SGST 2.5%", amount: "₹34.53" },
                    ],
                    totalLabel: "Total",
                    total: "₹1,450.00",
                    aside: {
                        title: "A bill for every order, without the Sunday.",
                        body: `Every paid order gets a numbered bill, sent to the customer. Add your ${money.taxName} number and bills show the tax; without one, they’re bills of supply. Write one by hand for a big office order.`,
                    },
                },
            ],
            used: [{ feature: "billing" }],
        },
        {
            anchor: "6pm",
            mood: "Shutters half down. Christmas orders start this week.",
            title: `Closing up, ${rye.owner} asks Claude to add the Christmas menu.`,
            lead: "Saroh connects to Claude, ChatGPT and other AI apps. She asks in her own words; the products go in as drafts and the menu page waits. It can only do what she can do in Saroh, and nothing changes on her website until she publishes it.",
            moments: [
                {
                    kind: "ai-app",
                    more: "See what waits as drafts",
                    label: `A chat in Claude, connected to Saroh, an example: ${rye.owner} adds the Christmas menu as drafts`,
                    app: "Claude",
                    connected: "Saroh connected",
                    ask: `Add our Christmas menu to ${rye.name}: ${christmas[0].name.toLowerCase()}, ${christmas[0].unit}, ${christmas[0].price}, and a ${christmas[1].name.toLowerCase()} for ${christmas[1].price}. Put them on a Christmas page.`,
                    acts: [
                        `Added as a draft · ${christmas[0].name}, ${christmas[0].unit}`,
                        `Added as a draft · ${christmas[1].name}`,
                        "Page drafted · Christmas menu",
                    ],
                    answer: `Done. Both are in ${rye.name}’s products as drafts, and the Christmas menu page is drafted with them. Nothing is on your website until you publish it in Saroh.`,
                    drafts: {
                        title: "Waiting for her in Saroh",
                        rows: [
                            ...christmas.map((c) => ({
                                name: `${c.name}${c.unit ? `, ${c.unit}` : ""}`,
                                line: `${c.price} · from Claude, 6:12 pm`,
                                state: "Draft",
                            })),
                            {
                                name: "Christmas menu page",
                                line: `${rye.site}${RYE_MONDAY.christmas.page}`,
                                state: "Draft",
                            },
                        ],
                        action: "Publish",
                        foot: "The site stays as it is until she taps Publish.",
                    },
                },
            ],
            note: {
                text: "Have a developer or an agency? They can read orders with an API key and hear about each paid one by webhook.",
                link: { label: "API keys and webhooks", href: "/developers" },
            },
            used: [{ feature: "ai-apps" }, { feature: "website" }],
        },
        {
            anchor: "9pm",
            mood: "Home, feet up, chai going cold. One question before bed.",
            title: [
                "She asks what sold most this week",
                { text: ", in Hinglish", claim: "ask-ai-languages" },
                ".",
            ],
            lead: [
                "Ask AI answers from her own records",
                {
                    text: ", in English, Hinglish or Hindi,",
                    claim: "ask-ai-languages",
                },
                "and shows the rows behind every number. Ask it to change something and it fills in a card for her to check. Nothing is saved until she confirms.",
            ],
            moments: [],
            claimed: {
                claim: "ask-ai-languages",
                on: [RYE_ASK.hinglish],
                off: [RYE_ASK.english],
            },
            after: RYE_ASK_FOOT,
            used: [{ feature: "ask-ai" }],
        },
    ],
    next: {
        anchor: "tue7am",
        title: "Tuesday, 7 am. It’s all waiting for her.",
        body: "Whatever happened yesterday, from the site, WhatsApp, the counter or her chat with Claude, is on one screen, most urgent first.",
        moment: {
            kind: "waiting",
            label: `${rye.name}’s Home on Tuesday at 7 am, an example`,
            business: rye.name,
            when: "Tue 17 Nov · 7:00",
            rows: [
                {
                    icon: "doc",
                    title: "Christmas menu is ready to publish",
                    line: "2 products, drafted from Claude last night",
                },
                {
                    icon: "check",
                    title: `${anjali.customer.split(" ")[0]} paid ${anjali.total}`,
                    line: `Bill ${anjali.invoice} sent to her`,
                    tone: "paid",
                },
                {
                    icon: "order",
                    title: "4 cake orders to bake today",
                    line: "2 came in from the site overnight",
                },
                {
                    icon: "stock",
                    title: "Brownie boxes sold out",
                    line: `Bake a fresh ${brownies.of} for today`,
                    tone: "warn",
                },
            ],
        },
    },
    doorLine:
        "Seven hours from the ovens at 7, with a cake ordered on the website, the Christmas menu added from Claude and a question at night.",
};

/* ------------------------------------------------------------------ Petal Lane */

const petal = WORLD.others.find((b) => b.key === "petal") ?? rye;
const kabir = order(petal, "ORD-0518");
const hotel = order(petal, "ORD-0516");
const aditi = order(petal, "ORD-0519");
const roses12 = item(petal, "red-rose-12");
const roses24 = item(petal, "red-rose-24");
const bridal = item(petal, "bridal-bouquet");
const ritika = petal.customers.find((c) => c.name === "Ritika Sen")?.name ?? "";

const PETAL_DAY: TradeDay = {
    slug: "florists",
    business: petal,
    intro: `Follow Monday at ${petal.name}, from the flower market at six to tomorrow’s rose count at night.`,
    phoneIntro: `Follow Monday at ${petal.name}, an example florist.`,
    follow: `Follow ${petal.owner}’s day`,
    date: DATE,
    example: `${petal.name}, an example florist`,
    exampleNote: `${petal.name} is an example florist, not a real shop. Its people, orders and figures are made up to show the day.`,
    stripTitle: "Her day, hour by hour",
    problemsLine: `If you sell flowers for a living, you’ll know most of these. Each one has an hour in ${petal.owner}’s day where Saroh takes care of it.`,
    hero: {
        kind: "home",
        more: "See today’s list",
        label: `${petal.name}’s Home at 6:40 am, an example, back from the flower market: three things need ${petal.owner}`,
        clock: "6:40",
        greeting: `Good morning, ${petal.owner}`,
        place: `${petal.name} · Indiranagar`,
        needsTitle: "Needs you",
        needs: [
            {
                icon: "order",
                title: "3 orders go out today",
                line: "11 am to 7 pm · 2 card messages to write",
            },
            {
                icon: "calendar",
                title: "A wedding enquiry came in last night",
                line: `${ritika} · Sun 13 Dec · reply today`,
                warn: true,
            },
            {
                icon: "bill",
                title: "The hotel’s weekly flowers aren’t paid",
                line: `${hotel.customer} · ${hotel.total} · ${hotel.invoice}`,
                action: "Send pay link",
                warn: true,
            },
        ],
    },
    start: {
        anchor: "6am",
        line: `Back from the flower market with the roses. Before the first bunch is cut, ${petal.owner} knows what needs her.`,
        mood: "",
        moments: [],
        used: [{ feature: "dashboard" }],
    },
    hours: [
        {
            anchor: "9am",
            mood: "The market roses are in buckets. Her hands are full of thorns when the phone rings.",
            title: "Twenty-four roses for tonight, card message and all.",
            lead: `${kabir.customer.split(" ")[0]} calls for his anniversary. ${petal.owner} puts it into Orders while they talk: the card message and the delivery time go in the note, and his page already says no lilies, because his wife is allergic.`,
            moments: [
                {
                    kind: "order",
                    label: `${petal.name}’s order list in Saroh, an example: five orders from a call, WhatsApp, a DM and the hotel’s weekly order`,
                    address: "app.saroh.in · Orders",
                    title: "Orders",
                    open: "5 open",
                    rows: [
                        row(
                            petal,
                            "ORD-0518",
                            "New",
                            "new",
                            "Delivery",
                            "Note: Phone call · deliver 6–7 pm, card inside",
                        ),
                        row(
                            petal,
                            "ORD-0517",
                            "Preparing",
                            "prep",
                            "Pick-up",
                            "Note: WhatsApp · for today, 5 pm",
                        ),
                        row(
                            petal,
                            "ORD-0516",
                            "Out",
                            "prep",
                            "Delivery",
                            "Note: Weekly · lobby and front desk, 11 am",
                        ),
                        row(
                            petal,
                            "ORD-0515",
                            "Ready",
                            "ready",
                            "Delivery",
                            "Note: Instagram DM · deliver 4–5 pm",
                        ),
                        row(
                            petal,
                            "ORD-0514",
                            "New",
                            "new",
                            "Pick-up",
                            "Note: WhatsApp · for Tue 17 Nov, 10 am",
                        ),
                    ],
                    message: {
                        channel: "phone",
                        from: `Phone call · ${kabir.customer}`,
                        text: "“Twenty-four red roses, the deep red, for 7 tonight. The card says: Ten years, Pooja. Happy anniversary.”",
                        at: "9:12 am · 2 min",
                    },
                    detail: {
                        title: `Order ${kabir.id}`,
                        at: "9:14 am",
                        item: `${roses24.name}, ${roses24.unit}`,
                        how: "Delivery · today, 6 to 7 pm · Indiranagar",
                        note: "Card: ‘Ten years, Pooja. Happy anniversary.’ Ring before coming up. Ordered on a call.",
                        flag: "No lilies",
                        initials: "KM",
                        customer: `${kabir.customer.split(" ")[0]} · 6 orders · ₹9,400 spent · anniversary 16 Nov, every year`,
                    },
                    more: "See the whole order list",
                },
            ],
            used: [{ feature: "orders" }, { feature: "customers" }],
        },
        {
            anchor: "11am",
            mood: "The first deliveries are out. A bride wrote in last night.",
            title: "A December bride asks for prices.",
            lead: `${ritika.split(" ")[0]} found the Weddings page on ${petal.name}’s site late last night. Her enquiry waits with the date and what she wants. ${petal.owner} sends prices from it, and Thursday is set to follow up if ${ritika.split(" ")[0]} goes quiet.`,
            moments: [
                {
                    kind: "enquiry",
                    label: `A wedding enquiry from ${petal.name}’s Weddings page, an example, answered with prices, with a follow-up set for Thursday`,
                    title: "New enquiry · Weddings page",
                    at: "10:52 pm",
                    customer: ritika,
                    what: "Wedding · Sun 13 Dec · Whitefield",
                    said: "“Mandap flowers in white and blush, and 30 table arrangements. Could you send prices?”",
                    lines: [
                        ["Came in", "Sun 15 Nov"],
                        ["Guests", "about 300"],
                    ],
                    follow: {
                        title: "Follow-up",
                        state: "Set",
                        reply: "Prices sent at 11:08 am",
                        replyMeta: "By email, from the enquiry",
                        steps: [
                            {
                                at: "Sun 10:52 pm",
                                line: "Enquiry from the Weddings page",
                            },
                            {
                                at: "Mon 11:08 am",
                                line: `${petal.owner} sends prices`,
                            },
                            {
                                at: "Thu 19 Nov",
                                line: `Follow up, if ${ritika.split(" ")[0]} hasn’t replied`,
                                next: true,
                            },
                        ],
                        next: `On ${petal.owner}’s Home on Thursday morning if there’s no reply`,
                    },
                },
            ],
            used: [{ feature: "customers" }, { feature: "website" }],
        },
        {
            anchor: "1pm",
            mood: "A quiet hour between the lunch deliveries.",
            title: `Today’s roses on Instagram, in ${petal.name}’s colours.`,
            lead: [
                `She taps Share on the ${roses12.name.toLowerCase()}. Saroh draws a ready post in her site’s colours, fonts and logo, and writes the caption: order by 3 pm for delivery tonight.`,
                { text: "Sharing is free;", claim: "share-every-plan" },
                {
                    text: "Saroh Social, an add-on, can post and schedule for her.",
                    claim: "social-posting",
                },
            ],
            moments: [
                {
                    kind: "post",
                    more: "See the share sheet",
                    label: `Sharing the ${roses12.name.toLowerCase()} from Saroh, an example`,
                    look: petal.look ?? ({} as never),
                    item: roses12.name,
                    itemLine: `${roses12.price} · ${roses12.unit} · made to order`,
                    pickTitle: "Pick a card",
                    styles: ["Photo", "Price tag", "Offer", "Simple"],
                    chosen: "Price tag",
                    captionTitle: "Caption",
                    caption: `Deep red roses, 12 stems for ${roses12.price} or 24 for ${roses24.price}. Order on our site by 3 pm for delivery tonight in Indiranagar.`,
                    captionNote: "Written from the product. Change anything.",
                    channels: ["Instagram", "WhatsApp", "Facebook"],
                    card: {
                        business: petal.name,
                        item: roses12.name,
                        price: roses12.price,
                        unit: roses12.unit,
                        site: petal.site,
                    },
                },
            ],
            used: [{ feature: "social" }],
        },
        {
            anchor: "3pm",
            mood: "The post has been up two hours. The 3 pm cut-off is close.",
            title: "Lilies for tonight, paid before she sees the order.",
            lead: `${aditi.customer.split(" ")[0]} orders a mixed lily bouquet on ${petal.site} for her mother, delivered tonight. The site is in ${petal.name}’s own look, with bouquets and prices straight from Saroh. The order lands paid, its bill written.`,
            moments: [
                {
                    kind: "site-order",
                    more: "See the website",
                    label: `${petal.name}’s website at ${petal.site}, an example`,
                    look: petal.look ?? ({} as never),
                    address: petal.site,
                    name: petal.name,
                    nav: ["Bouquets", "Weddings"],
                    cta: "Order flowers",
                    hero: {
                        title: "Fresh from the market at six.",
                        line: "Order by 3 pm for delivery tonight in Indiranagar and Koramangala.",
                    },
                    items: ["red-rose-12", "mixed-lily", "table-flowers"].map(
                        (k) => ({
                            name: item(petal, k).name,
                            price: priced(petal, k),
                        }),
                    ),
                    card: {
                        title: "New order from your website",
                        at: "2:41 pm",
                        item: "Mixed lily bouquet, 12 stems",
                        meta: `${aditi.customer} · for her mother in Koramangala · today, 6 to 8 pm`,
                        lines: [
                            ["Order", aditi.id],
                            [`Paid by ${money.method}`, aditi.total],
                            ["Bill", aditi.invoice],
                        ],
                        paid: "Paid",
                        after: "On tonight’s delivery run",
                    },
                },
            ],
            used: [{ feature: "website" }, { feature: "products" }],
        },
        {
            anchor: "4pm",
            mood: "Monday is when the hotel’s front desk settles the week.",
            title: "The hotel’s weekly flowers, paid to her own account.",
            lead: `${hotel.customer} pays this week’s ${hotel.total} from the link by ${money.method}, into ${petal.name}’s own ${money.provider} account and on to ${petal.owner}’s bank. Saroh marks ${hotel.invoice} paid and sends the bill.`,
            moments: [
                {
                    kind: "payment",
                    label: `The money’s path, an example: the hotel’s ${money.method} app, to ${petal.name}’s own ${money.provider} account, to ${petal.owner}’s bank. Saroh only records it.`,
                    from: {
                        label: hotel.customer,
                        title: hotel.total,
                        line: "Pays this week’s flowers from the link",
                    },
                    via: {
                        label: `Her own ${money.provider} account`,
                        title: petal.name,
                        line: `Or ${money.otherProviders}.`,
                    },
                    to: {
                        label: `${petal.owner}’s bank`,
                        title: "Current a/c",
                        line: `On ${money.provider}’s usual settlement`,
                    },
                    wires: [money.method, "Settled"],
                    saroh: {
                        title: "Saroh",
                        line: `Sees the payment, marks ${hotel.invoice} paid and sends it to the hotel. It never holds the money and never takes a cut of it.`,
                    },
                    paid: "Paid",
                    at: "4:06 pm",
                    after: "The “hotel isn’t paid” row on her Home is gone. Next Monday, a new bill and link.",
                },
            ],
            used: [{ feature: "billing" }],
        },
        {
            anchor: "9pm",
            mood: "The shop’s dark and the buckets are rinsed. The market opens at five.",
            title: "ChatGPT counts tomorrow’s roses.",
            lead: [
                `Saroh connects to ChatGPT, Claude and other AI apps. ${petal.owner} asks in her own words; it reads her orders, counts the stems and adds the bridal bouquet to her Weddings page as a draft, which waits for her to publish.`,
                {
                    text: "Inside Saroh, Ask AI answers the same question on Grow and Pro.",
                    claim: "ask-ai-plans",
                },
            ],
            moments: [
                {
                    kind: "ai-app",
                    more: "See what waits as drafts",
                    label: `A chat in ChatGPT, connected to Saroh, an example: it counts tomorrow’s roses from ${petal.name}’s orders and adds the bridal bouquet to the Weddings page as a draft`,
                    app: "ChatGPT",
                    connected: "Saroh connected",
                    ask: `How many red roses do I need from the market tomorrow? And add the bridal bouquet, roses and orchids, ${bridal.price}, to my Weddings page.`,
                    acts: [
                        "Read Orders · Tue 17 Nov",
                        "Added a product · Bridal bouquet",
                        "Changed a page · Weddings",
                    ],
                    answer: "Tuesday has 4 red rose orders: 72 stems, two of 24 and two of 12. Wednesday to Saturday adds 10 more orders, 168 stems; the Mehra wedding is separate. The bridal bouquet is in your products and on the Weddings page, as a draft.",
                    drafts: {
                        title: "Waiting for her in Saroh",
                        rows: [
                            {
                                name: "Weddings page · 1 change",
                                line: `${petal.site}/weddings`,
                                state: "Draft",
                            },
                        ],
                        action: "Publish",
                        foot: "The site stays as it is until she taps Publish.",
                    },
                },
            ],
            used: [{ feature: "ai-apps" }, { feature: "ask-ai" }],
        },
    ],
    doorLine:
        "From the flower market at six to tomorrow’s rose count, with a wedding enquiry, a post and the hotel paying its week.",
};

export const TRADE_DAYS: readonly TradeDay[] = [RYE_DAY, PETAL_DAY];

export const tradeDay = (slug: string) =>
    TRADE_DAYS.find((d) => d.slug === slug);
