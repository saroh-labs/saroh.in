/**
 * /features/ask-ai on saroh.tech: saroh.in's Ask page (boards FADesk and
 * FAPhone2, DEC-221) at Thistlewick Bakery, Tuesday 9:45 am. Every name,
 * order, price and count comes from the world (`content/world.ts`); the
 * words around them are this file's.
 *
 * What differs from saroh.in: Ask AI is for paying plans and everyone here
 * is on Free (DEC-211), so the page says it isn't part of Free and names no
 * plan; questions are in English; one person runs the business, so there is
 * no role or staff. `stockOn` is the `ask-ai-stock` claim, as on saroh.in.
 */
import type { AskAiWords } from "@saroh/marketing/feature-pages/ask-ai/words";

import { planWords } from "./plan-words";
import { ASK_US } from "./reach-ask-us";
import { THISTLEWICK_TUESDAY, WORLD } from "./world";

const bakery = WORLD.lead;
const order = (id: string) => {
    const o = bakery.orders?.find((x) => x.id === id);
    if (!o) throw new Error(`world: no order ${id}`);
    return o;
};
const item = (key: string) =>
    bakery.items.find((i) => i.key === key)?.name ?? key;
const stock = (key: string) =>
    THISTLEWICK_TUESDAY.stock.find((s) => s.item === key)?.left ?? 0;
const first = (name: string) => name.split(" ")[0];
const cls = THISTLEWICK_TUESDAY.class;
const left = cls.places - cls.booked;
const maya = order("ORD-041");
const lucy = order("ORD-044");
const ben = order("ORD-045");
const street = bakery.place.split(",")[0];
const where = "Downtown";

/** Today's pick-ups, due first. */
const DUE = ["ORD-041", "ORD-045", "ORD-043", "ORD-044"];
const unpaid = new Set([maya.id, lucy.id]);
const paidLabel = (id: string) =>
    id === maya.id ? "Not paid" : id === lucy.id ? "Pays online" : "Paid";
const pickups = DUE.length;
const paid = DUE.length - unpaid.size;

