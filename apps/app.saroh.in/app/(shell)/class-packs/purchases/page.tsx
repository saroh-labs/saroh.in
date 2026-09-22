import { PurchasesScreen } from "@/components/class-packs/purchases-screen";
import { PageContainer } from "@/components/shared/page-container";
import { canWritePacks } from "@/lib/class-packs/access";
import {
    getSellingTerms,
    listPacks,
    listPurchases,
} from "@/lib/class-packs/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Who holds a class pack" };

/** Class packs → who holds one, with classes left and when it runs out. */
export default async function PackPurchasesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    await requireSession();
    const [purchases, packs, organization, params] = await Promise.all([
        listPurchases(),
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
            <PurchasesScreen
                purchases={purchases}
                packs={packs}
                contacts={contacts}
                canWrite={canWrite}
                invoicesOnSale={terms.invoicesOnSale}
                initialFilterId={params.view}
            />
        </PageContainer>
    );
}
