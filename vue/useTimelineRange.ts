/**
 * Навігація по періодах. Живе поза компонентом навмисне: компонент
 * контрольований (рішення 04), тож діапазоном володіє застосунок, а не таймлайн.
 *
 * Дані вантажаться не звідси, а з події `range-change` компонента: при
 * тижневому кроці вісь ширша за заданий діапазон, і завантажувати треба саме
 * те, що видно.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { addDays, addMonths, startOfMonth, startOfWeek, toEpoch, toIso, toLocalDate } from "../core/date";
import type { DateRange, IsoDate } from "../core/types";

export type RangeUnit = "month" | "week" | "day";

export interface UseTimelineRangeOptions {
    /** Чим рухають prev/next. За замовчуванням "month". */
    unit?: RangeUnit;
    /** Скільки одиниць у вікні. За замовчуванням 1. */
    count?: number;
    /** Початковий якір; за замовчуванням сьогодні. */
    date?: IsoDate;
    /** Для unit: "week". За замовчуванням 1 (понеділок). */
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    /** Локаль заголовка. За замовчуванням системна. */
    locale?: string;
    /** Власний заголовок замість типового. */
    formatTitle?: (range: DateRange, unit: RangeUnit) => string;
}

export interface UseTimelineRange {
    /** Дата, навколо якої будується вікно. */
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
