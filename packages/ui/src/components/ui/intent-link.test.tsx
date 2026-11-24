import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IntentLink } from "./intent-link";

// The prefetch Next is asked for, as the link last rendered it.
const prefetchOf = vi.hoisted(() => new Map<string, unknown>());
vi.mock("next/link", () => ({
    default: ({
        prefetch,
        href,
        ...rest
    }: { prefetch?: unknown; href: string } & Record<string, unknown>) => {
        prefetchOf.set(href, prefetch);
        return <a href={href} {...rest} />;
    },
}));

describe("IntentLink", () => {
    it.each([
        ["a pointer over it", fireEvent.pointerEnter],
        ["a touch", fireEvent.touchStart],
        ["keyboard focus", fireEvent.focus],
    ])("fetches nothing ahead until %s, then Next's own", (_, show) => {
        const own = vi.fn();
        render(
            <IntentLink
                href="/calendar"
                onPointerEnter={own}
                onTouchStart={own}
                onFocus={own}
            >
                Calendar
            </IntentLink>,
        );
        expect(prefetchOf.get("/calendar")).toBe(false);
        show(screen.getByRole("link", { name: "Calendar" }));
        expect(prefetchOf.get("/calendar")).toBeNull();
        // The caller's own handler still runs.
        expect(own).toHaveBeenCalledTimes(1);
    });
});
