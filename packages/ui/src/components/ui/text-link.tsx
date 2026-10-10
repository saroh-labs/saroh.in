import { ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * The link's look, for the rare caller that must draw one on an element of
 * its own (a `label`, a router's link). Prefer `TextLink`.
 */
export function textLinkClass(tone: "ink" | "muted" = "ink") {
    return cn(
        "cursor-pointer rounded-sm underline underline-offset-4 transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:text-disabled-foreground disabled:no-underline",
        tone === "ink"
            ? "font-medium text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground"
            : "text-muted-foreground decoration-border-strong hover:text-foreground active:text-muted-foreground",
    );
}

interface Common {
    /** `ink` by default; `muted` for a link in secondary text. */
    tone?: "ink" | "muted";
    className?: string;
    children: React.ReactNode;
}

type AnchorProps = Common &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
        href: string;
        /** Opens in a new tab, and says so with the glyph and to a screen reader. */
        external?: boolean;
        /** Next's `scroll` and `prefetch`, for an in-app link. */
        scroll?: boolean;
        prefetch?: boolean;
        onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    };

type ButtonProps = Common &
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
        href?: undefined;
        external?: undefined;
        onClick: React.MouseEventHandler<HTMLButtonElement>;
    };

export type TextLinkProps = AnchorProps | ButtonProps;

/**
 * The one link in text: Ink, underlined at rest (colour alone doesn't tell
 * a link from the words around it), with the focus ring. Never Saffron.
 *
 * With `href` it is a link, in-app through Next; `external` opens a new tab
 * and adds the glyph. With `onClick` alone it is a button that reads as a
 * link, for an action inside a sentence ("Change").
 */
export function TextLink(props: TextLinkProps) {
    if (props.href === undefined) {
        const { tone, className, children, ...rest } = props;
        return (
            <button
                type="button"
                className={cn(textLinkClass(tone), className)}
                {...rest}
            >
                {children}
            </button>
        );
    }
    const {
        tone,
        className,
        children,
        external,
        href,
        scroll,
        prefetch,
        ...rest
    } = props;
    const cls = cn(textLinkClass(tone), className);
    if (external) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cls}
                {...rest}
            >
                {children}
                <ExternalLink
                    aria-hidden
                    className="ml-1 inline size-[0.9em] align-[-0.08em]"
                />
                <span className="sr-only"> (opens in a new tab)</span>
            </a>
        );
    }
    return (
        <Link
            href={href}
            scroll={scroll}
            prefetch={prefetch}
            className={cls}
            {...rest}
        >
            {children}
        </Link>
    );
}
