export type IdeaSection = { heading: string; points: string[] };

export type IdeaCollaborator = { id: string; email: string; nickname: string | null };

export type Profile = { id: string; email: string; nickname: string | null };

export type Idea = {
  id: string;
  user_id: string;
  created_at: string;
  raw_input: string;
  title: string | null;
  summary: string | null;
  sections: IdeaSection[];
  key_insights: string[];
  action_items: string[];
  tags: string[];
  last_edited_by_id?: string | null;
  last_edited_at?: string | null;
  last_edited_by_nickname?: string | null;
  is_owner?: boolean;
  collaborators?: IdeaCollaborator[];
};

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
  reminder_minutes: number | null;
  reminded_at: string | null;
};
