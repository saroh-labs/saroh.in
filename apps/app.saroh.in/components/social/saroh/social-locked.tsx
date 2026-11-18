"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, PlanLockedState } from "@saroh/ui/data-state";
import { useRouter } from "next/navigation";

import { PlanLockedCard, PlanWay } from "@/components/billing/plan-way";
import { upgradeHref } from "@/lib/billing/access";
import { ADD_ONS_HREF } from "@/lib/share-item/share";
import { addSocialLabel, SHARE_WORDS } from "@/lib/share-item/words";
import type { SocialAccess } from "@/lib/social/saroh-social-types";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

/**
 * Saroh Social, locked (S1): what it does in one card, no blur, and the
 * one way to it. Grow is pointed at the add-on (its price only from the
 * catalogue), anything else at the plan that has it. Someone who can't
 * change the plan reads who can. Sharing from a phone stays free, said
 * under it. When the plan couldn't be checked, it says so: never drawn
 * unlocked by mistake.
 */
export function SocialLocked({
    access,
    price,
}: {
    /** Null: the plan couldn't be checked. */
    access: SocialAccess | null;
    /** The add-on's monthly price, from the catalogue; null without one. */
    price: string | null;
}) {
    const router = useRouter();
    if (!access) {
        return (
            <FailedState
                size="panel"
                title={SOCIAL_WORDS.couldntCheck}
                onRetry={() => router.refresh()}
            />
        );
    }
    const free = (
        <p className="text-pretty text-[13px] text-muted-foreground">
            {SOCIAL_WORDS.shareForFree}
        </p>
    );
    if (access.plan?.id === "grow") {
        return (
            <PlanLockedState
                data-social-locked="grow"
                size="panel"
                className="max-w-[640px]"
                name="Saroh Social"
                href={ADD_ONS_HREF}
                canChangePlan={access.canBuy}
                title={SOCIAL_WORDS.lockedTitle}
                description={SOCIAL_WORDS.lockedWhat}
                way={
                    <PlanWay
                        fallback={
                            <span className="text-[13px] text-muted-foreground">
                                {SHARE_WORDS.ownerCanAdd}
                            </span>
                        }
                    >
                        <Button asChild>
                            <a href={ADD_ONS_HREF}>{addSocialLabel(price)}</a>
                        </Button>
                    </PlanWay>
                }
                secondary={free}
            />
        );
    }
    return (
        <PlanLockedCard
            data-social-locked="plan"
            size="panel"
            className="max-w-[640px]"
            name="Saroh Social"
            plan={access.upgradeTo?.name}
            href={upgradeHref(access.upgradeTo?.planId)}
            title={SOCIAL_WORDS.lockedTitle}
            description={SOCIAL_WORDS.lockedWhat}
            secondary={free}
        />
    );
}
