/**
 * The axis in days. Shared by the gestures, because they all measure the same
 * thing, and columns cannot measure it.
 *
 * Why not columns, as it used to be: at the "week" step a column covers seven
 * days, and an event shorter than a week cannot be expressed in columns at all.
 * An edge clamped to a single column could not move by one day - the gesture
 * silently did nothing; and when it did jump a column, the date travelled seven
 * days and the end landed before the start. Both troubles came from one cause:
 * the unit the gesture measured in did not match the unit the data lives in.
 *
 * So the unit here is a day, at every step. Columns remain only where things
 * are drawn: the ghost counts pixels, and it is handed a fractional column.
 *
 * The pro/ folder imports from core/; never the other way round.
 */
import { addDays, diffDays, toEpoch, toIso } from "../core/date";
import type { IsoDate, Layout } from "../core/types";

export interface DayAxis {
    /** How many days one column covers: a day step one, a week step seven. */
    perSlot: number;
    /** How many days the axis holds in total. */
    length: number;
    /** The axis day for a date. Negative means earlier than the axis start. */
    dayOf(date: IsoDate): number;
    /** The date at an axis day. */
    dateAt(day: number): IsoDate;
    /** The column for a day; fractional, because the ghost is drawn in columns. */
    slotOf(day: number): number;
    /**
     * The day at a column. Through rounding rather than plain division: 3/7*7
     * in double precision gives 2.9999999999999996, and the day would slip back.
     */
    dayOfSlot(slot: number): number;
}

export function dayAxis<R, I>(layout: Layout<R, I>): DayAxis {
    const slots = layout.slots;

    // An empty axis happens only in tests and on the first frame; safe units
    // are returned so that a gesture simply hits nothing.
    if (slots.length === 0) {
        return {
            perSlot: 1,
            length: 0,
            dayOf: () => 0,
            dateAt: () => layout.range.start,
            slotOf: (day) => day,
            dayOfSlot: (slot) => Math.round(slot),
        };
    }

    const first = toEpoch(slots[0].start);
    const perSlot = diffDays(first, toEpoch(slots[0].end));
    const length = diffDays(first, toEpoch(slots[slots.length - 1].end));

    return {
        perSlot,
        length,
        dayOf: (date) => diffDays(first, toEpoch(date)),
        dateAt: (day) => toIso(addDays(first, day)),
        slotOf: (day) => day / perSlot,
        dayOfSlot: (slot) => Math.round(slot * perSlot),
    };
}

/**
 * The axis day under the pointer. The overlay sits in grid coordinates, so its
 * left edge is the zero of the axis; there is no need to ask the component.
 */
export function dayUnder(x: number, overlay: HTMLElement, slotWidth: number, perSlot: number): number {
    const dayWidth = slotWidth / perSlot;
    return Math.floor((x - overlay.getBoundingClientRect().left) / dayWidth);
}

/** The bounds may meet at a point - then the lower one wins, rather than NaN. */
export function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), Math.max(low, high));
}
