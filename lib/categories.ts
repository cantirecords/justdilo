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
    badge: "text-foreground/70",
  },
  business: {
    label: "Business",
    icon: "💼",
    dot: "bg-blue-500",
    badge: "text-foreground/70",
  },
  health: {
    label: "Health",
    icon: "🏃",
    dot: "bg-green-500",
    badge: "text-foreground/70",
  },
  finance: {
    label: "Finance",
    icon: "💰",
    dot: "bg-amber-500",
    badge: "text-foreground/70",
  },
  social: {
    label: "Social",
    icon: "👥",
    dot: "bg-pink-500",
    badge: "text-foreground/70",
  },
  home: {
    label: "Home",
    icon: "🏠",
    dot: "bg-teal-500",
    badge: "text-foreground/70",
  },
  travel: {
    label: "Travel",
    icon: "✈️",
    dot: "bg-orange-500",
    badge: "text-foreground/70",
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    dot: "bg-indigo-500",
    badge: "text-foreground/70",
  },
};
