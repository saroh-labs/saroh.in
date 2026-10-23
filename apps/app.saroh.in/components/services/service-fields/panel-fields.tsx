"use client";

import { Field } from "@saroh/ui/field";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { Textarea } from "@saroh/ui/textarea";

import { FailedRead } from "@/components/shared/states/failed-read";
import type { PlanLock } from "@/lib/billing/access";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import { callName } from "@/lib/services/call-name";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import type { DepositMode } from "@/lib/services/service";
import { AVAILABILITY_HREF } from "@/lib/services/service-cards";
import type {
    ServiceCharged,
    ServiceDraft,
} from "@/lib/services/service-editor";
import {
    draftVisits,
    gstGoesOnTop,
    hoursNote,
    timeNote,
    toMinor,
    TREATMENT_NEEDS_STOREFRONT,
    wholeNumber,
} from "@/lib/services/service-editor";
import {
    freeTimeOf,
    lengthNote,
    sameNameAs,
} from "@/lib/services/service-form";
import type { PanelKey } from "@/lib/services/service-panels";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";
import { TimezoneSelect } from "./timezone-select";

import type { Edit } from "@/components/services/service-editor/fields";
import {
    HELP,
    LABEL,
    NumberField,
} from "@/components/services/service-editor/fields";
import { GstFields } from "@/components/services/service-editor/gst-fields";
import { DepositField } from "./deposit-field";
import { PriceFields } from "./editor-sections";
import { HoursField } from "./hours-field";
import { LengthField } from "./length-field";
import { NameQuestion, WhoComesQuestion, WhoDoesItQuestion } from "./questions";
import { VisitsField, VisitsStorefrontNote } from "./visits-field";
import { WhereField } from "./where-field";

/** What every panel's fields may need beside the draft. */
export interface PanelSetup {
    currency: string;
    /** Null when the people on the diary couldn't be read. */
    staff: StaffView[] | null;
    people: readonly StaffView[];
    payment: BookingPaymentView | null;
    paymentsLock: PlanLock | null;
    /** What is saved: a deposit kept on a locked plan, a length changed. */
    saved: ServiceDraft;
    savedDeposit: DepositMode;
    gstAt: "price" | "more" | "none";
    businessPriceMode: GstPriceMode | null;
    /** The API's amounts for a price as saved (`chargedAsSaved`). */
    charged: (draft: ServiceDraft) => ServiceCharged | null;
    canEdit: boolean;
    noStorefront: boolean;
    /** Its own hours could be read. */
    hoursRead: boolean;
    /** Bookings still to come; null when they couldn't be counted. */
    comingUp: number | null;
    /** A saved service (its length change keeps bookings made). */
    isSaved: boolean;
    /** The business's other services, for a name already taken. */
    others: readonly { id: string; name: string }[];
    /** This service, when saved. */
    selfId: string | null;
    /** Row problems in its own hours, once they should be said. */
    hoursProblem: (index: number) => string | null;
}

function Describe({ draft, set }: Pick<Edit, "draft" | "set">) {
    return (
        <Field
            label="What to tell customers"
            hint="Shown on your booking page under the name."
        >
            <Textarea
                rows={4}
                maxLength={2000}
                value={draft.description}
                placeholder="e.g. One-to-one session built around your goals."
                onChange={(e) => set({ description: e.target.value })}
                data-ph-mask=""
            />
        </Field>
    );
}

function Breaks({
    edit,
    which,
}: {
    edit: Edit;
    which: readonly ("after" | "before")[];
}) {
    const { draft, set, problem, leave } = edit;
    return (
        <div className="flex flex-wrap gap-3">
            {which.includes("after") ? (
                <NumberField
                    label="Break after (min)"
                    value={draft.gap}
                    onChange={(gap) => set({ gap })}
                    width="w-[120px]"
                    error={problem("gap")}
                    onLeave={() => leave("gap")}
                />
            ) : null}
            {which.includes("before") ? (
                <NumberField
                    label="Break before (min)"
                    value={draft.bufferBefore}
                    onChange={(bufferBefore) => set({ bufferBefore })}
                    width="w-[120px]"
                    error={problem("bufferBefore")}
                    onLeave={() => leave("bufferBefore")}
                />
            ) : null}
        </div>
    );
}

