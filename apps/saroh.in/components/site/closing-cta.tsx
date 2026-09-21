import JoinWaitlist from "@/components/home/join-waitlist";

/**
 * The card every page ends on — the design's "Name your business. That is
 * step one of three." — asking for the waitlist instead while signup is gated
 * (#261). `id="waitlist"` is where every "Join the waitlist" on the page lands.
 */
export function ClosingCta() {
    return (
        <section
            id="waitlist"
            className="mx-auto max-w-[1220px] scroll-mt-24 px-4 pb-[66px] pt-[34px] sm:px-10"
        >
            <div className="rounded-[18px] border border-border bg-card px-5 py-10 text-center sm:px-[34px]">
                <h2 className="mx-auto mb-3 max-w-[28ch] font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">
                    Be there when your batch opens.
                </h2>
                <p className="mx-auto mb-[22px] max-w-[54ch] text-pretty text-[16px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                    We are letting businesses in a few at a time, so each one is
                    set up properly. Leave your email and we will write once,
                    when it is your turn.
                </p>
                <JoinWaitlist />
                <p className="mt-3.5 text-[13px] leading-[1.55] text-muted-foreground">
                    One email when we open your batch. No newsletter, and nobody
                    will ring you.
                </p>
            </div>
        </section>
    );
}
