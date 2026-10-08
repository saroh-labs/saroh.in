import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BusinessZoneProvider } from "@/components/shared/business-zone";

import { OrderTimeline } from "./timeline";

/**
 * Order Detail's "What happened" on the server's first paint (UX-008): in
 * the business's zone, so a full page load reads the same as a client
 * navigation — no UTC "04:28" that turns into "09:58".
 */
const render = (at: string, zone?: string) => {
    const timeline = (
        <OrderTimeline
            steps={[{ key: "placed", what: "Placed", at, who: "Anika" }]}
        />
    );
    return renderToStaticMarkup(
        zone ? (
            <BusinessZoneProvider zone={zone}>{timeline}</BusinessZoneProvider>
        ) : (
            timeline
        ),
    );
};

describe("the order timeline's times", () => {
    it("says an evening in India in India's time", () => {
        const html = render("2025-10-06T14:59:00Z", "Asia/Kolkata");
        expect(html).toContain("6 Oct 2025, 20:29");
        expect(html).not.toContain(">6 Oct 2025, 14:59<");
    });

    it("puts a step just before UTC's midnight on the business's next day", () => {
        expect(render("2025-10-05T20:00:00Z", "Asia/Kolkata")).toContain(
            "6 Oct 2025, 01:30",
        );
        expect(render("2025-10-05T20:00:00Z", "America/New_York")).toContain(
            "5 Oct 2025, 16:00",
        );
    });

    it("reads India's when no business zone is given, never UTC", () => {
        expect(render("2025-10-05T20:00:00Z")).toContain("6 Oct 2025, 01:30");
    });
});
