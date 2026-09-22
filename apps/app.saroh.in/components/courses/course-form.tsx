"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
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
import { Textarea } from "@saroh/ui/textarea";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { OptionSelect } from "@/components/shared/option-select";
import { createCourse, updateCourse } from "@/lib/courses/actions";
import type { CourseDetail } from "@/lib/courses/service";
import { wallClockToIso, ymd } from "@/lib/courses/sessions";
import { formatDayLabel, formatTimeRange } from "@/lib/format/datetime";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"];

const schema = z.object({
    serviceId: z.string().min(1, "Choose the service it runs on"),
    name: z.string().trim().min(1, "Give the course a name").max(120),
    description: z.string().max(1000),
    price: z
        .string()
        .trim()
        .regex(/^\d{1,9}(\.\d{1,2})?$/, "A price like 240 or 240.50"),
    currency: z.string().regex(/^[A-Z]{3}$/),
    seats: z
        .string()
        .trim()
        .regex(/^\d{1,4}$/, "A whole number of seats")
        .refine((v) => Number(v) >= 1, "At least one seat"),
});
type Values = z.infer<typeof schema>;

/** What the editor needs to know about a service it may run on. */
export interface CourseServiceOption {
    id: string;
    name: string;
    capacity: number;
    durationMinutes: number;
    timezone: string;
    currency: string | null;
}

const FIELDS = new Set(["serviceId", "name", "price", "currency", "seats"]);

/**
 * Make or change a course. A new one takes its sessions here, as dates and
 * times on the business's own clock; an existing one adds and removes
 * sessions on its page, where each change books or frees everyone on it.
 * Seats stop at what the service takes at once.
 */
export function CourseForm({
    services,
    course,
    defaultCurrency,
}: {
    services: CourseServiceOption[];
    /** The course being changed; absent for a new one. */
    course?: CourseDetail;
    defaultCurrency: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const first = services.at(0);
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: {
            serviceId: course?.service.id ?? first?.id ?? "",
            name: course?.name ?? "",
            description: course?.description ?? "",
            price: course?.price ?? "",
            currency: course?.currency ?? first?.currency ?? defaultCurrency,
            seats: String(course?.seats ?? first?.capacity ?? 1),
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

    // New courses gather their sessions here.
    const [sessions, setSessions] = useState<string[]>([]);

    async function save(values: Values, open: boolean) {
        const seats = Number(values.seats);
        if (service && seats > service.capacity) {
            form.setError("seats", {
                message: `${service.name} takes ${service.capacity} at a time, so at most ${service.capacity}.`,
            });
            return;
        }
        setBusy(true);
        const input = {
            name: values.name,
            description: values.description.trim() || null,
            price: values.price.trim(),
            currency: values.currency,
            seats,
        };
        const res = course
            ? await updateCourse(course.id, input)
            : await createCourse({
                  ...input,
                  serviceId: values.serviceId,
                  sessions,
                  status: open ? "OPEN" : "DRAFT",
              });
        setBusy(false);
        if (!res.ok) {
            if (res.field && FIELDS.has(res.field)) {
                form.setError(res.field as keyof Values, {
                    message: res.error,
                });
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess(
            course
                ? "Course saved"
                : open
                  ? `${values.name} is open for enrolment`
                  : `${values.name} saved as a draft`,
        );
        router.push(`/courses/${res.data.id}`);
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit((v) => save(v, false))}
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
                <div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem]">
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        inputMode="decimal"
                                        placeholder="240.00"
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
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        options={CURRENCIES.map((c) => ({
                                            value: c,
                                            label: c,
                                        }))}
                                    />
                                </FormControl>
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
                        {service.capacity === 1 ? "seat" : "seats"}. Seats
                        nobody has taken are kept from other bookers while the
                        course is open.
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
                        <Button type="submit" disabled={busy}>
                            {busy ? "Saving…" : "Save"}
                        </Button>
                    ) : (
                        <>
                            <Button
                                type="button"
                                disabled={busy || sessions.length === 0}
                                onClick={form.handleSubmit((v) =>
                                    save(v, true),
                                )}
                            >
                                {busy ? "Saving…" : "Save and open"}
                            </Button>
                            <Button
                                type="submit"
                                variant="outline"
                                disabled={busy}
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
            </form>
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
                <p className="text-[12.5px] text-muted-foreground">
                    No sessions yet. Add the first; the next suggests a week
                    later. A draft can be saved without any.
                </p>
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
                                {formatDayLabel(iso, tz)} ·{" "}
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
                                className="coarse:size-11"
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
