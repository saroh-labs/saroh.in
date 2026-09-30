import { rolledOut } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { inIndia, yourAddress } from "@/lib/organizations/business-details";
import type {
    OrganizationSettings,
    SetupFacts,
} from "@/lib/organizations/settings-service";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import { BUSINESS_TAB_PARAM } from "./search";

/** The API's readiness code for payments that can't be confirmed (DEC-063). */
export const PAYMENTS_WEBHOOK_SECRET_MISSING =
    "PAYMENTS_WEBHOOK_SECRET_MISSING";

/**
 * Getting a business ready to take money, and what email needs.
 *
 * `readyChecklist` is the one list of setup steps. Home shows it as "Get
 * ready to take money" and Settings › Business as "Ready to take payments"
 * (the "Saroh Home" and "Saroh Settings" designs, F8), so the two never
 * count differently. Only facts the API already sends: the business's own
 * settings and the modules' readiness.
 *
 * Email is not a step — it does not take money. What email needs is said on
 * the Providers tab (`providersTabNote`), where it is fixed. The design's
 * "your email sender isn't verified" has no fact behind it (Saroh does not
 * verify senders), so that note says what is true: the email provider is
 * disconnected, or there is none while Communications is on.
 */

/** Why email needs a person, or `null` when it does not (or we can't tell). */
export type EmailAttention = "disconnected" | "not-connected";

/**
 * On for this business, and rolled out by Saroh: a module whose rollout is
 * off is never named to the business, here or anywhere (DEC-057).
 */
export const on = (modules: readonly ModuleView[], key: string) =>
    rolledOut(modules).find((m) => m.key === key)?.lifecycle === "ENABLED";

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

export type ReadyStepKey =
    "payments" | "address" | "tax" | "catalogue" | "site" | "shop";

/** The API's Website step: the shop waits on "Sells from" (P4). */
export const WEBSITE_SHOP_NOT_CHOSEN = "WEBSITE_SHOP_NOT_CHOSEN";

/** What Settings also asks for, beside the steps (`nudges.ts`, DEC-056). */
export type SettingsNudgeKey = "email" | "businessType" | "logo" | "pipeline";

export interface ReadyItem {
    key: ReadyStepKey | SettingsNudgeKey;
    /** The step, as a thing to do ("Connect payments"). */
    label: string;
    /** Why it matters, in a sentence. */
    why: string;
    /** The button, where the step is offered as one ("Add GSTIN"). */
    cta: string;
    /** Where the step is done. */
    href: string;
    /** Something that worked has stopped — the danger dot, not the accent. */
    broken: boolean;
}

export interface ReadyStep extends ReadyItem {
    done: boolean;
}

export interface ReadyChecklist {
    /** Every step that could be checked, in the order to do them. */
    steps: ReadyStep[];
    /** What is left, in the same order. */
    left: ReadyItem[];
    done: number;
    total: number;
}

export const business = (section: string) =>
    `/settings/organization?${BUSINESS_TAB_PARAM}=${section}`;

/** Modules that take money for something: a sale, a booking, a course, a pack. */
const SELLING = ["COMMERCE", "APPOINTMENTS", "COURSES", "CLASS_PACKS"] as const;

/**
 * Whether the business invoices or takes money (DEC-070, KTD-7): something
 * that sells is on, or Payments is, or it has an invoice (drafts count, void
 * ones don't). Only then do the address, business-type and logo steps apply:
 * a portfolio with only a website is never told to register a company.
 *
 * A fact, never the kind — the kind picks a step's words, not whether it
 * applies. `null` is unknown (the modules could not be read and no invoice
 * says so): the steps are then asked as they always were. An API older than
 * the invoice count is read from the modules alone.
 */
export function handlesMoney(
    modules: readonly ModuleView[] | null,
    facts: Pick<SetupFacts, "invoices"> | undefined,
): boolean | null {
    if ((facts?.invoices ?? 0) > 0) return true;
    if (!modules) return null;
    return [...SELLING, "PAYMENTS"].some((k) => on(modules, k));
}

