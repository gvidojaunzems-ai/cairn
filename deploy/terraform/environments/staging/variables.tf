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
