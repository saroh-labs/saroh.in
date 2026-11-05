import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { historyWords } from "@/lib/search-page-words";
import {
    loadPage,
    readSearchPageHistory,
    searchPageForTab,
} from "@/lib/search-pages";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    return {
        title: `${loadPage(slug)?.page.name ?? slug} · History · Search pages`,
    };
}

/** Every publish, unpublish, archive and restore of the page, newest first. */
export default async function SearchPageHistory({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const data = await searchPageForTab(slug);
    if (!data) return null;
    const history = await readSearchPageHistory(data.row.path).catch(
        () => undefined,
    );
    if (history === undefined) return <FailedPanel things="the history" />;
    const events = history?.events ?? [];
    if (events.length === 0) {
        return (
            <EmptyPanel
                title="No changes yet"
                description="It has never been published, unpublished or archived. Each change shows here with who made it."
            />
        );
    }

    return (
        <ol className="rounded-[11px] border bg-card px-5">
            {events.map((event) => {
                const w = historyWords(event, data.site.host);
                return (
                    <li
                        key={`${event.at}-${event.action}`}
                        className="flex flex-wrap gap-3 border-b py-3.5 last:border-b-0"
                    >
                        <time
                            dateTime={event.at}
                            className="flex-[0_0_150px] tabular-nums text-muted-foreground"
                        >
                            {w.when}
                        </time>
                        <span className="grid flex-[1_1_360px] gap-0.5">
                            <strong className="font-semibold">{w.what}</strong>
                            <span className="text-[13px] text-muted-foreground">
                                {w.detail}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
