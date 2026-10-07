import type { EmailSetup } from "@/lib/communications/email-setup";
import {
    EMAIL_PROMPT_MISSED,
    SEE_PLANS_HREF,
} from "@/lib/communications/email-setup";
import { rolledOut } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import {
    BUSINESS_TYPE_ANCHOR,
    businessTypeOf,
} from "@/lib/organizations/business-types";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import type { ReadyAside, ReadyChecklist, ReadyItem, ReadyStep } from "./ready";
import {
    business,
    emailAttention,
    emailHeldByPlan,
    handlesMoney,
    on,
    readyChecklist,
} from "./ready";

/**
 * Settings › Business's "Ready to take payments" is the take-money steps
 * (`readyChecklist`, the same as Home's) and then what else the design's
 * card asks for there (DEC-056 brought them back after F8 dropped them):
 *
 * - **Email**, while Communications is on and no email provider sends
 *   (`emailAttention`) — the danger dot when one that was sending stopped.
 * - **Business type**, until one is chosen, for a business that didn't say
 *   Registered at setup. One that did is asked by the take-money steps
 *   instead (`readyChecklist`): Registered saves no type, so the real one
 *   (Pvt Ltd, LLP, partnership…) holds it back from going live (user,
 *   2026-09-28). For everyone else it is only a suggestion.
 * - **Logo**, which prints on every receipt and invoice.
 * - **A pipeline**, while Contacts is on without one.
 *
 * Business type and logo are paper a business hands someone who pays it, so
 * like the registered address they are asked only once something invoices
 * or takes money (`handlesMoney`, DEC-070): a site with nothing to sell is
 * never told to pick a company type.
 *
 * Home keeps only the steps: these are not about taking money, so Home's
 * count is the steps' and Settings' is the steps' and these together.
 *
 * Each is left, done, or not asked at all. Unknown (a read that failed, an
 * older API) is not asked, so the count never claims what nobody checked.
 * A module Saroh has not rolled out is never named (DEC-057).
 */

type Nudge = ReadyItem & { left: boolean };

function email(
    modules: readonly ModuleView[] | null,
    messaging: readonly ConnectedCommsProvider[] | null,
    setup: EmailSetup | null | undefined,
): Nudge | null {
    // Asked only once both lists are read and Communications is on.
    if (!modules || !messaging || !on(modules, "COMMUNICATIONS")) return null;
    const attention = emailAttention(modules, messaging);
    // The plan can't connect one (DEC-091): never a Connect the API would
    // refuse, and not a step the business could finish. Said beside the
    // steps instead (`emailAside`).
    if (emailHeldByPlan(attention, setup)) return null;
    const sends = messaging.some(
        (c) => c.channel === "EMAIL" && c.status === "CONNECTED",
    );
    // Sending on WhatsApp alone, with no email set up: not asked, rather
    // than ticked for something they never did.
    if (attention === null && !sends) return null;
    if (attention === "disconnected") {
        return {
            key: "email",
            label: "Reconnect email",
            why: "Your email provider is disconnected, so receipts and messages to customers aren't sending.",
            cta: "Reconnect email",
            href: "/settings/providers",
            broken: true,
            left: true,
        };
    }
    return {
        key: "email",
        label: "Connect an email provider",
        why: "So receipts and messages to customers get sent.",
        cta: "Connect email",
        href: "/settings/providers",
        broken: false,
        left: attention !== null,
    };
}

function businessType(
    settings: Pick<OrganizationSettings, "profile">,
): Nudge | null {
    // Said Registered: a take-money step asks, not this (`ready.ts`).
    if (settings.profile?.registered === true) return null;
    return {
        key: "businessType",
        label: "Choose your business type",
        why: "Sole proprietor, partnership, LLP, private limited or another — so your business details are complete.",
        cta: "Choose type",
        // Straight to the Type field, not the top of the tab.
        href: `${business("identity")}#${BUSINESS_TYPE_ANCHOR}`,
        broken: false,
        left: businessTypeOf(settings.profile?.type) === "",
    };
}

