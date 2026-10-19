import { redirect } from "next/navigation";

import { releaseHref } from "@/lib/releases";

/** `/flags/KEY` (and anything under it) lands on that release's page. */
export default async function FlagRedirect({
    params,
}: {
    params: Promise<{ rest: string[] }>;
}) {
    const { rest } = await params;
    redirect(rest[0] ? releaseHref(decodeURIComponent(rest[0])) : "/releases");
}
