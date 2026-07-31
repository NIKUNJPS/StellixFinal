"""Pydantic output schemas for the 4 LLM functions.

Each is used as an Anthropic tool's ``input_schema`` (forced tool-use), so a
response is guaranteed to already be valid JSON matching this shape — never parsed
from free text with regex. See docs/schemas.md -> "LLM Research Assistant" for why
``numeric_claims`` was added beyond Part 1's literal field list (Safeguard 5).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class NumericClaim(BaseModel):
    """A specific number the model referenced in its prose — restated here so it can
    be mechanically cross-checked against real stored data (Safeguard 5), instead of
    regex-scraping the free-text explanation for numbers."""

    metric_name: str = Field(description="e.g. 'sharpe_ratio', 'max_drawdown', 'win_rate', 'robustness_score'")
    claimed_value: float = Field(description="The exact numeric value stated in the prose")


class SuggestedParameter(BaseModel):
    name: str
    value: float
    min: float
    max: float
    type: str = Field(description="'float' or 'int'")


class HypothesisResult(BaseModel):
    hypothesis_text: str
    rationale: str
    suggested_parameters: list[SuggestedParameter] = Field(default_factory=list)
    suggested_regime_focus: list[str] = Field(
        default_factory=list, description="Regime labels this hypothesis is expected to work best in"
    )


class FailureExplanation(BaseModel):
    explanation_text: str
    regime_context_summary: str
    suggested_mitigation: str
    numeric_claims: list[NumericClaim] = Field(
        default_factory=list,
        description="Every specific number referenced in explanation_text/regime_context_summary, restated for verification",
    )


class StrategyCritique(BaseModel):
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    overfitting_risks: list[str] = Field(default_factory=list)
    edge_cases: list[str] = Field(default_factory=list)
    numeric_claims: list[NumericClaim] = Field(
        default_factory=list,
        description="Every specific number referenced anywhere above, restated for verification",
    )


class GraphSummary(BaseModel):
    summary_text: str = Field(description="Natural-language interpretation of the graph query result")
    key_findings: list[str] = Field(default_factory=list)
