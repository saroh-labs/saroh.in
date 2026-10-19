"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";
import { showSuccess } from "@saroh/ui/toast";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useTakingBookings } from "@/components/services/use-taking-bookings";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PriceHistoryList } from "@/components/shared/price-history";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { count } from "@/lib/format/plural";
import {
    PRICE_HISTORY_TITLE,
    priceHistoryShown,
} from "@/lib/price-history/words";
import { archiveService } from "@/lib/services/actions";
import { callName } from "@/lib/services/call-name";
import type { Service } from "@/lib/services/service";
import type { WhoFields } from "@/lib/services/service-cards";
import { AVAILABILITY_HREF } from "@/lib/services/service-cards";
import type { ServiceDraft } from "@/lib/services/service-editor";
import {
    businessModeFor,
    chargedAsSaved,
    draftOf,
    glance,
    gstPlace,
    savedMessage,
    serviceFieldProblems,
    staffFor,
} from "@/lib/services/service-editor";
import type { Bookers } from "@/lib/services/service-form";
import {
    bookersOf,
    freeTimeOf,
    lengthSaved,
    mixOf,
    pauseLabel,
    takingLine,
    withSameName,
} from "@/lib/services/service-form";
import { hoursFromRules } from "@/lib/services/service-hours-draft";
import type { PanelKey } from "@/lib/services/service-panels";
import { editCards } from "@/lib/services/service-panels";
import { zoneShortName } from "@/lib/services/time-picker";

import { AtAGlance } from "./at-a-glance";
import { DetailPanel } from "./detail-panel";
import type { EditorProps } from "./editor-props";
import { BackToServices, SERVICES_HREF } from "./editor-props";
import { Section } from "./fields";
import { DESK, EditCards, PHONE } from "./service-rows";
import { useServiceSave } from "./use-service-save";
import { WhoCanBookCard } from "./who-can-book";

/** Where a service's bookings are listed. */
const ALL_BOOKINGS_HREF = "/bookings/all";

/**
 * A saved service (U16, #1032; boards BKMServiceEdit and BKDServiceNew's
 * edit states): read first, changed a part at a time. "Who can book it"
 * leads (DEC-170, Q5) and each tick saves as it is pressed, with Undo.
 * Then three cards, What it is, Time and place, and Money, each opening
 * its own panel with one Save (`DetailPanel`), so there is never a page
 * of unsaved changes. At a glance and Price history beside them at a
 * desk, under them on a phone.
 *
 * More holds See its bookings, Pause (both ticks off) or taking bookings
 * again, and Delete service last, in red, whose confirm offers "Pause it
 * instead". Without the right to change services it all reads, and says
 * so once.
 */
