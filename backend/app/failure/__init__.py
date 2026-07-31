"""Failure intelligence (Batch 6).

Detection triggers, real SHAP attribution (LightGBM surrogate), and tenant-scoped
failure clustering. Heavy modules (shap_attribution, detection) are imported explicitly
by callers so app startup stays light.
"""
