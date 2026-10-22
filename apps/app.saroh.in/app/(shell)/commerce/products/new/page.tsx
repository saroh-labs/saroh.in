import { ProductEditorV2 } from "@/components/commerce/product-editor-v2/editor-shell";
import { NoProductAccess } from "@/components/commerce/product-editor-v2/no-access";
import { ProductLimitReached } from "@/components/commerce/product-limit-reached";
import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page/page-container";
import { planMeter } from "@/lib/billing/meter";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { loadEditorContext } from "@/lib/products/editor-data";
import { newProductHref } from "@/lib/products/links";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { canAddLocation, locationLine } from "@/lib/stores/business-stores";
import { pickStorefront } from "@/lib/stores/pick";
import { readBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "New product" };

/**
 * Sell → Products → New product.
 *
 * A product is made at one storefront — that is where the API keeps it — so
 * with more than one, the first question is which. It is asked here as a
 * short list rather than a field on the form, because the answer decides the
 * currency and the categories the form offers.
 *
 * The locations are the business's, for every role (16 Oct audit, SEV 4):
 * a failed read says so, never "No locations yet". The editor is read-only
 * without `store:write`, and the API decides the create.
 */
export default async function NewProductPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ storefront }, organization, access] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
        billingAccessOrNull(),
    ]);
    if (organization?.actions && !organization.actions.includes("store:read")) {
        return <NoProductAccess organization={organization} />;
    }
    const stores = await readBusinessStores();
    // At the plan's limit, say so before the form, not on Create (UX-036).
    const meter = planMeter(access, "products");
    if (meter?.full) {
        return (
            <PageContainer width="form">
                <ProductLimitReached meter={meter} />
            </PageContainer>
        );
    }
    const store = stores ? pickStorefront(stores, storefront) : null;

    if (store) {
        const context = await loadEditorContext(
            store,
            undefined,
            stores ?? [store],
        );
        return <ProductEditorV2 {...context} product={null} />;
    }

    return (
        <PageContainer width="form">
            <StorefrontChooser
                section="Products"
                sectionHref="/commerce/products"
                crumb="New product"
                title="Where is it sold?"
                description="A product is made at one location, and priced in that location's currency."
                stores={stores}
                hrefFor={newProductHref}
                detail={locationLine}
                canCreate={canAddLocation(organization)}
            />
        </PageContainer>
    );
}
