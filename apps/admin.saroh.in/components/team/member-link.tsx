"use client";

import { CopyButton } from "@saroh/ui/copy-button";
import { showSuccess } from "@saroh/ui/toast";

import { managerLink } from "@/lib/team-member-words";

/**
 * Their manager link and code (DEC-169, U19), each with Copy: the `?am=`
 * link to the public site, which a business signs up through, and the code
 * an owner types at sign-up instead. Both name them as the one who brought
 * the business in. Copy says "Copied" on the button and in a toast.
 */
export function MemberLink({
    code,
    siteUrl,
    isManager,
    self,
}: {
    /** Null until their profile is first saved. */
    code: string | null;
    siteUrl: string;
    /** Whether they hold the Account manager role now. */
    isManager: boolean;
    self: boolean;
}) {
    const whose = self ? "your" : "their";
    if (!code) {
        return (
            <section
                aria-label="Manager link"
                className="grid gap-1 rounded-xl border bg-card p-4"
            >
                <h2 className="text-[15px] font-semibold">Manager link</h2>
                <p className="text-sm text-muted-foreground">
                    {self ? "You get" : "They get"} a link and a code once{" "}
                    {whose} details are first saved.
                </p>
            </section>
        );
    }
    const link = managerLink(siteUrl, code);
    return (
        <section
            aria-label="Manager link"
            className="grid gap-3 rounded-xl border bg-card p-4"
        >
            <div className="grid gap-0.5">
                <h2 className="text-[15px] font-semibold">Manager link</h2>
                <p className="text-sm text-muted-foreground">
                    {isManager
                        ? `A business that signs up through ${whose} link, or types ${whose} code, is ${self ? "yours" : "theirs"} to look after.`
                        : `Works only while ${self ? "you hold" : "they hold"} the Account manager role.`}
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <code
                    data-testid="manager-link"
                    className="min-w-0 break-all rounded-md bg-muted px-2.5 py-1.5 font-mono text-[13px]"
                >
                    {link}
                </code>
                <CopyButton
                    value={link}
                    label="Copy link"
                    thing="link"
                    onCopied={() => showSuccess("Link copied", link)}
                />
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <p className="text-sm">
                    Code{" "}
                    <code
                        data-testid="manager-code"
                        className="rounded-md bg-muted px-2 py-1 font-mono text-[13px] tracking-wider"
                    >
                        {code}
                    </code>
                </p>
                <CopyButton
                    value={code}
                    label="Copy code"
                    thing="code"
                    onCopied={() => showSuccess("Code copied", code)}
                />
            </div>
        </section>
    );
}
