/**
 * A fixed-offset zone where it's mid-morning now, as the business's zone. Home
 * and the diary read from the business's clock, and a capture run at any hour
 * should show a working day; no shot shows the zone itself. The capture works
 * out the same one (`capture.ts`), so re-seed shortly before capturing.
 */
export function morningZone(now: Date): string {
    const hoursAhead = Math.round(
        10.5 - now.getUTCHours() - now.getUTCMinutes() / 60,
    );
    const ahead = ((hoursAhead + 12 + 24) % 24) - 12;
    // Etc/GMT's sign is the opposite of its offset.
    return ahead === 0
        ? "Etc/GMT"
        : `Etc/GMT${ahead > 0 ? "-" : "+"}${Math.abs(ahead)}`;
}
