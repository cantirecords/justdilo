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
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-500/25 dark:text-violet-100 dark:border dark:border-violet-400/50",
  },
  business: {
    label: "Business",
    icon: "💼",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/25 dark:text-blue-100 dark:border dark:border-blue-400/50",
  },
  health: {
    label: "Health",
    icon: "🏃",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-800 dark:bg-green-500/25 dark:text-green-100 dark:border dark:border-green-400/50",
  },
  finance: {
    label: "Finance",
    icon: "💰",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-100 dark:border dark:border-amber-400/50",
  },
  social: {
    label: "Social",
    icon: "👥",
    dot: "bg-pink-500",
    badge: "bg-pink-100 text-pink-800 dark:bg-pink-500/25 dark:text-pink-100 dark:border dark:border-pink-400/50",
  },
  home: {
    label: "Home",
    icon: "🏠",
    dot: "bg-teal-500",
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-500/25 dark:text-teal-100 dark:border dark:border-teal-400/50",
  },
  travel: {
    label: "Travel",
    icon: "✈️",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-500/25 dark:text-orange-100 dark:border dark:border-orange-400/50",
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    dot: "bg-indigo-500",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-100 dark:border dark:border-indigo-400/50",
  },
};
