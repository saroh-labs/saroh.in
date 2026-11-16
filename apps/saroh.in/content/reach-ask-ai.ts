/**
 * /features/ask-ai, the Ask page (boards FADesk and FAPhone2, DEC-221): one
 * real answer at 9:45 am, the rows it read, and the step it offers. Every
 * name, order, price and count comes from the world (`content/world.ts`);
 * the words around them are this file's.
 *
 * Claims wait for their switch, and the words come in both forms:
 * - `ask-ai-languages`: Hinglish or Hindi questions. Off, Asha asks in English;
 * - `ask-ai-stock`: reading Stock. Off, the answer reads Orders and Customers;
 * - `ask-ai-plans`: "Grow and Pro" beside Ask AI.
 */
import type { AskAiWords } from "@saroh/marketing/feature-pages/ask-ai/words";
import { RYE_MONDAY, WORLD } from "./world";

const rye = WORLD.lead;
const order = (id: string) => {
    const o = rye.orders?.find((x) => x.id === id);
    if (!o) throw new Error(`world: no order ${id}`);
    return o;
};
const item = (key: string) => rye.items.find((i) => i.key === key)?.name ?? key;
const stock = (key: string) =>
    RYE_MONDAY.stock.find((s) => s.item === key)?.left ?? 0;
const first = (name: string) => name.split(" ")[0];
const at = RYE_MONDAY.askAt945;
const cls = RYE_MONDAY.class;
const meera = order("ORD-1041");
const anjali = order("ORD-1044");
const kavya = rye.customers.find((c) => c.name.startsWith("Kavya"))?.name ?? "";
const kavyaOrder = order("ORD-1048");
const staff = rye.staff?.[0]?.name ?? "";
const place = rye.place.split(",")[0];

/** Today's pick-ups, in the order the answer lists them. */
const DUE = [
    "ORD-1046",
    "ORD-1041",
    "ORD-1047",
    "ORD-1043",
    "ORD-1044",
    "ORD-1045",
];
const paidLabel = (id: string) =>
    id === meera.id ? "Not paid" : id === anjali.id ? "Link sent" : "Paid";

