import { blockFixture } from "@saroh/block-contract";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    SAMPLE_SERVICES,
    SAMPLE_TIMETABLE,
    SAMPLE_VISIT,
} from "./block-fixture-preview";
import { PageSections } from "./section-renderer";

/**
 * A whole page drawn from fixtures (industry templates U14): every bound
 * block that would read the public API in the browser draws the data it is
 * given, and nothing is fetched, even with a site id and an API to read.
 */

afterEach(() => {
    vi.unstubAllGlobals();
});

function sections() {
    return [
        { type: "hero", content: blockFixture("hero", "fullBleed") },
        {
            type: "servicesList",
            content: blockFixture("servicesList", "default"),
        },
        { type: "visitUs", content: blockFixture("visitUs", "default") },
        { type: "hours", content: blockFixture("hours", "default") },
        { type: "timetable", content: blockFixture("timetable", "grid") },
    ].map((s) => {
        if (!s.content) throw new Error(`${s.type} has no default fixture`);
        return s;
    });
}

describe("PageSections with fixtures", () => {
    it("draws every bound block from what it is given, without a request", async () => {
        const fetchSpy = vi.fn(() => Promise.reject(new Error("no network")));
        vi.stubGlobal("fetch", fetchSpy);
        const hero = sections()[0].content as Record<string, unknown>;

        render(
            <PageSections
                sections={[
                    { type: "hero", content: { ...hero, onToday: true } },
                    ...sections().slice(1),
                ]}
                siteId="site-that-does-not-exist"
                apiUrl="https://api.invalid"
                fixtures={{
                    services: SAMPLE_SERVICES,
                    visit: SAMPLE_VISIT,
                    timetable: SAMPLE_TIMETABLE,
                }}
            />,
        );

        // Services: the given names.
        expect(await screen.findByText("Cut and finish")).toBeTruthy();
        // Visit us: the given address.
        expect(
            screen.getAllByText(/Riverside Trade Park/).length,
        ).toBeGreaterThan(0);
        // The timetable: a given session.
        expect(screen.getAllByText("Conditioning").length).toBeGreaterThan(0);
        await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
    });

    it("reads as before when none are given", async () => {
        const fetchSpy = vi.fn(() =>
            Promise.resolve(new Response("{}", { status: 500 })),
        );
        vi.stubGlobal("fetch", fetchSpy);
        render(
            <PageSections
                sections={sections().slice(1, 2)}
                siteId="site-1"
                apiUrl="https://api.invalid"
            />,
        );
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    });
});
