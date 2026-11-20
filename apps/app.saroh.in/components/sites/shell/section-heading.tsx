"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { PostCategory } from "@/lib/content/service";

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
    postCategories,
}: {
    siteId: string;
    groups: readonly SiteGroup[];
    canEdit: boolean;
    /** As `WebsiteHeader`'s: `undefined` hides Categories, `null` failed. */
    postCategories?: PostCategory[] | null;
}) {
    const pathname = usePathname();
    const search = useSearchParams();
    const here = currentSection(groups, siteId, pathname, search);
    if (here.section === null) return null;
    const title =
        here.section === "overview"
            ? "Overview"
            : (groups
                  .flatMap((g) => g.sections)
                  .find((s) => s.id === here.section)?.label ?? "");
    const writing = here.section === "writing" && canEdit;

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
                        {postCategories === undefined ? null : (
                            <PostCategoriesSheet
                                siteId={siteId}
                                categories={postCategories}
                            />
                        )}
                        <Button asChild>
                            <Link href={`/sites/${siteId}/posts/new`}>
                                New post
                            </Link>
                        </Button>
                    </>
                ) : undefined
            }
        />
    );
}
