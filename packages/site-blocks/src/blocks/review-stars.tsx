import { cn } from "../lib/utils";

/**
 * The stars on a testimonial, only when it has a rating (23 Nov 2026): the
 * rating's worth filled and the rest outlined, so the count reads without
 * colour. Nothing at all when unset: an unrated quote never shows empty
 * stars. One image to a screen reader ("4 of 5 stars").
 */
export function ReviewStars({
    rating,
    className,
}: {
    rating: number | undefined;
    className?: string;
}) {
    if (!rating || rating < 1 || rating > 5) return null;
    return (
        <span
            role="img"
            aria-label={`${rating} of 5 stars`}
            data-review-stars={rating}
            className={cn(
                "text-site-accent-text inline-flex gap-0.5",
                className,
            )}
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <svg
                    key={n}
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill={n <= rating ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                >
                    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" />
                </svg>
            ))}
        </span>
    );
}
