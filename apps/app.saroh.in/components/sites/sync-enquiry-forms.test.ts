import { describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import { syncEnquiryForms } from "./sync-enquiry-forms";

const enquiry = (label: string, formId?: string): Section => ({
    key: `enq_${label || "blank"}`,
    type: "enquiry",
    contractVersion: 1,
    content: {
        title: "Get in touch",
        formId,
        fields: [
            {
                name: "email",
                label: "Email",
                type: "email",
                required: true,
            },
            { name: "note", label, type: "text" },
        ],
    },
});

const hero = {
    key: "hero_1",
    type: "hero",
    contractVersion: 1,
    content: { heading: "Welcome" },
} as Section;

describe("syncEnquiryForms", () => {
    it("stamps the Form id into a finished enquiry section", async () => {
        const ensure = vi.fn().mockResolvedValue({
            ok: true,
            data: { formId: "form_1" },
        });
        const res = await syncEnquiryForms(
            [hero, enquiry("Note")],
            "Northwind",
            ensure,
        );
        expect(res.ok && res.sections[1].content).toMatchObject({
            formId: "form_1",
        });
        expect(ensure).toHaveBeenCalledTimes(1);
    });

    // Review of #328: an unfinished enquiry used to fail the sync and stop
    // the whole save, which is what holding back exists to prevent.
    it("skips an unfinished enquiry section instead of failing the save", async () => {
        const ensure = vi.fn();
        const sections = [hero, enquiry("")];
        const res = await syncEnquiryForms(sections, "Northwind", ensure);
        expect(ensure).not.toHaveBeenCalled();
        expect(res).toEqual({ ok: true, sections });
    });

    it("reports which section a failed sync belongs to", async () => {
        const ensure = vi
            .fn()
            .mockResolvedValue({ ok: false, error: "Could not save the form" });
        const res = await syncEnquiryForms(
            [hero, enquiry("Note")],
            "Northwind",
            ensure,
        );
        expect(res).toEqual({
            ok: false,
            index: 1,
            error: "Could not save the form",
        });
    });
});
