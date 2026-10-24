// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradePromptLink } from "@/components/billing/upgrade-prompt-link";

import { promptPressed, promptShown } from "./upgrade-prompts";

/**
 * Upgrade prompts (#1197): the client only says a prompt was shown or
 * pressed. sessionStorage saves this tab's repeat requests; a failure is
 * never the owner's; pressing the way up still goes where it goes.
 */

const record = vi.fn();
vi.mock("@/lib/billing/upgrade-prompts-action", () => ({
    recordUpgradePrompt: (...args: unknown[]) => record(...args) as unknown,
}));
// A plain anchor: what is tested is the click, not the router.
vi.mock("next/link", () => ({
    default: ({
        href,
        ...props
    }: { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props} />
    ),
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    window.sessionStorage.clear();
    record.mockReset().mockResolvedValue(undefined);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("upgrade prompts", () => {
    it("asks once per tab and day for a prompt shown, and again for another", () => {
        promptShown("deposits");
        promptShown("deposits");
        promptShown("own_domain");
        expect(record.mock.calls).toEqual([
            ["deposits", "shown"],
            ["own_domain", "shown"],
        ]);
    });

    it("asks again once the tab's mark is from another day", () => {
        window.sessionStorage.setItem(
            "saroh:upgrade-prompt-shown:deposits",
            "2000-01-01",
        );
        promptShown("deposits");
        expect(record).toHaveBeenCalledWith("deposits", "shown");
    });

    it("says nothing when the API fails, or the call throws", async () => {
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        record.mockRejectedValueOnce(new Error("down"));
        expect(() => promptShown("at_limit")).not.toThrow();
        record.mockImplementationOnce(() => {
            throw new Error("no action");
        });
        expect(() => promptPressed("at_limit")).not.toThrow();
        await settle();
        process.off("unhandledRejection", unhandled);
        expect(unhandled).not.toHaveBeenCalled();
    });

    it("says the link was shown when drawn, and pressed when pressed, and still goes", () => {
        const onClick = vi.fn();
        act(() =>
            root.render(
                <UpgradePromptLink
                    prompt="plan_refusal"
                    href="#plans"
                    onClick={onClick}
                >
                    See plans
                </UpgradePromptLink>,
            ),
        );
        expect(record).toHaveBeenCalledWith("plan_refusal", "shown");

        const link = host.querySelector("a");
        const click = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
        });
        act(() => {
            link?.dispatchEvent(click);
        });
        expect(record).toHaveBeenCalledWith("plan_refusal", "pressed");
        expect(onClick).toHaveBeenCalledTimes(1);
        // Nothing stopped the link's own way.
        expect(click.defaultPrevented).toBe(false);
        expect(link?.getAttribute("href")).toBe("#plans");
    });
});
