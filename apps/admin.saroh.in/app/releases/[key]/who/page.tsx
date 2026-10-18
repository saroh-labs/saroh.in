import { WhoHasIt } from "@/components/releases/who-has-it";
import { explainFlag } from "@/lib/control-plane";
import { releaseForTab } from "@/lib/release-data";

/** The tab names the release by its key. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ key: string }>;
}) {
    const { key } = await params;
    return { title: `${key} · Who has it · Releases` };
}

/**
 * Every business, what it gets and why. `?organizationId=` asks the
 * resolver why that one business sees what it sees ("Why?").
 */
export default async function ReleaseWhoPage({
    params,
    searchParams,
}: {
    params: Promise<{ key: string }>;
    searchParams: Promise<{ organizationId?: string }>;
}) {
    const data = await releaseForTab(params);
    if (!data) return null;
    const { flag, organizations, canPublish } = data;
    const { organizationId } = await searchParams;
    const explanation = organizationId
        ? await explainFlag(flag.key, organizationId).catch(() => null)
        : null;

    return (
        <WhoHasIt
            flag={flag}
            organizations={organizations}
            canPublish={canPublish}
            explained={
                explanation && organizationId
                    ? { organizationId, explanation }
                    : null
            }
        />
    );
}
