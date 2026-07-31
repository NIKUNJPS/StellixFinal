"""Regime detection engine (Batch 3, SRC report §5.1).

An ensemble of four independent detectors (HMM, PELT change-point, GMM, GARCH) whose
per-period labels are mapped onto one 6-label taxonomy and combined by a
self-consistency-weighted majority vote, with a fast-triggering Crisis override.

Import the light taxonomy (``app.regime.taxonomy``) freely; the heavy detector/engine
modules (arch/hmmlearn/ruptures) are imported explicitly by callers so app startup and
lightweight imports (e.g. the ORM model) stay cheap.
"""
