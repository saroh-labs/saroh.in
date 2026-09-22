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
    stores: { id: string; name: string; slug: string }[];
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
                    title="No storefront yet"
                    description="Everything you sell is sold at a storefront, so the first one comes first."
                    action={
                        <Link
                            href="/stores/new"
                            className="font-medium underline-offset-4 hover:underline"
                        >
                            Make a storefront
                        </Link>
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
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {s.name}
                                    </span>
                                    <span className="block font-mono text-[11.5px] text-muted-foreground">
                                        /{s.slug}
                                    </span>
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
