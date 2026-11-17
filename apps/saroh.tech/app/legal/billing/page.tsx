import { LegalPage } from "@/components/legal/legal-page";
import { billingFor } from "@/content/legal";
import { paidPlansOn } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/legal/billing");

export const metadata = pageMetadata(page);

export default async function Page() {
    return <LegalPage page={page} sections={billingFor(await paidPlansOn())} />;
}
