import type { WorldBusiness, WorldStory } from "../content/world";
import { Chip } from "../kit/chip";
import { Container } from "../layout/container";
import { MoneyBand } from "./money-band";
import type { NewsSwitches } from "./new-in-saroh";
import { NewInSaroh } from "./new-in-saroh";
import { OrdersChapter } from "./orders-chapter";
import type { SiteShowcase } from "./site-chapter";
import { SiteChapter } from "./site-chapter";
import type { HomeWords } from "./words";

/**
 * The landing's middle, the same on both editions: a phone's chapter chips
 * (New only while there is news), the site and orders chapters, the money
 * band and, straight after it (the door that sat between went, 16 Nov
 * 2026), what's new in Saroh.
 */
export function HomeChapters({
    home,
    news,
    anyNews,
    showcase,
    templates,
    business,
    story,
}: {
    home: Pick<
        HomeWords,
        "chapters" | "site" | "orders" | "money" | "chips" | "news"
    >;
    news: NewsSwitches;
    /** Whether the New chip is drawn. */
    anyNews: boolean;
    showcase: readonly SiteShowcase[];
    /** Whether the site chapter links the templates gallery. */
    templates: boolean;
    business: WorldBusiness;
    story: WorldStory;
}) {
    const paidTotal =
        business.orders?.find((o) => o.id === story.paidOrder)?.total ?? "";
    return (
        <>
            <Container
                as="nav"
                aria-label={home.chapters.label}
                className="pt-5 min-[760px]:hidden"
            >
                <ul className="m-0 -mr-mk-gutter flex list-none gap-2 overflow-x-auto p-0 pr-mk-gutter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {home.chapters.items
                        .filter((c) => c.href !== "#new" || anyNews)
                        .map((c) => (
                            <li key={c.href}>
                                <Chip variant="chapter" href={c.href}>
                                    {c.label}
                                </Chip>
                            </li>
                        ))}
                </ul>
            </Container>

            <SiteChapter
                words={home.site}
                showcase={showcase}
                templates={templates}
            />
            <OrdersChapter
                words={home.orders}
                business={business}
                rows={story.todayRows}
                cls={story.class}
            />
            <MoneyBand
                words={home.money}
                chips={home.chips}
                amount={paidTotal}
            />
            <NewInSaroh
                on={news}
                words={home.news}
                business={business}
                story={story}
            />
        </>
    );
}
