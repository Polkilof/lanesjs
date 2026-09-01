/**
 * The timeline layout: a range and some events -> axis slots and bars placed on
 * the grid.
 *
 * No DOM, no Vue, no Date.now() - everything that affects the result arrives in
 * `LayoutInput`. Coordinates are given in slots, not pixels (decision 06).
 */

import { addDays, diffDays, startOfWeek, toEpoch, toIso, toLocalDate, weekday } from "./date";
import type {
    DateRange,
    IsoDate,
    Item,
    Layout,
    LayoutInput,
    PlacedItem,
    Row,
    Slot,
    SlotStep,
} from "./types";

const DEFAULT_WEEKEND_DAYS = [0, 6];
const DEFAULT_WEEK_STARTS_ON = 1;

function slotSize(step: SlotStep): number {
    return step === "week" ? 7 : 1;
}

interface Axis {
    slots: Slot[];
    /** The actual range of the axis: at the "week" step, wider than the one asked for. */
    range: DateRange;
}

/**
 * Builds the columns of the axis. At the "week" step the start is pushed back
 * to the beginning of the week - the axis is always made of whole slots, and
 * there is no such thing as a clipped column.
 */
function buildAxis(
    range: DateRange,
    step: SlotStep,
    today: IsoDate | undefined,
    weekendDays: number[],
    weekStartsOn: number,
): Axis {
    const size = slotSize(step);
    const requestedStart = toEpoch(range.start);
    const requestedEnd = toEpoch(range.end);
    const axisStart = step === "week" ? startOfWeek(requestedStart, weekStartsOn) : requestedStart;
    const todayEpoch = today === undefined ? null : toEpoch(today);

    const slots: Slot[] = [];
    for (let cursor = axisStart, index = 0; cursor < requestedEnd; cursor = addDays(cursor, size), index++) {
        const end = addDays(cursor, size);
        slots.push({
            index,
            start: toIso(cursor),
            end: toIso(end),
            date: toLocalDate(cursor),
            isToday: todayEpoch !== null && todayEpoch >= cursor && todayEpoch < end,
            isWeekend: step === "day" && weekendDays.includes(weekday(cursor)),
        });
    }

    return {
        slots,
        range: {
            start: toIso(axisStart),
            end: slots.length === 0 ? toIso(axisStart) : slots[slots.length - 1].end,
        },
    };
}

/**
 * The position of a day in slot units. Fractional at the week step, and that is
 * not an oversight: an event lasts days rather than weeks, and rounding to a
 * column would mean a three-day booking and a week-long one are drawn the same,
 * while one shifted by a day would not move at all.
 *
 * The price is that coordinates stopped being indices into the slot array:
 * wherever a slot itself is needed, it is taken through Math.floor. In exchange,
 * a bar sits where it actually is.
 */
function slotAt(epoch: number, axisStart: number, step: SlotStep): number {
    return diffDays(axisStart, epoch) / slotSize(step);
}

/**
 * Places an event on the axis. Returns null if it falls entirely outside the
 * visible window.
 *
 * An `end` that is not greater than `start` is treated as one slot: that is a
 * common mistake in data, and forgiving it costs less than silently losing the
 * event.
 */
function place<I>(
    item: Item<I>,
    axisStart: number,
    axisEnd: number,
    step: SlotStep,
): PlacedItem<I> | null {
    const start = toEpoch(item.start);
    const rawEnd = toEpoch(item.end);
    const end = rawEnd > start ? rawEnd : addDays(start, slotSize(step));

    if (end <= axisStart || start >= axisEnd) return null;

    const visibleStart = Math.max(start, axisStart);
    const visibleEnd = Math.min(end, axisEnd);
    const slotIndex = slotAt(visibleStart, axisStart, step);

    return {
        item,
        slotIndex,
        slotSpan: slotAt(visibleEnd, axisStart, step) - slotIndex,
        lane: 0,
        clippedStart: start < axisStart,
        clippedEnd: end > axisEnd,
    };
}

interface PackResult<I> {
    bars: PlacedItem<I>[];
    laneCount: number;
}

/**
 * Spreads bars across lanes so that overlapping ones do not sit on top of each
 * other. A greedy pass from left to right: an event takes the first lane that
 * has come free.
 *
 * The sort order is pinned all the way down to `id`, so that the same input
 * always gives the same picture - otherwise bars would jump between repaints.
 */
function packLanes<I>(bars: PlacedItem<I>[]): PackResult<I> {
    const ordered = [...bars].sort(
        (a, b) =>
            a.slotIndex - b.slotIndex ||
            b.slotSpan - a.slotSpan ||
            (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
    );

    const laneEnds: number[] = [];
    for (const placed of ordered) {
        let lane = laneEnds.findIndex((end) => end <= placed.slotIndex);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = placed.slotIndex + placed.slotSpan;
        placed.lane = lane;
    }

    return { bars: ordered, laneCount: Math.max(1, laneEnds.length) };
}

/**
 * The main function of the core.
 *
 * The order of the rows equals the order of `resources` - the core neither
 * sorts nor filters (decision 04). Events belonging to unknown resources are
 * ignored; the input arrays are never mutated.
 */
export function buildLayout<R = unknown, I = unknown>(input: LayoutInput<R, I>): Layout<R, I> {
    const axis = buildAxis(
        input.range,
        input.step,
        input.today,
        input.weekendDays ?? DEFAULT_WEEKEND_DAYS,
        input.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON,
    );

    const axisStart = toEpoch(axis.range.start);
    const axisEnd = toEpoch(axis.range.end);

    const byResource = new Map<string, Item<I>[]>();
    for (const item of input.items) {
        const bucket = byResource.get(item.resourceId);
        if (bucket) bucket.push(item);
        else byResource.set(item.resourceId, [item]);
    }

    const rows: Row<R, I>[] = input.resources.map((resource) => {
        const bars: PlacedItem<I>[] = [];
        const backgrounds: PlacedItem<I>[] = [];

        for (const item of byResource.get(resource.id) ?? []) {
            const placed = place(item, axisStart, axisEnd, input.step);
            if (placed === null) continue;
            if (item.display === "background") backgrounds.push(placed);
            else bars.push(placed);
        }

        const packed = packLanes(bars);
        return { resource, bars: packed.bars, backgrounds, laneCount: packed.laneCount };
    });

    return { range: axis.range, step: input.step, slots: axis.slots, rows };
}
