import { PacksScreen } from "@/components/class-packs/packs-screen";
import { PageContainer } from "@/components/shared/page-container";
import { canWritePacks } from "@/lib/class-packs/access";
import { getSellingTerms, listPacks } from "@/lib/class-packs/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Class packs" };

/** Class packs: what is sold, on its tab (On sale, Archived). */
export default async function ClassPacksPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string; sell?: string }>;
}) {
    await requireSession();
    const [packs, organization, params] = await Promise.all([
        listPacks(),
        resolveActiveOrganization(),
        searchParams,
    ]);
    const canWrite = canWritePacks(organization);
    const [contacts, terms] = await Promise.all([
        canWrite ? contactPickerOptions() : Promise.resolve([]),
        getSellingTerms(),
    ]);

    return (
        <PageContainer width="full">
            <PacksScreen
                packs={packs}
                contacts={contacts}
                canWrite={canWrite}
                invoicesOnSale={terms.invoicesOnSale}
                initialFilterId={params.view}
                openSell={canWrite && params.sell === "1"}
            />
        </PageContainer>
    );
}