function Visits({ edit, setup }: { edit: Edit; setup: PanelSetup }) {
    const { draft, set, problem, leave } = edit;
    if (draft.kind === "class") {
        return (
            <p className={cn(HELP, "mt-0")}>
                A group class is one visit. Visits in a package are for one
                person at a time.
            </p>
        );
    }
    const error = problem("visits");
    return (
        <div>
            <VisitsField
                value={draft.visits}
                onChange={(visits) => set({ visits })}
                // No storefront is said under it, with its way out.
                error={error === TREATMENT_NEEDS_STOREFRONT ? null : error}
                onLeave={() => leave("visits")}
            />
            <p className={HELP}>
                {timeNote(
                    draft.kind,
                    setup.people.length > 0,
                    draftVisits(draft),
                    wholeNumber(draft.minutes),
                )}
            </p>
            {setup.noStorefront && draftVisits(draft) > 1 ? (
                <VisitsStorefrontNote />
            ) : null}
        </div>
    );
}

function Pay({ edit, setup }: { edit: Edit; setup: PanelSetup }) {
    const { draft, set } = edit;
    const problem = draft.showOnBookingPage
        ? onlineBookingProblem(
              { priceCents: toMinor(draft.price), depositMode: draft.deposit },
              setup.payment,
          )
        : null;
    return (
        <div>
            <DepositField
                deposit={draft.deposit}
                price={draft.price}
                currency={setup.currency}
                visits={draftVisits(draft)}
                saved={setup.savedDeposit}
                paymentsLock={setup.paymentsLock}
                way={setup.payment?.bookingPayment}
                problem={problem}
                charged={setup.charged(draft)}
                gstOnTop={gstGoesOnTop(
                    draft,
                    setup.businessPriceMode,
                    setup.gstAt === "price",
                )}
                onChange={(deposit) => set({ deposit })}
            />
            {edit.problem("price") ? (
                <p role="alert" className={cn(HELP, "text-destructive")}>
                    {edit.problem("price")}
                </p>
            ) : null}
        </div>
    );
}

function Gst({ edit, setup }: { edit: Edit; setup: PanelSetup }) {
    return (
        <div className="flex flex-wrap gap-3">
            <GstFields
                draft={edit.draft}
                set={edit.set}
                problem={edit.problem}
                leave={edit.leave}
                asked={setup.gstAt === "price"}
                canEdit={setup.canEdit}
                businessPriceMode={setup.businessPriceMode}
            />
        </div>
    );
}

function Zone({ edit, setup }: { edit: Edit; setup: PanelSetup }) {
    return (
        <Field label="Time zone" error={edit.problem("timezone")}>
            <TimezoneSelect
                value={edit.draft.timezone}
                onValueChange={(timezone) => edit.set({ timezone })}
                disabled={!setup.canEdit}
            />
        </Field>
    );
}

/** Its own weekly hours, with whose hours it books in when someone does it. */
function Hours({
    edit,
    setup,
    titled,
}: {
    edit: Edit;
    setup: PanelSetup;
    /** Inside Time and place: a caption of its own. */
    titled: boolean;
}) {
    const { draft, set } = edit;
    const names = setup.people
        .filter((p) => draft.staffIds.includes(p.id))
        .map((p) => callName(p.name));
    const narrows = draft.kind === "one" && names.length > 0;
    return (
        <div className="min-w-0">
            {titled ? (
                <div className={cn(LABEL, "mb-2")}>When it can be booked</div>
            ) : null}
            <p className={cn(HELP, "mb-2.5 mt-0")}>
                {narrows ? (
                    <>
                        Its times come from{" "}
                        {freeTimeOf("one", names).replace(
                            / free time$/,
                            " hours",
                        )}
                        .{" "}
                        <TextLink href={AVAILABILITY_HREF}>
                            Change them in Hours and time off
                        </TextLink>
                        , or give it hours of its own: only the free time inside
                        them is offered.
                    </>
                ) : draft.kind === "class" ? (
                    "A class runs at its own weekly times."
                ) : (
                    "Nobody does it yet, so customers book it in its own weekly hours."
                )}{" "}
                {hoursNote(draft.timezone, false)}
            </p>
            {setup.hoursRead ? (
                <HoursField
                    rows={draft.hours}
                    onChange={(hours) => set({ hours })}
                    problemOf={setup.hoursProblem}
                    disabled={!setup.canEdit}
                />
            ) : (
                <FailedRead
                    things="its weekly hours"
                    reassurance="They can't be changed right now."
                />
            )}
        </div>
    );
}

