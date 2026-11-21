import { cn } from "../lib/utils";
import { initialsOf } from "./look-front";

/**
 * The Stamp (BLOCK-MAP §3, the LA Hero board): a monogram ring drawn from
 * the business's name and town, the no-photo art that fills a split hero's
 * image slot, so a hero without a photo never shows a grey box.
 *
 * Decoration only (`aria-hidden`): the name is the page's own words
 * elsewhere. Drawn from `--site-*` only. No `"use client"`: pure SVG.
 */
export function Stamp({
    name,
    town,
    className,
}: {
    name: string;
    town?: string | null;
    className?: string;
}) {
    const initial = initialsOf(name).slice(0, 1);
    const place = town?.trim().toLocaleUpperCase() ?? "";
    const ring = ringWords(name, place);
    // One ring path per name: two stamps of one business share the same
    // geometry, so a shared id is harmless and needs no hook.
    const id = `site-stamp-${hash(ring)}`;
    return (
        <div
            data-site-stamp=""
            aria-hidden="true"
            className={cn(
                "text-site-accent-text mx-auto aspect-square w-full max-w-[380px]",
                className,
            )}
        >
            <svg viewBox="0 0 400 400" className="block size-full">
                <defs>
                    <path
                        id={id}
                        d="M200,200 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0"
                    />
                </defs>
                <circle
                    cx="200"
                    cy="200"
                    r="194"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                />
                <circle
                    cx="200"
                    cy="200"
                    r="132"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                />
                <text
                    className="font-site-body"
                    fill="currentColor"
                    fontSize="19"
                    fontWeight="600"
                    letterSpacing="3.4"
                >
                    <textPath
                        href={`#${id}`}
                        textLength="1000"
                        lengthAdjust="spacing"
                    >
                        {ring}
                    </textPath>
                </text>
                <text
                    x="200"
                    y={place ? 232 : 252}
                    textAnchor="middle"
                    className="font-site-heading fill-site-fg"
                    fontSize="150"
                    fontStyle="italic"
                    fontWeight="600"
                >
                    {initial}
                </text>
                {place ? (
                    <text
                        x="200"
                        y="282"
                        textAnchor="middle"
                        className="font-site-body fill-site-muted"
                        fontSize="15"
                        fontWeight="600"
                        letterSpacing="4.2"
                    >
                        {place}
                    </text>
                ) : null}
            </svg>
        </div>
    );
}

/** "SANDHU TAILORS · ROHTAK · ", said again until it rounds the ring. */
export function ringWords(name: string, town: string): string {
    const once = [name.trim().toLocaleUpperCase(), town]
        .filter(Boolean)
        .map((part) => `${part} · `)
        .join("");
    if (once === "") return "";
    let ring = once;
    while (ring.length < 36) ring += once;
    return ring;
}

/**
 * The town in a one-line or several-line address: its last part that is
 * not a pin code, without a trailing pin ("Bandra West, Mumbai 400050" →
 * "Mumbai"). Null when there is none.
 */
export function townOf(address: string | null | undefined): string | null {
    if (!address) return null;
    const parts = address
        .split(/[\n,]/)
        .map((p) => p.replace(/[\s-]*\d[\d\s-]*$/, "").trim())
        .filter((p) => p !== "");
    return parts.length > 1 ? parts[parts.length - 1] : null;
}

function hash(text: string): string {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
