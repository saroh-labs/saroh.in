"use client";

import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { Row, Section } from "@/components/sites/settings-rows";
import { setPublishNeedsApproval } from "@/lib/sites/actions";
import type { PublishApproval } from "@/lib/sites/publish-approval";
import {
    PUBLISH_APPROVAL_RULE,
    publishApprovalLine,
} from "@/lib/sites/publish-approval";

/**
 * "Publishing needs approval" (DEC-071, T13), on the site's settings.
 *
 * The owner gets the switch; everyone else reads whether it's on and who can
 * change it. Unlike the rest of this screen it isn't draft state: it takes
 * effect at once, so the section says there's nothing to publish. Rendered
 * only while test releases are on for the business, or while the setting is
 * already on (`publishApprovalOf`).
 */
export function PublishApprovalSection({
    siteId,
    approval,
}: {
    siteId: string;
    approval: PublishApproval;
}) {
    const router = useRouter();
    const id = useId();
    const [on, setOn] = useState(approval.on);
    const [pending, startTransition] = useTransition();

    function change(next: boolean) {
        setOn(next);
        startTransition(async () => {
            const res = await setPublishNeedsApproval(siteId, next);
            if (!res.ok) {
                setOn(!next);
                // Review isn't in the plan (U13): the way up, not a toast.
                if (res.plan) showPlanRefusal(res.plan);
                else showError(res.error);
                return;
            }
            router.refresh();
            showSuccess(
                next
                    ? "Publishing now needs approval."
                    : "Publishing no longer needs approval.",
            );
        });
    }

    return (
        <Section
            title="Publishing"
            description="Whether a change needs someone else's approval before it goes live. Changes here apply at once; there's nothing to publish."
        >
            <Row
                label="Needs approval"
                action={
                    approval.canChange ? (
                        <Switch
                            id={id}
                            checked={on}
                            disabled={pending}
                            onCheckedChange={change}
                            aria-label="Publishing needs approval"
                            aria-describedby={`${id}-rule`}
                            className="disabled:cursor-default"
                        />
                    ) : undefined
                }
            >
                {approval.canChange ? (
                    <span id={`${id}-rule`} className="text-muted-foreground">
                        {PUBLISH_APPROVAL_RULE}
                    </span>
                ) : (
                    <div className="space-y-0.5">
                        <div>{publishApprovalLine(on)}</div>
                        {on ? (
                            <div className="text-xs text-muted-foreground">
                                Only an approved test release can go live.
                            </div>
                        ) : null}
                    </div>
                )}
            </Row>
        </Section>
    );
}
