import type { SeedAskConversation } from "../ask-ai-conversations";
import {
    dayLabel,
    endOfLocalDay,
    writeAskConversations,
} from "../ask-ai-conversations";
import type { Db } from "../helpers";

/**
 * Thistlewick Bakery's Ask AI conversations for saroh.tech's shots
 * (`ASK_SHOTS` in `e2e/marketing-shots/shots.global.ts`): the three asked
 * through the API on 16 Nov 2026, as it answered them, so the release run
 * needs no model key. Sample words and numbers; dates follow the seed's now.
 */

const ORG = "seed_gl_shop_org";
const product = (n: number) => `seed_gl_shop_product_${n}`;
const MINUTE = 60_000;
const DAY = 86_400_000;

/** [product, price, sold, takings, stock] as the read tool's card shows it. */
type Row = [number, string, number, string, number | null];
const WEEK: Row[] = [
    [0, "$9", 6, "$47", 63],
    [2, "$8", 2, "$16", 6],
    [6, "$44", 1, "$44", 0],
    [5, "$44", 1, "$44", 4],
];
const MONTH: Row[] = [
    [0, "$9", 11, "$85", 63],
    [1, "$4.50", 7, "$32", 34],
    [2, "$8", 5, "$40", 6],
    [4, "$42", 4, "$194", 5],
    [6, "$44", 1, "$44", 0],
];
/** The week's orders: [number, customer, total, status, days ago, order id]. */
const ORDERS: [string, string, string, string, number, string][] = [
    ["ORD-048", "Maya Thompson", "$5.50", "Pending", 0, "maya"],
    ["ORD-047", "Ella Bell", "$25", "Pending", 0, "46"],
    ["ORD-046", "Chloe Green", "$44", "Processing", 0, "45"],
    ["ORD-045", "Felix Lee", "$18", "Processing", 0, "44"],
    ["ORD-044", "Ruby Baker", "$61", "Shipped", 0, "43"],
    ["ORD-043", "Ruby Baker", "$64", "Processing", 2, "42"],
    ["ORD-042", "Henry Walker", "$53", "Delivered", 5, "41"],
];

export async function seedThistlewickAskAi(
    prisma: Db,
    now: Date,
    zone: string,
    ownerId: string,
): Promise<number> {
    const names = new Map(
        (
            await prisma.product.findMany({
                where: { organizationId: ORG },
                select: { id: true, name: true, image: true },
            })
        ).map((p) => [p.id, p]),
    );
    const day = (at: Date) => dayLabel(at, zone);
    const iso = (at: Date) =>
        at.toLocaleDateString("en-CA", { timeZone: zone });
    const products = (title: string, rows: Row[], href: string) => ({
        kind: "products",
        data: {
            title,
            items: rows.map(([n, price, sold, amount, stock]) => {
                const p = names.get(product(n));
                if (!p)
                    throw new Error(`[ask-ai] Thistlewick has no product ${n}`);
                // The app shows a card photo only from Saroh's media host; a
                // card without one would be an empty box in the release shots.
                if (!p.image?.startsWith("https://media.saroh."))
                    throw new Error(
                        `[ask-ai] Thistlewick's ${p.name} has no photo on media.saroh.*`,
                    );
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
            link: { label: "Open in Insights", href },
        },
    });
    const weekFrom = new Date(now.getTime() - 6 * DAY);
    // Noon UTC on the 1st: the 1st in any zone within 11 hours of UTC.
    const monthFrom = new Date(`${iso(now).slice(0, 7)}-01T12:00:00Z`);
    const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE);

    const conversations: SeedAskConversation[] = [
        {
            id: "seed_gl_shop_aiconversation_week",
            title: "How did the last seven days go, and which products sold the…",
            at: ago(50),
            question:
                "How did the last seven days go, and which products sold the most?",
            answer: `Over the last 7 days (${day(weekFrom)} to ${day(now)}), you took 7 orders worth $271, none cancelled, up from 6 orders worth $248 in the 7 days before.\n\nThe top sellers by units sold were:\n1. Sourdough loaf: 6 sold\n2. Rosemary focaccia: 2 sold\n3. Coffee and walnut cake and Lemon and blueberry cake: 1 sold each`,
            cards: [
                products(
                    `Best sellers, ${day(weekFrom)} to ${day(now)}`,
                    WEEK,
                    "/analytics?tab=sells&period=7d",
                ),
                {
                    kind: "table",
                    data: {
                        title: `Orders, ${day(weekFrom)} to ${day(now)}`,
                        columns: [
                            "Order",
                            "Customer",
                            "Total",
                            "Status",
                            "Placed",
                        ],
                        numeric: [2],
                        link: {
                            label: "Open in Orders",
                            href: `/commerce/orders?date=custom&from=${iso(weekFrom)}&to=${iso(now)}`,
                        },
                        rows: ORDERS.map(([no, who, total, status, ago]) => [
                            no,
                            who,
                            total,
                            status,
                            day(new Date(now.getTime() - ago * DAY)),
                        ]),
                        hrefs: ORDERS.map(
                            (o) =>
                                `/commerce/orders/seed_gl_shop_order_${o[5]}`,
                        ),
                    },
                },
            ],
        },
        {
            id: "seed_gl_shop_aiconversation_month",
            title: "Which products sold best this month?",
            at: ago(40),
            question: "Which products sold best this month?",
            answer: `The top sellers this month (${day(monthFrom)} to ${day(now)}) are the Sourdough loaf with 11 units sold, the Cinnamon bun with 7, and the Rosemary focaccia with 5. The Chocolate truffle cake (4 units) is next. The card shows the full list.`,
            cards: [
                products(
                    `Best sellers, ${day(monthFrom)} to ${day(now)}`,
                    MONTH,
                    "/analytics?tab=sells",
                ),
            ],
        },
        {
            id: "seed_gl_shop_aiconversation_sourdough",
            title: "Change the Sourdough loaf's description to: Naturally…",
            at: ago(30),
            question:
                "Change the Sourdough loaf's description to: Naturally leavened, fermented for 36 hours and baked fresh every morning.",
            answer: "Here it is to check. Nothing is saved until you confirm it.",
            draft: {
                id: "seed_gl_shop_askaidraft_sourdough",
                turnId: "seed_gl_shop_aiturn_sourdough",
                productId: product(0),
                description:
                    "Naturally leavened, fermented for 36 hours and baked fresh every morning.",
                expiresAt: endOfLocalDay(now, zone),
            },
        },
    ];
    return writeAskConversations(prisma, ORG, ownerId, conversations);
}
