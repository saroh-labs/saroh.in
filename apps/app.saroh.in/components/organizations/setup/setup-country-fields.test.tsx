import { Form } from "@saroh/ui/form";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { SetupValues } from "@/lib/organizations/setup-steps";

import { SetupCountryFields } from "./setup-country-fields";

// Global's setup: the only one that asks the country.
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return { ...(await actual<object>()), PROFILE: editionProfile("GLOBAL") };
});

function Drawn({
    currency,
    country = "GB",
    timezone,
}: {
    currency: string;
    country?: string;
    timezone?: string;
}) {
    const form = useForm<SetupValues>({
        defaultValues: { country, currency, timezone } as SetupValues,
    });
    return (
        <Form {...form}>
            <SetupCountryFields />
        </Form>
    );
}

describe("Global setup's currency", () => {
    it("shows a value set while its list is shut", () => {
        expect(renderToStaticMarkup(<Drawn currency="GBP" />)).toContain("GBP");
    });

    it("asks when there's none", () => {
        expect(renderToStaticMarkup(<Drawn currency="" />)).toContain(
            "Choose a currency",
        );
    });
});

describe("Global setup's time zone (KTD-C)", () => {
    it("is asked of a country that keeps several, empty until chosen", () => {
        const html = renderToStaticMarkup(
            <Drawn currency="USD" country="US" />,
        );
        expect(html).toContain("Time zone");
        expect(html).toContain("Choose a time zone");
    });

    it("shows the zone chosen", () => {
        expect(
            renderToStaticMarkup(
                <Drawn
                    currency="USD"
                    country="US"
                    timezone="America/Chicago"
                />,
            ),
        ).toContain("Chicago");
    });

    it("isn't asked of a country that keeps one", () => {
        expect(renderToStaticMarkup(<Drawn currency="GBP" />)).not.toContain(
            "Time zone",
        );
    });
});
