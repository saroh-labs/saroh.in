import { notFound } from "next/navigation";

import { ArchivedBanner } from "@/components/commerce/product-page/archived-banner";
import { CustomerView } from "@/components/commerce/product-page/customer-view";
import { ProductDiscountsTab } from "@/components/commerce/product-page/discounts-tab";
import { ProductHeader } from "@/components/commerce/product-page/header";
import { ProductOrdersTab } from "@/components/commerce/product-page/orders-tab";
import { ProductOverviewTab } from "@/components/commerce/product-page/overview-tab";
import { ProductPhotosTab } from "@/components/commerce/product-page/photos-tab";
import { ProductReviewsTab } from "@/components/commerce/product-page/reviews-tab";
import { ProductTabs } from "@/components/commerce/product-page/tabs";
import { ProductVariantsTab } from "@/components/commerce/product-page/variants-tab";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { isProductTab, productHref } from "@/lib/products/links";
import {
    getProductOverview,
    withStorefrontFallback,
} from "@/lib/products/overview";
import { listCategories } from "@/lib/products/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Product" };

/**
 * Sell → Products → one product, after "Saroh Product Detail".
 *
 * What it is, how it is selling and what people say, read-mostly: every panel
 * links on to where that thing is changed. One read (`/overview`) carries the
 * product and its stock by variant; orders, reviews and discounts arrive as
 * panels that fail — or are withheld from a role — on their own, so a slow
 * order list never blanks the stock a merchant came to check.
 *
 * The tab is in the address (`?tab=reviews`) so a notification, a link in
 * chat or the browser's back button lands on the same view.
 */
export default async function ProductPage({
    params,
    searchParams,
}: {
    params: Promise<{ productId: string }>;
    searchParams: Promise<{
        storefront?: string;
        tab?: string;
        orders?: string;
        view?: string;
    }>;
}) {
    await requireSession();
    const [{ productId }, query, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);

    // A role that cannot open products at all is told so, and who can
    // change it — not shown a "not found" that reads like a broken link.
    if (organization?.actions && !organization.actions.includes("store:read")) {
        return (
            <AccessDenied
                title="You can't open this product"
                description={`Your role in ${organization.name} can't see products. An owner or admin can change that in Team.`}
            />
        );
    }

    // The business's product (#531), as the storefront in the address sees
    // it — or the first that sells it.
    const overview = await withStorefrontFallback(query.storefront, (at) =>
        getProductOverview(at, productId),
    );
    if (!overview) notFound();
    const store = overview.storefront;

    const tab = isProductTab(query.tab) ? query.tab : "overview";
    const view = query.view === "customer" ? "customer" : "team";
    // The details sheet picks a category; only a writer opens it.
    const categories = overview.canWrite
        ? await listCategories().catch(() => [])
        : [];
    // A hint for which controls to draw; the API decides regardless.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const href = (t: Parameters<typeof productHref>[2]) =>
        productHref(store.id, productId, t);

    return (
        <PageContainer width="wide">
            <div className="flex flex-col gap-5">
                <ProductHeader
                    overview={overview}
                    storeId={store.id}
                    view={view}
                />
                {overview.product.status === "ARCHIVED" ? (
                    <ArchivedBanner
                        storeId={store.id}
                        productId={overview.product.id}
                        archivedAt={overview.product.archivedAt ?? null}
                        canWrite={overview.canWrite}
                    />
                ) : null}
                {view === "customer" ? (
                    <CustomerView
                        overview={overview}
                        storeId={store.id}
                        canWrite={overview.canWrite}
                    />
                ) : (
                    <>
                        <ProductTabs
                            overview={overview}
                            active={tab}
                            href={href}
                        />
                        <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
                            {tab === "overview" ? (
                                <ProductOverviewTab
                                    overview={overview}
                                    storeId={store.id}
                                    href={href}
                                    categories={categories}
                                />
                            ) : null}
                            {tab === "variants" ? (
                                <ProductVariantsTab
                                    overview={overview}
                                    storeId={store.id}
                                />
                            ) : null}
                            {tab === "photos" ? (
                                <ProductPhotosTab
                                    overview={overview}
                                    storeId={store.id}
                                />
                            ) : null}
                            {tab === "reviews" ? (
                                <ProductReviewsTab
                                    overview={overview}
                                    retryHref={href("reviews")}
                                    canReply={may("product-review:write")}
                                />
                            ) : null}
                            {tab === "orders" ? (
                                <ProductOrdersTab
                                    overview={overview}
                                    storeId={store.id}
                                    filter={
                                        query.orders === "recent"
                                            ? "recent"
                                            : "open"
                                    }
                                />
                            ) : null}
                            {tab === "discounts" ? (
                                <ProductDiscountsTab
                                    overview={overview}
                                    retryHref={href("discounts")}
                                />
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </PageContainer>
    );
}
