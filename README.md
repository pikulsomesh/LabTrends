# LabTrends (working title)

An offline, privacy-first Android app that turns scattered lab reports (PDFs and paper scans) into per-person health trends. Built for families, with multiple profiles. No cloud, no accounts, no network permission.

**Author:** Somesh Mohapatra
**License:** MIT

## What it does

1. Ingest a lab report (camera, image, or PDF).
2. Extract text on-device (PDF text layer first, OCR for scans).
3. Parse biomarkers with deterministic rules, falling back to a small local model.
4. You verify and correct every value before anything is saved.
5. View trends over time per profile. Ask simple questions in a data-only chat ("show my ALT trend").
6. Export a PDF, or back up and restore an encrypted file to move to a new phone.

## Privacy guarantees

- Zero network access. The release build strips the INTERNET permission.
- No raw files stored. Images, PDFs, and OCR text are never written to the database.
- Nothing is saved without human verification.
- Backups are encrypted with a user passphrase.

## Not a medical device

LabTrends only stores, retrieves, and plots values you provide. It does not diagnose, interpret, or advise. Always consult a qualified clinician.

## Models

Model files are not committed to this repo (GitHub rejects files over 100 MB). They are attached to GitHub Releases and imported in-app through the file picker. See PLAN.md for the default choices.

## Status

Planning. See PLAN.md.
