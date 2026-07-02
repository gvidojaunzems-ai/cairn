resource "google_storage_bucket" "this" {
  name     = var.name
  project  = var.project_id
  location = var.location

  force_destroy               = var.force_destroy
  uniform_bucket_level_access = true
  # Block all public access by default — never expose a bucket to allUsers.
  public_access_prevention = "enforced"

  versioning {
    enabled = var.versioning
  }
}

# Bucket-scoped IAM — least privilege. Bind the runtime SA here rather than
# granting a project-wide storage role elsewhere.
resource "google_storage_bucket_iam_member" "object_writers" {
  for_each = toset(var.object_writer_service_accounts)
  bucket   = google_storage_bucket.this.name
  role     = "roles/storage.objectCreator"
  member   = "serviceAccount:${each.value}"
}

resource "google_storage_bucket_iam_member" "object_admins" {
  for_each = toset(var.object_admin_service_accounts)
  bucket   = google_storage_bucket.this.name
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${each.value}"
}
