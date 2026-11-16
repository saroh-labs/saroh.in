/**
 * /features/ai-apps, the Connect page (boards FMDesk and FMPhone2, DEC-221):
 * one Claude chat at closing time, what lands in Saroh, and how to connect.
 * Every name, price and time comes from the world (`content/world.ts`);
 * tool names are the MCP server's own (`apps/api.saroh.in/src/modules/mcp/
 * tools/`), kept small in the chat.
 *
 * Claims wait for their switch: `ai-apps-plans` (a plan named beside AI
 * apps), `ask-ai-languages` (Ask AI answering in Hinglish), `ask-ai-plans`.
 */
import type { AiAppsWords } from "@saroh/marketing/feature-pages/ai-apps/words";
import { RYE_MONDAY, WORLD } from "./world";

const rye = WORLD.lead;
const item = (key: string) => {
    const found = rye.items.find((i) => i.key === key);
    if (!found) throw new Error(`world: no item ${key}`);
    return found;
};
const plum = item("plum-cake");
const hamper = item("hamper");
const bun = item("bun-box");
const rose = item("rose-pistachio");
const xmas = RYE_MONDAY.christmas;
const owner = rye.owner;
const place = rye.place.split(",")[0];

export function aiAppsWords({
    plans,
    askPlans,
    languages,
}: {
    plans: boolean;
    askPlans: boolean;
    languages: boolean;
}): AiAppsWords {
    return {
        name: "AI apps",
        title: { before: "Run Saroh from your own ", mark: "assistant." },
        lede: `Closing up at 6 pm, ${owner} asks Claude to add the Christmas menu. Connect the assistant you already use and ask for your work in your own words. It can do only what you can do in Saroh, and nothing on your website goes live until you publish it.`,
        apps: "Works with Claude, ChatGPT and other AI apps.",
        secondary: "Connect your assistant",
        note: "Free to start. No card needed.",

        chat: {
            label: `A chat in Claude at 6:12 pm where ${owner} adds the Christmas menu to ${rye.name} as two drafts on a new Christmas page and gets a publish request`,
            app: "Claude",
            connected: `Saroh · ${rye.name}`,
            first: {
                at: xmas.at,
                ask: `Add the Christmas menu: ${plum.name.toLowerCase()}, ${plum.unit}, ${plum.price} and a ${hamper.name.toLowerCase()}, ${hamper.price}. Put them on a Christmas page.`,
                steps: [
                    {
                        did: "Added a product",
                        what: `${plum.name}, ${plum.unit} · ${plum.price}`,
                        tool: "create_product",
                        state: "Draft",
                    },
                    {
                        did: "Added a product",
                        what: `${hamper.name} · ${hamper.price}`,
                        tool: "create_product",
                        state: "Draft",
                    },
                    {
                        did: "Added a page",
                        what: `Christmas · ${xmas.page}`,
                        tool: "add_page",
                        state: "Draft",
                    },
                    {
                        did: "Asked you to publish",
                        what: `${rye.name} website`,
                        tool: "preview_publish",
                        state: "Not published",
                    },
                ],
                answer: [
                    `Added both to ${rye.name} as drafts, so they're not on sale yet: `,
                    `${plum.name}, ${plum.price}`,
                    " and ",
                    `${hamper.name}, ${hamper.price}`,
                    ". I've made a Christmas page at ",
                    xmas.page,
                    " with both on it, in your website draft. I can't publish it: check the preview, then publish it yourself in Saroh. The link works for 24 hours.",
                ],
                link: "Open the publish request in Saroh",
            },
            cap: `An example chat, for ${rye.name} (demo bakery). ${owner}, closing up on Monday 16 Nov.`,
            momentLink: `See 6 pm at ${rye.name}`,
            phoneMore: "See the rest of the chat",
        },

        rule: {
            bold: "Which should you use?",
            text: `Most owners use Ask AI: it's already in Saroh, ${languages ? "answers in Hinglish" : "answers from your own records"} and asks before it changes anything. Connect your own assistant if you already live in Claude or ChatGPT, even on the bus.`,
            link: "How Ask AI works",
        },

        land: {
            arriveMore: "What waits for you, and what changes at once",
            title: "And there it is, in Saroh.",
            lead: "Your assistant works on the same records as the rest of Saroh. New products wait as drafts. Website changes wait for you to publish.",
            products: {
                after: "After “Add the Christmas menu”",
                when: "Products, at 6:12 pm",
                label: "Saroh's Products list with the two new Christmas products marked Draft",
                crumb: ["Sell", "Products"],
                title: "Products",
                count: "32 products",
                head: ["PRODUCT", "STATUS", "PRICE"],
                rows: [
                    {
                        key: plum.key,
                        name: `${plum.name}, ${plum.unit}`,
                        state: "Draft",
                        price: plum.price,
                        isNew: true,
                    },
                    {
                        key: hamper.key,
                        name: hamper.name,
                        state: "Draft",
                        price: hamper.price,
                        isNew: true,
                    },
                    {
                        key: bun.key,
                        name: `${bun.name} (6)`,
                        state: "Live",
                        price: bun.price,
                    },
                    {
                        key: rose.key,
                        name: `${rose.name} (${rose.unit})`,
                        state: "Live",
                        price: rose.price,
                    },
                ],
                where: `${place} · Online`,
                foot: "Draft: only your team can see it. Open one to check the photo, then put it on sale.",
            },
            request: {
                after: "After “Put them on a Christmas page”",
                when: "At 6:12 pm, one tap from the chat",
                label: `Saroh's Publish request screen: Claude prepared it, and ${owner} chooses Publish or Don't publish`,
                crumb: ["Website", "Publish request"],
                title: `Publish ${rye.name}?`,
                rows: [
                    [
                        "Asked by",
                        `Claude prepared this, on ${owner}'s connection.`,
                        "16 Nov, 6:12 pm",
                    ],
                    ["Website", rye.name, ""],
                    ["Open until", "17 Nov, 6:12 pm", ""],
                ] as const,
                live: "Going live",
                liveWhat: `New page: Christmas, at ${xmas.page}`,
                preview: "Open the preview",
                note: "Publishing puts it live for everyone, now. Nothing happens until you choose.",
                buttons: ["Don't publish", "Publish"],
            },
            arrive: [
                {
                    title: "Products and services",
                    how: "Start as drafts",
                    draft: true,
                    body: "A new product is a draft, not on sale, unless you ask for it on sale. You check it in Products.",
                },
                {
                    title: "Bookings, orders, customers",
                    how: "Change at once",
                    draft: false,
                    body: "A new or moved booking, an order's status or a customer's details change straight away. When a booking moves, the customer is told.",
                },
                {
                    title: "Your website",
                    how: "Waits for you",
                    draft: true,
                    body: "Pages, sections and blog posts are drafts. Your assistant can't publish: it hands you a link, and you choose Publish or Don't publish in Saroh.",
                },
            ],
        },

        compare: {
            more: "See the whole comparison",
            title: "Ask AI, or AI apps?",
            lead: "Both work on the same records, with your role's limits. AI apps asks less before it acts, so here is the difference, plainly.",
            cols: [
                { name: "Ask AI", sub: "Built into Saroh" },
                { name: "AI apps", sub: "Claude, ChatGPT and other AI apps" },
            ],
            rows: [
                [
                    "Where you ask",
                    "At the top of every screen in Saroh",
                    "In the app you already use, on your phone or computer",
                ],
                [
                    "Language",
                    languages ? "English, Hinglish or Hindi" : "Your own words",
                    "Whatever your assistant understands",
                ],
                [
                    "Changes",
                    "A card you confirm first, with Undo the same day",
                    "No card to confirm. Bookings, orders and customers change at once. Products and website changes are drafts, and it can remove sections and pages from your website draft. All listed in AI activity",
                ],
                [
                    "Answers show",
                    "The rows behind each answer, and which screens it read",
                    "What your assistant chooses to show",
                ],
                [
                    "To set up",
                    "Nothing. It's already there",
                    "One connector, one sign-in",
                ],
                ...(askPlans && plans
                    ? [
                          [
                              "Plans",
                              "Grow and Pro",
                              "Grow and Pro. Some apps need one of their own paid plans",
                          ] as const,
                      ]
                    : [
                          [
                              "Plans",
                              "See Pricing",
                              "Some apps need one of their own paid plans",
                          ] as const,
                      ]),
            ] as const,
        },

        paste: {
            lede: "Paste one address into your AI app.",
            copy: "Copy",
            copied: "Copied",
            failed: "Couldn't copy. The address is selected: copy it by hand.",
            guides: "Step-by-step for",
            claude: "Claude",
            chatgpt: "ChatGPT",
            other: "Another AI app",
        },

        connect: {
            id: "connect",
            title: "Connected in three moves.",
            lead: "Press Connect in Saroh Settings, under API and AI apps. About a minute, once; it stays connected until you disconnect it.",
            address: "https://mcp.saroh.in/mcp",
            moves: [
                {
                    where: "In Claude",
                    claude: true,
                    label: "Claude's custom connector form with the name Saroh and Saroh's address",
                    bar: ["Claude", "Connectors"],
                    title: "Press Connect in Saroh Settings.",
                    body: "It opens Claude's connectors, where Saroh is added. Or paste Saroh's address there yourself.",
                    link: {
                        label: "Open Claude's connectors",
                        href: "https://claude.ai/new#customize/connectors",
                    },
                },
                {
                    where: "In Saroh",
                    label: "Saroh's sign-in page opened from Claude",
                    title: "Sign in, as you always do.",
                    body: "Your assistant opens Saroh's own sign-in page. It never sees your password.",
                },
                {
                    where: "In Saroh",
                    label: "Saroh asks which businesses Claude may work with, then what it will be able to do",
                    title: "Pick the business, and allow it.",
                    body: "Tick one business, several or all of yours. Saroh shows what it may and may not do before you press Allow.",
                },
            ],
            form: {
                title: "Add a custom connector",
                name: ["Name", "Saroh"],
                addr: "Address",
                copy: "Copy",
                add: "Add",
            },
            signIn: {
                host: "accounts.saroh.in",
                title: "Sign in to Saroh",
                email: ["Email", `${owner.toLowerCase()}@example.com`],
                go: "Continue",
                note: "The email or phone you already use.",
            },
            consent: {
                title: "Which businesses should Claude work with?",
                all: "All my businesses",
                one: rye.name,
                able: "It will be able to",
                can: [
                    "See your business: products, bookings, orders, customers, enquiries and your website",
                    "Make changes for you: add and edit products, bookings, orders and your website's draft",
                ],
                allow: "Allow",
            },
            chatgpt: {
                bold: "Use ChatGPT?",
                text: "Add Saroh the same way in ChatGPT's connectors, then sign in to Saroh when it asks.",
                link: "Connect ChatGPT",
            },
            of: "of",
        },

        can: {
            more: "See what else it can do",
            title: "What your assistant can do.",
            lead: "Ask in plain words. A few examples from each part of the business.",
            groups: [
                {
                    title: "Your day",
                    sub: "Bookings, orders, customers and enquiries.",
                    items: [
                        "See who's booked, for a day or a person",
                        "Make a booking, or move one",
                        "See orders and move them along",
                    ],
                },
                {
                    title: "What you sell",
                    sub: "Products, services, prices and hours.",
                    items: [
                        "Add a product, as a draft",
                        "Change a price or details",
                        "Set your opening hours",
                    ],
                },
                {
                    title: "Your website",
                    sub: "Always a draft, until you publish.",
                    items: [
                        "Add a page, or change one",
                        "Write a blog post draft",
                        "Remove a section or a page from the draft",
                    ],
                },
                {
                    title: "How it's going",
                    sub: "Read only. Nothing changes.",
                    items: [
                        "What's selling",
                        "Who still owes you",
                        "Customers who haven't come back",
                    ],
                },
            ],
            honest: "It can remove sections and pages from your website draft. They stay a draft until you publish, and Roll back site draft puts the draft back as it was.",
            all: "Every step it can take, on Developers",
        },

        cant: {
            title: "What it can't do.",
            lead: "It acts as you, with your role in each business. Never more than you could do yourself.",
            stays: "Some things stay with you.",
            list: [
                "Publish your website",
                "Cancel a booking or refund a payment",
                "Touch billing or payment settings",
                "Change your team or manage API keys",
                "See sensitive customer notes, like health details",
            ],
            record: {
                title: "Everything it did, on record.",
                body: "Each change is listed under its connection in Settings › API and AI apps, kept for 90 days. Put the website draft back as it was, or disconnect it any time.",
            },
            panel: {
                more: "See its record",
                label: "Saroh's connection panel for Claude: what it changed, Roll back site draft and Disconnect",
                title: "Claude",
                sub: `Your connection · Connected by ${owner} (you)`,
                rows: [
                    [`Added a product: ${plum.name}, ${plum.unit}`, "6:12 pm"],
                    [`Added a product: ${hamper.name}`, "6:12 pm"],
                    ["Added a page to the website draft: Christmas", "6:12 pm"],
                ] as const,
                buttons: ["Roll back site draft", "Disconnect"],
            },
            foot: "What your assistant reads from Saroh goes to the company behind it, under its own terms. An owner can end anyone's connection, and a connection ends by itself after 90 days unused.",
        },

        dev: {
            lead: "Someone building for you?",
            link: "API keys and webhooks are on Developers",
        },
        plan: {
            line: plans
                ? "Free to start. AI apps comes with Grow and Pro. Your assistant's app may need a paid plan of its own."
                : "Free to start. Your assistant's app may need a paid plan of its own.",
            compare: "Compare plans",
        },

        faq: [
            {
                q: "Can my assistant publish my website?",
                a: "No. When you ask, it shows you what will go live and gives you a link into Saroh, where you choose Publish or Don't publish. If your business needs a reviewer, it goes to them instead.",
            },
            {
                q: "Which apps can I use?",
                a: "Claude, ChatGPT and other AI apps. Claude and ChatGPT each have a short guide.",
            },
            {
                q: "What does it see?",
                a: "Only what you can see in the businesses you ticked, and never sensitive customer details. What it reads is sent to the company behind your assistant, under its own terms.",
            },
            {
                q: "What can't it do?",
                a: "It acts as you, with your role. It can't cancel bookings, give refunds, touch billing or change your team.",
            },
            {
                q: "Can one connection cover several businesses?",
                a: "Yes. Tick the ones it may use, and it names the business on every change it makes.",
            },
            {
                q: "How do I disconnect it?",
                a: "Open Settings › API and AI apps › AI assistants, choose the connection and press Disconnect from this business. A connection also ends after 90 days without use.",
            },
            {
                q: "Is this the same as Ask AI?",
                a: "Ask AI is built into Saroh. AI apps connects the assistant you already use. Both work on the same records.",
            },
            {
                q: "What is MCP?",
                a: "MCP (Model Context Protocol) is the open standard AI apps use to connect to other tools. Saroh has an MCP server, so an AI app that supports it can connect to your business after you sign in.",
            },
        ],
        askUs: {
            lead: "Something else?",
            label: "Ask us",
            href: "/contact",
            more: "All questions",
        },
        close: { title: "Do your Saroh work by asking." },
        inTheApp: {
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help and setup",
            of: "of",
        },
    };
}

export type { AiAppsWords };
