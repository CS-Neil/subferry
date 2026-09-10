import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui 与 motion-primitives 共用的类名合并工具。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
