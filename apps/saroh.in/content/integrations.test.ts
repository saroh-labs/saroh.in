import { WEBHOOK_EVENTS, webhookPath } from "@saroh/integrations";
import { describe, expect, it } from "vitest";

import {
    integrationSource,
    loadIntegration,
    splitIntegration,
} from "@/lib/integration-docs";

import {
    API_ORIGIN,
    INTEGRATION_PATHS,
    INTEGRATION_SLUGS,
    liveIntegrations,
    PLACEHOLDER_BUSINESS_ID,
    plannedIntegrations,
} from "./integrations";
import { integrationErrors } from "./validate";

/**
 * The Integrations pages (Resources plan U3): every provider page's MDX
 * passes its frontmatter check, names the same webhook path and events as
 * the API (both read `@saroh/integrations`), and links nowhere it
 * shouldn't. Planned rows never link.
 */
const pages = Object.fromEntries(
    INTEGRATION_SLUGS.map((slug) => {
        const source = integrationSource(slug);
        const { frontmatter } = splitIntegration(`${slug}.mdx`, source);
        return [slug, { frontmatter, source }];
    }),
);
const real = { live: liveIntegrations, planned: plannedIntegrations, pages };

describe("the integration pages", () => {
    it("finds nothing wrong with the real pages", () => {
        expect(integrationErrors(real)).toEqual([]);
    });

    it("has a page for every live card and a card for every page", () => {
        expect(liveIntegrations.map((i) => i.slug)).toEqual([
            ...INTEGRATION_SLUGS,
        ]);
        expect(INTEGRATION_PATHS).toEqual([
            "/integrations",
            "/integrations/razorpay",
            "/integrations/cashfree",
            "/integrations/email",
        ]);
    });

    it("names the API's webhook path on each payments page", () => {
        expect(pages.razorpay.frontmatter.webhookPath).toBe(
            webhookPath("RAZORPAY", PLACEHOLDER_BUSINESS_ID),
        );
        expect(pages.cashfree.frontmatter.webhookPath).toBe(
            webhookPath("CASHFREE", PLACEHOLDER_BUSINESS_ID),
        );
        expect(pages.razorpay.source).toContain(
            `${API_ORIGIN}${webhookPath("RAZORPAY", PLACEHOLDER_BUSINESS_ID)}`,
        );
    });

    it("names the API's events on each payments page", () => {
        expect(pages.razorpay.frontmatter.events).toEqual([
            ...WEBHOOK_EVENTS.RAZORPAY,
        ]);
        expect(pages.cashfree.frontmatter.events).toEqual([
            ...WEBHOOK_EVENTS.CASHFREE,
        ]);
    });

    it("fails a page whose webhook path drifts from the API's", () => {
        const page = pages.razorpay;
        const drifted = page.source.replaceAll(
            "/public/webhooks/razorpay/",
            "/webhooks/razorpay/",
        );
        const broken = {
            ...pages,
            razorpay: {
                frontmatter: splitIntegration("razorpay.mdx", drifted)
                    .frontmatter,
                source: drifted,
            },
        };
        expect(integrationErrors({ ...real, pages: broken })).toEqual([
            "integration razorpay: webhook path /webhooks/razorpay/your-business-id is not /public/webhooks/razorpay/your-business-id",
            "integration razorpay: writes webhook address https://api.saroh.in/webhooks/razorpay/your-business-id",
        ]);
    });

    it("fails a page whose events drift, in the frontmatter or a step", () => {
        const page = pages.cashfree;
        const fm = page.frontmatter;
        const broken = {
            ...pages,
            cashfree: {
                source: page.source,
                frontmatter: {
                    ...fm,
                    events: fm.events?.slice(1),
                    steps: fm.steps.map((s) => ({
                        ...s,
                        rows: s.rows.map((r) =>
                            r.label === "Tick these events"
                                ? { ...r, value: "PAYMENT_SUCCESS_WEBHOOK" }
                                : r,
                        ),
                    })),
                },
            },
        };
        expect(integrationErrors({ ...real, pages: broken })).toEqual([
            `integration cashfree: events are not ${WEBHOOK_EVENTS.CASHFREE.join(", ")}`,
            'integration cashfree: step "Tell Cashfree where to send payment updates" lists other events',
        ]);
    });

    it("fails a page that links to itself, and a planned row that links", () => {
        const fm = pages.email.frontmatter;
        const broken = {
            ...pages,
            email: {
                source: pages.email.source,
                frontmatter: {
                    ...fm,
                    links: [{ label: "Again", href: "/integrations/email" }],
                },
            },
        };
        expect(
            integrationErrors({
                ...real,
                pages: broken,
                planned: [
                    ...plannedIntegrations,
                    { name: "Fax", line: "", when: "", href: "/fax" },
                ],
            }),
        ).toEqual(["integration email: links to itself", "planned Fax: links"]);
    });

    it("never gives a planned row a link", () => {
        for (const row of plannedIntegrations) {
            expect(Object.keys(row).sort()).toEqual(["line", "name", "when"]);
        }
    });
});

describe("the frontmatter check", () => {
    const source = integrationSource("razorpay");

    it("fails a page with a missing field, naming the file and the field", () => {
        const broken = source.replace(/^intro: .*$/m, "");
        expect(() => splitIntegration("razorpay.mdx", broken)).toThrow(
            /razorpay\.mdx: frontmatter is wrong\n {2}intro: Required/,
        );
    });

    it("fails a payments page without its webhook path", () => {
        const broken = source.replace(/^webhookPath: .*$/m, "");
        expect(() => splitIntegration("razorpay.mdx", broken)).toThrow(
            /webhookPath: a payments page names its webhook path and events/,
        );
    });

    it("fails a field it doesn't know", () => {
        const broken = source.replace(/^slug: /m, "plan: Free\nslug: ");
        expect(() => splitIntegration("razorpay.mdx", broken)).toThrow(
            /Unrecognized key/,
        );
    });

    it("compiles every page's body", async () => {
        for (const slug of INTEGRATION_SLUGS) {
            const doc = await loadIntegration(slug);
            expect(typeof doc.Body).toBe("function");
            expect(doc.frontmatter.steps.length).toBeGreaterThanOrEqual(3);
        }
    });
});
