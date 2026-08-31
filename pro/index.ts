/**
 * Точка входу платної половини. Окрема від безкоштовної навмисно: хто не
 * імпортує `pro`, той його й не збирає — плагіни ставляться через проп
 * `plugins`, як будь-які чужі, і ядро про них не знає.
 *
 * `gesture` тут не службовий виняток, а частина обіцянки: на ньому тримаються
 * всі жести, і чужий плагін має писатись так само, як наші.
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
