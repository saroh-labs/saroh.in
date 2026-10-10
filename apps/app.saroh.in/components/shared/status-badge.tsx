import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { Tip } from "@saroh/ui/tooltip";
import type { ReactNode } from "react";

import type { Thing } from "@/lib/status/vocabulary";
import { publication } from "@/lib/status/vocabulary";

type Variant = NonNullable<BadgeProps["variant"]>;

/**
 * Every tone a screen names, and the one badge each wears. The domain
 * helpers (`lib/subscriptions/view`, `lib/orders/list-row`, the editor
 * shell) keep their own names for a tone; this is where they meet.
 */
const TONE = {
    // the badge's own
    success: "success",
    warning: "warning",
    error: "error",
    info: "info",
    draft: "draft",
    active: "active",
    neutral: "neutral",
    tag: "tag",
    // subscriptions, packs, the editor shell
    ok: "success",
    accent: "active",
    bad: "error",
    off: "neutral",
    // an order's step
    new: "active",
    prog: "neutral",
    ready: "success",
    done: "tag",
    // a site, a module
    live: "success",
    attention: "warning",
    quiet: "neutral",
    danger: "error",
} as const satisfies Record<string, Variant>;

export type StatusTone = keyof typeof TONE;

/** The badge variant a tone wears, for a caller that draws `Badge` itself. */
export function statusVariant(tone: StatusTone): Variant {
    return TONE[tone];
}

type Common = {
    /** 11px by default, for rows and beside a title. `default` is 12px. */
    size?: BadgeProps["size"];
    /** A dot before the word, in the badge's colour. */
    dot?: boolean;
    className?: string;
    id?: string;
};

export type StatusBadgeProps =
    | (Common & {
          /** A state with words of its own: an order's step, an invoice. */
          tone: StatusTone;
          children: ReactNode;
          /** More about it, for a hover and a screen reader. */
          hint?: string;
          thing?: undefined;
          status?: undefined;
      })
    | (Common & {
          /** "Can customers get it?": the word comes from the vocabulary. */
          thing: Thing;
          /** The API's own status for it (`PUBLISHED`, `OPEN`, `ACTIVE`). */
          status: string;
          tone?: undefined;
          children?: undefined;
          hint?: undefined;
      });

/**
 * The one status badge. Sentence case, always in words, never pressed: it
 * has no hover and no focus ring.
 *
 * Give it a `thing` and its `status` and it says "Draft", "Live", "Paused",
 * "Ended" or "Archived" (`lib/status/vocabulary.ts`), with the thing's own
 * sentence ("Taking bookings.") as its hint. Give it a `tone` and words for
 * any other state.
 *
 * The hint shows as a tooltip under a mouse and is the badge's description
 * for a screen reader. It is a gloss, never the only place something is
 * said: a thumb has no hover.
 */
export function StatusBadge(props: StatusBadgeProps) {
    const { size = "sm", dot, className, id } = props;
    const words =
        props.thing !== undefined
            ? publication(props.thing, props.status)
            : null;
    const variant = words ? words.tone : TONE[props.tone ?? "neutral"];
    const hint = words ? words.hint : props.hint;
    const badge = (
        <Badge
            id={id}
            variant={variant}
            size={size}
            dot={dot}
            data-status={words?.state}
            aria-description={hint || undefined}
            className={cn("shrink-0 font-semibold", className)}
        >
            {words ? words.word : props.children}
        </Badge>
    );
    return hint ? <Tip label={hint}>{badge}</Tip> : badge;
}
