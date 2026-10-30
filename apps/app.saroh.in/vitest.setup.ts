import { setRefusalTest } from "@saroh/ui/lib/refusal";
import { vi } from "vitest";

import { isRoleRefusal } from "@/lib/api/role-denied";

/*
 * jsdom has no top layer, and its selector engine (nwsapi) resolves `:modal`
 * and `:popover-open` by calling `Element.matches`, which is nwsapi again:
 * each check recurses to a stack overflow before it answers false.
 * floating-ui asks both of every positioned tooltip, menu and popover, so
 * one open tooltip cost a test seconds and timed it out (DEV_LEARNINGS, and
 * `packages/ui/vitest.setup.ts`, which this mirrors). Nothing is ever in the
 * top layer here, so the answer is false at once. A no-op under `node`.
 */
if (typeof Element !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with its element below
    const matches = Element.prototype.matches;
    Element.prototype.matches = function (this: Element, selector: string) {
        if (selector === ":modal" || selector === ":popover-open") return false;
        return matches.call(this, selector);
    };
}

/*
 * jsdom has no ResizeObserver, and the shared `Checkbox` and `Switch`
 * (Radix) measure themselves with one. Nothing is laid out here, so an
 * observer that never reports is the truth. A test that needs sizes brings
 * its own.
 */
if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.ResizeObserver === "undefined"
) {
    globalThis.ResizeObserver = class {
        observe() {
            return undefined;
        }
        unobserve() {
            return undefined;
        }
        disconnect() {
            return undefined;
        }
    };
}

/*
 * jsdom lays nothing out, so it has no `scrollIntoView`. Putting the
 * keyboard on the first field in error brings it into view too
 * (`focusFirstError`), and here there is nowhere to scroll.
 */
if (
    typeof Element !== "undefined" &&
    typeof Element.prototype.scrollIntoView !== "function"
) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
        return undefined;
    };
}

/*
 * Every upgrade prompt says it was shown (#1197) through a server action,
 * which reads server-only env. A component test never reaches the API, so
 * the action is a no-op everywhere; `lib/billing/upgrade-prompts.test.tsx`
 * brings its own to look at the calls.
 */
vi.mock("@/lib/billing/upgrade-prompts-action", () => ({
    recordUpgradePrompt: () => Promise.resolve(),
}));

/*
 * The app tells its role refusals apart once, on mount (`app/providers.tsx`);
 * the shared ConfirmDialog in @saroh/ui asks the same test. Tests render
 * without the providers, so register it here too.
 */
setRefusalTest(isRoleRefusal);
