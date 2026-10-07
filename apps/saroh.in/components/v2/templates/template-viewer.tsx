"use client";

import { useState } from "react";

import type { GalleryTemplate } from "@/content/templates";
import { cn } from "@/lib/cn";

import { BrowserFrame } from "./browser-frame";
import { TemplatePageView } from "./template-page-view";
import type { PreviewDevice } from "./template-preview";

const TOGGLE =
    "inline-flex h-9 cursor-pointer items-center rounded-full px-3.5 text-[14px] transition-[background-color,color,transform] duration-fast ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

function Toggle({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: readonly { id: string; label: string }[];
    value: string;
    onChange: (id: string) => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1"
        >
            {options.map((o) => {
                const on = o.id === value;
                return (
                    <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            TOGGLE,
                            on
                                ? "bg-foreground text-background"
                                : "text-mk-copy hover:bg-mk-hover hover:text-foreground",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * The detail page's look at the template (Templates design, Gym): its pages
 * as a switcher (when it has more than one), Desktop or Phone, and the page
 * in a browser frame that scrolls inside itself, as the site would.
 */
export function TemplateViewer({
    template,
    labels,
}: {
    template: GalleryTemplate;
    labels: { pages: string; device: string; desktop: string; phone: string };
}) {
    const [path, setPath] = useState(template.pages[0]?.path ?? "/");
    const [device, setDevice] = useState<PreviewDevice>("desktop");
    const page = template.pages.find((p) => p.path === path);
    const phone = device === "phone";

    return (
        <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                {template.pages.length > 1 ? (
                    <Toggle
                        label={labels.pages}
                        options={template.pages.map((p) => ({
                            id: p.path,
                            label: p.title,
                        }))}
                        value={path}
                        onChange={setPath}
                    />
                ) : (
                    <span />
                )}
                <Toggle
                    label={labels.device}
                    options={[
                        { id: "desktop", label: labels.desktop },
                        { id: "phone", label: labels.phone },
                    ]}
                    value={device}
                    onChange={(id) => setDevice(id as PreviewDevice)}
                />
            </div>
            <BrowserFrame
                host={`${template.sample.host}${path === "/" ? "" : path}`}
                className={cn(
                    "w-full justify-self-center shadow-mk-shot",
                    phone && "max-w-[390px]",
                )}
            >
                {page ? (
                    <div
                        tabIndex={0}
                        role="region"
                        aria-label={`${template.name}, ${page.title} page`}
                        data-template-view={`${page.path}:${device}`}
                        className={cn(
                            "overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]",
                            phone
                                ? "h-[min(720px,80vh)]"
                                : "aspect-[16/10] max-h-[80vh]",
                        )}
                    >
                        <TemplatePageView
                            template={template}
                            page={page}
                            device={device}
                            priority
                            sizes={
                                phone
                                    ? "390px"
                                    : "(min-width: 1280px) 1180px, 100vw"
                            }
                        />
                    </div>
                ) : null}
            </BrowserFrame>
        </div>
    );
}