type Check = ReadyItem & { left: boolean };

const connect = (href: string): ReadyItem => ({
    key: "payments",
    label: "Connect payments",
    why: "So money reaches your bank.",
    cta: "Connect payments",
    href,
    broken: false,
});

function payments(modules: readonly ModuleView[]): Check | null {
    const view = modules.find((m) => m.key === "PAYMENTS");
    // Not offered to this business at all (its rollout hasn't reached it):
    // nothing it could do about it here, so not a step.
    if (!view) return null;
    if (view.lifecycle !== "ENABLED") {
        // Nothing that sells is on either: no money to take yet, so the step
        // does not apply. Something sells: Payments has to come on first.
        if (!SELLING.some((k) => on(modules, k))) return null;
        return {
            ...connect("/settings/modules"),
            why: "Turn on Payments, then connect your provider, so money reaches your bank.",
            left: true,
        };
    }
    const href = view.blockers[0]?.actionHref ?? "/settings/providers";
    // Connected, but no payment through it can be confirmed: saved without
    // its webhook signing secret (DEC-063). Not ready to take money, and
    // not "switched off" either.
    if (
        view.readiness === "ATTENTION_REQUIRED" &&
        view.blockers[0]?.code === PAYMENTS_WEBHOOK_SECRET_MISSING
    ) {
        return {
            key: "payments",
            label: "Finish connecting payments",
            why: "Add your webhook signing secret, so payments customers make are confirmed.",
            cta: "Add webhook secret",
            href,
            broken: true,
            left: true,
        };
    }
    if (view.readiness === "ATTENTION_REQUIRED") {
        return {
            key: "payments",
            label: "Reconnect payments",
            why: "Your payment provider is switched off, so customers can't pay online.",
            cta: "Reconnect payments",
            href,
            broken: true,
            left: true,
        };
    }
    return { ...connect(href), left: view.readiness !== "ACTIVE" };
}

const filled = (v: string | null | undefined) => !!v?.trim();

/**
 * The registered address, the API's rule for an invoice (DEC-068): its
 * first line, city and PIN, and an Indian address its state. Until it is
 * in, Issue, Send, a pay link and connecting payments ask for it first.
 */
function address(
    registered: NonNullable<OrganizationSettings["registeredAddress"]>,
    country: string | null | undefined,
    kind: unknown,
): Check {
    return {
        key: "address",
        // "your registered address", or "your address" (DEC-070).
        label: `Add ${yourAddress(kind)}`,
        why: "It's printed on every invoice you send.",
        cta: "Add address",
        href: business("address"),
        broken: false,
        left: !(
            filled(registered.line1) &&
            filled(registered.city) &&
            filled(registered.postalCode) &&
            (filled(registered.state) || !inIndia(country))
        ),
    };
}

function tax(
    settings: Pick<OrganizationSettings, "tax" | "profile">,
): Check | null {
    // Absent from an API older than GST: unknown. Not GST-registered: there
    // is no GSTIN to add, so the step does not apply.
    if (!settings.tax?.registered) return null;
    return {
        key: "tax",
        label: "Add your GSTIN",
        why: "So your invoices count as tax invoices.",
        cta: "Add GSTIN",
        href: business("tax"),
        broken: false,
        left: !filled(settings.profile?.taxId),
    };
}

/**
 * A first product or service. Done once either list has one; it applies only
 * while something that lists them is on, and what it asks for follows what
 * is on.
 *
 * Done is the API's count when it sends one (H-5): Commerce's readiness is
 * satisfied by a storefront alone, so reading it ticked "first product" for
 * a business with a storefront and nothing in it. An older API sends no
 * count, and the blockers are read as before.
 */
