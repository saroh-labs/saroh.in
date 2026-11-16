/**
 * /features/social, "Share and posts", the Reach page built around one bun
 * box all the way out (boards FSDesk and FSPhone2, DEC-221). Every name,
 * price, time and address comes from the world (`content/world.ts`); the
 * words around them are this file's. Visit counts are examples, and say so.
 *
 * The page's claims each wait for their switch (`claimOn`), and these words
 * come in both forms where a claim changes a sentence:
 * - `share-every-plan`: "free to share", "free on every plan";
 * - `social-posting`: Saroh Social posting and scheduling for you;
 * - `share-insights`: Worth posting today and visits per post;
 * - `ask-ai-plans`, `ask-ai-languages`, `ask-ai-social`: Ask AI's plan, its
 *   Hinglish question and its reading of posts.
 */
import type {
    CardWordsSet,
    SocialWords,
} from "@saroh/marketing/feature-pages/social/words";
import { ASK_US } from "./reach-ask-us";
import { LOOK_BANDS } from "./reach-looks";
import { RYE_MONDAY, WORLD } from "./world";

const rye = WORLD.lead;
const neel = WORLD.others[0];
const find = (b: typeof rye, key: string) => {
    const found = b.items.find((i) => i.key === key);
    if (!found) throw new Error(`world: no item ${key}`);
    return found;
};
const bun = find(rye, "bun-box");
const keratin = find(neel, "keratin");
const cls = RYE_MONDAY.class;
const top = RYE_MONDAY.topSeller;
/** "₹360" → 288, at 20% off; the world writes money, so this writes it back. */
const off20 = (price: string) => {
    const n = Number(price.replace(/[^\d]/g, ""));
    return `${price.replace(/[\d,]+/, "")}${String(Math.round(n * 0.8)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};
const initials = (name: string) =>
    name
        .replace(/&/g, " & ")
        .split(/\s+/)
        .filter((w) => /^[A-Z&]/.test(w))
        .map((w) => w[0])
        .join("");
const said = (name: string) =>
    name.split(" ").slice(-2).join(" ").toLowerCase();
const meera = rye.customers[0].name.split(" ")[0];
const priya = rye.customers.find((c) => c.name.startsWith("Priya"))?.name ?? "";
const meeraFull = rye.customers[0].name;
const handle = rye.domain?.split(".")[0] ?? rye.site.split(".")[0];

const ryeCard: CardWordsSet = {
    label: `${rye.name} · Bakery`,
    name: bun.name,
    photoLine: `${bun.price} · ${bun.unit}`,
    tag: { price: bun.price, unit: bun.unit },
    offer: {
        big: "20% off",
        was: bun.price,
        now: off20(bun.price),
        label: `${rye.name} · this week only`,
    },
    simpleLine: `${bun.price} · fresh every morning`,
    mark: initials(rye.name),
    web: rye.site,
};
const neelCard: CardWordsSet = {
    label: `${neel.name} · Hair and skin`,
    name: keratin.name,
    photoLine: `${keratin.price} · ${keratin.unit}`,
    tag: { price: keratin.price, unit: keratin.unit },
    offer: {
        big: "20% off",
        was: keratin.price,
        now: off20(keratin.price),
        label: `${neel.name} · this week only`,
    },
    simpleLine: `${keratin.price} · book a chair this week`,
    mark: initials(neel.name),
    web: neel.site,
};

const caption = `Taaze cardamom buns, roz subah bante hain. 6 ka box sirf ${bun.price}. Order karein:`;

export function socialWords({
    everyPlan,
    posting,
    insights,
    askPlans,
    askLanguages,
    askSocial,
}: {
    everyPlan: boolean;
    posting: boolean;
    insights: boolean;
    askPlans: boolean;
    askLanguages: boolean;
    askSocial: boolean;
}): SocialWords {
    return {
        name: "Share and posts",
        title: {
            before: "Turn what you sell into a post ",
            mark: "in a minute.",
        },
        lede: "Press Share on a product, a class, an offer or your booking page. Saroh draws it as a ready post in your website's own colours, fonts and logo, writes the caption, and you post it from your own phone.",
        free: "Free to share. Instagram, WhatsApp, Facebook.",
        secondary: "Watch one post, start to finish",
        note: "Free to start. No card needed.",
        looks: {
            lead: { look: rye.look, band: LOOK_BANDS.rye },
            other: { look: neel.look, band: LOOK_BANDS.neel },
        },
        cards: { lead: ryeCard, other: neelCard },

        stage: {
            /** On a phone, the cards are cut; this opens them. */
            more: "See all four cards",
            label: `The ${bun.name} shared as four cards in ${rye.name}'s look`,
            product: bun.name,
            productNote: `${bun.price} · Bakes · Sells online and at the counter`,
            phoneNote: `${bun.price} · Bakes`,
            live: "Live",
            share: "Share",
            pick: "Pick a post",
            sizes: ["Post 4:5", "Square", "Story 9:16"],
            styles: {
                photo: "Photo",
                price: "Price tag",
                offer: "Offer",
                simple: "Simple",
            },
            picked: "Price tag",
            note: `Four cards from one product, in ${rye.name}'s cream, terracotta and sage, set in her own serif. A card only shows what the item has: no live offer, no Offer card.`,
            of: "of",
        },

        salon: {
            title: "Same four cards. A salon's own look.",
            lead: `${neel.name} shares a ${keratin.name.toLowerCase()}. The cards take her plum and gold, her type and her rounder corners, read from her published site. Nothing on them is Saroh's.`,
            site: `${neel.name} · ${neel.site}`,
            phoneMore: `See all four in ${neel.name}'s look`,
            duo: [
                { name: rye.name, kind: "bakery" },
                { name: neel.name, kind: "salon" },
            ],
        },

        worth: {
            askMore: "See what Ask AI says",
            title: "Share tells you what's worth posting.",
            lead: askPlans
                ? "Every morning it looks at what sold, your offers and your classes, and puts three ideas at the top. On Grow and Pro, Ask AI answers in your words and ends with the post worth making."
                : "Every morning it looks at what sold, your offers and your classes, and puts three ideas at the top. Ask AI can tell you too, and ends with the post worth making.",
            label: `Saroh's Social page for ${rye.name} with Worth posting today`,
            small: "Share and posts",
            page: "Posts",
            pageLine:
                "Posts in your website's look, ready for Instagram, WhatsApp and Facebook.",
            newPost: "New post",
            head: "Worth posting today",
            headNote: "From what sold, your offers and your classes",
            make: "Make this post",
            ideas: [
                {
                    kind: "price" as const,
                    name: bun.name,
                    line: `Your top seller: ${top.sold} sold this week. Not posted yet.`,
                },
                {
                    kind: "offer" as const,
                    name: "Weekend bakes ends Sunday",
                    line: "20% off till Sunday. A post today gives it two days.",
                },
                {
                    kind: "text" as const,
                    name: `${cls.name}, ${cls.when.split(",")[0]}`,
                    line: `${cls.places - cls.booked} places left of ${cls.places}.`,
                },
            ],
            ask: {
                label: `Ask AI answers what sold most this week: ${said(bun.name)}, ${top.sold} sold, read from Orders and Products`,
                title: "Ask AI",
                q: askLanguages
                    ? "Is hafte sabse zyada kya bika?"
                    : "What sold most this week?",
                a: `${bun.name}: ${top.sold} sold this week.`,
                more: askSocial
                    ? "Your top seller, and it hasn't been posted yet."
                    : "Your top seller.",
                from: "Read from",
                sources: ["Orders", "Products"],
                follow: `Make a post about the ${said(bun.name)}`,
                plans: askPlans ? "Ask AI is on Grow and Pro." : "",
            },
            phoneMore: "See the whole list",
            phoneMoreMeta: "Ask AI too",
            phoneAlso: `Also today: ${cls.name}, ${cls.when.split(",")[0]}, ${cls.places - cls.booked} places left of ${cls.places}.`,
        },

        story: {
            id: "bunbox",
            title: `One ${said(bun.name)}, from the counter to their feed.`,
            lead: `Monday, just after one. ${rye.owner} has ten minutes before the next batch. She needs about four.`,
            of: "of",
            card: {
                at: "13:02",
                title: "She picks a card and a size.",
                body: "Photo, Price tag, Offer or Simple, as a post, a square or a story. Stories keep the words clear of the top and bottom, where Instagram and WhatsApp put their own bars.",
                another: "Try another look",
                seg: ["Post", "Square", "Story"],
                sizes: [
                    { size: "post" as const, name: "Post", ratio: "4:5" },
                    { size: "square" as const, name: "Square", ratio: "1:1" },
                    { size: "story" as const, name: "Story", ratio: "9:16" },
                ],
            },
            caption: {
                at: "13:03",
                title: "The caption is already written.",
                body: "Short, with the price, or in Hinglish. Change any word. The preview follows as you type, and your short link sits at the end so people land on the bun box page.",
                product: bun.name,
                productNote: `Product · ${bun.price} · live on your shop`,
                head: "Caption",
                done: "Done",
                kinds: ["Short", "With price", "Hinglish"],
                on: "Hinglish",
                text: caption,
                link: `${rye.site}/s/k3f9`,
                note: 'Instagram shows the first 125 characters before "… more". Yours fits. The short link becomes "Link in bio" there.',
            },
            share: {
                at: "13:04",
                title: everyPlan ? "She shares it. Free." : "She shares it.",
                body: "Download the picture and copy the caption, or send it straight on WhatsApp or Facebook. You post from your own accounts, so there's nothing to connect and no password to give.",
                head: "Ready to share",
                download: ["Download image", "Then post it from Instagram"],
                copy: ["Copy caption", "With your short link at the end"],
                apps: ["WhatsApp", "Facebook"],
                phone: "On a phone, the caption is copied and your share sheet opens with the picture.",
            },
        },

        feed: {
            handle,
            initials: initials(rye.name),
            caption,
            inBio: "Link in bio",
        },

        posted: {
            more: "See it in the feed",
            at: "13:05",
            title: "Posted. Back to the ovens.",
            label: `${rye.name}'s post on Instagram, on a phone`,
            ticks: [
                "Image saved to your Downloads",
                "Caption copied, with your short link",
            ],
            buttons: [
                "Open Instagram",
                "Also send on WhatsApp",
                "Make another post",
            ],
            laterAt: "19:30",
            shared: "Shared",
            laterName: bun.name,
            laterWhen: "Shared today · Instagram",
            visits: "11 visits",
            example: "Example",
            visitsNote:
                "Visits are people who opened your short link from the post. They show on the post in Social and on the bun box's own page.",
        },

        own: {
            title: "Nothing to sell today? Say something.",
            lead: "Type a line, add your photo if you like, and pick the page it links to. Saroh draws it in your website's look. Your own posts are saved, so you can share them again.",
            label: "Your own post: the headline Open late on Saturday, till 10 pm, drawn in the business's look",
            headline: "Open late on Saturday, till 10 pm",
            caption:
                "We're open till 10 pm this Saturday for late cake pick-ups. Come by!",
            ask: "What do you want to say?",
            hint: "Short reads best on a phone.",
            count: "33 / 90",
            photo: "Add your photo",
            linkTo: "Link to",
            linkPage: `Home · ${rye.site}`,
            saved: "Draft saved ·",
            yours: "Your posts (3)",
            listTitle: "Your posts, ready to share again",
            list: [
                {
                    kind: "offer" as const,
                    name: "Weekend bakes, 20% off",
                    when: "Shared today · WhatsApp, Instagram",
                    visits: "9 visits",
                    state: "Shared",
                },
                {
                    kind: "price" as const,
                    name: bun.name,
                    when: "Shared today · Instagram",
                    visits: "11 visits",
                    state: "Shared",
                },
                {
                    kind: "text" as const,
                    fill: "accent" as const,
                    name: "Open late on Saturday",
                    card: "Open late on Saturday, till 10 pm",
                    when: "Your own post · saved today",
                    state: "Draft",
                },
                {
                    kind: "text" as const,
                    fill: "band" as const,
                    name: "We're hiring a morning baker",
                    when: "Shared 12 Nov · WhatsApp",
                    visits: "6 visits",
                    state: "Shared",
                },
                {
                    kind: "text" as const,
                    fill: "band" as const,
                    name: cls.name,
                    line: `${cls.when.split(",")[0]} · ${cls.price}`,
                    when: "Shared 8 Nov · Facebook",
                    visits: "9 visits",
                    state: "Shared",
                },
            ],
            foot: "Visits are people who opened your short link from a post. Numbers here are examples.",
            phoneMore: "See your posts",
            phoneMoreMeta: "Share again",
        },

        social: {
            id: "saroh-social",
            title: "Or let Saroh Social post it (add-on).",
            lead: "Saroh Social connects Instagram, your Facebook Page and Threads once. Then your posts go out at your good time, when most of your customers are online, and sit in your Calendar beside the day's bookings.",
            pill: "Saroh Social · an add-on",
            notYetTitle: "Saroh Social",
            notYet: "Not available yet",
            label: `Business Calendar, week of 16 to 22 November, with the Posts layer: the ${said(bun.name)} post scheduled for Thursday at 7:30 pm`,
            week: "16 to 22 Nov",
            views: ["Month", "Week"],
            legend: ["Posts", "Good time to post"],
            addPost: "+ Post",
            days: [
                ["MON", "16"],
                ["TUE", "17"],
                ["WED", "18"],
                ["THU", "19"],
                ["FRI", "20"],
                ["SAT", "21"],
                ["SUN", "22"],
            ] as const,
            hours: ["3 pm", "4 pm", "5 pm", "6 pm", "7 pm", "8 pm"],
            goodTime: "Good time",
            events: [
                { day: 0, at: 1, name: "Order collection", time: "4:00 pm" },
                { day: 2, at: 0, name: "Order collection", time: "3:00 pm" },
                { day: 3, at: 1, name: meeraFull, time: "4:00 pm" },
                { day: 5, at: 0, name: "Cake tasting", time: "3:00 pm" },
            ],
            goodDays: [1, 5, 6],
            posts: [
                { day: 2, past: false, kind: "simple" as const },
                { day: 3, past: false, kind: "price" as const, on: true },
            ],
            postShort: "Bun box",
            postAt: "7:30 pm",
            panel: {
                day: "Thu 19 Nov",
                meta: "3 things · 1 post",
                posts: "POSTS · 1",
                when: "7:30 pm · your good time",
                where: "Instagram, Facebook Page, Threads",
                edit: "Edit",
                now: "Post now",
                schedule: "Schedule a post on this day",
                bookings: "BOOKINGS · 2",
                rows: [
                    ["11:00 am", priya, "Cake tasting"],
                    ["4:00 pm", meeraFull, "Order collection"],
                ] as const,
            },
            points: [
                {
                    title: "Posts at your good time",
                    body: "The dashed line is when most of your customers are online. Drag a post to move it.",
                },
                {
                    title: "Likes beside visits",
                    body: "Each post shows its likes from Instagram next to the visits its link brought.",
                },
                {
                    title: "Your bookings in view",
                    body: "Posts sit in the same Calendar as your classes and pick-ups, so a quiet Saturday is easy to spot.",
                },
            ],
            phoneMore: "See the Calendar week",
            phoneMoreMeta: "Good times",
            phoneWeek: `Thu 19 Nov has ${priya}'s cake tasting at 11:00 am and ${meera}'s order collection at 4:00 pm. Drag a post to move it; each post shows its Instagram likes beside its visits.`,
        },

        tail: {
            plan: [
                everyPlan ? "Share is free on every plan." : "Free to start.",
                posting
                    ? "Saroh Social, the add-on that posts for you, goes on top of any plan."
                    : "",
            ]
                .filter(Boolean)
                .join(" "),
            compare: "Compare plans",
        },

        faq: [
            {
                q: "Do I have to connect my Instagram?",
                a: `No. Saroh makes the picture and the caption, and you share them from your own accounts, so there is nothing to connect and no password to give.${posting ? " Connecting is only for Saroh Social, if you want it to post for you." : ""}`,
            },
            {
                q: "Whose look are the cards in?",
                a: "Yours. Cards use your website's colours, fonts and logo, read from your published site. Nothing on them is Saroh's.",
            },
            {
                q: "Which things can I share?",
                a: "Products, services and classes, offers, blog posts and your booking page, once they are live on your site. Or make a post of your own with a headline, your photo or both.",
            },
            {
                q: "Will Hindi names come out right?",
                a: "Yes. Names in Hindi and other Indian scripts come out as you typed them.",
            },
            {
                q: "What sizes do I get?",
                a: "Post, square and story. Stories keep words clear of the top and bottom, so Instagram and WhatsApp never cover the name or price.",
            },
            {
                q: "Where does a post link to?",
                a: "To the item's live page on your site, where people can book or buy.",
            },
        ],
        askUs: ASK_US,
        close: {
            title: "Start managing your online presence with Saroh today.",
            note: everyPlan
                ? "Share is on every plan, Free included. You post it yourself from your phone."
                : "You post it yourself from your phone.",
            share: {
                lede: "Press Share on anything with a page. It's ready for every app, in your own colours, with a link back to you.",
                pick: "What to share",
                row: "The same post on WhatsApp, Instagram and Facebook",
                apps: {
                    whatsapp: "WhatsApp · a chat",
                    instagram: "Instagram · a square post",
                    facebook: "Facebook · a link post",
                },
                handle,
                of: "of",
                posts: [
                    {
                        label: "A product",
                        kind: "New",
                        title: bun.name,
                        sub: `${bun.price} · ${bun.unit}`,
                        line: bun.price,
                        caption:
                            "Fresh this morning. Order by tonight for tomorrow.",
                        reply: "Saving two boxes for Saturday.",
                        path: `/shop/${bun.name.toLowerCase().replace(/\W+/g, "-")}`,
                        photo: "buns",
                    },
                    {
                        label: "A class",
                        kind: "Class",
                        title: cls.name,
                        sub: `${cls.when} · ${cls.places - cls.booked} places left`,
                        line: `${cls.places - cls.booked} places left`,
                        caption: "Bake your own loaf with us this Saturday.",
                        reply: "Booked two places.",
                        path: "/book",
                        photo: "class",
                    },
                    {
                        label: "An offer",
                        kind: "Offer",
                        title: RYE_MONDAY.offer.name,
                        sub: RYE_MONDAY.offer.line,
                        line: RYE_MONDAY.offer.big,
                        caption: `${RYE_MONDAY.offer.big} on our weekend bakes, till Sunday.`,
                        reply: "Perfect timing.",
                        path: "/shop",
                        photo: "brownies",
                    },
                    {
                        label: "A blog post",
                        kind: "Blog",
                        title: RYE_MONDAY.blogPost.title,
                        sub: "From the blog",
                        line: "Read it on our site",
                        caption: "The slow way, and why it tastes better.",
                        reply: "Loved reading this.",
                        path: `/blog/${RYE_MONDAY.blogPost.slug}`,
                        photo: "loaf",
                    },
                ],
            },
        },
        inTheApp: {
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help and setup",
            of: "of",
        },
        insights,
    };
}

export type { CardWordsSet, SocialWords };
