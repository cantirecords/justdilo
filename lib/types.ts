export type OrgRole = "owner" | "admin" | "member";
export type OrgMemberStatus = "pending" | "active";

export type OrgMember = {
  id: string;
  org_id: string;
  user_id: string | null;
  invited_email: string;
  role: OrgRole;
  status: OrgMemberStatus;
  created_at: string;
  profile?: { nickname: string | null; email: string } | null;
};

export type Organization = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members?: OrgMember[];
};

export type ProjectPhase = "planning" | "in_progress" | "review" | "done";
export type ProjectStatus = "active" | "on_hold" | "done";

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: "lead" | "member";
  created_at: string;
  profile?: { nickname: string | null; email: string } | null;
};

export type Project = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  phase: ProjectPhase;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  members?: ProjectMember[];
  task_count?: number;
  done_count?: number;
};

export type TaskAssignee = {
  user_id: string;
  profile?: { nickname: string | null; email: string } | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string | null;
  body: string | null;
  link_url: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  profile?: { nickname: string | null; email: string } | null;
};

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
  completed_at: string | null;
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
  org_id: string | null;
  project_id: string | null;
  assigned_to_id: string | null;
  assigned_to?: { nickname: string | null; email: string } | null;
  assignees?: TaskAssignee[] | null;
};
