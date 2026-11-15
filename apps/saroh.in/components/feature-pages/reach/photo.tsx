import { cn } from "@saroh/marketing/cn";
import type { CSSProperties } from "react";

/**
 * The Reach boards' stand-in product photos (FW, FS): drawn bakes, not
 * pictures of a real shop, so a drawing never passes for a capture. Each is
 * a fill only: the caller sizes it and gives it its corners. Keyed by what
 * it shows, so any world's item can name one (`photoFor`).
 */
const PHOTOS = {
    buns: "radial-gradient(circle at 26% 34%,#EDBD7E 0 11%,#C98A4B 11.5% 13%,transparent 13.5%),radial-gradient(circle at 58% 28%,#E9B676 0 12%,#C4844A 12.5% 14%,transparent 14.5%),radial-gradient(circle at 44% 64%,#F0C487 0 13%,#C98A4B 13.5% 15%,transparent 15.5%),radial-gradient(circle at 78% 60%,#E6B070 0 11%,#BF7F45 11.5% 13%,transparent 13.5%),radial-gradient(circle at 16% 78%,#EBBA7A 0 10%,#C4844A 10.5% 12%,transparent 12.5%),radial-gradient(circle at 86% 22%,#E2A968 0 9%,#BF7F45 9.5% 11%,transparent 11.5%),linear-gradient(160deg,#8A5A35,#5E3A20)",
    loaf: "radial-gradient(ellipse 34% 26% at 50% 56%,#C98A4B 0 60%,#9C5F2C 62% 80%,transparent 82%),radial-gradient(ellipse 30% 4% at 50% 50%,#E9C08A 0 90%,transparent 100%),linear-gradient(160deg,#E9DCC6,#CDB894)",
    brownies:
        "radial-gradient(ellipse 30% 22% at 38% 58%,#6E4526 0 70%,#4E2F18 72% 85%,transparent 87%),radial-gradient(ellipse 22% 18% at 68% 46%,#7C5030 0 70%,#53321A 72% 85%,transparent 87%),linear-gradient(170deg,#D8CBB6,#B9A688)",
    festive:
        "radial-gradient(circle at 30% 40%,#F2C14E 0 9%,transparent 10%),radial-gradient(circle at 52% 34%,#E9A23B 0 9%,transparent 10%),radial-gradient(circle at 70% 46%,#F2C14E 0 9%,transparent 10%),radial-gradient(circle at 42% 64%,#D9822B 0 9%,transparent 10%),radial-gradient(circle at 62% 66%,#F0B95A 0 9%,transparent 10%),radial-gradient(ellipse 42% 34% at 50% 52%,#8E2B2B 0 96%,transparent 100%),linear-gradient(160deg,#5A1C1C,#2E0E10)",
    class: "radial-gradient(ellipse 18% 22% at 30% 40%,#E8C9A6 0 90%,transparent 100%),radial-gradient(ellipse 18% 22% at 70% 40%,#D9B08A 0 90%,transparent 100%),radial-gradient(ellipse 50% 18% at 50% 78%,#F1E4CF 0 90%,transparent 100%),linear-gradient(170deg,#6B4A33,#3D2A1D)",
    salon: "radial-gradient(ellipse 15% 19% at 50% 45%,#D9A57E 0 96%,transparent 100%),radial-gradient(ellipse 25% 30% at 50% 40%,#3B2016 0 96%,transparent 100%),radial-gradient(ellipse 40% 30% at 50% 100%,#C9A24A 0 96%,transparent 100%),radial-gradient(circle at 80% 18%,rgba(201,162,74,.55) 0 12%,transparent 30%),radial-gradient(circle at 15% 85%,rgba(201,162,74,.35) 0 10%,transparent 26%),linear-gradient(170deg,#5B2E63,#24102A)",
} as const;

export type PhotoKind = keyof typeof PHOTOS;

/** The drawn photo for an item the world names; bakes look like bakes. */
export const photoFor = (itemKey: string): PhotoKind =>
    (
        ({
            "bun-box": "buns",
            sourdough: "loaf",
            "brownie-box": "brownies",
            "rose-pistachio": "brownies",
            "black-forest": "brownies",
            "plum-cake": "festive",
            hamper: "festive",
        }) as Record<string, PhotoKind>
    )[itemKey] ?? "buns";

export function Photo({
    kind,
    className,
    style,
}: {
    kind: PhotoKind;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <span
            aria-hidden
            className={cn("block bg-cover", className)}
            style={{ backgroundImage: PHOTOS[kind], ...style }}
        />
    );
}
