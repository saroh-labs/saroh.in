import { ReleaseHistory } from "@/components/releases/release-history";
import { flagHistory } from "@/lib/control-plane";
import { releaseForTab } from "@/lib/release-data";

/** The tab names the release by its key. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ key: string }>;
}) {
    const { key } = await params;
    return { title: `${key} · History · Releases` };
}

/** The last changes to the release: who, when, what and why. */
export default async function ReleaseHistoryPage({
    params,
}: {
    params: Promise<{ key: string }>;
}) {
    const data = await releaseForTab(params);
    if (!data) return null;
    const history = await flagHistory(data.flag.key).catch(() => null);
    return <ReleaseHistory history={history} />;
}
