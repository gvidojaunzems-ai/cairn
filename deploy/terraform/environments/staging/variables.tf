variable "project_id" {
  type        = string
  description = "GCP project ID for this environment."
}

variable "region" {
  type        = string
  description = "GCP region, e.g. europe-west1."
}

variable "env" {
  type        = string
  description = "Environment name: staging or production."
}

# `image` is required by the AIDE workflow template for parity with Cloud Run
# apps. Cairn is a desktop app and does NOT build a container image, so the
# workflow may leave TF_VAR_image unset — the default preserves compatibility.
variable "image" {
  type        = string
  description = "Unused for Cairn (desktop app has no container image). Preserved for AIDE workflow parity."
  default     = ""
}
