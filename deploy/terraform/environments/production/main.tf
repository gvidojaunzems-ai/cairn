# Cairn is a local-first Electron desktop app — there is NO server-side
# compute (no Cloud Run, no Cloud Functions). This environment provisions only
# the cloud infrastructure a distributed desktop app benefits from:
#   1. A private Cloud Storage bucket to host built installers (.exe, .dmg,
#      .AppImage) and the future auto-update `latest.yml` manifests.
#   2. A least-privilege runtime service account with objectCreator scoped to
#      THAT bucket — used by CI to upload installers.
#
# Resource names are derived from locals; nothing is hand-typed downstream.

locals {
  app_name = "cairn"
  name     = "${local.app_name}-${var.env}"
}

# Runtime SA for the packaging pipeline. No project-wide roles — bucket access
# is granted resource-scoped by the storage-bucket module below.
module "runtime_sa" {
  source       = "../../modules/iam"
  project_id   = var.project_id
  account_id   = local.name
  display_name = "Cairn installer uploader (${var.env})"
  roles        = []
}

# Installer artifacts bucket. project_id prefix guarantees global uniqueness.
# force_destroy stays false in production — installers are release artifacts
# we do not want a `terraform destroy` to wipe accidentally.
module "installers_bucket" {
  source                         = "../../modules/storage-bucket"
  project_id                     = var.project_id
  name                           = "${var.project_id}-${local.app_name}-releases-${var.env}"
  location                       = var.region
  force_destroy                  = false
  versioning                     = true
  object_writer_service_accounts = [module.runtime_sa.email]
}

output "installers_bucket_url" {
  description = "gs:// URL of the installer artifacts bucket."
  value       = module.installers_bucket.url
}

output "runtime_sa_email" {
  description = "Service account email used by CI to upload installers."
  value       = module.runtime_sa.email
}
