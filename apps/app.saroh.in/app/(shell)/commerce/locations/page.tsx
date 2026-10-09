import { PageContainer } from "@/components/shared/page-container";
import { StorefrontsScreen } from "@/components/stores/storefronts-screen";
import { mayAddStorefront } from "@/lib/business-limits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { readSiteSelling } from "@/lib/stores/location-selling";
import { locationsWord } from "@/lib/stores/pick";
import {
    getStorefront,
    getStorefrontAllowance,
    listStorefronts,
} from "@/lib/stores/storefronts";

/**
 * Sell → Locations: the places the business sells from, and each one's own
 * settings. A location is a `Store` in code and a storefront in the API
 * (DEC-069 renamed the words, not the identifiers).
 *
 * The chosen storefront lives in `?storefront=` so a link to one lands on
 * it, and read here rather than in the screen for the reason Orders gives:
 * `useSearchParams` would put the whole screen behind Suspense for a value
 * needed once. An unknown id falls back to the first, not to an error.
 */
export async function generateMetadata() {
    // Named by the count, as the rail names it: "Location" for one.
    const storefronts = await listStorefronts().catch(() => []);
    return { title: locationsWord(storefronts.length) };
}

export default async function StorefrontsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [organization, storefronts, allowance, siteSelling, { storefront }] =
        await Promise.all([
            resolveActiveOrganization(),
            listStorefronts(),
            // How many the plan allows; unreadable offers New and lets the
            // API decide.
            getStorefrontAllowance().catch(() => null),
            // Which location the online shop sells from, for each one's
            // "Sells in person only / and online" line (DEC-069).
            readSiteSelling(),
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
                site={siteSelling.known ? siteSelling.site : undefined}
                canCreate={
                    may("store:create") &&
                    mayAddStorefront(
                        allowance && {
                            // The list is the fresher count of the two.
                            used: storefronts.length,
                            limit: allowance.limit,
                        },
                    )
                }
                canEdit={may("store:write")}
                canClose={may("store:delete")}
                // How customers who share an email are linked is a
                // customer-record call too (C15): the API asks for both.
                canLinkCustomers={may("store:write") && may("contact:write")}
            />
        </PageContainer>
    );
}