function catalogue(
    modules: readonly ModuleView[],
    facts: SetupFacts | undefined,
): Check | null {
    const sells = on(modules, "COMMERCE");
    const books = on(modules, "APPOINTMENTS");
    if (!sells && !books) return null;
    const blocked = (key: string, code: string) =>
        modules
            .find((m) => m.key === key)
            ?.blockers.some((b) => b.code === code) ?? false;
    const hasProduct =
        sells &&
        (facts
            ? facts.products > 0
            : !blocked("COMMERCE", "COMMERCE_NO_CATALOG"));
    const hasService =
        books &&
        (facts
            ? facts.services > 0
            : !blocked("APPOINTMENTS", "APPOINTMENTS_NO_SERVICE"));
    const left = !hasProduct && !hasService;

    if (books && !sells) {
        return {
            key: "catalogue",
            label: "Add your first service",
            why: "Customers can only book what's listed.",
            cta: "Add a service",
            href: "/services/new",
            broken: false,
            left,
        };
    }
    return {
        key: "catalogue",
        ...(books
            ? {
                  label: "Add your first product or service",
                  why: "Customers can only buy or book what's listed.",
              }
            : {
                  label: "Add your first product",
                  why: "A name, a price and a photo is enough to start.",
              }),
        cta: "Add a product",
        href: "/commerce/products/new",
        broken: false,
        left,
    };
}

/**
 * Publishing the site. Done is the API's fact when it sends one (H-6): a
 * site exists and none is without something published now — the same fact
 * Home's "Your site isn't live" reads. Readiness counts any publication
 * ever made, so a site taken down still ticked it. An older API sends no
 * fact, and the blockers are read as before.
 */
function site(
    modules: readonly ModuleView[],
    facts: SetupFacts | undefined,
): Check | null {
    // The website is off: nothing to publish, so the step does not apply.
    if (!on(modules, "WEBSITE")) return null;
    const blocker = modules
        .find((m) => m.key === "WEBSITE")
        ?.blockers.find(
            (b) =>
                b.code === "WEBSITE_NO_PUBLICATION" ||
                b.code === "WEBSITE_NO_SITE",
        );
    const left = facts
        ? facts.sites === 0 || facts.sitesNotLive > 0
        : blocker !== undefined;
    return {
        key: "site",
        label: "Publish your site",
        why: "Nobody can find you until it's live.",
        cta: "Publish site",
        href:
            blocker?.actionHref ??
            (facts?.sites === 0 ? "/sites/new" : "/sites"),
        broken: false,
        left,
    };
}

/**
 * The shop's storefront (P4): the site is live and its shop could serve,
 * but "Sells from" is unanswered, so `/shop` isn't live. The API says so
 * as the Website's step (`WEBSITE_SHOP_NOT_CHOSEN`) only while the shop is
 * open for the business (DEC-057), so a business with no shop is never
 * asked. Asked only while it is left: once answered there is no fact that
 * says the step ever applied, and a tick for it would claim a shop that
 * may not exist.
 */
function shop(modules: readonly ModuleView[]): Check | null {
    if (!on(modules, "WEBSITE")) return null;
    const blocker = modules
        .find((m) => m.key === "WEBSITE")
        ?.blockers.find((b) => b.code === WEBSITE_SHOP_NOT_CHOSEN);
    if (!blocker) return null;
    return {
        key: "shop",
        label: "Choose which location your online shop sells from",
        why: "Until then your shop page isn't live.",
        cta: "Choose location",
        href: blocker.actionHref ?? "/sites",
        broken: false,
        left: true,
    };
}

/**
 * The steps to take money, in order: connect payments, the registered
 * address (once something invoices or takes money, `handlesMoney`), GST, a first product or service, publishing the site and,
 * while its shop waits on it, choosing the storefront it sells from.
 *
 * Each check is left, done, or not a step at all. Unknown — the list behind
 * it could not be read — is left out, so the count never claims a step is
 * done that nobody checked. So is a step that does not apply (the business
 * is not GST-registered, the website is off): Home ticks the done steps, and
 * a tick beside "Add your GSTIN" for a business with no GSTIN would be false.
 */
