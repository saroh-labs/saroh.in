/**
 * Side by side, not on top: the lanes a person's bookings take in the day
 * view, so two that overlap (a double booking, a class beside a one-to-one)
 * each keep their own place to read and tap.
 *
 * A booking counts as at least `minMinutes` long here, because that is the
 * least height it is drawn at on a phone (a 44px touch target): a 15-minute
 * booking drawn 44px tall would otherwise cover the one straight after it.
 * Pure; tested in `diary-lanes.test.ts`.
 */
export interface Laned {
    /** Which lane, from 0 on the left. */
    lane: number;
    /** How many lanes its cluster of overlapping bookings uses. */
    lanes: number;
}

export function bookingLanes<
    T extends { key: string; start: number; end: number },
>(blocks: readonly T[], minMinutes: number): Map<string, Laned> {
    const sorted = [...blocks].sort(
        (a, b) =>
            a.start - b.start || b.end - a.end || a.key.localeCompare(b.key),
    );
    const out = new Map<string, Laned>();
    // A cluster: bookings joined by overlap, which share one lane count.
    let cluster: { key: string; lane: number }[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = -Infinity;
    const close = () => {
        const lanes = Math.max(1, laneEnds.length);
        for (const c of cluster) out.set(c.key, { lane: c.lane, lanes });
        cluster = [];
        laneEnds = [];
    };
    for (const b of sorted) {
        const end = Math.max(b.end, b.start + minMinutes);
        if (b.start >= clusterEnd) {
            close();
            clusterEnd = -Infinity;
        }
        let lane = laneEnds.findIndex((e) => e <= b.start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(end);
        } else {
            laneEnds.splice(lane, 1, end);
        }
        cluster.push({ key: b.key, lane });
        clusterEnd = Math.max(clusterEnd, end);
    }
    close();
    return out;
}
