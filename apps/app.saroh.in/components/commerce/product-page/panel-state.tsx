import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";

/**
 * The product page's own state card: the design draws it smaller than the
 * workspace's (a 28px icon, a 17px line, 36/24 of padding) because it sits
 * inside a tab, under the product's header, not as the whole page.
 */
export function TabState({
    icon: Icon,
    title,
    description,
    children,
    role = "status",
}: {
    icon: LucideIcon;
    title: string;
    description: React.ReactNode;
    /** Up to two `StateLink`s. */
    children?: React.ReactNode;
    role?: "status" | "alert";
}) {
    return (
        <div
            role={role}
            className="flex flex-col items-center gap-[9px] rounded-[12px] border border-dashed border-border px-6 py-9 text-center"
        >
            <Icon
                aria-hidden
                className="size-7 text-muted-foreground/60"
                strokeWidth={1.8}
            />
            <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                {title}
            </h2>
            <p className="max-w-[46ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                {description}
            </p>
            {children ? (
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                    {children}
                </div>
            ) : null}
        </div>
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
        <Link
            href={href}
            className={cn(
                "inline-flex items-center rounded-[9px] text-[12.5px] font-semibold coarse:min-h-11",
                primary
                    ? "h-[34px] bg-foreground px-3.5 text-background hover:bg-foreground/90"
                    : "h-8 border border-border bg-card px-3 text-foreground hover:bg-muted",
            )}
        >
            {children}
        </Link>
    );
}

/**
 * A panel of the product page that did not arrive: it could not be read
 * (retry, and say the rest of the page is current) or this role may not see
 * it (say so, and who can change it). Never a zero, never an empty list.
 */
export function PanelFailed({
    what,
    retryHref,
    note,
    elsewhere,
}: {
    what: string;
    retryHref: string;
    note?: string;
    /** Where the same records can be read on their own screen. */
    elsewhere?: { href: string; label: string };
}) {
    return (
        <TabState
            role="alert"
            icon={TriangleAlert}
            title={`Couldn't load ${what}`}
            description={
                note ??
                "The rest of the product loaded; only this did not. Nothing about the product has changed."
            }
        >
            <StateLink href={retryHref} primary>
                Try again
            </StateLink>
            {elsewhere ? (
                <StateLink href={elsewhere.href}>{elsewhere.label}</StateLink>
            ) : null}
        </TabState>
    );
}

export function PanelForbidden({ what }: { what: string }) {
    return (
        <TabState
            icon={Lock}
            title={`Your role can't see ${what}`}
            description="Everything else about the product is here. An owner or admin can change what your role reaches in Team."
        />
    );
}
