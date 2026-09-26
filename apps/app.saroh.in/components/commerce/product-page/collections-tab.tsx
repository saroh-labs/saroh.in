import { Card } from "@saroh/ui/card";
import { Layers } from "lucide-react";

import type { ProductOverview } from "@/lib/products/overview-rules";
import { websiteSummary } from "@/lib/products/overview-words";

import {
    PanelFailed,
    PanelForbidden,
    StateLink,
    TabState,
} from "./panel-state";

/**
 * The product's Collections tab (#522): the collections it is in and the
 * website pages that show it, read-only. Changing them from here — the
 * edit sheet, "fills itself" locks — is #524 (U16), which replaces this.
 */
export function ProductCollectionsTab({
    overview,
    retryHref,
}: {
    overview: ProductOverview;
    retryHref: string;
}) {
    const placement = overview.placement;
    if (!placement || placement.status === "failed") {
        return <PanelFailed what="collections" retryHref={retryHref} />;
    }
    if (placement.status === "forbidden") {
        return <PanelForbidden what="collections" />;
    }
    const shown = placement.data.collections;
    const web = websiteSummary(placement.data);
    if (shown.length === 0 && !placement.data.website.showsProducts) {
        return (
            <TabState
                icon={Layers}
                title="Not in a collection, not on the website"
                description="Collections are how it shows up on the site — a Breads section, a Weekend list. Add it to one from Products."
            >
                <StateLink href="/commerce/products">Open Products</StateLink>
            </TabState>
        );
    }
    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] items-start gap-4">
            <section aria-labelledby="in-collections">
                <h2
                    id="in-collections"
                    className="mb-2 text-[12.5px] font-semibold"
                >
                    In these collections
                </h2>
                <div className="flex flex-col gap-2.5">
                    {shown.length === 0 ? (
                        <p className="rounded-[12px] border border-dashed border-border-strong px-4 py-3.5 text-[12.5px] text-muted-foreground">
                            Not in any collection.
                        </p>
                    ) : (
                        shown.map((c) => (
                            <Card
                                key={c.id}
                                className="rounded-[12px] px-4 py-[13px]"
                            >
                                <p className="text-[14px] font-semibold">
                                    {c.name}
                                </p>
                                <p className="mt-1 text-[12px] text-muted-foreground">
                                    {c.kind === "AUTOMATIC"
                                        ? `Fills itself: everything in ${c.category?.name ?? "its category"}`
                                        : c.showing
                                          ? "Picked by hand"
                                          : "Picked by hand · hidden while it is archived"}
                                </p>
                            </Card>
                        ))
                    )}
                </div>
            </section>
            <section aria-labelledby="on-website">
                <h2
                    id="on-website"
                    className="mb-2 text-[12.5px] font-semibold"
                >
                    Shown on the website
                </h2>
                <div className="flex flex-col gap-2.5">
                    {placement.data.website.pages.length > 0 ? (
                        placement.data.website.pages.map((p) => (
                            <Card
                                key={`${p.siteId}${p.path}`}
                                className="rounded-[12px] px-4 py-[13px]"
                            >
                                <p className="text-[14px] font-semibold">
                                    {p.title || p.path}
                                </p>
                                <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                                    {p.path}
                                </p>
                            </Card>
                        ))
                    ) : (
                        <p className="rounded-[12px] border border-dashed border-border-strong px-4 py-3.5 text-[12.5px] text-muted-foreground">
                            {web.lines[0]}
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
}
