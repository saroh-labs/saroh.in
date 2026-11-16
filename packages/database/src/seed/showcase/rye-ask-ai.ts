import type { SeedAskConversation } from "../ask-ai-conversations";
import {
    dayLabel,
    endOfLocalDay,
    writeAskConversations,
} from "../ask-ai-conversations";
import type { Db } from "../helpers";
import { ryeId } from "./bakery-catalogue";

/**
 * Rye & Co.'s Ask AI conversations for saroh.in's shots (`ask-*` in
 * `e2e/marketing-shots/shots.config.ts`): the three the owner asked by hand
 * on 15 Nov 2026, as the API answered them, so the release run needs no
 * model key. Sample words and numbers; the week's dates follow the seed's now.
 * Ask AI is switched on for Rye, as its pages show it (DEC-220).
 */

const ZONE = "Asia/Kolkata";
const MINUTE = 60_000;
const DAY = 86_400_000;

/** [product, sold, takings, stock or null] as the read tool's card shows it. */
const BEST: [number, string, number, string, number | null][] = [
    [6, "₹120", 14, "₹2,280", 13],
    [0, "₹480", 11, "₹4,620", 32],
    [7, "₹360", 10, "₹3,600", 17],
    [3, "₹160", 8, "₹1,280", null],
    [4, "₹180", 7, "₹1,260", null],
];

async function bestSellers(prisma: Db, from: Date, to: Date) {
    const ids = BEST.map(([n]) => ryeId("product", n));
    const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: {
            id: true,
            name: true,
            image: true,
        },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
        kind: "products",
        data: {
            title: `Best sellers, ${dayLabel(from, ZONE)} to ${dayLabel(to, ZONE)}`,
            items: BEST.map(([n, price, sold, amount, stock]) => {
                const p = byId.get(ryeId("product", n));
                if (!p) throw new Error(`[ask-ai] Rye has no product ${n}`);
                return {
                    id: p.id,
                    name: p.name,
                    imageUrl: p.image,
                    price,
                    sold,
                    amount,
                    stock,
                    href: `/commerce/products/${p.id}`,
                };
            }),
            link: {
                label: "Open in Insights",
                href: "/analytics?tab=sells&period=7d",
            },
        },
    };
}

export async function seedRyeAskAi(
    prisma: Db,
    now: Date,
    ownerId: string,
): Promise<number> {
    const orgId = ryeId("org");
    await prisma.featureFlagOverride.upsert({
        where: {
            flagKey_organizationId: {
                flagKey: "ASK_AI",
                organizationId: orgId,
            },
        },
        update: { enabled: true },
        create: {
            id: ryeId("flagoverride", "ask-ai"),
            flagKey: "ASK_AI",
            organizationId: orgId,
            enabled: true,
        },
    });

    // The seven days before today, where the bakery is.
    const from = new Date(now.getTime() - 7 * DAY);
    const to = new Date(now.getTime() - DAY);
    const [fromDay, toDay] = [dayLabel(from, ZONE), dayLabel(to, ZONE)];
    const week =
        fromDay.split(" ")[1] === toDay.split(" ")[1]
            ? `${fromDay.split(" ")[0]}–${toDay}`
            : `${fromDay}–${toDay}`;
    const cards = [await bestSellers(prisma, from, to)];
    const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE);

    const conversations: SeedAskConversation[] = [
        {
            id: ryeId("aiconversation", "week"),
            title: "How did this week go, and which products sold the most?",
            at: ago(50),
            question: "How did this week go, and which products sold the most?",
            answer: `This week (${week}) brought in ₹90,458 from 37 orders and no bookings. Seven bills are unpaid (₹37,450), and five of them are overdue (₹27,550).\n\nThe top sellers were Cinnamon bun (14 sold, ₹2,280), Sourdough loaf (11 sold, ₹4,620) and Almond croissant (10 sold, ₹3,600).`,
            cards,
        },
        {
            id: ryeId("aiconversation", "hafte"),
            title: "Is hafte sabse zyada kya bika?",
            at: ago(40),
            question: "Is hafte sabse zyada kya bika?",
            answer: `Is hafte sabse zyada Cinnamon bun bika, 14 units (₹2,280), jo pichle hafte 20 the. Uske baad Sourdough loaf 11 units (₹4,620) aur Almond croissant 10 units (₹3,600) rahe. Ye ${fromDay} se ${toDay} tak ka data hai.`,
            cards,
        },
        {
            id: ryeId("aiconversation", "sourdough"),
            title: "Change the Sourdough loaf's description to: Slow-fermented…",
            at: ago(30),
            question:
                "Change the Sourdough loaf's description to: Slow-fermented for 36 hours and baked every morning on Hill Road. Order by 9 pm for tomorrow.",
            answer: "Here it is to check. Nothing is saved until you confirm it.",
            draft: {
                id: ryeId("askaidraft", "sourdough"),
                turnId: ryeId("aiturn", "sourdough"),
                productId: ryeId("product", 0),
                description:
                    "Slow-fermented for 36 hours and baked every morning on Hill Road. Order by 9 pm for tomorrow.",
                expiresAt: endOfLocalDay(now, ZONE),
            },
        },
    ];
    return writeAskConversations(prisma, orgId, ownerId, conversations);
}
