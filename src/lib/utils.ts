import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format HP values: show integers without decimals (6 HP),
 * but preserve .5 decimals (1,5 HP) using Swedish comma.
 * Rounds to nearest 0.5.
 */
export function formatHp(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 2) / 2;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toString().replace('.', ',');
}
