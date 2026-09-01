/**
 * Wall-date arithmetic (decision 05). Everything is computed in UTC-midnight
 * epochs: a daylight-saving switch must not shift the boundaries of a day.
 *
 * An internal module of the core - not part of the public contract.
 */

import type { IsoDate } from "./types";

export const MS_PER_DAY = 86_400_000;

/** YYYY-MM-DD -> UTC-midnight epoch. */
export function toEpoch(date: IsoDate): number {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}

export function toIso(epoch: number): IsoDate {
    return new Date(epoch).toISOString().slice(0, 10);
}

/** Local midnight - only for the formatters in the vue layer. */
export function toLocalDate(epoch: number): Date {
    const utc = new Date(epoch);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export function addDays(epoch: number, days: number): number {
    return epoch + days * MS_PER_DAY;
}

export function diffDays(from: number, to: number): number {
    return Math.round((to - from) / MS_PER_DAY);
}

/** Day of the week, 0 is Sunday. */
export function weekday(epoch: number): number {
    return new Date(epoch).getUTCDay();
}

export function startOfWeek(epoch: number, weekStartsOn: number): number {
    return addDays(epoch, -((weekday(epoch) - weekStartsOn + 7) % 7));
}

export function startOfMonth(epoch: number): number {
    const date = new Date(epoch);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/** The day of the month is kept; if the target month is shorter, it clamps to the last day. */
export function addMonths(epoch: number, months: number): number {
    const date = new Date(epoch);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay));
}
