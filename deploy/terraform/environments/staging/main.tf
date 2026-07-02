# Cairn is a local-first Electron desktop app (see deploy/README.md). There is
# no cloud compute — no Cloud Run, no Cloud Functions. This stack provisions
# ONLY the cloud infra a distributed desktop app benefits from: a per-env GCS
# bucket to host built installers, plus a least-privilege runtime SA with
# resource-scoped write access to that bucket.

locals {
  app_name = "cairn"
  name     = "${local.app_name}-${var.env}"
}

# Runtime service account — no project-level roles. Access is granted
# resource-scoped via storage-bucket's object_writer_service_accounts below
# (least privilege — narrow bucket-scoped role, not a project-wide storage role).
module "runtime_sa" {
  source       = "../../modules/iam"
  project_id   = var.project_id
  account_id   = local.name
  display_name = "Cairn installer uploader (${var.env})"
  roles        = []
}

# Per-environment releases bucket for installer artifacts (.exe / .msi / .dmg /
# .AppImage) and (future) latest.yml auto-update manifests. Project-id prefix
# guarantees a globally-unique name. force_destroy is true in staging so
# throwaway apply/destroy cycles are painless; production sets it false.
module "releases_bucket" {
  source                         = "../../modules/storage-bucket"
  project_id                     = var.project_id
  name                           = "${var.project_id}-${local.app_name}-releases-${var.env}"
  location                       = var.region
  force_destroy                  = true
  versioning                     = true
  object_writer_service_accounts = [module.runtime_sa.email]
}

output "runtime_sa_email" {
  description = "Service account email used by CI to upload installers."
  value       = module.runtime_sa.email
}

output "releases_bucket" {
  description = "GCS bucket name hosting the installer artifacts for this environment."
  value       = module.releases_bucket.name
}

output "installers_bucket_url" {
  description = "gs:// URL of the installer artifacts bucket."
  value       = module.releases_bucket.url
}
