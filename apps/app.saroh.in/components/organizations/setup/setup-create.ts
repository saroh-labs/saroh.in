import { authClient } from "@saroh/auth/client";
import { showError, showInfo } from "@saroh/ui/toast";

import { startWithGoalAction } from "@/lib/modules/first-goal-actions";
import { GOAL_LATER } from "@/lib/modules/goals";
import { createOrganization } from "@/lib/organizations/actions";
import type { BillingField } from "@/lib/organizations/setup-billing";
import { billingFieldOf, billingSent } from "@/lib/organizations/setup-billing";
import type { SetupValues } from "@/lib/organizations/setup-steps";
import { browserZone } from "@/lib/organizations/time-zones";
import {
    startCheckoutAfterOnboarding,
    takeLaunchOfferAfterOnboarding,
} from "@/lib/saroh-billing/checkout-actions";

/** What setup's last button came to. */
export type SetupOutcome =
    /** Made: go here. Anything that went half-wrong has been said. */
    | { made: true; href: string }
    /** Not made, and it is this field's problem: say it under the field. */
    | {
          made: false;
          field: "yourName" | "name" | "address" | BillingField;
          message: string;
      }
    /** Not made, and it has been said. */
    | { made: false; field?: undefined };

/**
 * Setup's create (DEC-130): the business from the three steps' answers,
 * then its first goal turned on with the defaults, then the plan or the
 * invite picked on saroh.in. One press, no second sheet.
 *
 * Nothing here knows about steps. It answers with what happened, and the
 * form shows a field's problem on that field's own step.
 */
export async function createFromSetup(
    values: SetupValues,
    {
        needsName,
        checkout,
        invite,
        billing = false,
        onMade,
    }: {
        /** The account has no name yet: it is saved first. */
        needsName: boolean;
        /** Who Saroh bills was asked (DEC-167): the answer is sent. */
        billing?: boolean;
        checkout?: {
            plan: string;
            cycle: "month" | "year";
            name: string;
        } | null;
        invite?: string | null;
        /** The business exists, whatever happens next. */
        onMade: () => void;
    },
): Promise<SetupOutcome> {
    const businessName = values.name.trim();
    // The account's own name first: the business's team, its invoices
    // and its welcome email all say who made it.
    if (needsName) {
        const saved = await authClient
            .updateUser({ name: (values.yourName ?? "").trim() })
            .then(
                (res) => !res.error,
                () => false,
            );
        if (!saved) {
            return {
                made: false,
                field: "yourName",
                message: "Couldn't save your name. Try again.",
            };
        }
    }
    const zone = browserZone();
    const res = await createOrganization({
        name: businessName,
        kind: values.kind,
        address: values.address,
        // What they chose to do first: the welcome email leads with it.
        ...(values.goal === GOAL_LATER ? {} : { goal: values.goal }),
        ...(billing ? billingSent(values) : {}),
        // A Saroh teammate's code, when one was typed (DEC-169).
        ...(values.managerCode?.trim()
            ? { managerCode: values.managerCode }
            : {}),
        profile: {
            country: values.country,
            // The browser's zone (UX-008): the business's for a country
            // that keeps several; one that keeps one zone uses that.
            ...(zone ? { timezone: zone } : {}),
        },
    });
    if (!res.ok) {
        if (res.field === "name" || res.field === "address") {
            return { made: false, field: res.field, message: res.error };
        }
        // Who Saroh bills, refused: said on its own step, when it was asked.
        const onStep = billing ? billingFieldOf(res.field) : null;
        if (onStep) return { made: false, field: onStep, message: res.error };
        showError(res.error);
        return { made: false };
    }
    onMade();
    // Turn its first goal on with the defaults and learn where to land. A
    // goal that can't be turned on lands on Home with the reason: the
    // business is set up either way.
    const start = await startWithGoalAction(values.goal, values.kind).catch(
        () => ({
            href: "/",
            said: `${businessName} is set up. Pick what to do first from Home.`,
        }),
    );
    if (invite) {
        // Where the waitlist entry is marked joined and the offer starts;
        // the API checks the invite against this account.
        const taken = await takeLaunchOfferAfterOnboarding(invite);
        if (!taken.ok) {
            showError(
                `${businessName} is set up, but the launch offer isn't applied yet.`,
                taken.error,
            );
        }
    } else if (checkout) {
        const started = await startCheckoutAfterOnboarding({
            plan: checkout.plan,
            cycle: checkout.cycle,
        });
        if (started.kind === "authorise") {
            // The provider's page, given once (U15). Leaving the app, so
            // the button stays "Setting up…" until the page goes.
            window.location.assign(started.url);
            return new Promise<never>(() => undefined);
        }
        if (started.kind === "failed") {
            showError(
                `${businessName} is set up, but ${checkout.name} isn't started yet.`,
                started.error,
            );
        }
    }
    if (start.said) showInfo(start.said);
    return { made: true, href: start.href };
}
