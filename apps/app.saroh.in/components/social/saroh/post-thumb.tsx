import { cn } from "@saroh/ui/lib/utils";

import type { SocialPost } from "@/lib/social/saroh-social-types";

/**
 * A post's picture, small: the JPEG Saroh drew for it, at its own shape
 * (4:5 or square). A draft not drawn yet shows its name on a plain tile.
 */
export function PostThumb({
    post,
    className,
}: {
    post: Pick<SocialPost, "title" | "picture">;
    className?: string;
}) {
    const square = post.picture.size === "square";
    return (
        <span
            className={cn(
                "block shrink-0 overflow-hidden rounded-[4px] bg-card shadow-md",
                square ? "aspect-square" : "aspect-[4/5]",
                className,
            )}
        >
            {post.picture.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the JPEG Saroh stored for the post
                <img
                    src={post.picture.imageUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                />
            ) : (
                <span
                    data-ph-mask=""
                    className="flex size-full items-center justify-center p-1.5 text-center text-[11px] font-semibold leading-tight text-muted-foreground"
                >
                    {post.title}
                </span>
            )}
        </span>
    );
}
