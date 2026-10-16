import { newStorefrontHref } from "@/lib/stores/links";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { ChevronRight, Store as StoreIcon } from "lucide-react";
import Link from "next/link";

import { FailedRead } from "@/components/shared/failed-read";

interface ChooserStore {
    id: string;
    name: string;
}

/**
 * "Where is it?" — the first question for anything a storefront owns, when a
 * business has more than one. A short list rather than a field on the form,
 * because the answer decides what the form offers: the currency, the
 * catalogue, the customers.
 *
 * `stores` is the business's locations (`listBusinessStores`), or `null`
 * when they couldn't be read: that says so and offers Try again, never
 * "No locations yet", which is only true of a business with none.
 */
export function StorefrontChooser<S extends ChooserStore>({
    section,
    sectionHref,
    crumb,
    title,
    description,
    stores,
    hrefFor,
    lead,
    detail,
    canCreate = false,
}: {
    /** The list this belongs to: "Products", "Orders". */
    section: string;
    sectionHref: string;
    /** The last crumb: "New product". */
    crumb: string;
    title: string;
    description: string;
    stores: readonly S[] | null;
    hrefFor: (storeId: string) => string;
    /** One line above the list: what choosing one means. */
    lead?: string | null;
    /** What a location is, under its name ("No counter · 12 products"). */
    detail?: (store: S) => string | null;
    /** May add a location (`store:create`): the empty state's button. */
    canCreate?: boolean;
}) {
    return (
        <>
            <PageHeader
                holdsData={false}
                breadcrumb={[
                    "Sell",
                    <Link
                        key="section"
                        href={sectionHref}
                        className="hover:text-foreground"
                    >
                        {section}
                    </Link>,
                    crumb,
                ]}
                title={title}
                description={description}
            />
            {stores === null ? (
                <FailedRead things="your locations" size="page" />
            ) : stores.length === 0 ? (
                <EmptyState
                    icon={<StoreIcon />}
                    title="No locations yet"
                    description={
                        canCreate
                            ? "Everything you sell is sold at a location, so the first one comes first."
                            : "Everything you sell is sold at a location. An owner or admin adds the first one."
                    }
                    action={
                        canCreate ? (
                            <Button asChild>
                                <Link href={newStorefrontHref}>
                                    New location
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <>
                    {lead ? (
                        <p className="mb-3 text-[13.5px] text-muted-foreground">
                            {lead}
                        </p>
                    ) : null}
                    <ul className="overflow-hidden rounded-[12px] border border-border">
                        {stores.map((s) => {
                            const line = detail?.(s) ?? null;
                            return (
                                <li
                                    key={s.id}
                                    className="border-b border-border last:border-b-0"
                                >
                                    <Link
                                        href={hrefFor(s.id)}
                                        className="flex items-center gap-3 bg-card px-[18px] py-[14px] transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13.5px] font-medium">
                                                {s.name}
                                            </span>
                                            {line ? (
                                                <span className="block truncate text-[12.5px] text-muted-foreground">
                                                    {line}
                                                </span>
                                            ) : null}
                                        </span>
                                        <ChevronRight
                                            aria-hidden
                                            className="size-4 text-muted-foreground"
                                        />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </>
    );
}
