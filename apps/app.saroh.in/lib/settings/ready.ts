import type { ModuleView } from "@/lib/modules/schema";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import { BUSINESS_TAB_PARAM } from "./search";

/**
 * "Ready to take payments" ("Saroh Settings" design): what is left before a
 * business is set up to sell, each with the place that fixes it.
 *
 * Only facts the API already sends: the business's own settings, the
 * modules' readiness and the messaging providers connected. The design's
 * first item — "your email sender isn't verified" — has no fact behind it
 * (Saroh does not verify senders), so the email item says what is true: the
 * email provider is disconnected, or there is none while Communications is on.
 * Payments is added: a card headed "Ready to take payments" that hid itself
 * while no payment provider was connected would be claiming something false.
 */

/** Why email needs a person, or `null` when it does not (or we can't tell). */
export type EmailAttention = "disconnected" | "not-connected";

const on = (modules: readonly ModuleView[], key: string) =>
    modules.find((m) => m.key === key)?.lifecycle === "ENABLED";

/**
 * Only while Communications is on — off, nothing is sent to anyone. Then
 * email needs a person when its provider was disconnected (email that was
 * going out has stopped), or when nothing at all is connected to send with,
 * so follow-ups and messages to customers go nowhere. A business that sends
 * on WhatsApp alone and never set up email is not nagged about it. Unknown
 * (either list could not be read) is not a problem to report.
 */
export function emailAttention(
    modules: readonly ModuleView[] | null,
    messaging: readonly ConnectedCommsProvider[] | null,
): EmailAttention | null {
    if (!modules || !messaging || !on(modules, "COMMUNICATIONS")) return null;
    const email = messaging.filter((c) => c.channel === "EMAIL");
    if (email.some((c) => c.status === "CONNECTED")) return null;
    if (email.length > 0) return "disconnected";
    return messaging.some((c) => c.status === "CONNECTED")
        ? null
        : "not-connected";
}

/** The Providers tab's line in the settings tabs, when email needs a person. */
export function providersTabNote(attention: EmailAttention | null) {
    if (attention === "disconnected") {
        return "Needs you: email is disconnected";
    }
    if (attention === "not-connected") {
        return "Needs you: no email provider yet";
    }
    return null;
}

export interface ReadyItem {
    key: "email" | "payments" | "logo" | "gstin" | "pipeline";
    label: string;
    cta: string;
    href: string;
    /** Something that worked has stopped — the danger dot, not the accent. */
    broken: boolean;
}

export interface ReadyChecklist {
    /** What is left, in the order to do it. */
    left: ReadyItem[];
    done: number;
    total: number;
}

const business = (section: string) =>
    `/settings/organization?${BUSINESS_TAB_PARAM}=${section}`;

/**
 * Each check is left, done, or unknown. Unknown — the list behind it could
 * not be read — counts neither way, so the count never claims a step is done
 * that nobody checked. A step that does not apply (Contacts is off, the
 * business is not GST-registered) is done, as the design counts it.
 */
export function readyChecklist({
    settings,
    modules,
    messaging,
}: {
    settings: Pick<OrganizationSettings, "logo" | "tax" | "profile">;
    modules: readonly ModuleView[] | null;
    messaging: readonly ConnectedCommsProvider[] | null;
}): ReadyChecklist {
    const checks: { item: ReadyItem; left: boolean }[] = [];

    const email = emailAttention(modules, messaging);
    if (modules && messaging) {
        checks.push({
            left: email !== null,
            item:
                email === "disconnected"
                    ? {
                          key: "email",
                          label: "Email to customers isn't sending — your email provider is disconnected",
                          cta: "Reconnect email",
                          href: "/settings/providers",
                          broken: true,
                      }
                    : {
                          key: "email",
                          label: "Connect an email provider so messages to customers get sent",
                          cta: "Connect email",
                          href: "/settings/providers",
                          broken: false,
                      },
        });
    }

    if (modules) {
        const payments = modules.find((m) => m.key === "PAYMENTS");
        const step =
            payments?.lifecycle === "ENABLED" && payments.readiness !== "ACTIVE"
                ? payments.blockers[0]
                : undefined;
        const broken = payments?.readiness === "ATTENTION_REQUIRED";
        checks.push({
            left: step !== undefined,
            item: {
                key: "payments",
                label: broken
                    ? "Your payment provider is switched off — customers can't pay online"
                    : "Connect a payment provider so customers can pay online",
                cta: broken ? "Reconnect payments" : "Connect payments",
                href: step?.actionHref ?? "/settings/providers",
                broken,
            },
        });
    }

    // Absent from an API older than the logo: unknown, not missing.
    if (settings.logo !== undefined) {
        checks.push({
            left: settings.logo === null,
            item: {
                key: "logo",
                label: "Add your logo — it goes on every receipt and invoice",
                cta: "Add logo",
                href: business("identity"),
                broken: false,
            },
        });
    }

    if (settings.tax) {
        checks.push({
            left: settings.tax.registered && !settings.profile?.taxId?.trim(),
            item: {
                key: "gstin",
                label: "Add your GSTIN so invoices count as tax invoices",
                cta: "Add GSTIN",
                href: business("tax"),
                broken: false,
            },
        });
    }

    if (modules) {
        const pipeline = on(modules, "CRM")
            ? modules
                  .find((m) => m.key === "CRM")
                  ?.blockers.find((b) => b.code === "CRM_NO_PIPELINE")
            : undefined;
        checks.push({
            left: pipeline !== undefined,
            item: {
                key: "pipeline",
                label: "Create a pipeline so enquiries don't get lost",
                cta: "Set up",
                href: pipeline?.actionHref ?? "/settings/modules",
                broken: false,
            },
        });
    }

    const left = checks.filter((c) => c.left).map((c) => c.item);
    return { left, done: checks.length - left.length, total: checks.length };
}
