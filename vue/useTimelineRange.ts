/**
 * Navigation across periods. It lives outside the component on purpose: the
 * component is controlled (decision 04), so the range belongs to the
 * application rather than to the timeline.
 *
 * Data is not loaded from here but from the component's `range-change` event:
 * at the week step the axis is wider than the range asked for, and what has to
 * be loaded is exactly what is visible.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { addDays, addMonths, startOfMonth, startOfWeek, toEpoch, toIso, toLocalDate } from "../core/date";
import type { DateRange, IsoDate } from "../core/types";

export type RangeUnit = "month" | "week" | "day";

export interface UseTimelineRangeOptions {
    /** What prev/next move by. Defaults to "month". */
    unit?: RangeUnit;
    /** How many units fit in the window. Defaults to 1. */
    count?: number;
    /** The initial anchor; defaults to today. */
    date?: IsoDate;
    /** For unit: "week". Defaults to 1 (Monday). */
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    /** The locale of the title. Defaults to the system one. */
    locale?: string;
    /** A title of your own instead of the standard one. */
    formatTitle?: (range: DateRange, unit: RangeUnit) => string;
}

export interface UseTimelineRange {
    /** The date the window is built around. */
    anchor: Ref<IsoDate>;
    range: ComputedRef<DateRange>;
    title: ComputedRef<string>;
    prev: () => void;
    next: () => void;
    today: () => void;
    gotoDate: (date: IsoDate) => void;
}

function todayIso(): IsoDate {
    const now = new Date();
    return toIso(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function useTimelineRange(options: UseTimelineRangeOptions = {}): UseTimelineRange {
    const unit = options.unit ?? "month";
    const count = Math.max(1, options.count ?? 1);
    const weekStartsOn = options.weekStartsOn ?? 1;

    const anchor = ref<IsoDate>(options.date ?? todayIso());

    const range = computed<DateRange>(() => {
        const epoch = toEpoch(anchor.value);

        if (unit === "month") {
            const start = startOfMonth(epoch);
            return { start: toIso(start), end: toIso(addMonths(start, count)) };
        }

        if (unit === "week") {
            const start = startOfWeek(epoch, weekStartsOn);
            return { start: toIso(start), end: toIso(addDays(start, 7 * count)) };
        }

        return { start: toIso(epoch), end: toIso(addDays(epoch, count)) };
    });

    const title = computed(() => {
        if (options.formatTitle !== undefined) return options.formatTitle(range.value, unit);

        const first = toLocalDate(toEpoch(range.value.start));
        const last = toLocalDate(addDays(toEpoch(range.value.end), -1));

        if (unit === "month" && count === 1) {
            return new Intl.DateTimeFormat(options.locale, { month: "long", year: "numeric" }).format(first);
        }

        const format = new Intl.DateTimeFormat(options.locale, {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
        return `${format.format(first)} – ${format.format(last)}`;
    });

    function shift(direction: 1 | -1) {
        const epoch = toEpoch(anchor.value);
        const step = direction * count;

        if (unit === "month") anchor.value = toIso(addMonths(startOfMonth(epoch), step));
        else if (unit === "week") anchor.value = toIso(addDays(startOfWeek(epoch, weekStartsOn), step * 7));
        else anchor.value = toIso(addDays(epoch, step));
    }

    return {
        anchor,
        range,
        title,
        prev: () => shift(-1),
        next: () => shift(1),
        today: () => {
            anchor.value = todayIso();
        },
        gotoDate: (date: IsoDate) => {
            anchor.value = date;
        },
    };
}
