/**
 * Row virtualization: which slice to show at the current scroll position.
 *
 * Pure arithmetic, no DOM: heights arrive as numbers, so the same computation
 * gives the same answer in the browser, in tests and on the server.
 */

/** Cumulative offsets; one element longer than the number of rows. */
export function rowOffsets(heights: number[]): number[] {
    const offsets = new Array<number>(heights.length + 1);
    offsets[0] = 0;

    for (let index = 0; index < heights.length; index++) {
        offsets[index + 1] = offsets[index] + heights[index];
    }

    return offsets;
}

/** A visible slice of rows; `end` is exclusive, as everywhere in the contract. */
export interface RowSlice {
    start: number;
    end: number;
}

/**
 * The last row whose offset does not exceed the position. Exported because
 * pointer hit-testing needs the same search: the row under the cursor is the
 * same problem as the first visible row, only with a different number coming in.
 */
export function rowAt(offsets: number[], position: number): number {
    const lastRow = offsets.length - 2;
    if (position <= 0) return 0;
    if (position >= offsets[lastRow + 1]) return lastRow;

    let low = 0;
    let high = lastRow;

    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (offsets[middle] <= position) low = middle;
        else high = middle - 1;
    }

    return low;
}

/**
 * How many rows an unmeasured render may draw. Enough to fill a tall screen at
 * any sane row height, and few enough that drawing them costs nothing.
 */
export const UNMEASURED_ROWS = 40;

/**
 * A viewport height of zero means there is nothing to measure - SSR, a hidden
 * tab or a test environment. Then the first screenful is shown, because both
 * alternatives are worse: an empty table is worse where scrolling does not
 * exist, and drawing every row is worse everywhere.
 *
 * Drawing every row used to be what happened here, and it was expensive in a
 * way that never appeared on screen. The height is measured after the first
 * render, so the first render of two thousand rows built two thousand rows of
 * markup and removed all but twenty of them in the same flush - half a second,
 * paid on every mount, for rows the browser never painted.
 *
 * The count is the same on the server and in the browser, so hydration matches;
 * the real slice arrives as soon as the viewport has been measured.
 */
export function visibleSlice(
    offsets: number[],
    scrollTop: number,
    viewportHeight: number,
    overscan = 4,
): RowSlice {
    const count = offsets.length - 1;
    if (count <= 0) return { start: 0, end: 0 };
    if (viewportHeight <= 0) return { start: 0, end: Math.min(count, UNMEASURED_ROWS) };

    const first = rowAt(offsets, scrollTop);
    const last = rowAt(offsets, scrollTop + viewportHeight);

    return {
        start: Math.max(0, first - overscan),
        end: Math.min(count, last + 1 + overscan),
    };
}
