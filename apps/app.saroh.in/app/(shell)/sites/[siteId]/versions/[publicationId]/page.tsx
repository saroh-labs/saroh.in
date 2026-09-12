import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PastVersionPreview } from "@/components/sites/past-version-preview";
import { RestoreVersion } from "@/components/sites/restore-version";
import { requireSession } from "@/lib/session";
import { exactDate } from "@/lib/sites/format-date";
import { getPublication, getSite } from "@/lib/sites/service";

/**
 * One past version, as it was served (#283, #194).
 *
 * #194 shipped the list and restore, and left "preview any past version as it
 * was served" as its remaining half. Restoring blind is the thing that page
 * was meant to spare a merchant: the list names a date, not what the site
 * looked like on it.
 *
 * Read-only by construction. The snapshot is immutable, the preview is inert,
 * and the only action is putting this version back.
 */
export const metadata = { title: "Past version" };

export default async function PastVersionPage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string; publicationId: string }>;
    searchParams: Promise<{ path?: string }>;
}) {
    const { siteId, publicationId } = await params;
    const { path } = await searchParams;
    await requireSession();

    const [site, publication] = await Promise.all([
        getSite(siteId),
        getPublication(siteId, publicationId),
    ]);
    if (!site || !publication) notFound();

    const pages = publication.snapshot.pages ?? [];
    // Which page is open is a URL question, as in the editor: it survives a
    // reload and can be linked to. An unknown path falls back to home.
    //
    // `.at(0)`, not `[0]`: a published version with no pages at all is a real
    // thing to land on, and only `.at` types the miss as undefined.
    const page =
        pages.find((p) => p.path === path) ??
        pages.find((p) => p.isHome) ??
        pages.at(0);

    const { renderable, unrenderable } = publication.renderability;
    // Left out rather than handed to a component that no longer understands
    // them: #194 asks for "says so", not "renders incorrectly".
    const skipped = new Set(
        unrenderable.filter((u) => u.path === page?.path).map((u) => u.index),
    );
    const sections = (page?.sections ?? []).filter((_, i) => !skipped.has(i));

    const isCurrent = site.currentPublicationId === publication.id;
    const base = `/sites/${siteId}/versions/${publicationId}`;

    return (
        <div className="max-w-5xl space-y-6">
            <PageHeader
                title={`Version from ${exactDate(publication.publishedAt)}`}
                description={
                    publication.publishedBy
                        ? `${site.name} · published by ${publication.publishedBy}`
                        : site.name
                }
                actions={
                    <Button variant="outline" asChild>
                        <Link href={`/sites/${siteId}/versions`}>
                            Version history
                        </Link>
                    </Button>
                }
            />

            <p
                role="status"
                className="rounded-lg border bg-muted px-4 py-3 text-sm"
            >
                {isCurrent
                    ? "This is the version visitors see now."
                    : "A past version, as it was served. It is not what visitors see now, and nothing here can be edited."}
            </p>

            {renderable ? null : (
                <PartialNotice>
                    {unrenderable.length === 0
                        ? "This version's stored copy could not be read, so none of it can be shown."
                        : `${unrenderable.length === 1 ? "One section" : `${unrenderable.length} sections`} in this version can no longer be drawn by your site as it is today, and ${unrenderable.length === 1 ? "is" : "are"} left out below.`}
                </PartialNotice>
            )}

            <RestoreVersion
                siteId={siteId}
                publicationId={publication.id}
                isCurrent={isCurrent}
                renderable={renderable}
            />

            {pages.length > 1 ? (
                <nav
                    aria-label="Pages in this version"
                    className="flex flex-wrap gap-2"
                >
                    {pages.map((p) => (
                        <Button
                            key={p.path}
                            asChild
                            size="sm"
                            variant={
                                p.path === page?.path ? "secondary" : "ghost"
                            }
                        >
                            <Link
                                href={`${base}?path=${encodeURIComponent(p.path)}`}
                                aria-current={
                                    p.path === page?.path ? "page" : undefined
                                }
                            >
                                {p.title}
                            </Link>
                        </Button>
                    ))}
                </nav>
            ) : null}

            {page ? (
                <PastVersionPreview
                    sections={sections}
                    variables={publication.snapshot.site?.styleVariables}
                />
            ) : (
                <p className="text-sm text-muted-foreground">
                    This version holds no pages.
                </p>
            )}
        </div>
    );
}
