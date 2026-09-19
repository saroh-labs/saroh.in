import * as React from "react";

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Optional muted per-app suffix, e.g. "Docs", "Help", "UI". */
    suffix?: string;
    /** The symbol alone, for rails and tight spaces. It keeps "Saroh" as its accessible name. */
    symbolOnly?: boolean;
}

/**
 * The single stroke: one path that folds twice, and a Saffron cursor dot. The
 * geometry is the brand file's 64-unit master; never re-draw it. Below 20px the
 * dot is dropped (brand file §1).
 */
export function SarohSymbol({
    size = 24,
    style,
    ...props
}: Omit<React.SVGProps<SVGSVGElement>, "width" | "height"> & {
    /** Pixels, or any CSS length (the lockup passes `1.385em` so it scales with its type). */
    size?: number | string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden
            focusable="false"
            style={{ flex: "none", ...style }}
            {...props}
        >
            <path
                d="M44 11 L27 26 L40 37 L20 53"
                // The page's ink: Ink 900 on Paper, Paper-side on Ink. Never
                // Saffron — the stroke measures 2.5:1 on Paper in Saffron.
                stroke="hsl(var(--foreground, 60 4% 11%))"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {typeof size === "string" || size >= 20 ? (
                <circle
                    cx="50"
                    cy="48"
                    r="5.6"
                    // `--highlight` is Saffron 500 on light and Saffron light
                    // (#F0A92B) on dark — exactly the dot's two cuts.
                    fill="hsl(var(--highlight, 36 82% 47%))"
                />
            ) : null}
        </svg>
    );
}

/**
 * "Saroh" in Plus Jakarta Sans SemiBold at −0.025em, outlined. The wordmark
 * keeps its own face and ships as paths, so no app loads Plus Jakarta Sans
 * just to set one word (brand file §3). Generated once from the font by
 * outlining the five glyphs; never re-typed or re-drawn.
 *
 * Font units, baseline at y = 1038, cropped to the letters (y 281 → 1050).
 */
const WORDMARK_PATH =
    "M338 1050Q267.5 1050.0 207.7 1023.7Q148.0 997.5 105.7 951.2Q63.5 905.0 44.0 845.5L143.5 803.5Q170.5 872.0 222.7 909.2Q275.0 946.5 343.0 946.5Q383.0 946.5 412.7 933.7Q442.5 921.0 459.0 898.2Q475.5 875.5 475.5 845.0Q475.5 804.5 452.5 780.2Q429.5 756.0 384.5 742.5L244.5 698.5Q160.5 672.5 116.7 618.7Q73 565 73 493Q73.0 430.5 103.7 382.7Q134.5 335.0 189.0 308.0Q243.5 281.0 313.5 281.0Q380.5 281.0 435.7 304.7Q491.0 328.5 530.2 369.5Q569.5 410.5 588.0 464.5L490 507Q467.5 448.0 421.2 416.2Q375.0 384.5 314.0 384.5Q277.0 384.5 248.7 397.0Q220.5 409.5 205.0 432.7Q189.5 456.0 189.5 487.0Q189.5 523.0 212.5 551.0Q235.5 579.0 282.5 593.5L413 634Q502.0 661.5 546.7 712.0Q591.5 762.5 591.5 837.0Q591.5 899.5 559.2 947.5Q527.0 995.5 470.0 1022.7Q413 1050 338 1050ZM850.0 1050Q795.0 1050 753.5 1030.7Q712.0 1011.5 689.0 976.7Q666.0 942 666.0 895.5Q666.0 851.5 685.5 816.5Q705.0 781.5 745.7 757.5Q786.5 733.5 848.5 723.5L1037.0 692.5V781.5L871.0 810Q826.0 818 804.7 838.7Q783.5 859.5 783.5 891.5Q783.5 922.0 807.2 941.5Q831.0 961 867.5 961.0Q913.5 961.0 948.0 941.2Q982.5 921.5 1001.7 887.7Q1021.0 854 1021.0 813V674Q1021.0 634.5 991.2 609.0Q961.5 583.5 912.5 583.5Q868.0 583.5 834.2 606.7Q800.5 630.0 784.5 667.5L690.5 620.5Q706.0 580.5 739.7 550.0Q773.5 519.5 819.0 502.2Q864.5 485.0 916.0 485Q980.0 485 1029.2 509.0Q1078.5 533.0 1106.0 575.5Q1133.5 618.0 1133.5 674.0V1038.0H1026.0V940.5L1048.5 943.0Q1029.5 976.0 1000.2 1000.0Q971.0 1024 933.2 1037.0Q895.5 1050.0 850.0 1050ZM1241.0 1038V497H1348.5V606.5L1338.5 590.5Q1357.0 537 1397.0 513.7Q1437.0 490.5 1493.0 490.5H1526.0V593H1479.0Q1422.5 593.0 1388.0 627.7Q1353.5 662.5 1353.5 726.0V1038.0ZM1839.0 1050Q1760.5 1050.0 1696.2 1013.2Q1632.0 976.5 1594.0 912.5Q1556.0 848.5 1556.0 767Q1556.0 685.5 1593.7 622.0Q1631.5 558.5 1695.5 521.7Q1759.5 485.0 1839.0 485Q1918.5 485.0 1982.2 521.5Q2046.0 558 2083.5 621.5Q2121.0 685 2121.0 767Q2121.0 849 2082.7 913.0Q2044.5 977.0 1980.7 1013.5Q1917.0 1050 1839.0 1050ZM1839.0 945Q1886.5 945.0 1923.5 922.0Q1960.5 899.0 1982.0 858.5Q2003.5 818.0 2003.5 767.0Q2003.5 716.0 1982.0 676.2Q1960.5 636.5 1923.5 613.2Q1886.5 590.0 1839.0 590Q1791.5 590.0 1754.2 613.2Q1717.0 636.5 1695.2 676.2Q1673.5 716.0 1673.5 767.0Q1673.5 818.0 1695.2 858.5Q1717.0 899 1754.2 922.0Q1791.5 945.0 1839.0 945ZM2206.0 1038V281H2318.5V603.0L2301.0 589Q2320.5 538.5 2364.5 511.7Q2408.5 485.0 2467.0 485Q2526.5 485.0 2572.5 511.0Q2618.5 537.0 2644.7 583.0Q2671.0 629 2671.0 688.5V1038H2558.5V719.0Q2558.5 678.5 2543.2 650.0Q2528.0 621.5 2501.0 605.7Q2474.0 590 2439.0 590Q2404.5 590.0 2377.0 605.7Q2349.5 621.5 2334.0 650.2Q2318.5 679.0 2318.5 719.0V1038.0Z";