export function askAiWords({
    stockOn,
    plansOn,
}: {
    stockOn: boolean;
    plansOn: boolean;
}): AskAiWords {
    const plan = planWords(plansOn);
    const reads = stockOn
        ? "Orders, Customers and Stock"
        : "Orders and Customers";
    return {
        name: "Ask AI",
        title: { before: "Ask across your whole ", mark: "business." },
        lede: "One Ask button sits over every screen in Saroh. Ask in your own words and the answer comes from your own records, with the rows behind it and the parts of the business it read. Then it offers the next step, and waits for your OK.",
        plan: plan.askAiHero,
        secondary: "See pricing",
        note: "Free to start. No card needed.",

        hero: {
            at: "09:45",
            moment: "Tuesday, between bakes.",
            line: `${bakery.owner} asks on Home. To answer, it read ${stockOn ? "three" : "two"} parts of ${bakery.name}.`,
            phoneLine: `Between bakes, ${bakery.owner} asks on Home.`,
            next: {
                title: "Every answer ends in a next step.",
                body: "This one is a card. Nothing changes until you press it.",
            },
            drop: "Into the answer",
            slips: {
                customers: {
                    title: "Customers",
                    sub: "Regulars",
                    rows: [
                        { name: maya.customer, end: "8 orders", hi: true },
                        { name: ben.customer, end: "5 orders" },
                        { name: lucy.customer, end: "4 orders" },
                    ],
                    note: `${first(maya.customer)} pays at pick-up.`,
                    feed: {
                        line: `${first(maya.customer)} pays at pick-up`,
                        end: "8 orders",
                    },
                },
                orders: {
                    title: "Orders",
                    sub: "Due today",
                    rows: DUE.map((id) => ({
                        id,
                        name: order(id).customer,
                        end: paidLabel(id),
                        hi: id === maya.id,
                    })),
                    feed: {
                        line: `${maya.id} · ${maya.customer}`,
                        end: "Not paid",
                    },
                },
                stock: {
                    title: "Stock",
                    sub: where,
                    head: ["Item", "In stock"],
                    rows: [
                        {
                            name: item("cinnamon-bun"),
                            end: String(stock("cinnamon-bun")),
                            hi: true,
                        },
                        {
                            name: item("sourdough"),
                            end: String(stock("sourdough")),
                            hi: true,
                        },
                        {
                            name: item("focaccia"),
                            end: String(stock("focaccia")),
                        },
                    ],
                    feed: {
                        line: item("cinnamon-bun"),
                        end: `${stock("cinnamon-bun")} in stock`,
                    },
                },
            },
            panel: {
                label: `The Ask AI panel on Home answering a question about today's orders, with the rows it read from ${reads}, and a card to mark two orders ready`,
                title: "Ask AI",
                about: `All of ${bakery.name}`,
                q: "Is everything ready for today's orders?",
                checked: `Checked your ${reads} just now`,
                lead: stockOn
                    ? `${pickups} orders are due for pick-up today, and there's stock for all of them.`
                    : `${pickups} orders are due for pick-up today.`,
                why: `${paid} are paid. ${maya.customer} pays at pick-up, and ${lucy.customer} pays online before she collects. Cakes are made to order, so they aren't counted.`,
                head: ["Order", "Customer", "Total", "Paid"],
                rows: DUE.map((id) => ({
                    id,
                    customer: order(id).customer,
                    total: order(id).total,
                    paid: paidLabel(id),
                    from: id === maya.id,
                })),
                stockHead: ["For these orders", "Needed", "In stock"],
                stockRows: [
                    {
                        name: item("cinnamon-bun"),
                        need: "8",
                        have: String(stock("cinnamon-bun")),
                    },
                    {
                        name: item("sourdough"),
                        need: "1",
                        have: String(stock("sourdough")),
                    },
                ],
                from: "Read from",
                sources: stockOn
                    ? ["Orders", "Customers", "Stock"]
                    : ["Orders", "Customers"],
                where: `· today, ${where}`,
                card: {
                    head: "Change 2 orders",
                    orders: [maya.id, ben.id],
                    title: "Mark as ready for pick-up",
                    kv: [
                        ["Orders", `${maya.id}, ${ben.id}`],
                        ["Then", "They show as Ready in Orders"],
                    ],
                    note: "The two cakes are left as they are until they're baked. Undo works all day.",
                    buttons: ["Mark 2 ready", "Pick which"],
                },
                more: "See the whole answer",
            },
            example: `An example: ${bakery.name}, a ${bakery.kind} on ${street}.`,
        },

        where: {
            id: "anywhere",
            title: "Ask from wherever you are.",
            lead: "The same button sits at the top of every screen. Open it on a page and it already knows the page, with suggestions and small hints counted from it. Opening it never runs anything. A question runs only when you tap it.",
            ask: "Ask AI",
            hintHome:
                "Hints are counted from your business. Tapping one asks, and nothing runs until you do.",
            hintPage:
                "Hints are counted from this page. Tapping one asks, and nothing runs until you do.",
            screens: [
                {
                    name: "Orders",
                    sub: "Today's list",
                    page: "/ Orders",
                    label: "Ask AI opened on Orders, about today's orders",
                    h: "Orders",
                    small: `Due today · ${pickups}`,
                    lines: DUE.map(
                        (id) =>
                            [id, unpaid.has(id) ? "Not paid" : "Paid"] as const,
                    ),
                    about: "About: Orders · today",
                    sugs: [
                        {
                            t: "Which orders go out today?",
                            h: `${pickups} due`,
                        },
                        { t: "Who hasn't paid yet?", h: "2 orders" },
                        { t: "Best sellers this month" },
                        {
                            t: "Mark today's orders ready…",
                            h: `${paid} paid`,
                            act: true,
                        },
                    ],
                },
                {
                    name: "Home",
                    sub: "The whole business",
                    label: "Ask AI opened on Home, with suggestions about the whole business",
                    h: `Good morning, ${bakery.owner}`,
                    small: "Tuesday 17 November",
                    lines: [
                        ["To get ready today", `${pickups} orders`],
                        ["Cakes to make", "2"],
                        [
                            "Money in yesterday",
                            THISTLEWICK_TUESDAY.paidYesterday,
                        ],
                    ],
                    lead: `Ask about ${bakery.name}`,
                    sugs: [
                        { t: "November vs October", h: "Up so far" },
                        { t: "Regulars who haven't been back", h: "5 people" },
                        { t: "Quietest day this week", h: "Wednesday" },
                        {
                            t: "Mark today's orders ready…",
                            h: `${pickups} due`,
                            act: true,
                        },
                    ],
                },
                {
                    name: "Customers",
                    sub: "One person",
                    page: "/ Contacts",
                    label: `Ask AI opened on ${maya.customer}'s customer page`,
                    h: maya.customer,
                    small: "8 orders · collects most Saturdays",
                    lines: [
                        ["Today, 11 am", maya.total],
                        ["Sat 14 Nov", "$24.00"],
                        ["Sat 7 Nov", "$9.00"],
                        ["Sat 31 Oct", "$33.00"],
                    ],
                    about: `About: ${maya.customer}`,
                    sugs: [
                        {
                            t: "What does she usually order?",
                            h: "Sourdough · 6 of 8",
                        },
                        {
                            t: "Anything she can't eat?",
                            h: "Sesame",
                        },
                        { t: "Order her usual for Saturday…", act: true },
                        { t: "Add a note to her page…", act: true },
                    ],
                },
                {
                    name: "Calendar",
                    sub: "This week",
                    page: "/ Calendar",
                    label: "Ask AI opened on the Calendar week of 16 to 22 November",
                    h: "16 to 22 Nov",
                    small: "Pick-ups, your class and invoices",
                    lines: [
                        ["Tue 11 am", maya.customer],
                        ["Tue 2 pm", order("ORD-043").customer],
                        ["Sat 10 am", cls.name],
                        ["Sat 11 am", "Order collection"],
                    ],
                    about: "About: Calendar · 16–22 Nov",
                    sugs: [
                        {
                            t: "Which days are quietest?",
                            h: "Wednesday",
                        },
                        {
                            t: "Which classes still have seats?",
                            h: `Sat · ${left} places`,
                        },
                        { t: "Busiest day this week", h: "Sat · 5 things" },
                        { t: "Move a booking…", act: true },
                    ],
                },
            ],
            phoneMore: "See it on Home, a customer and Calendar",
            asked: "Asked at the counter this week",
            askedMore: "See what was asked this week",
            questions: [
                { q: "Which orders go out today?", from: ["Orders"] },
                {
                    q: "Which regulars haven't come back?",
                    from: ["Customers", "Orders"],
                },
                { q: "How many cakes this week?", from: ["Orders"] },
                { q: "Who still owes me money?", from: ["Billing"] },
            ],
            history:
                "Your conversations stay in the panel's history (the clock icon) and on their own page at /ask. History keeps them for 90 days, then deletes them. Only you can see yours.",
        },

        acts: {
            id: "acts",
            title: "It acts, after you confirm.",
            lead: "Ask it to book, add or change something and it fills in a card, checked by the same rules as the form. Nothing is saved until you press the button. Then Undo works until the end of the day.",
            steps: [
                { at: "10:42", title: "The answer, with a way to act" },
                { at: "10:42", title: "A card for you to check" },
                { at: "10:43", title: "Done, with Undo" },
            ],
            q: `Can ${first(maya.customer)} have a place in Saturday's class?`,
            checked: "Checked this week's Calendar just now",
            lead1: `Yes. ${cls.name} has ${left} places left. Here are the next ones.`,
            slots: [
                ["Sat 21 Nov", `10 am · ${left} places left`],
                ["Sat 28 Nov", `10 am · ${cls.places} places left`],
                ["Sat 5 Dec", `10 am · ${cls.places} places left`],
            ],
            bookHere: "Book here",
            lead2: "Booking a place, Sat 21 Nov.",
            newBooking: "New booking",
            what: cls.name,
            kv: [
                ["When", "Sat 21 Nov, 10:00 am to 12:00 pm"],
                ["Who", maya.customer],
                ["Where", where],
            ],
            told: `It shows on ${first(maya.customer)}'s page.`,
            book: ["Book it", "Another time"],
            booked: "Booked",
            doneTitle: `${cls.name} · ${maya.customer}`,
            doneKv: [
                ["When", "Sat 21 Nov, 10:00 am"],
                ["Who", maya.customer],
            ],
            doneNote:
                "It's on your calendar now. Undo works until the end of today.",
            done: ["Undo", "Open it"],
            again: `Book ${first(ben.customer)}'s place too`,
            can: [
                ["Add a product or a service", "Saved as a draft"],
                ["Book or move a booking", "From the answer"],
                ["Mark orders ready, create an order", "From the answer"],
                ["Update a customer's details", "Notes, phone, flags"],
                ["Undo any of these the same day", "From the card"],
            ],
            never: ["Delete, cancel or refund", "Never. Do those yourself."],
            listMore: "What it can change, and what it never does",
        },

        private: {
            id: "private",
            title: "What stays private.",
            more: "Your conversations, and who uses it",
            role: {
                title: "Only your business.",
                body: "It answers from your own records in Saroh, for your business alone.",
            },
            staff: {
                who: `Asked by ${bakery.owner} · on her phone`,
                q: "How much did we take yesterday?",
                a: `${THISTLEWICK_TUESDAY.paidYesterday}. Today ${pickups} orders are due, with 2 not paid yet.`,
            },
            yours: {
                title: "Your conversations are yours.",
                body: 'Only you can see yours. "How your data is used" sits under the box you type in, on every screen.',
            },
            who: {
                title: "You decide when it's on.",
                body: "Turn it off for the whole business in Settings, any time.",
            },
        },

        plans: {
            id: "plans",
            line: plan.askAiLine,
            compare: plan.compare,
        },

        mcp: {
            title: "Prefer your own assistant? Connect Claude or ChatGPT.",
            body: "AI apps connects the assistant you already use to Saroh, on Free. It works on the same records as Ask AI, so a change it makes is a change everywhere.",
            link: "How AI apps work",
            more: "See an answer from your assistant",
            rule: {
                bold: "Which one?",
                text: "Ask AI is built into Saroh and asks before it changes anything, but it isn't part of Free. Connect your own assistant if you already live in Claude or ChatGPT, even on the bus.",
            },
            label: "An AI assistant chat using Saroh to answer who is booked on Saturday",
            who: "Your assistant",
            q: `Who's booked Saturday at ${bakery.name}?`,
            a: `Saturday 21 Nov starts with ${cls.name} at 10 am: ${cls.booked} of ${cls.places} places booked, ${left} left.`,
        },

        moment: {
            link: `See 9 pm at ${bakery.name}`,
        },

        faq: [
            {
                q: "Where do the answers come from?",
                a: "From your own records in Saroh, in the same figures Home and Insights show. Each answer says which parts of the business it read and links to that screen.",
            },
            {
                q: "Does opening it do anything?",
                a: "No. It shows suggestions for the page you're on. Nothing runs until you tap one or type a question.",
            },
            {
                q: "Can it change things without me?",
                a: "No. Every change is a card you confirm, and you can undo it the same day. It never deletes, cancels or refunds.",
            },
            {
                q: "Is it on Free?",
                a: plan.askAiFaq,
            },
            {
                q: "Is it the same as using Saroh from Claude or ChatGPT?",
                a: "Ask AI is built into Saroh. AI apps lets you connect the assistant you already use. Both work on the same records.",
            },
        ],
        askUs: ASK_US,
        close: {
            title: "Ask across your whole business.",
            note: "Nothing changes until you confirm.",
            ask: {
                pick: "Ask one",
                readFrom: "Read from",
                questions: [
                    {
                        label: "What sold most?",
                        text: "What sold most this week?",
                        answer: `${item(THISTLEWICK_TUESDAY.topSeller.item)}: ${THISTLEWICK_TUESDAY.topSeller.sold} sold this week.`,
                        from: "Orders, Products",
                    },
                    {
                        label: "Who hasn't paid?",
                        text: "Who still owes me money?",
                        answer: `${maya.customer} pays at pick-up, and ${lucy.customer} pays online, ${lucy.total}.`,
                        from: "Orders, Billing",
                    },
                    {
                        label: "Who hasn't come back?",
                        text: "Which regulars haven't come back?",
                        answer: "5 regulars haven't been back.",
                        from: "Customers, Orders",
                    },
                    {
                        label: "Free time this week?",
                        text: "When am I free this week?",
                        answer: "Wednesday, Thursday and Friday, with nothing booked.",
                        from: "Calendar",
                    },
                ],
            },
        },
        chapters: [
            ["anywhere", "Ask anywhere"],
            ["acts", "It acts"],
            ["private", "Private"],
            ["plans", "Plans"],
            ["faq", "Questions"],
        ],
        inTheApp: {
            of: "of",
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help and setup",
            foot: "History keeps your conversations for 90 days, then deletes them. Only you can see yours.",
            play: {
                startOver: "Start over",
                reading: "Reading",
                ready: "Ready",
                done: "Done",
                undo: "Undo",
            },
        },
    };
}
