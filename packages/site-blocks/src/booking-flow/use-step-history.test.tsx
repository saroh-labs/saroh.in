import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StepUrl } from "./step-url";
import { EMPTY_STEP_URL } from "./step-url";
import { useStepHistory } from "./use-step-history";

/**
 * The step in the address against Next's router falling behind (U9): a
 * Server Action that sets a cookie refreshes the page at the address the
 * router last knew, and its history sync would push an earlier step's
 * address over the one on screen.
 */

function Flow({ want }: { want: StepUrl }) {
    useStepHistory({ want, onTraverse: () => undefined });
    return null;
}

const at = (step: StepUrl["step"], extra: Partial<StepUrl> = {}): StepUrl => ({
    ...EMPTY_STEP_URL,
    service: "svc_walk",
    step,
    ...extra,
});

const address = () =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

describe("the step in the address", () => {
    afterEach(() => window.history.replaceState(null, "", "/"));

    it("keeps its own address when the router syncs one it has left", () => {
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_walk&step=when",
        );
        const flow = render(<Flow want={at("when")} />);
        const when = address();
        flow.rerender(
            <Flow
                want={at("details", { date: "2026-11-02", start: "14:00" })}
            />,
        );
        const details = address();
        expect(details).toContain("step=details");
        const length = window.history.length;

        // The router's own write, of the step the page has left.
        window.history.pushState({ __NA: true }, "", when);

        expect(address()).toBe(details);
        expect(window.history.length).toBe(length);
        flow.unmount();
    });

    it("lets every other write through, and all of them once it is gone", () => {
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_walk&step=when",
        );
        const flow = render(<Flow want={at("when")} />);
        const when = address();
        flow.rerender(
            <Flow
                want={at("details", { date: "2026-11-02", start: "14:00" })}
            />,
        );

        // A navigation of the router's somewhere the page never wrote.
        window.history.pushState({ __NA: true }, "", "/book?service=svc_other");
        expect(address()).toBe("/book?service=svc_other");

        flow.unmount();
        window.history.pushState({ __NA: true }, "", when);
        expect(address()).toBe(when);
    });

    it("still moves to an earlier step under a router that marks every write", () => {
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_walk&step=when",
        );
        // Back on When once already (Back, then Forward): its address written.
        const flow = render(
            <Flow want={at("when", { date: "2026-11-02", start: "14:00" })} />,
        );
        flow.rerender(<Flow want={at("when")} />);
        flow.rerender(
            <Flow
                want={at("details", { date: "2026-11-02", start: "14:00" })}
            />,
        );
        // As Next's patch does, over the page's: `__NA` copied into each.
        const { history } = window;
        const push = history.pushState.bind(history);
        const replace = history.replaceState.bind(history);
        history.pushState = (data, unused, url) =>
            push({ ...data, __NA: true }, unused, url);
        history.replaceState = (data, unused, url) =>
            replace({ ...data, __NA: true }, unused, url);
        try {
            // The frame's own Back a step.
            flow.rerender(
                <Flow
                    want={at("when", { date: "2026-11-02", start: "14:00" })}
                />,
            );
            expect(address()).toContain("step=when");
        } finally {
            history.pushState = push;
            history.replaceState = replace;
            flow.unmount();
        }
    });
});
