import type { AccountCourse } from "./details-model";
import { courseDates, courseLine, courseNext } from "./details-model";
import type { Block } from "./model";
import { AccountCard, AccountRow, Unavailable } from "./parts";

/**
 * The courses a customer holds a seat on (DEC-142), read-only: the course,
 * its dates, their own sessions (attended, missed, still to come) and the
 * next one. A course's sessions change together, with the business, so
 * there is nothing to move or cancel here. Nothing is drawn for a customer
 * with no course; a read that failed says so.
 */
export function CoursesCard({
    courses,
    className,
}: {
    courses: Block<AccountCourse[]>;
    className?: string;
}) {
    if (!courses.ok) {
        return (
            <AccountCard
                labelledBy="account-courses"
                title="Your courses"
                className={className}
            >
                <Unavailable what="Your courses" />
            </AccountCard>
        );
    }
    if (courses.value.length === 0) return null;
    return (
        <AccountCard
            labelledBy="account-courses"
            title="Your courses"
            className={className}
        >
            {courses.value.map((course) => {
                const next = courseNext(course);
                return (
                    <AccountRow
                        key={course.ref}
                        title={course.name}
                        sub={
                            <>
                                {[courseDates(course), courseLine(course)]
                                    .filter(Boolean)
                                    .join(" · ")}
                                {next ? (
                                    <span className="block">{next}</span>
                                ) : null}
                            </>
                        }
                    />
                );
            })}
        </AccountCard>
    );
}
