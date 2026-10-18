import { Badge } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import type { AdminFlag, AdminOrganization } from "@/lib/control-plane";
import {
    chipIsOn,
    effectiveSummary,
    releaseState,
    STATE_LABEL,
} from "@/lib/releases";

import { ReleaseActions } from "./release-actions";

/**
 * The top of a release's page (R11): the name a business sees, the code
 * name under it, its state pill and one line on who has it. The actions
 * (Turn on for some…, Turn on for everyone…, ⋯ More actions) only for
 * someone who may publish; anyone else is told why there are none.
 */
export function ReleaseHeader({
    flag,
    organizations,
    canPublish,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
    canPublish: boolean;
}) {
    return (
        <PageHeader
            className="mb-5"
            breadcrumb={[
                <Link key="releases" href="/releases">
                    Releases
                </Link>,
                flag.metadata.shownAs,
            ]}
            title={flag.metadata.shownAs}
            badge={
                <Badge variant={chipIsOn(flag) ? "success" : "neutral"}>
                    {STATE_LABEL[releaseState(flag)]}
                </Badge>
            }
            description={
                <span className="grid gap-1">
                    <code className="break-all font-mono text-[12.5px]">
                        {flag.key}
                    </code>
                    <span>
                        {effectiveSummary(flag)}
                        {!canPublish &&
                            " Read-only: your role doesn't include turning releases on or off."}
                    </span>
                </span>
            }
            actions={
                canPublish ? (
                    <ReleaseActions flag={flag} organizations={organizations} />
                ) : undefined
            }
        />
    );
}
