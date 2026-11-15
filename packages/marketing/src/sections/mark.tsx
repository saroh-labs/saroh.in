import type { ReactNode } from "react";

/**
 * The site mark (KIT.md): a Saffron underline under one word of a page's
 * h1, once per page. The page wraps the word: `Your <Mark>website</Mark>
 * and orders…`.
 */
export function Mark({ children }: { children: ReactNode }) {
    return (
        <span className="underline decoration-brand-500 decoration-[0.08em] underline-offset-[0.14em] [text-decoration-skip-ink:none]">
            {children}
        </span>
    );
}
