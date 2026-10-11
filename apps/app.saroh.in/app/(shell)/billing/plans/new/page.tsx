import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { whoCanChange } from "@/components/shared/who-can-change";

import { PlanEditor } from "@/components/subscriptions/plan-editor/plan-editor";
import { membershipPlansLock } from "@/lib/billing/access";
import { permitsFor } from "@/lib/organizations/permits";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";
import { planEditorContext } from "@/lib/subscriptions/plan-editor-data";

export const metadata = { title: "New plan" };

/**
 * Payments → Plans → New plan (plan 2026-09-26-004, D7), after "Saroh Plan
 * Editor". Nothing is saved until it has a name; then it is a Draft nobody
 * can join, and the address becomes its edit page. Publish opens it.
 *
 * On a plan without memberships (6 Oct 2026) the API refuses a new plan,
 * so the page says so, with the way up, instead of an editor whose first
 * save would only fail. Unread access draws the editor: the API decides.
 */
export default async function NewPlanPage() {
    await requireSession();
    const organization = await resolveActiveOrganization();
    const may = permitsFor(organization);

    if (organization?.actions && !may("subscription:write")) {
        return (
            <AccessDenied
                {...whoCanChange({
                    thing: "New plan",
                    business: organization.name,
                    role: knownRoleName(organization),
                })}
                backHref={may("subscription:read") ? PLANS_HREF : "/"}
                backLabel={
                    may("subscription:read") ? "Back to plans" : "Back to Home"
                }
            />
        );
    }

    const locked = membershipPlansLock(await billingAccessOrNull());
    if (locked) {
        return (
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={[
                        "Payments",
                        <Link key="plans" href={PLANS_HREF}>
                            Plans
                        </Link>,
                        "New plan",
                    ]}
                    title="New plan"
                />
                <div className="max-w-[640px] space-y-3">
                    <LimitNoticeBlock
                        full={false}
                        title={locked.title}
                        body={locked.body}
                        cta={locked.cta}
                        href={locked.href}
                    />
                    <Button asChild variant="outline">
                        <Link href={PLANS_HREF}>Back to plans</Link>
                    </Button>
                </div>
            </PageContainer>
        );
    }

    const context = await planEditorContext(null);

    // The editor shell draws the page's one <main>.
    return (
        <PlanEditor
            initial={null}
            figures={null}
            takenNames={context.takenNames}
            withClasses={context.withClasses}
            autopayOffered={context.autopayOffered}
            currency={context.currency}
            canEdit
        />
    );
}
