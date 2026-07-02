# Remote state in GCS. Create the state bucket once (see deploy/bootstrap) and
# fill the bucket name below. Staging and production use distinct prefixes so
# they never share state.
terraform {
  backend "gcs" {
    bucket = "TODO-cairn-terraform-state"
    prefix = "cairn/production"
  }
}
