import type { ReactNode } from "react";

/**
 * The card each part of a storefront's settings sits in, and the note under
 * a control ("Saroh Storefront Settings" design): an 11px uppercase label,
 * then the controls 20px apart. Shared by `storefronts-screen.tsx` and the
 * sections split out of it.
 */
export function Section({
    title,
    id,
    children,
}: {
    title: string;
    /** For a link straight to this card. */
    id?: string;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            aria-label={title}
            className="scroll-mt-6 rounded-xl border border-border px-5 py-[18px]"
        >
            <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {title}
            </h2>
            <div className="flex flex-col gap-5">{children}</div>
        </section>
    );
}

export function Note({ id, children }: { id?: string; children: ReactNode }) {
    return (
        <p
            id={id}
            className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
        >
            {children}
        </p>
    );
}
