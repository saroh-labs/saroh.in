import { newStorefrontHref } from "@/lib/stores/links";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { ChevronRight, Store as StoreIcon } from "lucide-react";
import Link from "next/link";

/**
 * "Where is it?" — the first question for anything a storefront owns, when a
 * business has more than one. A short list rather than a field on the form,
 * because the answer decides what the form offers: the currency, the
 * catalogue, the customers.
 */
export function StorefrontChooser({
    section,
    sectionHref,
    crumb,
    title,
    description,
    stores,
    hrefFor,
}: {
    /** The list this belongs to: "Products", "Orders". */
    section: string;
    sectionHref: string;
    /** The last crumb: "New product". */
    crumb: string;
    title: string;
    description: string;
    stores: { id: string; name: string }[];
    hrefFor: (storeId: string) => string;
}) {
    return (
        <>
            <PageHeader
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
            {stores.length === 0 ? (
                <EmptyState
                    icon={<StoreIcon />}
                    title="No locations yet"
                    description="Everything you sell is sold at a location, so the first one comes first."
                    action={
                        <Button asChild>
                            <Link href={newStorefrontHref}>New location</Link>
                        </Button>
                    }
                />
            ) : (
                <ul className="overflow-hidden rounded-[12px] border border-border">
                    {stores.map((s) => (
                        <li
                            key={s.id}
                            className="border-b border-border last:border-b-0"
                        >
                            <Link
                                href={hrefFor(s.id)}
                                className="flex items-center gap-3 bg-card px-[18px] py-[14px] transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                                    {s.name}
                                </span>
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
