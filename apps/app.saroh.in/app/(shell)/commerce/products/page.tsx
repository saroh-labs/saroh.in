import { PageContainer } from "@/components/shared/page-container";
import { CatalogueScreen } from "@/components/stores/catalogue-screen";
import { ProductsTabs } from "@/components/stores/products-tabs";
import { ReviewsView } from "@/components/stores/reviews-view";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import {
    invitableOrders,
    listReviews,
    reviewSummary,
} from "@/lib/product-reviews/service";
import type { ProductListItem } from "@/lib/products/service";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";
import { viewParam } from "@/lib/views/search-params";

/**
 * Sell → Products: the business's catalogue, across every storefront.
 *
 * Products are stored per storefront, so this reads each storefront's list in
 * parallel and the screen merges them by SKU. A storefront whose list cannot
 * be read is left out rather than failing the page — the rest of the catalogue
 * is still true — and the screen is told WHICH, so it can say so instead of
 * presenting a subset as the whole catalogue.
 */
export const metadata = { title: "Products" };

export default async function CataloguePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [stores, query, organization] = await Promise.all([
        listStores(),
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
    const tab =
        query.tab === "reviews" && canReadReviews ? "reviews" : "products";
    const lists = await Promise.all(
        stores.map((s) =>
            listProducts(s.id).catch((): ProductListItem[] | null => null),
        ),
    );
    const productsByStore = Object.fromEntries(
        stores.map((s, i) => [s.id, lists[i] ?? []]),
    );
    const missing = stores
        .filter((_, i) => lists[i] === null)
        .map((s) => ({ id: s.id, name: s.name }));

    // Reviews are read for the tab's count on both tabs; a failure is an empty
    // list here rather than the whole Products page failing.
    const reviews = canReadReviews ? await listReviews().catch(() => []) : [];
    const productCount = Object.values(productsByStore).reduce(
        (n, list) => n + list.length,
        0,
    );
    const tabs = canReadReviews ? (
        <ProductsTabs
            active={tab}
            productCount={productCount}
            reviewCount={reviews.length}
        />
    ) : undefined;

    if (tab === "reviews") {
        const invitable = canWriteReviews
            ? await invitableOrders().catch(() => [])
            : [];
        const review =
            typeof query.review === "string" ? query.review : undefined;
        return (
            <PageContainer width="full">
                <ReviewsView
                    reviews={reviews}
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
                tabs={tabs}
                ratings={ratings}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                productsByStore={productsByStore}
                missing={missing}
                initialView={viewParam(query)}
            />
        </PageContainer>
    );
}
