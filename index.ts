/**
 * Entry point of the free half: the component, the time axis and the layout.
 *
 * What is exported here is exactly what we promise to keep compatible.
 * `core/date` goes out whole, even though half of it is only needed by the
 * layout: it is tiny and pure, and keeping it inside would make everyone who
 * needs to shift a date write their own copy.
 *
 * Nothing paid lives here: `pro/` is a separate entry point, and nothing in
 * this tree imports it.
 */
export { default as Timeline } from "./vue/Timeline.vue";

export { useTimelineRange } from "./vue/useTimelineRange";
export type { RangeUnit, UseTimelineRange, UseTimelineRangeOptions } from "./vue/useTimelineRange";

export { buildLayout } from "./core/layout";
export { rowAt, rowOffsets, visibleSlice } from "./core/virtual";
export type { RowSlice } from "./core/virtual";

export {
    MS_PER_DAY,
    addDays,
    addMonths,
    diffDays,
    startOfMonth,
    startOfWeek,
    toEpoch,
    toIso,
    toLocalDate,
    weekday,
} from "./core/date";

export type * from "./core/types";
