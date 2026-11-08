/** How the app words things it counts and names, the same everywhere */

/** A curriculum domain's id as words (`services-networking` → `services networking`) */
export const domainName = (domain: string) => domain.replaceAll("-", " ");

/** A count with its noun: `1 worker`, `2 workers` */
export const plural = (n: number, word: string) => `${n} ${noun(n, word)}`;

/** The noun alone, for a count shown apart (a figure above its label) */
export const noun = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

/** Megabytes as gigabytes, one decimal: `2.1 GB` */
export const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;
