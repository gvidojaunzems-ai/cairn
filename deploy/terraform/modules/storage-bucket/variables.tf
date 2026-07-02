variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "name" {
  type        = string
  description = "Globally-unique bucket name. Convention: <project_id>-<app>-<purpose>."
}

variable "location" {
  type        = string
  description = "Bucket location (region or multi-region), e.g. EU or europe-west1."
}

variable "force_destroy" {
  type        = bool
  description = "Allow Terraform to delete a non-empty bucket. Keep false for production."
  default     = false
}

variable "versioning" {
  type        = bool
  description = "Enable object versioning."
  default     = true
}

# Resource-scoped IAM — grant access to THIS bucket only (least privilege),
# instead of granting project-wide storage roles on the runtime service account.

variable "object_writer_service_accounts" {
  type        = list(string)
  description = "SA emails granted write-only access (roles/storage.objectCreator) on this bucket. Use for upload-only services."
  default     = []
}

variable "object_admin_service_accounts" {
  type        = list(string)
  description = "SA emails granted full object access (roles/storage.objectAdmin) on this bucket. Use only when the service must also read/list/delete objects."
  default     = []
}
