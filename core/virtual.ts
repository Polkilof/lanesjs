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
 * A viewport height of zero means there is nothing to measure - SSR, a hidden
 * tab or a test environment. Then everything is shown: better extra DOM than an
 * empty screen somewhere scrolling does not exist at all.
 */
export function visibleSlice(
    offsets: number[],
    scrollTop: number,
    viewportHeight: number,
    overscan = 4,
): RowSlice {
    const count = offsets.length - 1;
    if (count <= 0) return { start: 0, end: 0 };
    if (viewportHeight <= 0) return { start: 0, end: count };

    const first = rowAt(offsets, scrollTop);
    const last = rowAt(offsets, scrollTop + viewportHeight);

    return {
        start: Math.max(0, first - overscan),
        end: Math.min(count, last + 1 + overscan),
    };
}
