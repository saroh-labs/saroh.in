import { buttonVariants } from "@saroh/ui/button";
import Link from "next/link";

import { ReleaseHistory } from "@/components/releases/release-history";
import { EmptyPanel } from "@/components/states/empty-panel";
import { flagHistory, HISTORY_PAGE } from "@/lib/control-plane";
import { releaseForTab } from "@/lib/release-data";
import { releaseHref } from "@/lib/releases";
import { readPage } from "@/lib/usage-words";

/** The tab names the release by its key. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ key: string }>;
}) {
    const { key } = await params;
    return { title: `${key} · History · Releases` };
}

/**
 * Every change to the release, newest first, a page at a time: who, when,
 * what and why. A full page offers the older one, so nothing is cut off.
 */
export default async function ReleaseHistoryPage({
    params,
    searchParams,
}: {
    params: Promise<{ key: string }>;
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const data = await releaseForTab(params);
    if (!data) return null;
    const page = readPage((await searchParams).page);
    const history = await flagHistory(data.flag.key, page).catch(() => null);
    const href = (p: number) =>
        p > 1
            ? `${releaseHref(data.flag.key, "history")}?page=${p}`
            : releaseHref(data.flag.key, "history");

    if (history?.length === 0 && page > 1) {
        return (
            <EmptyPanel
                title="No older changes"
                description="Every change to this release is on the pages before this one."
                action={
                    <Link
                        href={href(1)}
                        className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                        })}
                    >
                        Go to the newest changes
                    </Link>
                }
            />
        );
    }

    const first = (page - 1) * HISTORY_PAGE + 1;
    const older = history !== null && history.length === HISTORY_PAGE;
    return (
        <div className="grid gap-3">
            <ReleaseHistory history={history} />
            {history && history.length > 0 && (page > 1 || older) && (
                <nav
                    aria-label="History pages"
                    className="flex flex-wrap items-center justify-end gap-2"
                >
                    <span className="text-sm text-muted-foreground">
                        Changes {first}–{first + history.length - 1}, newest
                        first
                    </span>
                    {page > 1 && (
                        <Link
                            href={href(page - 1)}
                            className={buttonVariants({
                                variant: "ghost",
                                size: "sm",
                            })}
                        >
                            Newer changes
                        </Link>
                    )}
                    {older && (
                        <Link
                            href={href(page + 1)}
                            className={buttonVariants({
                                variant: "outline",
                                size: "sm",
                            })}
                        >
                            Older changes
                        </Link>
                    )}
                </nav>
            )}
        </div>
    );
}
