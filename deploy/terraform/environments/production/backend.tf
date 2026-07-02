# Remote state in GCS. Create the state bucket once (see deploy/bootstrap) and
# fill the bucket name below. Use a distinct prefix per environment so staging
# and production never share state.
terraform {
  backend "gcs" {
    bucket = "TODO-terraform-state-bucket"
    prefix = "cairn/production"
  }
}
