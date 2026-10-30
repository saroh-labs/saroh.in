import { Badge } from "@saroh/ui/badge";
import { buttonVariants } from "@saroh/ui/button";
import { FailedRead } from "@saroh/ui/failed-read";
import { ListCard, ListRow } from "@saroh/ui/list-card";
import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";
import type { Metadata } from "next";

import { getOnboardingUrl } from "@/lib/app-urls";
import type { Business } from "@/lib/businesses";
import {
    businessBadge,
    consoleUrl,
    isStaff,
    listBusinesses,
    openBusinessUrl,
    PAUSED_DETAIL,
    ROLE_LABEL,
    ROLE_SHORT,
} from "@/lib/businesses";

export const metadata: Metadata = {
    title: "Your businesses",
    description:
        "Choose a business to open, see your role in each, and manage your account.",
};

/**
 * Every business a person belongs to and the role they hold in each, in the
 * account area's frame (DEC-199: unparked, a menu place like the other two).
 * It no longer sends someone with one business straight into it: a place
 * in the menu has to stay put when it is opened.
 */
export default async function BusinessesPage() {
    const [businesses, staff] = await Promise.all([
        listBusinesses().catch(() => null),
        isStaff(),
    ]);
    const header = (
        <PageHeader
            title="Your businesses"
            description="What you can do in each depends on the role that business gave you."
            actions={
                <a href={getOnboardingUrl()} className={buttonVariants()}>
                    Add a business
                </a>
            }
        />
    );
    if (businesses === null) {
        return (
            <div className="max-w-[760px]">
                {header}
                <FailedRead
                    size="panel"
                    things="your businesses"
                    className="mt-6"
                />
            </div>
        );
    }

    const owned = businesses.filter((b) => b.role === "OWNER");
    const invited = businesses.filter((b) => b.role !== "OWNER");

    return (
        <div className="max-w-[760px]">
            {header}
            <div className="mt-6 grid gap-6">
                {owned.length > 0 ? (
                    <Group main="Yours" businesses={owned} />
                ) : null}
                {invited.length > 0 ? (
                    <Group main="On the team" businesses={invited} />
                ) : null}
                {businesses.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        You don&apos;t belong to a business yet.
                    </p>
                ) : null}
                {staff ? (
                    <p className="text-muted-foreground text-sm">
                        You run this instance too:{" "}
                        <TextLink href={consoleUrl()}>
                            open the console
                        </TextLink>
                        .
                    </p>
                ) : null}
            </div>
        </div>
    );
}

function Group({ main, businesses }: { main: string; businesses: Business[] }) {
    return (
        <ListCard main={main} end="Open">
            {businesses.map((business) => {
                const state = businessBadge(business);
                return (
                    // By id: two businesses may share a name.
                    <li key={business.id}>
                        <ListRow
                            title={<span data-ph-mask="">{business.name}</span>}
                            tag={
                                state ? (
                                    <Badge variant={state.variant} size="sm">
                                        {state.label}
                                    </Badge>
                                ) : undefined
                            }
                            sub={
                                business.paused
                                    ? PAUSED_DETAIL
                                    : business.roleLabel
                                      ? `${business.roleLabel}, a role this business made`
                                      : `${ROLE_LABEL[business.role]} · ${ROLE_SHORT[business.role]}`
                            }
                            end={
                                <a
                                    href={openBusinessUrl(business.id)}
                                    className={buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                    })}
                                    aria-label={`Open ${business.name}`}
                                >
                                    Open
                                </a>
                            }
                        />
                    </li>
                );
            })}
        </ListCard>
    );
}
