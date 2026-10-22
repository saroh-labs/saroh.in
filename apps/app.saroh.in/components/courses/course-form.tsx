"use client";

import { plural } from "@/lib/format/plural";
import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { MoneyInput } from "@saroh/ui/money-input";
import { Textarea } from "@saroh/ui/textarea";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import { GstFields } from "@/components/services/service-editor/gst-fields";
import {
    lostChanges,
    lostNew,
    useLeaveGuard,
} from "@/components/shared/forms/use-leave-guard";
import { runAction } from "@/lib/api/run-action";
import { createCourse, updateCourse } from "@/lib/courses/actions";
import type { CourseFormValues } from "@/lib/courses/course-form";
import {
    courseGstDefaults,
    courseGstProblems,
    courseInput,
    courseSchema,
} from "@/lib/courses/course-form";
import type { CourseDetail } from "@/lib/courses/service";
import { wallClockToIso, ymd } from "@/lib/courses/sessions";
import { formatDate, formatTimeRange } from "@/lib/format/datetime";
import type { GstAsk } from "@/lib/gst/item-words";
import { addedGst, addedGstWords, NOT_ASKED } from "@/lib/gst/item-words";
import { PAGE_FORM, toFirstError } from "@/lib/hooks/page-form";
import { OptionSelect } from "@saroh/ui/option-select";

type Values = CourseFormValues;

/** What the editor needs to know about a service it may run on. */
export interface CourseServiceOption {
    id: string;
    name: string;
    capacity: number;
    durationMinutes: number;
    timezone: string;
    currency: string | null;
}

const FIELDS = new Set([
    "serviceId",
    "name",
    "price",
    "currency",
    "seats",
    "gstRate",
    "sacCode",
    "gstPriceMode",
]);

/**
 * Make or change a course. A new one takes its sessions here, as dates and
 * times on the business's own clock; an existing one adds and removes
 * sessions on its page, where each change books or frees everyone on it.
 * Seats stop at what the service takes at once.
 *
 * A GST-registered business answers the course's GST under its price
 * (12 Oct 2026), as on a service: a priced course needs a rate, with 0%
 * for an exempt one. One that isn't registered is shown none of it and
 * sends none of it (`lib/courses/course-form.ts`).
 */
