/**
 * A band colour each example business's site uses beside its accent (HSL
 * channels, as `--site-*` carries them): Rye & Co.'s sage class band, Studio
 * Neel's gold. The Reach pages' site and post drawings read it; a business
 * without one uses its accent.
 */
export const LOOK_BANDS: Record<
    string,
    { bg: string; fg: string } | undefined
> = {
    rye: { bg: "143 18.6% 29.8%", fg: "36 52% 91%" },
    neel: { bg: "41.6 54% 53.9%", fg: "286.7 39.1% 13.5%" },
};
