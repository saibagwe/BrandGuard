// Issue schema — mirrors backend/app/models/schemas.py exactly.
// NEVER change without updating the Pydantic model and docs/issue-schema.md.

export type IssueCategory = "tone" | "fact" | "claim" | "visual" | "accessibility";
export type IssueSeverity = "high" | "medium" | "low";
export type IssueStatus = "open" | "accepted" | "edited" | "dismissed";

export interface IssueLocation {
  start: number | null;
  end: number | null;
  region: string | null;
}

export interface IssueEvidence {
  source_doc: string;
  quote: string | null;
  rule_id: string | null;
}

export interface Issue {
  id: string;
  review_id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  location: IssueLocation | null;
  message: string;
  evidence: IssueEvidence | null;
  suggestion: string | null;
  status: IssueStatus;
}

export type UserRole = "creator" | "reviewer";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export type ReviewStatus = "draft" | "checking" | "ready" | "in_review" | "changes_requested" | "approved";
export type ContentType = "text" | "pdf" | "docx";

export interface ApprovalHistoryEntry {
  id: string;
  review_id: string;
  approved_by: string;
  action: string;
  decision?: string | null;
  reviewer_name?: string | null;
  comment: string | null;
  created_at: string;
}

export interface IssueCounts {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface Review {
  id: string;
  title: string;
  content_text: string;
  content?: string;
  content_type: ContentType;
  source_type?: string;
  original_filename?: string | null;
  status: ReviewStatus;
  content_version: number;
  checked_version: number | null;
  submitted_by?: { id: string; email: string; full_name: string } | string | null;
  created_by?: string | null;
  creator_name?: string | null;
  submitted_at?: string | null;
  progress?: Record<string, "pending" | "running" | "done" | "failed"> | null;
  latest_reviewer_comment?: string | null;
  approval_history?: ApprovalHistoryEntry[];
  no_guidelines?: boolean;
  is_stale?: boolean;
  message?: string | null;
  issue_counts?: IssueCounts;
  created_at: string;
  updated_at: string;
  issues: Issue[];
}

export interface GuidelineDoc {
  id: string;
  title: string;
  doc_type: "voice" | "terminology" | "facts" | "visual";
  created_at: string;
  chunk_count: number;
}

export interface AuditLogEntry {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  detail: string | null;
  created_at: string;
}