/**
 * A panel's fields, by its key (U16): one row of More details on a new
 * service, or one card of a saved one (What it is, Time and place, Money).
 * They edit the panel's own draft; nothing here saves.
 */
export function PanelFields({
    which,
    edit,
    setup,
}: {
    which: PanelKey;
    edit: Edit;
    setup: PanelSetup;
}) {
    const { draft, set, problem, leave } = edit;
    switch (which) {
        case "describe":
            return <Describe draft={draft} set={set} />;
        case "breakAfter":
            return <Breaks edit={edit} which={["after"]} />;
        case "breakBefore":
            return <Breaks edit={edit} which={["before"]} />;
        case "where":
            return (
                <WhereField
                    where={draft.where}
                    meetingUrl={draft.meetingUrl}
                    onChange={set}
                    error={problem("meetingUrl")}
                    onLeave={() => leave("meetingUrl")}
                />
            );
        case "visits":
            return <Visits edit={edit} setup={setup} />;
        case "hours":
            return <Hours edit={edit} setup={setup} titled={false} />;
        case "pay":
            return <Pay edit={edit} setup={setup} />;
        case "gst":
            return <Gst edit={edit} setup={setup} />;
        case "timezone":
            return <Zone edit={edit} setup={setup} />;
        case "what":
            return (
                <div className="grid gap-5">
                    <NameQuestion
                        {...edit}
                        taken={sameNameAs(
                            draft.name,
                            setup.others,
                            setup.selfId,
                        )}
                    />
                    <WhoComesQuestion {...edit} />
                    <Describe draft={draft} set={set} />
                    <WhoDoesItQuestion
                        {...edit}
                        staff={setup.staff}
                        people={setup.people}
                    />
                </div>
            );
        case "time":
            return (
                <div className="grid gap-5">
                    <LengthField
                        value={draft.minutes}
                        onChange={(minutes) => set({ minutes })}
                        error={problem("minutes")}
                        onLeave={() => leave("minutes")}
                        note={lengthNote({
                            minutes: draft.minutes,
                            savedMinutes: setup.saved.minutes,
                            gap: draft.gap,
                            names: setup.people
                                .filter((p) => draft.staffIds.includes(p.id))
                                .map((p) => callName(p.name)),
                            comingUp: setup.isSaved ? setup.comingUp : null,
                        })}
                    />
                    <Breaks edit={edit} which={["after", "before"]} />
                    <div>
                        <WhereField
                            where={draft.where}
                            meetingUrl={draft.meetingUrl}
                            onChange={set}
                            error={problem("meetingUrl")}
                            onLeave={() => leave("meetingUrl")}
                        />
                    </div>
                    <Hours edit={edit} setup={setup} titled />
                    <Zone edit={edit} setup={setup} />
                </div>
            );
        case "money":
            return (
                <div className="grid gap-5">
                    <div>
                        <PriceFields
                            {...edit}
                            currency={setup.currency}
                            savedDeposit={setup.savedDeposit}
                            paymentsLock={setup.paymentsLock}
                            payment={setup.payment}
                            withGst={setup.gstAt === "price"}
                            canEdit={setup.canEdit}
                            businessPriceMode={setup.businessPriceMode}
                            charged={setup.charged(draft)}
                        />
                    </div>
                    {setup.gstAt === "more" ? (
                        <Gst edit={edit} setup={setup} />
                    ) : null}
                    {draft.kind === "one" ? (
                        <Visits edit={edit} setup={setup} />
                    ) : null}
                </div>
            );
    }
}
