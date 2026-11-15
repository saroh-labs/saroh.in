"use client";

import { Skeleton } from "@saroh/ui/skeleton";
import { Check, Info, Shapes } from "lucide-react";
import type { ReactNode } from "react";

import type { Template } from "@/lib/sites/service";
import type { ModuleStates } from "@/lib/sites/template-picker";
import type { TemplatePreviewDetails } from "@/lib/sites/template-preview";
import { whatGoesIn } from "@/lib/sites/template-preview";

/**
 * "What goes in" beside a template's preview (DEC-216, board D4): what of
 * the business goes into the site and where it comes from, what stays a
 * sample to replace, and what waits on a module.
 */
export function WhatGoesInPanel({
    template,
    details,
    modules,
    businessName,
    sampleName,
    loading,
}: {
    template: Template;
    details: TemplatePreviewDetails | null;
    modules: ModuleStates | null;
    /** The business's name, for "From …"; null when not read. */
    businessName: string | null;
    sampleName: string;
    loading: boolean;
}) {
    const goes = whatGoesIn(template, details, modules, sampleName);
    return (
        <section aria-label="What goes in" className="grid gap-3 text-sm">
            <h3 className="font-medium">What goes in</h3>
            {loading ? (
                <div className="grid gap-2" aria-busy="true">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-32" />
                </div>
            ) : goes.yours.length > 0 ? (
                <Lines
                    title={`From ${businessName ?? "your business"}`}
                    lines={goes.yours}
                    icon={<Check aria-hidden className="mt-0.5 size-3.5" />}
                />
            ) : null}
            <Lines
                title="A sample to replace"
                lines={goes.sample}
                icon={<Shapes aria-hidden className="mt-0.5 size-3.5" />}
            />
            <div className="grid gap-1">
                <h4 className="text-xs font-medium text-muted-foreground">
                    Waits on a module
                </h4>
                <p className="text-xs leading-normal">{goes.waits}</p>
            </div>
            <p className="flex items-start gap-1.5 text-xs leading-normal text-muted-foreground">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Before you publish, we list any sample words still on your
                pages.
            </p>
        </section>
    );
}

function Lines({
    title,
    lines,
    icon,
}: {
    title: string;
    lines: readonly { what: string; from: string }[];
    icon: ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <h4
                data-ph-mask=""
                className="text-xs font-medium text-muted-foreground"
            >
                {title}
            </h4>
            <ul className="grid gap-1.5">
                {lines.map((l) => (
                    <li key={l.what} className="flex items-start gap-2">
                        <span className="shrink-0 text-muted-foreground">
                            {icon}
                        </span>
                        <span className="min-w-0">
                            <span data-ph-mask="" className="block text-xs">
                                {l.what}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                                {l.from}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
