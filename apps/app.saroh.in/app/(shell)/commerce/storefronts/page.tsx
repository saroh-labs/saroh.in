import { PageContainer } from "@/components/shared/page-container";
import { StorefrontsScreen } from "@/components/stores/storefronts-screen";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { getStorefront, listStorefronts } from "@/lib/stores/storefronts";

/**
 * Sell → Storefronts: the places the business sells from, and each one's own
 * settings.
 *
 * The chosen storefront lives in `?storefront=` so a link to one lands on
 * it, and read here rather than in the screen for the reason Orders gives:
 * `useSearchParams` would put the whole screen behind Suspense for a value
 * needed once. An unknown id falls back to the first, not to an error.
 */
export const metadata = { title: "Storefronts" };

export default async function StorefrontsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [organization, storefronts, { storefront }] = await Promise.all([
        resolveActiveOrganization(),
        listStorefronts(),
        searchParams,
    ]);

    const chosen =
        storefronts.find((s) => s.id === storefront) ?? storefronts.at(0);
    const selected = chosen
        ? await getStorefront(chosen.id).catch(() => null)
        : null;

    // From what the API resolved this person may do, as Team does; the role's
    // name is only the fallback for a response that predates permissions.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <PageContainer width="full">
            <StorefrontsScreen
                businessName={organization?.name ?? "This business"}
                storefronts={storefronts}
                selected={selected}
                canCreate={may("store:create")}
                canEdit={may("store:write")}
                canClose={may("store:delete")}
            />
        </PageContainer>
    );
}
