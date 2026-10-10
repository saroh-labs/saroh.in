import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Children } from "react";

import { whoCanChange } from "@/components/shared/who-can-change";

/**
 * A product tab with nothing in it yet: the shared empty card at panel
 * size, since it sits inside a tab under the product's header, not as the
 * whole page. `children` are its actions (up to two `StateLink`s).
 */
export function TabState({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: LucideIcon;
    title: string;
    description: React.ReactNode;
    /** Up to two `StateLink`s. */
    children?: React.ReactNode;
}) {
    const actions = Children.toArray(children);
    return (
        <EmptyState
            size="panel"
            icon={<Icon />}
            title={title}
            description={description}
            action={
                actions.length ? (
                    <div className="flex flex-wrap justify-center gap-2">
                        {actions}
                    </div>
                ) : undefined
            }
        />
    );
}

/** A state card's action: the ink one first, the outline ones after. */
export function StateLink({
    href,
    primary = false,
    children,
}: {
    href: string;
    primary?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Button
            asChild
            variant={primary ? "default" : "outline"}
            className="wk-press"
        >
            <Link href={href}>{children}</Link>
        </Button>
    );
}

/**
 * A panel of the product page that could not be read: the failed card, an
 * alert with Try again (a fresh load of the tab, which reads it again).
 * Never a zero, never an empty list. `reassurance` is the one true thing
 * the tab can add to "Nothing has been changed."
 */
export function PanelFailed({
    what,
    retryHref,
    reassurance = "The rest of the product loaded.",
    elsewhere,
}: {
    what: string;
    retryHref: string;
    reassurance?: string;
    /** Where the same records can be read on their own screen. */
    elsewhere?: { href: string; label: string };
}) {
    return (
        <FailedState
            size="panel"
            title={couldntLoad(what)}
            description={nothingChanged(reassurance)}
            retryHref={retryHref}
            action={
                elsewhere ? (
                    <StateLink href={elsewhere.href}>
                        {elsewhere.label}
                    </StateLink>
                ) : undefined
            }
        />
    );
}

/**
 * A panel this role may not see: the denied card, with the one sentence
 * (`whoCanChange`). Not the empty card, and nothing to retry.
 */
export function PanelForbidden({ what }: { what: string }) {
    const words = whoCanChange({ thing: what });
    return (
        <PermissionDeniedState
            size="panel"
            title={words.title}
            description={words.description}
            note={words.note}
        />
    );
}
