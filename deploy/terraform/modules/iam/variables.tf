variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "account_id" {
  type        = string
  description = "Service account ID (6-30 chars, lowercase). Convention: <app>-<env>."
}

variable "display_name" {
  type        = string
  description = "Human-readable service account display name."
}

variable "roles" {
  type        = list(string)
  description = "Project-level roles to grant. Keep least-privilege — avoid roles/owner or roles/editor. Prefer resource-scoped bindings (e.g. storage-bucket's object_writer_service_accounts) over project-wide roles."
  default     = []

  validation {
    condition     = !contains(var.roles, "roles/owner") && !contains(var.roles, "roles/editor")
    error_message = "Refusing to grant roles/owner or roles/editor — use narrowly-scoped roles instead."
  }
}
