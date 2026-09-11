/**
 * Segment loading state, drawn from the `--site-*` layer so the wait belongs
 * to the merchant's site rather than flashing a Saroh-grey placeholder onto
 * their page. Shaped like a hero and two sections, which is what nearly every
 * published page opens with.
 */
export default function Loading() {
    return (
        <div className="mx-auto w-full max-w-screen-lg animate-pulse px-5 py-16">
            <div className="h-10 w-2/3 rounded-[var(--site-radius)] bg-site-body/10" />
            <div className="mt-4 h-4 w-1/2 rounded-[var(--site-radius)] bg-site-body/10" />
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
                <div className="h-40 rounded-[var(--site-radius)] bg-site-body/10" />
                <div className="h-40 rounded-[var(--site-radius)] bg-site-body/10" />
            </div>
        </div>
    );
}
