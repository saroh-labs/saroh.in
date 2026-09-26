import { PartialNotice } from "@saroh/ui/data-state";

import { PageContainer } from "@/components/shared/page-container";
import { CatalogueScreen } from "@/components/stores/catalogue-screen";
import type { ProductsTab } from "@/components/stores/products-tabs";
import { ProductsTabs } from "@/components/stores/products-tabs";
import { ReviewsView } from "@/components/stores/reviews-view";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import {
    invitableOrders,
    listReviews,
    reviewSummary,
} from "@/lib/product-reviews/service";
import { canStockProducts, canWriteProducts } from "@/lib/products/access";
import { filterChoices } from "@/lib/products/filter-choices";
import {
    catalogueFilter,
    listHref,
    readListQuery,
} from "@/lib/products/list-query";
import type { CataloguePage } from "@/lib/products/service";
import { listCataloguePage } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStockTracking } from "@/lib/stock/service";
import { listBusinessStores } from "@/lib/stores/service";

/**
 * Sell → Products: the business's catalogue, across every storefront
 * (#519, #520).
 *
 * The address says what the list shows (`?view=`, `?q=`, `?storefront=`,
 * `?status=`, `?category=`, `?collection=`, or `?tab=reviews`); this reads
 * the first page for it. The catalogue read failing fails the page (its
 * error boundary) — never an empty catalogue. Reviews failing leaves the
 * list and says their count is unknown.
 */
export const metadata = { title: "Products" };

const NO_PAGE: CataloguePage = {
    items: [],
    nextCursor: null,
    total: 0,
    counts: { all: 0, collections: 0, inventory: 0 },
    storefronts: { everywhere: 0, byStorefront: [] },
    needs: [],
};

export default async function CataloguePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [stores, params, organization] = await Promise.all([
        listBusinessStores(),
        searchParams,
        resolveActiveOrganization(),
    ]);
    // From what the API resolved this person may do; the role's name only as
    // the fallback for a response that predates permissions.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const canReadReviews = organization?.actions
        ? may("product-review:read")
        : organization?.role !== "REVIEWER";
    const canWriteReviews = may("product-review:write") && may("order:read");
    const onReviews = params.tab === "reviews" && canReadReviews;

    const query = readListQuery(params);
    // A storefront that isn't this business's (or closed) is no filter.
    if (query.storefront && !stores.some((s) => s.id === query.storefront)) {
        query.storefront = null;
    }

    const [page, reviews, tracking, choices] = await Promise.all([
        stores.length > 0
            ? listCataloguePage(
                  // The Reviews view still counts the chips: one row will do.
                  onReviews ? { limit: 1 } : catalogueFilter(query),
              ).then((p) => p ?? NO_PAGE)
            : NO_PAGE,
        canReadReviews ? listReviews().catch(() => null) : Promise.resolve([]),
        getStockTracking().catch(() => null),
        filterChoices(),
    ]);

    const active: ProductsTab = onReviews
        ? "reviews"
        : query.view === "collections" || query.view === "inventory"
          ? query.view
          : "all";
    const tabs = (
        <ProductsTabs
            active={active}
            counts={{
                all: page.counts.all,
                collections: page.counts.collections,
                inventory: page.counts.inventory,
                reviews: reviews ? reviews.length : null,
            }}
            hrefs={{
                all: listHref(query, { view: "all" }),
                collections: listHref(query, { view: "collections" }),
                inventory: listHref(query, { view: "inventory" }),
                reviews: "/commerce/products?tab=reviews",
            }}
            showInventory={tracking?.tracked !== false}
            showReviews={canReadReviews}
        />
    );
    const notice =
        reviews === null ? (
            <PartialNotice>
                Reviews couldn&apos;t be read just now, so their count shows as
                “—”. It is not zero. Everything else on this page arrived
                normally.
            </PartialNotice>
        ) : null;

    if (onReviews) {
        const invitable = canWriteReviews
            ? await invitableOrders().catch(() => [])
            : [];
        const review =
            typeof params.review === "string" ? params.review : undefined;
        return (
            <PageContainer width="full">
                <ReviewsView
                    reviews={reviews ?? []}
                    invitable={invitable}
                    canWrite={canWriteReviews}
                    tabs={tabs}
                    initialReviewId={review}
                />
            </PageContainer>
        );
    }

    const ratings = canReadReviews ? await reviewSummary().catch(() => []) : [];

    return (
        <PageContainer width="full">
            <CatalogueScreen
                query={query}
                page={page}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                tabs={tabs}
                notice={notice}
                ratings={ratings}
                choices={choices}
                canWrite={canWriteProducts(organization)}
                canStock={canStockProducts(organization)}
            />
        </PageContainer>
    );
}