export function CourseForm({
    services,
    course,
    defaultCurrency,
    gst = NOT_ASKED,
}: {
    /** Whether GST is asked, and the business's own way of carrying it. */
    gst?: GstAsk;
    services: CourseServiceOption[];
    /** The course being changed; absent for a new one. */
    course?: CourseDetail;
    defaultCurrency: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const first = services.at(0);
    // The schema's problems and the GST fields' own, in one pass.
    const resolver = useMemo<Resolver<Values>>(() => {
        const checked = zodResolver(courseSchema);
        return async (values, context, options) => {
            const res = await checked(values, context, options);
            const gstProblems = Object.entries(
                courseGstProblems(values, gst.asked),
            );
            if (gstProblems.length === 0) return res;
            return {
                values: {},
                errors: {
                    ...Object.fromEntries(
                        gstProblems.map(([field, message]) => [
                            field,
                            { type: "custom", message },
                        ]),
                    ),
                    ...res.errors,
                },
            };
        };
    }, [gst.asked]);
    const form = useForm<Values>({
        resolver,
        ...PAGE_FORM,
        defaultValues: {
            serviceId: course?.service.id ?? first?.id ?? "",
            name: course?.name ?? "",
            description: course?.description ?? "",
            price: course?.price ?? "",
            currency: course?.currency ?? first?.currency ?? defaultCurrency,
            seats: String(course?.seats ?? first?.capacity ?? 1),
            ...courseGstDefaults(course),
        },
    });
    const serviceId = form.watch("serviceId");
    const service =
        services.find((s) => s.id === serviceId) ??
        (course
            ? {
                  ...course.service,
                  currency: course.currency,
              }
            : undefined);

    // "₹6,000 + ₹1,080 GST (18%) = ₹7,080 to pay" while GST is added to the
    // price typed: a preview by the mirror, the invoice is the truth.
    const toPay = addedGst(
        form.watch("price").trim(),
        {
            gstRate: form.watch("gstRate"),
            gstPriceMode: form.watch("gstPriceMode"),
        },
        gst,
    );

    // New courses gather their sessions here.
    const [sessions, setSessions] = useState<string[]>([]);

    /** True once saved. `leaving` is on its way elsewhere, so doesn't open it. */
    async function save(
        values: Values,
        open: boolean,
        leaving = false,
    ): Promise<boolean> {
        const seats = Number(values.seats);
        if (service && seats > service.capacity) {
            form.setError("seats", {
                message: `${service.name} takes ${service.capacity} at a time, so at most ${service.capacity}.`,
            });
            return false;
        }
        setBusy(true);
        const input = courseInput(values, gst);
        const res = await runAction(
            () =>
                course
                    ? updateCourse(course.id, input)
                    : createCourse({
                          ...input,
                          serviceId: values.serviceId,
                          sessions,
                          status: open ? "OPEN" : "DRAFT",
                      }),
            { setBusy },
        );
        if (!res) return false;
        if (!res.ok) {
            if (res.field && FIELDS.has(res.field)) {
                form.setError(res.field as keyof Values, {
                    message: res.error,
                });
            } else {
                showError(res.error);
            }
            return false;
        }
        showSuccess(
            course
                ? "Course saved."
                : open
                  ? `${values.name} is open for enrolment.`
                  : `${values.name} saved as a draft.`,
        );
        if (!leaving) router.push(`/courses/${res.data.id}`);
        return true;
    }

    // A new course can be kept as a draft on the way out; its sessions
    // are picked beside the form, so they count as typed work too.
    const guard = useLeaveGuard({
        dirty: form.formState.isDirty || sessions.length > 0,
        lost: course ? lostChanges("this course") : lostNew("course"),
        ...(course
            ? {}
            : {
                  save: async () => {
                      let kept = false;
                      await form.handleSubmit(async (v) => {
                          kept = await save(v, false, true);
                      })();
                      return kept;
                  },
              }),
    });

    return (
        <Form {...form}>
            <form
                onKeyDown={submitOnModEnter}
                // Enter runs the form's first button: Save for a course
                // being changed, Save and open for a new one (which waits
                // for a session, so Enter does nothing until there is one).
                onSubmit={form.handleSubmit(
                    (v) => save(v, !course),
                    toFirstError,
                )}
                className="grid max-w-[720px] gap-6"
            >
                <FormField
                    control={form.control}
                    name="serviceId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Runs on</FormLabel>
                            <FormControl>
                                <OptionSelect
                                    value={field.value}
                                    onValueChange={(v) => {
                                        field.onChange(v);
                                        const next = services.find(
                                            (s) => s.id === v,
                                        );
                                        if (next?.currency) {
                                            form.setValue(
                                                "currency",
                                                next.currency,
                                            );
                                        }
                                    }}
                                    disabled={!!course}
                                    placeholder="Choose a service"
                                    options={services.map((s) => ({
                                        value: s.id,
                                        label: `${s.name} · takes ${s.capacity} at a time`,
                                    }))}
                                />
                            </FormControl>
                            <FormDescription>
                                {course
                                    ? "A course stays on the service it was made for."
                                    : "Each session is a booking on this service, so it shows on the schedule and takes its time."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    maxLength={120}
                                    placeholder="Beginner wheel throwing"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Description{" "}
                                <span className="font-normal text-muted-foreground">
                                    (optional)
                                </span>
                            </FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    rows={3}
                                    maxLength={1000}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                    <MoneyInput
                                        {...field}
                                        currency={form.watch("currency")}
                                        onValueChange={field.onChange}
                                    />
                                </FormControl>
                                <FormDescription>
                                    For the whole course. You can change it for
                                    one person when you enrol them.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="seats"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Seats</FormLabel>
                                <FormControl>
                                    <Input {...field} inputMode="numeric" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                {service ? (
                    <p className="-mt-3 text-[12.5px] text-muted-foreground">
                        {service.name} takes {service.capacity} at a time, so
                        the course can have up to {service.capacity}{" "}
                        {plural(service.capacity, "seat")}. Seats nobody has
                        taken are kept from other bookers while the course is
                        open.
                    </p>
                ) : null}
                {/* A GST-registered business answers the rate with the
                    price, as on a service. */}
                {gst.asked ? (
                    <div className="flex flex-wrap items-start gap-3">
                        <GstFields
                            draft={{
                                gstRate: form.watch("gstRate"),
                                sacCode: form.watch("sacCode"),
                                gstPriceMode: form.watch("gstPriceMode"),
                            }}
                            set={(patch) => {
                                for (const key of [
                                    "gstRate",
                                    "sacCode",
                                    "gstPriceMode",
                                ] as const) {
                                    const value = patch[key];
                                    if (value === undefined) continue;
                                    form.setValue(key, value, {
                                        shouldDirty: true,
                                        // Said once the form has been sent,
                                        // and cleared as it is fixed.
                                        shouldValidate:
                                            form.formState.isSubmitted,
                                    });
                                }
                            }}
                            problem={(field) =>
                                form.formState.errors[field]?.message
                            }
                            leave={(field) => void form.trigger(field)}
                            asked
                            canEdit
                            businessPriceMode={gst.priceMode}
                        />
                    </div>
                ) : null}
                {/* The price above is the business's own; where GST is
                    added to it, what someone enrolling pays is said here. */}
                {toPay ? (
                    <p className="text-[12.5px] tabular-nums leading-[1.5] text-muted-foreground">
                        {addedGstWords(toPay, form.watch("currency"))}
                    </p>
                ) : null}

                {course ? null : (
                    <SessionPicker
                        value={sessions}
                        onChange={setSessions}
                        service={service}
                    />
                )}

                <div className="flex flex-wrap gap-2">
                    {course ? (
                        <Button type="submit" busy={busy} busyLabel="Saving…">
                            Save
                        </Button>
                    ) : (
                        <>
                            <Button
                                type="submit"
                                disabled={sessions.length === 0}
                                aria-describedby={
                                    sessions.length === 0
                                        ? "course-open-why"
                                        : undefined
                                }
                                busy={busy}
                                busyLabel="Saving…"
                            >
                                Save and open
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={form.handleSubmit(
                                    (v) => save(v, false),
                                    toFirstError,
                                )}
                            >
                                Save as draft
                            </Button>
                        </>
                    )}
                    <Button type="button" variant="ghost" asChild>
                        <Link
                            href={course ? `/courses/${course.id}` : "/courses"}
                        >
                            Cancel
                        </Link>
                    </Button>
                </div>
                {!course && sessions.length === 0 ? (
                    <p
                        id="course-open-why"
                        className="-mt-3 text-[0.78125rem] text-muted-foreground"
                    >
                        Add a session to open the course. Until then it can be
                        saved as a draft.
                    </p>
                ) : null}
            </form>
            {guard.dialog}
        </Form>
    );
}

/**
 * The sessions of a new course: a day and a time on the business's clock,
 * added one at a time and listed in order.
 */
function SessionPicker({
    value,
    onChange,
    service,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    service: { timezone: string; durationMinutes: number } | undefined;
}) {
    const ids = { day: useId(), time: useId() };
    const [day, setDay] = useState<Date | undefined>(undefined);
    const [time, setTime] = useState("18:30");
    const tz = service?.timezone ?? "UTC";
    const minutes = service?.durationMinutes ?? 60;

    function add() {
        if (!day || !time) return;
        const iso = wallClockToIso(ymd(day), time, tz);
        if (Date.parse(iso) <= Date.now()) {
            showError("A session has to be in the future.");
            return;
        }
        if (value.includes(iso)) {
            showError("There is already a session then.");
            return;
        }
        onChange([...value, iso].sort());
        // The next is most often a week on, at the same time.
        setDay(new Date(day.getTime() + 7 * 86_400_000));
    }

    return (
        <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Sessions</legend>
            {value.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No sessions yet"
                    description="Add the first, and the next suggests a week later. A draft can be saved without any."
                />
            ) : (
                <ol className="divide-y rounded-[11px] border border-border bg-card">
                    {value.map((iso, i) => (
                        <li
                            key={iso}
                            className="flex items-center gap-3 px-3.5 py-2"
                        >
                            <span className="w-6 text-[12px] tabular-nums text-muted-foreground">
                                {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 text-sm">
                                {formatDate(iso, tz, { weekday: "short" })} ·{" "}
                                {formatTimeRange(
                                    iso,
                                    new Date(
                                        Date.parse(iso) + minutes * 60_000,
                                    ),
                                    tz,
                                )}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove session ${i + 1}`}
                                onClick={() =>
                                    onChange(value.filter((v) => v !== iso))
                                }
                            >
                                <X className="size-4" aria-hidden />
                            </Button>
                        </li>
                    ))}
                </ol>
            )}
            <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.day}>Day</Label>
                    <DatePicker
                        id={ids.day}
                        value={day}
                        onValueChange={setDay}
                        className="w-[11rem]"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.time}>Time</Label>
                    <TimeSelect
                        id={ids.time}
                        value={time}
                        onValueChange={setTime}
                        stepMinutes={15}
                    />
                </div>
                <Button
                    type="button"
                    variant="outline"
                    disabled={!day}
                    onClick={add}
                >
                    Add session
                </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">
                Times are on the business's clock ({tz}).
            </p>
        </fieldset>
    );
}
