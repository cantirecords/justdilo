export type TaskCategory =
  | "personal"
  | "business"
  | "health"
  | "finance"
  | "social"
  | "home"
  | "travel"
  | "shopping";

export type Task = {
  id: string;
  user_id: string;
  capture_id: string | null;
  title: string;
  group_name: string | null;
  summary: string | null;
  due_date: string | null;
  priority: "low" | "med" | "high" | null;
  completed: boolean;
  created_at: string;
  recurring_type: "daily" | "weekly" | "monthly" | "custom" | null;
  recurring_interval: number | null;
  recurring_day_of_week: number | null;
  recurring_day_of_month: number | null;
  recurring_next_due: string | null;
  recurring_parent_id: string | null;
  category: TaskCategory | null;
};
