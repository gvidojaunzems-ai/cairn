# One-time bootstrap, run by a human with project-admin rights — NOT by CI.
# Creates: the Terraform state bucket, the deploy service account, and a
# Workload Identity Federation pool/provider so GitHub Actions can impersonate
# the deploy SA without any long-lived keys.
#
# Run once per GCP project (staging and production). Fill the variables, then:
#   terraform init && terraform apply

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
  }
}

variable "project_id" { type = string }
variable "region" { type = string }
variable "github_repo" {
  type        = string
  description = "owner/repo that may impersonate the deploy SA, e.g. acme/cairn."
}
variable "state_bucket" {
  type        = string
  description = "Globally-unique name for the Terraform state bucket."
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_storage_bucket" "tf_state" {
  name                        = var.state_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning { enabled = true }
}

resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"
}

# Cairn is a desktop app — no Cloud Run, no Cloud Functions, no Secret
# Manager needed here. This deployer only creates buckets + a runtime SA.
# Least-privilege roles for THIS stack:
#   - storage.admin: create the environment release bucket (storage-bucket module)
#   - storage.objectAdmin: read/write Terraform state in the state bucket
#   - iam.serviceAccountAdmin: create the runtime SA (iam module)
#   - iam.serviceAccountUser: bind roles referencing the runtime SA
# roles/owner and roles/editor are deliberately absent.
variable "deployer_roles" {
  type        = list(string)
  description = "Project roles for the GitHub deployer SA. Scoped to storage + iam only."
  default = [
    "roles/storage.admin",           # creates the release bucket
    "roles/storage.objectAdmin",     # reads/writes Terraform state
    "roles/iam.serviceAccountAdmin", # creates the runtime SA
    "roles/iam.serviceAccountUser",  # binds roles against the runtime SA
  ]
}

resource "google_project_iam_member" "deployer_roles" {
  for_each = toset(var.deployer_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  # Only allow tokens from the specified repository.
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "wif_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

output "wif_provider" {
  description = "Set this as the GCP_WIF_PROVIDER repo variable."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_sa_email" {
  description = "Set this as the GCP_DEPLOY_SA repo variable."
  value       = google_service_account.deployer.email
}