export function readyChecklist({
    settings,
    modules: all,
}: {
    settings: Pick<
        OrganizationSettings,
        "tax" | "profile" | "registeredAddress" | "setup" | "kind"
    >;
    modules: readonly ModuleView[] | null;
}): ReadyChecklist {
    // Never a step for a module Saroh has not rolled out (DEC-057).
    const modules = all ? rolledOut(all) : null;
    const checks = [
        modules ? payments(modules) : null,
        // Absent from an API older than the registered address: unknown.
        // Asked only once something invoices or takes money (DEC-070).
        settings.registeredAddress &&
        handlesMoney(modules, settings.setup) !== false
            ? address(
                  settings.registeredAddress,
                  settings.profile?.country,
                  settings.kind,
              )
            : null,
        tax(settings),
        modules ? catalogue(modules, settings.setup) : null,
        modules ? site(modules, settings.setup) : null,
        modules ? shop(modules) : null,
    ].filter((c): c is Check => c !== null);

    const steps: ReadyStep[] = checks.map(({ left, ...item }) => ({
        ...item,
        done: !left,
    }));
    const left: ReadyItem[] = checks
        .filter((c) => c.left)
        .map(({ left: _left, ...item }) => item);
    return {
        steps,
        left,
        done: steps.length - left.length,
        total: steps.length,
    };
}

/** The steps that are about money, rather than getting the site live. */
const MONEY_STEPS: ReadonlySet<ReadyItem["key"]> = new Set([
    "payments",
    "address",
    "tax",
    "catalogue",
    "shop",
    "businessType",
    "logo",
]);

/** Whether any step, done or left, is about money (DEC-070). */
export function takesMoney(list: Pick<ReadyChecklist, "steps">): boolean {
    return list.steps.some((s) => MONEY_STEPS.has(s.key));
}

/**
 * The checklist's heading follows its steps, never the kind (DEC-070): Home's
 * "Get ready to take money" and Settings' "Ready to take payments" while a
 * money step is in the list. Without one, a list that publishes the site is
 * "Get your site live", and Settings' other asks (email, a pipeline) are
 * "Finish setting up".
 */
export function checklistHeading(
    list: Pick<ReadyChecklist, "steps">,
    where: "home" | "settings",
): string {
    if (takesMoney(list)) {
        return where === "home"
            ? "Get ready to take money"
            : "Ready to take payments";
    }
    return list.steps.some((s) => s.key === "site")
        ? "Get your site live"
        : "Finish setting up";
}

/**
 * Where Home puts the checklist: first while fewer than half the steps are
 * done, lower down once more are, and only a "Show setup" link while hidden.
 * Nothing once every step is done, or when none could be checked.
 */
export type TakeMoneyPlace = "first" | "late" | "hidden" | null;

export function takeMoneyPlace(
    list: Pick<ReadyChecklist, "done" | "total">,
    hidden: boolean,
): TakeMoneyPlace {
    if (list.total === 0 || list.done >= list.total) return null;
    if (hidden) return "hidden";
    return list.done < list.total / 2 ? "first" : "late";
}

/**
 * Hiding the checklist is remembered per person, per business, in this
 * browser: a convenience, never a setting (default 123). Storage can be
 * missing or refuse (a private window, blocked site data), so every read and
 * write is guarded, and a failed read is "not hidden".
 */
export const SETUP_HIDDEN_KEY = "saroh.home.setupHidden";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function readHiddenMap(storage: () => StorageLike): Record<string, unknown> {
    try {
        const raw: unknown = JSON.parse(
            storage().getItem(SETUP_HIDDEN_KEY) ?? "{}",
        );
        return raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

export function readSetupHidden(
    storage: () => StorageLike,
    businessId: string,
): boolean {
    return readHiddenMap(storage)[businessId] === true;
}

/** False when the browser would not keep it. */
export function writeSetupHidden(
    storage: () => StorageLike,
    businessId: string,
    hidden: boolean,
): boolean {
    try {
        const next = { ...readHiddenMap(storage) };
        if (hidden) next[businessId] = true;
        else delete next[businessId];
        storage().setItem(SETUP_HIDDEN_KEY, JSON.stringify(next));
        return true;
    } catch {
        return false;
    }
}
