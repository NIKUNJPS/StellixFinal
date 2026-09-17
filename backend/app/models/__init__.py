"""ORM models.

Importing every model here guarantees they are registered on ``Base.metadata`` so
Alembic autogenerate and ``create_all`` see the full schema.
"""

from app.models.api_key import ApiKey
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.audit_log import AuditEventType, AuditLog
from app.models.compliance_export import ComplianceExportJob, ComplianceExportStatus
from app.models.demo_request import (
    DemoFirmType,
    DemoPrimaryInterest,
    DemoRequest,
    DemoRequestStatus,
    DemoTeamSize,
)
from app.models.email_verification_token import EmailVerificationToken
from app.models.evolution_run import EvolutionRun, EvolutionRunStatus
from app.models.failure import Failure, FailureTrigger
from app.models.feature_matrix import FeatureMatrix
from app.models.ingestion_job import IngestionJob, IngestionStatus
from app.models.invitation import Invitation, InvitationStatus
from app.models.kill_switch_review import KillSwitchReview
from app.models.llm_audit_log import LLMAuditLog
from app.models.market_data import MarketData
from app.models.notification import Notification, NotificationType
from app.models.organization import Organization, OrganizationStatus, OrganizationTier
from app.models.password_reset_token import PasswordResetToken
from app.models.performance_snapshot import PerformanceSnapshot
from app.models.rbac import Permission, Role, RolePermission
from app.models.refresh_token import RefreshToken
from app.models.regime_label import RegimeLabelRecord
from app.models.research_note import ResearchNote, ResearchNoteStatus
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.strategy_version import StrategyVersion
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.superadmin_audit_log import SuperAdminAuditLog
from app.models.trade_record import TradeRecord
from app.models.user import User, UserRole
from app.models.validation_result import ValidationResult

__all__ = [
    "Organization",
    "OrganizationTier",
    "OrganizationStatus",
    "User",
    "UserRole",
    "SuperAdminAuditLog",
    "RefreshToken",
    "MarketData",
    "FeatureMatrix",
    "IngestionJob",
    "IngestionStatus",
    "RegimeLabelRecord",
    "Strategy",
    "StrategyCreator",
    "StrategyStatus",
    "StrategyVersion",
    "ApprovalRecord",
    "ApprovalAction",
    "PerformanceSnapshot",
    "ValidationResult",
    "Failure",
    "FailureTrigger",
    "ResearchNote",
    "ResearchNoteStatus",
    "EmailVerificationToken",
    "Invitation",
    "InvitationStatus",
    "EvolutionRun",
    "EvolutionRunStatus",
    "LLMAuditLog",
    "AuditLog",
    "AuditEventType",
    "ComplianceExportJob",
    "ComplianceExportStatus",
    "KillSwitchReview",
    "Notification",
    "NotificationType",
    "ApiKey",
    "TradeRecord",
    "PasswordResetToken",
    "Permission",
    "Role",
    "RolePermission",
    "Subscription",
    "SubscriptionStatus",
    "DemoRequest",
    "DemoRequestStatus",
    "DemoFirmType",
    "DemoTeamSize",
    "DemoPrimaryInterest",
]
