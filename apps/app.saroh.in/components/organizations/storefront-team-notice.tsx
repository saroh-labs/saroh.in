"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { dismissStorefrontTeamNotice } from "@/lib/organizations/member-actions";
import type { StorefrontTeamNoticePerson } from "@/lib/organizations/members";

/** "3 people from your storefronts are now on your team as Storefront team". */
export function storefrontNoticeTitle(count: number, roleLabel: string) {
    return count === 1
        ? `1 person from your storefronts is now on your team as ${roleLabel}`
        : `${count} people from your storefronts are now on your team as ${roleLabel}`;
}

/**
 * Team's one-time notice after storefront people were put on the team
 * (F16, DEC-048 amended 2026-09-27). One roster underneath: everyone who
 * works on a storefront is now on the business's team, in the narrow
 * Storefront team role — no customers, bookings, orders or money. The owner
 * is told who, and can change anyone's role from here, so any widening is
 * on purpose.
 *
 * Someone whose role is changed drops off the list (the API stops naming
 * them); Dismiss hides it for the whole business, on the server.
 */
export function StorefrontTeamNotice({
    people,
    roleLabel,
    onChangeRole,
}: {
    people: StorefrontTeamNoticePerson[];
    /** What the business calls the role now ("Storefront team" until renamed). */
    roleLabel: string;
    onChangeRole: (userId: string) => void;
}) {
    const router = useRouter();
    const [dismissing, setDismissing] = useState(false);
    if (people.length === 0) return null;

    async function dismiss() {
        setDismissing(true);
        const res = await dismissStorefrontTeamNotice();
        setDismissing(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        router.refresh();
    }

    return (
        <section
            aria-labelledby="storefront-team-notice-title"
            className="overflow-hidden rounded-xl border border-border"
        >
            <div className="flex flex-wrap items-start gap-3 border-b border-muted bg-foreground/[0.03] px-4 py-3">
                <Store
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-[1_1_240px]">
                    <p
                        id="storefront-team-notice-title"
                        className="text-[13.5px] font-semibold"
                    >
                        {storefrontNoticeTitle(people.length, roleLabel)}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground">
                        They can see the team and the storefronts, but not
                        customers, bookings, orders or money. What they do in
                        their storefront hasn&apos;t changed. Change a role if
                        someone needs more.
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={dismissing}
                    onClick={dismiss}
                    className="text-[12.5px]"
                >
                    {dismissing ? "Dismissing…" : "Dismiss"}
                </Button>
            </div>
            <ul>
                {people.map((p, i) => {
                    const name = p.name?.trim() ? p.name.trim() : p.email;
                    return (
                        <li
                            key={p.userId}
                            className={cn(
                                "flex flex-wrap items-center gap-3 px-4 py-[11px]",
                                i > 0 && "border-t border-border",
                            )}
                        >
                            <div className="min-w-0 flex-[1_1_200px]">
                                <p className="text-[13.5px] font-medium [overflow-wrap:anywhere]">
                                    {name}
                                </p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    {p.storefronts.length > 0
                                        ? `From ${p.storefronts.join(", ")}`
                                        : p.email}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onChangeRole(p.userId)}
                                aria-label={`Change ${name}’s role`}
                                className="text-[12.5px]"
                            >
                                Change role
                            </Button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
