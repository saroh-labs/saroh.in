import { Form } from "@saroh/ui/form";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { SetupValues } from "@/lib/organizations/setup-steps";

import { SetupCountryFields } from "./setup-country-fields";

function Drawn({ currency }: { currency: string }) {
    const form = useForm<SetupValues>({
        defaultValues: { country: "GB", currency } as SetupValues,
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