/**
 * The canonical Saroh lockup: the symbol, then the outlined "Saroh", title
 * case, never all caps, with an optional muted per-app suffix in Geist.
 * Styled with INLINE styles only (no Tailwind) so it renders identically in
 * every app — shadcn/Tailwind apps, Nextra docs, or a plain marketing page —
 * without any per-app setup.
 *
 * Every colour is `var(--token, <literal fallback>)`, so it tracks the live
 * theme (including dark mode) where @saroh/ui tokens are loaded, and falls back
 * to the brand's light values where they are not.
 *
 * Proportions are the brand file's primary lockup: the symbol is 1.385× the
 * type size and the gap is 0.28× the symbol. Below 104px wide, use
 * `symbolOnly`.
 */
export function Wordmark({
    suffix,
    symbolOnly = false,
    style,
    ...props
}: WordmarkProps) {
    return (
        <span
            style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                // In em, so a call site that sets its own fontSize scales the
                // symbol and the gap with the type.
                gap: "0.388em",
                fontFamily:
                    "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
                fontWeight: 600,
                fontSize: "1.125rem",
                lineHeight: 1,
                letterSpacing: "-0.025em",
                ...style,
            }}
            {...(symbolOnly ? { role: "img", "aria-label": "Saroh" } : {})}
            {...props}
        >
            <SarohSymbol size="1.385em" />
            {symbolOnly ? null : (
                <>
                    <svg
                        viewBox="0 281 2726 769"
                        // 769 font units of a 1000-unit em: the letters sit at
                        // the size live text would set them.
                        style={{
                            height: "0.769em",
                            width: "auto",
                            flex: "none",
                        }}
                        aria-hidden
                        focusable="false"
                    >
                        <path
                            d={WORDMARK_PATH}
                            fill="hsl(var(--foreground, 60 4% 11%))"
                        />
                    </svg>
                    {/* The accessible name is the word itself. */}
                    <span style={VISUALLY_HIDDEN}>Saroh</span>
                </>
            )}
            {suffix && !symbolOnly ? (
                <span
                    style={{
                        fontWeight: 500,
                        color: "hsl(var(--muted-foreground, 42 9% 39%))",
                    }}
                >
                    {suffix}
                </span>
            ) : null}
        </span>
    );
}

const VISUALLY_HIDDEN: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
};

export default Wordmark;
