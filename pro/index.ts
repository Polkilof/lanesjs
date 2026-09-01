/**
 * Entry point of the paid half. Kept apart from the free one deliberately:
 * whoever does not import `pro` does not build it either - plugins are
 * installed through the `plugins` prop, like anyone else's, and the core knows
 * nothing about them.
 *
 * `gesture` is not an internal exception here but part of the promise: every
 * gesture rests on it, and a third-party plugin should be written exactly the
 * way ours are.
 */
export { drag } from "./drag";
export type { DragEdge, DragMove, DragOptions, DragResize } from "./drag";

export { create } from "./create";
export type { CreateOptions, DragCreate } from "./create";

export { history } from "./history";
export type { HistoryEntry, HistoryOptions, HistoryPlugin } from "./history";

export { links } from "./links";
export type { Link, LinksOptions } from "./links";

export { makeGhost, trackPointer } from "./gesture";
export type { Ghost, PointerGesture, Target } from "./gesture";

export { setLicense, licenseStatus, verifyLicense } from "./license";
export type { License, LicenseCheck, LicenseStatus } from "./license";
