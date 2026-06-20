import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Natural (human) ordering: numeric chunks compare as numbers, so "S-2" < "S-15"
// and "30mm" < "100mm" instead of plain lexicographic order.
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
export function naturalCompare(a: string, b: string): number {
  return naturalCollator.compare(a ?? "", b ?? "")
}