export function EditService(props: EditorProps & { service: Service }) {
    const {
        service,
        rules,
        staff,
        usage,
        currency,
        timezone,
        canEdit,
        hasStorefront = null,
        paymentsLock = null,
        payment = null,
        gstRegistered = null,
        businessPriceMode = null,
        priceHistory,
        others = [],
    } = props;
    const router = useRouter();
    const people = (staff ?? []).filter((p) => p.status === "ACTIVE");
    const hasStaff = people.length > 0;
    const [initial] = useState(() =>
        draftOf(
            service,
            staffFor(service.id, people),
            timezone,
            hoursFromRules(rules ?? []),
        ),
    );
    const store = useServiceSave({
        serviceId: service.id,
        initial,
        people,
        staffRead: staff !== null,
        hoursRead: rules !== null,
        currency,
    });
    const saved = store.saved;
    const taking = useTakingBookings();
    const [who, setWho] = useState<WhoFields>({
        status: service.status,
        showOnBookingPage: service.showOnBookingPage,
        bookableByTeam: service.bookableByTeam,
    });
    const bookers = bookersOf(who);
    const [panel, setPanel] = useState<PanelKey | null>(null);
    const [lastPanel, setLastPanel] = useState<PanelKey>("what");
    const [round, setRound] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // A service already a treatment keeps saving when its storefront has
    // gone since; the booking page refuses it then (E9).
    const wasTreatment = (service.visits || 1) > 1;
    const noStorefront =
        !wasTreatment && (hasStorefront === false || store.refusedStorefront);
    const [gstAt] = useState(() => gstPlace(gstRegistered, initial));
    // The zone's short name ("IST"), read once.
    const [zoneShort] = useState(() => zoneShortName(timezone, Date.now()));
    const comingUp = usage ? usage.comingUp : null;
    const chosen = people.filter((p) => saved.staffIds.includes(p.id));
    const names = chosen.map((p) => callName(p.name));
    const name = saved.name.trim() || service.name;

    const problemsOf = (d: ServiceDraft) =>
        withSameName(
            serviceFieldProblems(
                d,
                hasStaff,
                noStorefront,
                people.length === 1,
                gstRegistered === true,
            ),
            d.name,
            others,
            service.id,
        );

    function setBookers(next: Bookers) {
        if (!canEdit) return;
        void taking.setBookers({ id: service.id, name, ...who }, next, setWho);
    }
    const paused = mixOf(bookers) === "paused";
    const pauseOrResume = () =>
        setBookers(
            paused
                ? { customers: true, team: true }
                : { customers: false, team: false },
        );

    function openPanel(key: PanelKey) {
        setLastPanel(key);
        setRound((n) => n + 1);
        setPanel(key);
    }

    async function apply(which: PanelKey, next: ServiceDraft) {
        const message =
            which === "time" && next.minutes.trim() !== saved.minutes.trim()
                ? lengthSaved(next.minutes, saved.minutes, comingUp)
                : savedMessage({
                      isNew: false,
                      name: next.name.trim(),
                      kind: next.kind,
                      comingUp,
                  });
        return (await store.save(next, message)) === "saved";
    }

    async function remove(): Promise<ConfirmResult> {
        const res = await runAction(() => archiveService(service.id), {
            quiet: true,
        });
        if (!res?.ok) return { ok: false, error: res ? res.error : UNREACHED };
        showSuccess("Service deleted.");
        router.push(SERVICES_HREF);
    }

    const cards = editCards({
        draft: saved,
        names,
        fullNames: staff === null ? null : chosen.map((p) => p.name),
        currency,
        businessZone: timezone,
        zoneShort,
        hoursRead: rules !== null,
        gstAt,
    });
    const narrows = saved.kind === "one" && names.length > 0;
    const which = panel ?? lastPanel;

    const more = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    aria-label="More"
                    className="max-[759px]:w-11 max-[759px]:px-0"
                >
                    <span className={DESK}>More</span>
                    <ChevronDown aria-hidden className={DESK} />
                    <MoreHorizontal aria-hidden className={PHONE} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px] max-w-[90vw]">
                <DropdownMenuItem asChild>
                    <Link href={ALL_BOOKINGS_HREF}>See its bookings</Link>
                </DropdownMenuItem>
                {canEdit ? (
                    <>
                        <DropdownMenuItem
                            disabled={taking.busy === service.id}
                            onSelect={pauseOrResume}
                        >
                            {pauseLabel(bookers)}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setConfirmDelete(true)}
                        >
                            Delete service
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <main className="w-full px-4 pb-10 pt-4 sm:px-[26px]">
            <BackToServices />
            <PageHeader
                className="mb-4"
                holdsData="title"
                title={name}
                actions={
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline" className={DESK}>
                            <Link href={ALL_BOOKINGS_HREF}>
                                See its bookings
                            </Link>
                        </Button>
                        {more}
                    </div>
                }
            />
            {canEdit ? null : (
                <ReadOnlyNote>
                    Your role can see services but not change them.
                </ReadOnlyNote>
            )}
            <div className="grid gap-5 min-[760px]:grid-cols-[minmax(0,1fr)_340px] min-[760px]:items-start">
                <div className="grid min-w-0 gap-3.5">
                    <WhoCanBookCard
                        bookers={bookers}
                        onChange={setBookers}
                        line={takingLine(bookers, comingUp)}
                        freeTime={
                            names.length ? freeTimeOf(saved.kind, names) : null
                        }
                        disabled={!canEdit || taking.busy === service.id}
                        pair
                    />
                    <EditCards
                        cards={cards}
                        canEdit={canEdit}
                        onOpen={(key) => openPanel(key)}
                    />
                    {narrows ? (
                        <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                            <span data-ph-mask="">
                                Its times come from{" "}
                                {freeTimeOf("one", names).replace(
                                    / free time$/,
                                    " hours",
                                )}
                                .
                            </span>{" "}
                            <TextLink href={AVAILABILITY_HREF}>
                                Change them in Hours and time off
                            </TextLink>
                            , or give it hours of its own under Time and place.
                        </p>
                    ) : null}
                </div>
                <aside className="grid min-w-0 gap-3.5">
                    <AtAGlance rows={glance(saved, usage, currency)} />
                    {priceHistoryShown(priceHistory) ? (
                        <Section title={PRICE_HISTORY_TITLE}>
                            <PriceHistoryList
                                history={priceHistory}
                                layout="narrow"
                            />
                        </Section>
                    ) : null}
                    <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                        A change applies to bookings made after it. Bookings
                        already made keep their time and price.
                    </p>
                </aside>
            </div>

            {canEdit ? (
                <DetailPanel
                    key={round}
                    which={which}
                    open={panel !== null}
                    source={saved}
                    eyebrow={name}
                    saveLabel="Save"
                    pending={store.saving}
                    setup={{
                        currency,
                        staff,
                        people,
                        payment,
                        paymentsLock,
                        saved,
                        savedDeposit: service.depositMode,
                        gstAt,
                        businessPriceMode: businessModeFor(
                            service,
                            businessPriceMode,
                        ),
                        charged: (d) => chargedAsSaved(service, d),
                        canEdit,
                        noStorefront,
                        hoursRead: rules !== null,
                        comingUp,
                        isSaved: true,
                        others,
                        selfId: service.id,
                    }}
                    problemsOf={problemsOf}
                    onApply={(next) => apply(which, next)}
                    onClose={() => setPanel(null)}
                />
            ) : null}

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={`Delete ${name}?`}
                description={`It leaves your services and can't be booked again. ${
                    comingUp
                        ? `The ${count(comingUp, "booking")} already made keep it.`
                        : "Bookings already made keep it."
                } To stop bookings for a while, untick both under Who can book it instead. This can't be undone.`}
                confirmLabel="Delete service"
                keepLabel="Keep service"
                onConfirm={remove}
            >
                {paused ? null : (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                            setConfirmDelete(false);
                            setBookers({ customers: false, team: false });
                        }}
                    >
                        Pause it instead
                    </Button>
                )}
            </ConfirmDialog>
        </main>
    );
}
