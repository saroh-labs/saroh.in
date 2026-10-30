import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The messaging provider stays swappable (MSG91 today, Meta's Cloud API for
 * WhatsApp later): nothing outside `modules/messaging/` names it or its
 * hosts. Other modules call `MessagingService`. Scans every tracked or new
 * file under apps/ and packages/.
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const PROVIDER = /msg91/i;

const ALLOWED_DIR = "apps/api.saroh.in/src/modules/messaging/";

/** Files outside it that may name the provider, and why. */
const ALLOWED: Record<string, string> = {
    "apps/api.saroh.in/src/env.ts": "the provider's environment names",
    "apps/api.saroh.in/.env.example": "the provider's environment names",
    // The webhook's public path is set in MSG91's dashboard; these list every route.
    "apps/api.saroh.in/src/common/guards/test-host-routes.spec.ts":
        "lists the public webhook path",
    "apps/api.saroh.in/src/modules/organizations/demo-routes.spec.ts":
        "lists the public webhook path",
    "apps/api.saroh.in/src/modules/capabilities/module-annotations.spec.ts":
        "names the webhook controller's file",
    // A page's script policy must name the host the phone-code widget loads
    // from; the source itself is called `phoneCodeWidget` everywhere else.
    "packages/auth/src/security-headers.cjs":
        "the phone-code widget's host in the page policy",
    "apps/accounts.saroh.in/lib/page-policies.test.ts":
        "checks the widget's host is allowed",
    "apps/saroh.in/page-policies.test.ts":
        "checks the widget's host is not allowed there",
};

function files(): string[] {
    return execFileSync(
        "git",
        [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "apps",
            "packages",
        ],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
        .split("\n")
        .filter(Boolean);
}

/** Text a reader or the build sees; docs (Markdown) may name the provider. */
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|ya?ml|prisma|sql|css|html)$|\.env/;

describe("the messaging provider's name stays in modules/messaging", () => {
    it("names it nowhere else in apps/ or packages/", () => {
        const all = files();
        // A scan that finds nothing would pass anything.
        expect(all.length).toBeGreaterThan(1000);
        const leaks = all.filter((path) => {
            if (path.startsWith(ALLOWED_DIR) || path in ALLOWED) return false;
            if (!TEXT.test(path)) return false;
            if (PROVIDER.test(path)) return true;
            try {
                return PROVIDER.test(readFileSync(join(ROOT, path), "utf8"));
            } catch {
                return false; // listed but deleted in the working tree
            }
        });
        expect(leaks).toEqual([]);
    });

    it("still needs each allowance", () => {
        const stale = Object.keys(ALLOWED).filter((path) => {
            try {
                return !PROVIDER.test(readFileSync(join(ROOT, path), "utf8"));
            } catch {
                return true;
            }
        });
        expect(stale).toEqual([]);
    });
});
