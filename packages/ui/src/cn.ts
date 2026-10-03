import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge Untitled UI's extra scales so it doesn't mistake them for colours and drop them.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["md", "display-xs", "display-sm", "display-md", "display-lg", "display-xl", "display-2xl"],
      shadow: ["skeuomorphic", "xs-skeuomorphic"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
