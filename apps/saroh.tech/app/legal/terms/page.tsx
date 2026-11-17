import { LegalPage } from "@/components/legal/legal-page";
import { termsFor } from "@/content/legal";
import { paidPlansOn } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/legal/terms");

export const metadata = pageMetadata(page);

export default async function Page() {
    return <LegalPage page={page} sections={termsFor(await paidPlansOn())} />;
}
