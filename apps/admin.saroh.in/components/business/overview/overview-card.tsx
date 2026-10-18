import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { FailedState } from "@saroh/ui/data-state";
import Link from "next/link";
import type { ReactNode } from "react";

import type { OverviewPanel } from "@/lib/overview-words";

import type { BusinessTab } from "../business-tabs";

import { changedRowProps } from "../../changed-row";

/**
 * One card on a business's Overview (admin plan U3): a title, its action,
 * and its body. A card whose part of the read failed says so in place, and
 * the other cards stand. After a live write from its action, the card wears
 * the just-changed ground for two seconds (`useChangeFeedback`, R9).
 */
export function OverviewCard<T>({
    id,
    title,
    description,
    actions,
    data,
    highlighted = false,
    children,
}: {
    /** The card's name for tests and the highlight: `plan`, `usage`, … */
    id: string;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    data: OverviewPanel<T>;
    highlighted?: boolean;
    children: (data: T) => ReactNode;
}) {
    return (
        <Card
            className="min-w-0"
            data-overview-card={id}
            aria-labelledby={`overview-${id}-title`}
            role="region"
            {...changedRowProps(highlighted)}
        >
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                    <CardTitle
                        id={`overview-${id}-title`}
                        className="text-[15px]"
                    >
                        {title}
                    </CardTitle>
                    {description && (
                        <CardDescription className="mt-1">
                            {description}
                        </CardDescription>
                    )}
                </div>
                {actions && data.status === "ok" && (
                    <div className="flex flex-wrap items-start gap-2">
                        {actions}
                    </div>
                )}
            </CardHeader>
            <CardContent className="min-w-0">
                {data.status === "failed" ? (
                    <FailedState
                        size="inline"
                        title={`Couldn't load ${title.toLowerCase()}`}
                        description="Nothing has been changed. The rest of the page is current; reload to try this card again."
                    />
                ) : (
                    children(data.data)
                )}
            </CardContent>
        </Card>
    );
}

/** A card's link to the tab that holds the rest. */
export function CardLink({
    organizationId,
    tab,
    children,
}: {
    organizationId: string;
    tab: BusinessTab;
    children: ReactNode;
}) {
    // `businessTabHref`'s address, built here: that module is a client
    // one, and these cards are drawn on the server too.
    return (
        <Link
            href={`/businesses/${encodeURIComponent(organizationId)}/${tab}`}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
            {children}
        </Link>
    );
}
