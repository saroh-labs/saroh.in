import { LegalPage } from "@/components/legal/legal-page";
import { COOKIES } from "@/content/legal";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/legal/cookies");

export const metadata = pageMetadata(page);

export default function Page() {
    return <LegalPage page={page} sections={COOKIES} />;
}
