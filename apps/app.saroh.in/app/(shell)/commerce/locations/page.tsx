import { LocationsContainer } from "@/components/stores/locations/locations-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { locationsWord } from "@/lib/stores/pick";
import { listStorefronts } from "@/lib/stores/storefronts";

/**
 * Sell → Locations: the places the business sells from, and each one's own
 * settings. A location is a `Store` in code and a storefront in the API
 * (DEC-069 renamed the words, not the identifiers).
 *
 * The chosen storefront lives in `?storefront=` so a link to one lands on
 * it; an unknown id falls back to the first, not to an error. The open tab
 * (`?section=`) is the screen's own, as Settings › Business keeps its tab
 * (`useTabParam`).
 *
 * On React Query (DEC-259): the page awaits only its gates (the session,
 * the business and what this person may do there) and the address; the
 * locations and the chosen one's page are `LocationsContainer`'s reads.
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
    const session = await requireSession();
    const [organization, { storefront }] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
    ]);

    // From what the API resolved this person may do, as Team does; the role's
    // name is only the fallback for a response that predates permissions.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <LocationsContainer
            businessName={organization?.name ?? "This business"}
            chosen={typeof storefront === "string" ? storefront : undefined}
            userId={session.user.id}
            organization={
                organization && {
                    actions: organization.actions,
                    role: organization.role,
                }
            }
            mayCreate={may("store:create")}
            canEdit={may("store:write")}
            canUploadLogo={may("media:write")}
            canClose={may("store:delete")}
            // How customers who share an email are linked is a
            // customer-record call too (C15): the API asks for both.
            canLinkCustomers={may("store:write") && may("contact:write")}
        />
    );
}
