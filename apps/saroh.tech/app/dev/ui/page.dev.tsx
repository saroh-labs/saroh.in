"use client";

import { useState } from "react";

import { Button, ButtonLink } from "@/components/shared/button";
import { Card, LinkCard } from "@/components/shared/card";
import { Chip } from "@/components/shared/chip";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { Field } from "@/components/shared/field";
import { RelatedGrid } from "@/components/shared/related-grid";
import { SegmentedControl } from "@/components/shared/segmented-control";

/** Every shared piece on one sheet, for review. Only exists under `next dev`. */
export default function UiSheet() {
    const [term, setTerm] = useState("net30");
    const [mode, setMode] = useState<"add" | "remove">("add");
    return (
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-20">
            <h1 className="m-0 font-display text-4xl font-bold">
                Shared pieces
            </h1>
            <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href="/">Primary</ButtonLink>
                <Button look="secondary">Secondary</Button>
            </div>
            <div className="flex flex-wrap gap-2">
                {["receipt", "net14", "net30"].map((t) => (
                    <Chip key={t} on={term === t} onClick={() => setTerm(t)}>
                        {t}
                    </Chip>
                ))}
            </div>
            <SegmentedControl
                legend="Add or remove"
                value={mode}
                onChange={setMode}
                options={[
                    { value: "add", label: "Add tax" },
                    { value: "remove", label: "Remove tax" },
                ]}
            />
            <Field label="Business name" placeholder="Lumen Studio" />
            <Field label="Tax ID" hint="(optional)" />
            <Card>A card</Card>
            <LinkCard
                href="/tools"
                title="A link card"
                line="It goes somewhere."
            />
            <FaqList
                items={[
                    { question: "A question?", answer: "An answer." },
                    { question: "Another?", answer: "Another answer." },
                ]}
            />
            <RelatedGrid
                title="Related tools"
                items={[
                    {
                        title: "Invoice",
                        line: "Make one.",
                        href: "/tools/invoice-generator",
                    },
                    {
                        title: "Quote",
                        line: "Make one.",
                        href: "/tools/quote-maker",
                    },
                    {
                        title: "Receipt",
                        line: "Make one.",
                        href: "/tools/receipt-maker",
                    },
                ]}
            />
            <CtaBand
                title="Save, send and get paid"
                line="Free plan, no card."
                action="Start free"
                href="/"
                from="sheet"
            />
        </div>
    );
}
