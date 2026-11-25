"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { usePathname, useSearchParams } from "next/navigation";

import { usePostCategories, useSiteSave } from "@/lib/sites/use-sites";

import { PostCategoriesSheet } from "@/components/sites/posts/post-categories-sheet";

import type { SiteGroup } from "./group-map";
import { currentSection } from "./group-map";

/**
 * The open screen's name over it, and its own action: one black button per
 * screen (WXPPages). Writing keeps what today's Posts tab put in the header:
 * Categories, in its sheet, and New post. The layout renders once for every
 * screen under it, so this follows the address.
 */
export function SiteSectionHeading({
    siteId,
    groups,
    canEdit,
}: {
    siteId: string;
    groups: readonly SiteGroup[];
    canEdit: boolean;
}) {
    const pathname = usePathname();
    const search = useSearchParams();
    const here = currentSection(groups, siteId, pathname, search);
    const writing = here.section === "writing" && canEdit;
    // The Categories sheet's list, read only over Writing; until it lands
    // the button waits (a list not read is never "none yet").
    const categories = usePostCategories(siteId, writing);
    const save = useSiteSave(siteId);
    if (here.section === null) return null;
    const title =
        here.section === "overview"
            ? "Overview"
            : (groups
                  .flatMap((g) => g.sections)
                  .find((s) => s.id === here.section)?.label ?? "");

    return (
        <PageHeader
            holdsData={false}
            title={title}
            // The phone's site home is its own heading.
            className={cn(
                "mb-0",
                here.section === "overview" && "max-[759px]:sr-only",
            )}
            actions={
                writing ? (
                    <>
                        {categories.data || categories.isError ? (
                            <PostCategoriesSheet
                                siteId={siteId}
                                categories={categories.data ?? null}
                                save={save}
                                onRetry={() => void categories.refetch()}
                            />
                        ) : null}
                        <Button asChild>
                            <IntentLink href={`/sites/${siteId}/posts/new`}>
                                New post
                            </IntentLink>
                        </Button>
                    </>
                ) : undefined
            }
        />
    );
}
