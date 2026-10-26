import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";

import { Panel } from "@/components/panel";
import { PreviewFrame } from "@/components/search-pages/preview-frame";
import { wordBlocks } from "@/lib/search-page-content";
import { searchPageForTab } from "@/lib/search-pages";

type View = "desk" | "phone" | "words";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    return { title: `/for/${slug} · Content · Search pages` };
}

/**
 * The page as the site draws it (DEC-193): the admin's own preview route in
 * a frame at 1440 (scaled to fit) or 390, or every word in order. The view
 * is an address (`?view=`).
 */
export default async function SearchPageContent({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ view?: string }>;
}) {
    const { slug } = await params;
    const { view: asked } = await searchParams;
    const view: View = asked === "phone" || asked === "words" ? asked : "desk";
    const data = await searchPageForTab(slug);
    if (!data) return null;
    const { page, site } = data;
    const base = `/search-pages/${slug}/content`;
    const caption = `${site.host}${page.path} · preview, not public`;

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3 rounded-[11px] border bg-card px-4 py-3">
                <p className="flex-[1_1_360px] text-sm text-muted-foreground">
                    The page as it will look on {site.host}, drawn from the code
                    this console runs.
                </p>
                <Segmented<View>
                    label="View"
                    size="sm"
                    value={view}
                    options={[
                        { value: "desk", label: "Desk", href: base },
                        {
                            value: "phone",
                            label: "Phone",
                            href: `${base}?view=phone`,
                        },
                        {
                            value: "words",
                            label: "Words only",
                            href: `${base}?view=words`,
                        },
                    ]}
                />
            </div>

            {view === "desk" && (
                <PreviewFrame
                    src={`/search-pages/${slug}/preview?w=desk`}
                    width={1440}
                    title={`${page.name}, desk preview`}
                    caption={caption}
                />
            )}
            {view === "phone" && (
                <div className="mx-auto w-full max-w-[406px]">
                    <PreviewFrame
                        src={`/search-pages/${slug}/preview?w=phone`}
                        width={390}
                        title={`${page.name}, phone preview`}
                        caption={caption}
                    />
                </div>
            )}
            {view === "words" &&
                wordBlocks(page).map((block) => (
                    <Panel key={block.label} title={block.label}>
                        {() => (
                            <dl className="grid">
                                {block.items.map((item, i) => (
                                    <div
                                        key={`${item.k}-${i}`}
                                        className="flex flex-wrap gap-x-4 gap-y-1 border-t py-2 first:border-t-0"
                                    >
                                        <dt className="flex-[0_0_170px] text-[13px] text-muted-foreground">
                                            {item.k}
                                        </dt>
                                        <dd className="grid flex-[1_1_420px] gap-1">
                                            <span
                                                className={cn(
                                                    item.look === "headline" &&
                                                        "font-display text-xl font-semibold",
                                                    item.look === "title" &&
                                                        "font-semibold",
                                                    item.look === "quote" &&
                                                        "italic text-warning-subtle-foreground",
                                                )}
                                            >
                                                {item.v}
                                            </span>
                                            {item.sub && (
                                                <span className="leading-normal text-muted-foreground">
                                                    {item.sub}
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </Panel>
                ))}
        </div>
    );
}
