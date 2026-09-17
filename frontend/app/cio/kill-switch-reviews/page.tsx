import { KillSwitchReviewQueue } from "@/components/governance/kill-switch-review-queue";

export default function CioKillSwitchReviewsPage() {
  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <KillSwitchReviewQueue variant="page" />
      </div>
    </div>
  );
}