function logo(settings: Pick<OrganizationSettings, "logo">): Nudge | null {
    // Absent from an API older than the logo: unknown, not missing.
    if (settings.logo === undefined) return null;
    return {
        key: "logo",
        label: "Add your logo",
        why: "It goes on every receipt and invoice.",
        cta: "Add logo",
        href: business("identity"),
        broken: false,
        left: settings.logo === null,
    };
}

function pipeline(modules: readonly ModuleView[] | null): Nudge | null {
    if (!modules || !on(modules, "CRM")) return null;
    const blocker = rolledOut(modules)
        .find((m) => m.key === "CRM")
        ?.blockers.find((b) => b.code === "CRM_NO_PIPELINE");
    return {
        key: "pipeline",
        label: "Create a pipeline",
        why: "So enquiries don't get lost.",
        cta: "Set up",
        href: blocker?.actionHref ?? "/settings/modules",
        broken: false,
        left: blocker !== undefined,
    };
}

/**
 * On a plan that can't connect the business's own email (DEC-091): beside
 * the steps, outside the count (as DEC-092's payments), "Comes with a paid
 * plan" and See plans — to who may see the plans (`billing:read`) only.
 */
export function emailAside(input: {
    modules: readonly ModuleView[] | null;
    messaging: readonly ConnectedCommsProvider[] | null;
    emailSetup?: EmailSetup | null;
    mayPlans?: boolean;
}): ReadyAside | null {
    if (!input.mayPlans) return null;
    if (
        !emailHeldByPlan(
            emailAttention(input.modules, input.messaging),
            input.emailSetup,
        )
    ) {
        return null;
    }
    return {
        key: "email",
        label: "Email your customers",
        why: EMAIL_PROMPT_MISSED,
        comesWith: "Comes with a paid plan",
        cta: "See plans",
        href: SEE_PLANS_HREF,
    };
}

/** What Settings asks for beside the steps, in the design's order. */
export function settingsNudges({
    settings,
    modules,
    messaging,
    emailSetup,
}: {
    settings: Pick<OrganizationSettings, "profile" | "logo" | "setup">;
    modules: readonly ModuleView[] | null;
    messaging: readonly ConnectedCommsProvider[] | null;
    /** Whether the plan can connect one (DEC-091); unread asks as before. */
    emailSetup?: EmailSetup | null;
}): Nudge[] {
    // Unknown (the modules could not be read) asks as it always did.
    const money = handlesMoney(modules, settings.setup) !== false;
    return [
        email(modules, messaging, emailSetup),
        money ? businessType(settings) : null,
        money ? logo(settings) : null,
        pipeline(modules),
    ].filter((n): n is Nudge => n !== null);
}

/** Settings › Business's card: the take-money steps, then the nudges. */
export function settingsChecklist(input: {
    settings: Parameters<typeof readyChecklist>[0]["settings"] &
        Pick<OrganizationSettings, "logo">;
    modules: readonly ModuleView[] | null;
    messaging: readonly ConnectedCommsProvider[] | null;
    onlineUpgrade?: Parameters<typeof readyChecklist>[0]["onlineUpgrade"];
    emailSetup?: EmailSetup | null;
    /** `billing:read`: may see the plans. */
    mayPlans?: boolean;
}): ReadyChecklist {
    const ready = readyChecklist(input);
    const nudges = settingsNudges(input);
    const steps: ReadyStep[] = [
        ...ready.steps,
        ...nudges.map(({ left, ...item }) => ({ ...item, done: !left })),
    ];
    const left: ReadyItem[] = [
        ...ready.left,
        ...nudges.filter((n) => n.left).map(({ left: _left, ...item }) => item),
    ];
    return {
        steps,
        left,
        done: steps.length - left.length,
        total: steps.length,
        outside: [ready.outside, [emailAside(input)]]
            .flat()
            .filter((a): a is ReadyAside => a !== null),
    };
}
