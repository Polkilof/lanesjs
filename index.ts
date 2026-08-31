/**
 * Точка входу безкоштовної половини: компонент, вісь часу й розкладка.
 *
 * Експортуємо саме те, що обіцяємо тримати сумісним. `core/date` іде цілком,
 * хоч половина його потрібна лише розкладці: він крихітний і чистий, а
 * лишений усередині змушує кожного, кому треба посунути дату, переписати його
 * в себе.
 *
 * Платного тут немає: `pro/` — окрема точка входу, і вниз по імпортах вона не
 * тягнеться (див. BRIEF.md, правило теки).
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
