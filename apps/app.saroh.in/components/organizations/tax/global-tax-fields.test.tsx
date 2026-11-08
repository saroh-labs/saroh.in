import { Form } from "@saroh/ui/form";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { FormValues } from "@/components/organizations/business-settings/business-form";

import { GlobalTaxFields } from "./global-tax-fields";

function Harness({ country }: { country: string }) {
    const form = useForm<FormValues>({
        defaultValues: {
            taxName: "",
            taxRate: "",
            yearStartMonth: "1",
        } as Partial<FormValues> as FormValues,
    });
    return (
        <Form {...form}>
            <GlobalTaxFields
                control={form.control}
                taxId={null}
                country={country}
            />
        </Form>
    );
}

const html = (country: string) =>
    renderToStaticMarkup(<Harness country={country} />);

describe("GlobalTaxFields' examples follow the business's country (B4)", () => {
    it("a US business sees Sales tax and no rate", () => {
        const out = html("US");
        expect(out).toContain('placeholder="Sales tax"');
        expect(out).not.toContain("VAT");
        expect(out).not.toContain('placeholder="20"');
    });

    it("a UK business sees VAT and 20", () => {
        const out = html("GB");
        expect(out).toContain('placeholder="VAT"');
        expect(out).toContain('placeholder="20"');
    });

    it("an Australian business sees GST and 10", () => {
        const out = html("AU");
        expect(out).toContain('placeholder="GST"');
        expect(out).toContain('placeholder="10"');
    });
});
