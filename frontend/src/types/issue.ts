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

export type UserRole = "creator" | "manager" | "reviewer" | "admin";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export type ReviewStatus = "draft" | "in_review" | "changes_requested" | "approved";
export type ContentType = "text" | "pdf" | "docx";

export interface Review {
  id: string;
  title: string;
  content_text: string;
  content_type: ContentType;
  status: ReviewStatus;
  submitted_by: { id: string; email: string; full_name: string };
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
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  detail: string | null;
  created_at: string;
}
