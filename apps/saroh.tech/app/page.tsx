import { StubPage } from "@/components/shared/stub-page";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/");

export const metadata = pageMetadata(page);

export default function HomePage() {
    return <StubPage page={page} />;
}