export function askAiWords({
    languages,
    stockOn,
    plans,
}: {
    languages: boolean;
    stockOn: boolean;
    plans: boolean;
}): AskAiWords {
    const reads = stockOn
        ? "Orders, Customers and Stock"
        : "Orders and Customers";
    return {
        name: "Ask AI",
        title: { before: "Ask across your whole ", mark: "business." },
        lede: `One Ask button sits over every screen in Saroh. ${languages ? "Ask in English, Hinglish or Hindi" : "Ask in your own words"} and the answer comes from your own records, with the rows behind it and the parts of the business it read. Then it offers the next step, and waits for your OK.`,
        plan: plans ? "Included on Grow and Pro." : "",
        secondary: "Compare plans",
        note: "Free to start. No card needed.",

        hero: {
            at: "09:45",
            moment: "Monday, between bakes.",
            line: `${rye.owner} asks on Home${languages ? ", in Hinglish" : ""}. To answer, it read ${stockOn ? "three" : "two"} parts of ${rye.name}.`,
            phoneLine: `Between bakes, ${rye.owner} asks on Home.`,
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
                        { name: kavya, end: "10 orders" },
                        { name: meera.customer, end: "14 orders", hi: true },
                        { name: order("ORD-1046").customer, end: "6 orders" },
                    ],
                    note: `${first(meera.customer)} always pays at pick-up.`,
                    feed: {
                        line: `${first(meera.customer)} pays at pick-up`,
                        end: "14 orders",
                    },
                },
                orders: {
                    title: "Orders",
                    sub: "Due today",
                    rows: DUE.map((id) => ({
                        id,
                        name:
                            id === meera.id
                                ? `${meera.customer} · cake`
                                : order(id).customer,
                        end: paidLabel(id),
                        hi: id === meera.id,
                    })),
                    feed: {
                        line: `${meera.id} · ${meera.customer}`,
                        end: "Not paid",
                    },
                },
                stock: {
                    title: "Stock",
                    sub: place,
                    head: ["Item", "In stock"],
                    rows: [
                        {
                            name: item("bun-box"),
                            end: String(stock("bun-box")),
                            hi: true,
                        },
                        {
                            name: item("sourdough"),
                            end: String(stock("sourdough")),
                            hi: true,
                        },
                        {
                            name: item("brownie-box"),
                            end: String(stock("brownie-box")),
                        },
                    ],
                    feed: {
                        line: item("bun-box"),
                        end: `${stock("bun-box")} in stock`,
                    },
                },
            },
            panel: {
                label: `The Ask AI panel on Home answering a question about today's orders, with the rows it read from ${reads}, and a card to mark two orders ready`,
                title: "Ask AI",
                about: `All of ${rye.name}`,
                q: languages
                    ? "Aaj ke orders ke liye sab ready hai?"
                    : "Is everything ready for today's orders?",
                checked: `Checked your ${reads} just now`,
                lead: languages
                    ? stockOn
                        ? `${at.pickups} orders aaj pick-up hain, aur stock sab ke liye hai.`
                        : `${at.pickups} orders aaj pick-up hain.`
                    : stockOn
                      ? `${at.pickups} orders are due for pick-up today, and there's stock for all of them.`
                      : `${at.pickups} orders are due for pick-up today.`,
                why: languages
                    ? `${at.paid} paid hain. ${meera.customer} pick-up par pay karti hain, aur ${anjali.customer} ko pay link gaya hai. Cakes order par bante hain, unki ginti nahi hoti.`
                    : `${at.paid} are paid. ${meera.customer} pays at pick-up, and ${anjali.customer} has been sent a pay link. Cakes are made to order, so they aren't counted.`,
                head: ["Order", "Customer", "Total", "Paid"],
                rows: DUE.map((id) => ({
                    id,
                    customer: order(id).customer,
                    total: order(id).total,
                    paid: paidLabel(id),
                    from: id === meera.id,
                })),
                stockHead: ["For these orders", "Needed", "In stock"],
                stockRows: [
                    {
                        name: item("bun-box"),
                        need: String(at.bunBoxesNeeded),
                        have: String(stock("bun-box")),
                    },
                    {
                        name: item("sourdough"),
                        need: "2",
                        have: String(stock("sourdough")),
                    },
                ],
                from: "Read from",
                sources: stockOn
                    ? ["Orders", "Customers", "Stock"]
                    : ["Orders", "Customers"],
                where: `· today, ${place}`,
                card: {
                    head: "Change 2 orders",
                    title: "Mark as ready for pick-up",
                    kv: [
                        ["Orders", "ORD-1046, ORD-1047"],
                        ["Then", "They show as Ready in Orders"],
                    ] as const,
                    note: "The four cakes are left as they are until they're baked. Undo works all day.",
                    buttons: ["Mark 2 ready", "Pick which"],
                },
                more: "See the whole answer",
            },
            example: `An example: ${rye.name}, a ${rye.kind} on ${place}.`,
        },

        where: {
            id: "anywhere",
            title: "Ask from wherever you are.",
            lead: "The same button sits at the top of every screen. Open it on a page and it already knows the page, with suggestions and small hints counted from it. Opening it never runs anything. A question runs only when you tap it.",
            ask: "Ask AI",
            hintHome:
                "Hints are counted from your business. Tapping one asks; nothing runs until you do.",
            hintPage:
                "Hints are counted from this page. Tapping one asks; nothing runs until you do.",
            screens: [
                {
                    name: "Orders",
                    sub: "Today's list",
                    page: "/ Orders",
                    label: "Ask AI opened on Orders, about today's orders",
                    h: "Orders",
                    small: `Due today · ${at.pickups}`,
                    lines: DUE.map(
                        (id) =>
                            [
                                id,
                                id === meera.id || id === anjali.id
                                    ? "Not paid"
                                    : "Paid",
                            ] as const,
                    ),
                    about: "About: Orders · today",
                    sugs: [
                        {
                            t: "Which orders go out today?",
                            h: `${at.pickups} due`,
                        },
                        { t: "Who hasn't paid yet?", h: "2 orders" },
                        { t: "Best sellers since Diwali" },
                        {
                            t: "Mark today's orders ready…",
                            h: `${at.paid} paid`,
                            act: true,
                        },
                    ],
                },
                {
                    name: "Home",
                    sub: "The whole business",
                    label: "Ask AI opened on Home, with suggestions about the whole business",
                    h: `Good morning, ${rye.owner}`,
                    small: "Monday 16 November",
                    lines: [
                        ["To pack today", `${at.pickups} orders`],
                        ["Bookings today", "2"],
                        ["Money in today", "₹3,240"],
                    ] as const,
                    lead: `Ask about ${rye.name}`,
                    sugs: [
                        { t: "November vs October", h: "Up so far" },
                        { t: "Regulars who haven't been back", h: "5 people" },
                        { t: "Free time this week", h: "3 afternoons" },
                        {
                            t: "Mark today's orders ready…",
                            h: `${at.pickups} due`,
                            act: true,
                        },
                    ],
                },
                {
                    name: "Customers",
                    sub: "One person",
                    page: "/ Contacts",
                    label: `Ask AI opened on ${kavya}'s customer page`,
                    h: kavya,
                    small: "10 orders · last one today",
                    lines: [
                        ["Today, 10:14 am", kavyaOrder.total],
                        ["Wed 2 Sep", "₹360"],
                        ["Sat 29 Aug", "₹360"],
                        ["Sat 22 Aug", "₹720"],
                    ] as const,
                    about: `About: ${kavya}`,
                    sugs: [
                        {
                            t: "What does she usually order?",
                            h: "Bun box · 7 of 10",
                        },
                        {
                            t: "When is her birthday cake ready?",
                            h: "Sat 11 am",
                        },
                        { t: "Order her usual for Saturday…", act: true },
                        { t: "Book her a cake tasting…", act: true },
                    ],
                },
                {
                    name: "Calendar",
                    sub: "This week",
                    page: "/ Calendar",
                    label: "Ask AI opened on the Calendar week of 16 to 22 November",
                    h: "16 to 22 Nov",
                    small: "Bookings, classes, invoices and posts",
                    lines: [
                        ["Tue 11 am", "Cake tasting"],
                        [
                            "Thu 11 am",
                            rye.customers.find((c) =>
                                c.name.startsWith("Priya"),
                            )?.name ?? "",
                        ],
                        ["Sat 10 am", cls.name],
                        ["Sun 11 am", "Cake tasting"],
                    ] as const,
                    about: "About: Calendar · 16–22 Nov",
                    sugs: [
                        {
                            t: "Where can I fit 2 more cake tastings?",
                            h: "3 afternoons free",
                        },
                        {
                            t: "Which classes still have seats?",
                            h: `Sat · ${cls.places - cls.booked} places`,
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
                ...(languages
                    ? [
                          {
                              q: "Kaun regulars wapas nahi aaye?",
                              from: ["Customers", "Orders"],
                          },
                          {
                              q: "शनिवार को कितनी बुकिंग हैं?",
                              from: ["Bookings"],
                          },
                      ]
                    : [
                          {
                              q: "Which regulars haven't come back?",
                              from: ["Customers", "Orders"],
                          },
                          {
                              q: "How many bookings on Saturday?",
                              from: ["Bookings"],
                          },
                      ]),
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
            q: "Where can I fit 2 more cake tastings this week?",
            checked: "Checked this week's Calendar just now",
            lead1: "Tuesday, Wednesday and Thursday afternoons are free.",
            slots: [
                ["Tue 17 Nov", "12 to 5 pm"],
                ["Wed 18 Nov", "10 am to 3 pm"],
                ["Thu 19 Nov", "1 to 4 pm"],
            ] as const,
            bookHere: "Book here",
            lead2: "Booking a tasting, Tue 17 Nov.",
            newBooking: "New booking",
            what: "Cake tasting",
            kv: [
                ["When", "Tue 17 Nov, 12:00 to 12:45 pm"],
                ["Who", kavya],
                ["Where", place],
            ] as const,
            told: `${first(kavya)} gets a confirmation.`,
            book: ["Book it", "Another time"],
            booked: "Booked",
            doneTitle: `Cake tasting · ${kavya}`,
            doneKv: [
                ["When", "Tue 17 Nov, 12:00 pm"],
                ["Told", `${first(kavya)}, on WhatsApp`],
            ] as const,
            doneNote:
                "It's on your calendar now. Undo works until the end of today.",
            done: ["Undo", "Open it"],
            again: "Book the second tasting",
            can: [
                ["Add a product or a service", "Saved as a draft"],
                ["Book or move a booking", "The customer can be told"],
                ["Mark orders ready, create an order", "From the answer"],
                ["Update a customer's details", "Notes, phone, flags"],
                ["Undo any of these the same day", "From the card"],
            ] as const,
            never: [
                "Delete, cancel or refund",
                "Never. Do those yourself.",
            ] as const,
            listMore: "What it can change, and what it never does",
        },

        private: {
            id: "private",
            title: "What stays private.",
            more: "Your conversations, and who uses it",
            role: {
                title: "Only what your role can see.",
                body: "It answers from what your role lets you see in Saroh. Someone without access to money gets no takings.",
            },
            staff: {
                who: `Asked by ${staff} · counter staff`,
                q: languages
                    ? "Aaj kitna kamaya?"
                    : "How much did we take today?",
                a: `Takings are hidden for your role. I can tell you today's orders: ${at.pickups}, with 2 not paid.`,
            },
            yours: {
                title: "Your conversations are yours.",
                body: 'Only you can see yours. "How your data is used" sits under the box you type in, on every screen.',
            },
            who: {
                title: "You decide who uses it.",
                body: "Owners and admins can use it to start. Give it to anyone else in Roles, or turn it off for the whole business.",
            },
        },

        plans: {
            id: "plans",
            line: plans
                ? "Free to start. Ask AI comes with Grow and Pro."
                : "Free to start.",
            compare: "Compare plans",
        },

        mcp: {
            title: "Prefer your own assistant? Connect Claude or ChatGPT.",
            body: "AI apps connects the assistant you already use to Saroh. It works on the same records as Ask AI, so a change it makes is a change everywhere.",
            link: "How AI apps work",
            more: "See an answer from your assistant",
            rule: {
                bold: "Which one?",
                text: `Most owners use Ask AI: it's already in Saroh, ${languages ? "answers in Hinglish " : "answers from your records "}and asks before it changes anything. Connect your own assistant if you already live in Claude or ChatGPT, even on the bus.`,
            },
            label: "An AI assistant chat using Saroh to answer who is booked on Saturday",
            who: "Your assistant",
            q: `Who's booked Saturday at ${rye.name}?`,
            a: `Saturday 21 Nov starts with ${cls.name} at 10 am: ${cls.booked} of ${cls.places} places booked, ${cls.places - cls.booked} left.`,
        },

        moment: {
            link: `See 9 pm at ${rye.name}`,
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
            ...(languages
                ? [
                      {
                          q: "Which languages can I ask in?",
                          a: "English, Hinglish or Hindi. It answers in the language you ask in, or the one you choose.",
                      },
                  ]
                : []),
            {
                q: "Can it change things without me?",
                a: "No. Every change is a card you confirm, and you can undo it the same day. It never deletes, cancels or refunds.",
            },
            {
                q: "Can my staff use it?",
                a: "Owners and admins can to start. Give it to anyone else in Roles, or turn it off for the business. Each person only gets answers from what their role can see, so someone without access to money gets no takings.",
            },
            {
                q: "Is it the same as using Saroh from Claude or ChatGPT?",
                a: "Ask AI is built into Saroh. AI apps lets you connect the assistant you already use. Both work on the same records.",
            },
        ],
        askUs: {
            lead: "Something else?",
            label: "Ask us",
            href: "/contact",
            more: "All questions",
        },
        close: {
            title: "Ask your business, in your words.",
            note: "Free to start. No card needed.",
        },
        chapters: [
            ["anywhere", "Ask anywhere"],
            ["acts", "It acts"],
            ["private", "Private"],
            ["plans", "Plans"],
            ["faq", "Questions"],
        ] as const,
        inTheApp: {
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help and setup",
            of: "of",
        },
    };
}

export type { AskAiWords };
