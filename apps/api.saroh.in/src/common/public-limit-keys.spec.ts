import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every public route that keys a limit on `@ClientAddress()` also reads the
 * signed site relay (`visitorKey`), or sits behind `SiteRelayGuard`. A server
 * calling from shared addresses (saroh.app's Worker) would otherwise put every
 * visitor of every site in one bucket (DEV_LEARNINGS, 26 Nov 2026).
 *
 * A route only a browser calls directly may key on the address: list it here
 * with who calls it. A route saroh.app's server calls never belongs here.
 */
const BROWSER_ONLY: Record<string, string> = {
    "POST public/orders/:orderId/payment-intent":
        "site-blocks checkout, from the visitor's browser",
    "GET public/orders/:orderId/receipt": "the visitor's browser after paying",
    "GET public/services/holds/:token": "site-blocks booking flow, browser",
    "POST public/services/holds/:token/release":
        "site-blocks booking flow, browser",
    "GET public/sites/:siteId/today": "On today block, browser",
    "GET public/sites/:siteId/visit/:storeId": "use-public-visit, browser",
    "GET public/share/own/:id/image": "an <img> or a link unfurler",
    "GET public/share/:siteId/:kind/:ref/image": "an <img> or a link unfurler",
    "GET public/sites/:siteId/offers/:id":
        "saroh.app's server, on purpose not limited per caller (see offerWords)",
    "POST public/forms/:formId/submit": "Enquiry block, browser",
    "POST public/payments/return": "site-blocks checkout return, browser",
    "POST public/sites/:siteId/analytics/events": "page view beacon, browser",
    "POST public/funnel/signup-viewed": "saroh.in beacon, browser",
};

const MODULES = join(__dirname, "..", "modules");

function controllers(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return controllers(path);
        return entry.name.endsWith(".controller.ts") ? [path] : [];
    });
}

/** `METHOD base/path` of each public handler keyed on the bare address. */
function addressOnlyRoutes(): string[] {
    const found: string[] = [];
    for (const file of controllers(MODULES)) {
        const source = readFileSync(file, "utf8");
        if (!source.includes("@ClientAddress()")) continue;
        for (const part of source.split(/(?=@Controller\()/).slice(1)) {
            const base = /^@Controller\(\s*"([^"]*)"/.exec(part)?.[1] ?? "";
            if (!base.startsWith("public")) continue;
            const [head, ...handlers] = part.split(
                /(?=@(?:Get|Post|Put|Patch|Delete)\()/,
            );
            const classRelayed = head!.includes("SiteRelayGuard");
            for (const handler of handlers) {
                if (!handler.includes("@ClientAddress()")) continue;
                if (
                    classRelayed ||
                    handler.includes("SITE_RELAY_HEADER") ||
                    handler.includes("SiteRelayGuard")
                ) {
                    continue;
                }
                const route = /^@(\w+)\(\s*"?([^")]*)"?/.exec(handler)!;
                const path = route[2] ? `${base}/${route[2]}` : base;
                found.push(`${route[1]!.toUpperCase()} ${path}`);
            }
        }
    }
    return found.sort();
}

describe("public limit keys", () => {
    it("finds the controllers", () => {
        expect(
            controllers(MODULES).map((file) => relative(MODULES, file)),
        ).toContain("payments/public-order-pay.controller.ts");
    });

    it("keys every address-limited public route on the relayed visitor, or says why not", () => {
        const unexplained = addressOnlyRoutes().filter(
            (route) => !(route in BROWSER_ONLY),
        );
        expect(unexplained).toEqual([]);
    });

    it("keeps the allow-list to routes that still exist", () => {
        const routes = new Set(addressOnlyRoutes());
        expect(
            Object.keys(BROWSER_ONLY).filter((route) => !routes.has(route)),
        ).toEqual([]);
    });
});
