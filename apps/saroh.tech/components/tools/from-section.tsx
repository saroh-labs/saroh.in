"use client";

import { useRef, useState } from "react";

import { Field } from "@/components/shared/field";
import type { FromDetails } from "@/lib/tools/document";

import { Section } from "./fields";

export const NO_FROM: FromDetails = {
    logo: "",
    name: "",
    email: "",
    address: "",
    taxId: "",
};

const LOGO_PX = 192;

/** A small square PNG: it has to fit in this browser's storage and in the PDF. */
function readLogo(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Not an image"));
        };
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = LOGO_PX;
            const scale = LOGO_PX / Math.max(img.width, img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            canvas
                .getContext("2d")
                ?.drawImage(img, (LOGO_PX - w) / 2, (LOGO_PX - h) / 2, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/png"));
        };
        img.src = url;
    });
}

/** Your details, remembered across every tool. On a phone they fold away once filled. */
export function FromSection({
    from,
    onChange,
}: {
    from: FromDetails;
    onChange: (patch: Partial<FromDetails>) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const file = useRef<HTMLInputElement>(null);
    const folded = from.name.trim() !== "" && !editing;
    return (
        <Section
            title="From"
            aside={
                <>
                    <span className="hidden text-[13px] text-muted-foreground md:inline">
                        Remembered for next time
                    </span>
                    {folded ? (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="-my-2 min-h-11 cursor-pointer border-0 bg-transparent font-sans text-sm font-semibold underline md:hidden"
                        >
                            Edit
                        </button>
                    ) : null}
                </>
            }
        >
            {folded ? (
                <div className="text-[15px] md:hidden">
                    <b>{from.name}</b>
                    <div className="text-[13px] text-muted-foreground">
                        {[from.email, from.taxId].filter(Boolean).join(" · ")}
                    </div>
                </div>
            ) : null}
            <div
                onFocus={() => setEditing(true)}
                className={`flex-col gap-4 md:flex-row md:items-center ${
                    folded ? "hidden md:flex" : "flex"
                }`}
            >
                <div className="flex shrink-0 flex-col items-start gap-1">
                    <input
                        ref={file}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(e) => {
                            const picked = e.target.files?.[0];
                            e.target.value = "";
                            if (!picked) return;
                            setLogoError(false);
                            readLogo(picked)
                                .then((logo) => onChange({ logo }))
                                .catch(() => setLogoError(true));
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => file.current?.click()}
                        className="flex size-[88px] cursor-pointer items-center justify-center overflow-hidden rounded-mk-btn border border-dashed border-border-strong bg-background p-0 font-sans text-[13px] text-mk-copy"
                    >
                        {from.logo ? (
                            // A data URL from this browser.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={from.logo}
                                alt="Change logo"
                                className="size-full object-contain"
                            />
                        ) : (
                            "Add logo"
                        )}
                    </button>
                    {from.logo ? (
                        <button
                            type="button"
                            onClick={() => onChange({ logo: "" })}
                            className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] underline md:min-h-0"
                        >
                            Remove logo
                        </button>
                    ) : null}
                    {logoError ? (
                        <span
                            role="alert"
                            className="w-[88px] text-xs text-mk-copy"
                        >
                            That file didn't work. Try a PNG or JPG.
                        </span>
                    ) : null}
                </div>
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                    <Field
                        label="Business name"
                        placeholder="Your business"
                        value={from.name}
                        autoComplete="organization"
                        onChange={(e) => onChange({ name: e.target.value })}
                    />
                    <Field
                        label="Email"
                        type="email"
                        placeholder="you@example.com"
                        value={from.email}
                        autoComplete="email"
                        onChange={(e) => onChange({ email: e.target.value })}
                    />
                    <Field
                        label="Address"
                        placeholder="Street, city"
                        value={from.address}
                        onChange={(e) => onChange({ address: e.target.value })}
                    />
                    <Field
                        label="Tax ID"
                        optional
                        value={from.taxId}
                        onChange={(e) => onChange({ taxId: e.target.value })}
                    />
                </div>
            </div>
        </Section>
    );
}
