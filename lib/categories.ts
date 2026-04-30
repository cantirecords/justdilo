import type { TaskCategory } from "./types";

export const CATEGORIES: TaskCategory[] = [
  "personal",
  "business",
  "health",
  "finance",
  "social",
  "home",
  "travel",
  "shopping",
];

export const CATEGORY_CONFIG: Record<
  TaskCategory,
  { label: string; icon: string; dot: string; badge: string }
> = {
  personal: {
    label: "Personal",
    icon: "👤",
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  business: {
    label: "Business",
    icon: "💼",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  health: {
    label: "Health",
    icon: "🏃",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  finance: {
    label: "Finance",
    icon: "💰",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  social: {
    label: "Social",
    icon: "👥",
    dot: "bg-pink-500",
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  },
  home: {
    label: "Home",
    icon: "🏠",
    dot: "bg-teal-500",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  },
  travel: {
    label: "Travel",
    icon: "✈️",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    dot: "bg-indigo-500",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
};
