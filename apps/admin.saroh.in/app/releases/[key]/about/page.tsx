import { AboutRelease } from "@/components/releases/release-about";
import { todayIso } from "@/lib/format";
import { releaseForTab } from "@/lib/release-data";

/** What the release is for, who looks after it and when it can go. */
export default async function ReleaseAboutPage({
    params,
}: {
    params: Promise<{ key: string }>;
}) {
    const data = await releaseForTab(params);
    if (!data) return null;
    return <AboutRelease flag={data.flag} today={todayIso()} />;
}
