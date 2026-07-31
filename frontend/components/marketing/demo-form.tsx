"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitDemoRequest } from "@/lib/contact";
import { cn } from "@/lib/utils";

const FIRM_TYPES = [
  ["hedge_fund", "Hedge Fund"],
  ["prop_trading", "Prop Trading Firm"],
  ["crypto_fund", "Crypto Fund"],
  ["investment_bank", "Investment Bank"],
  ["asset_manager", "Asset Manager"],
  ["family_office", "Family Office"],
  ["academic_other", "Academic / Other"],
] as const;

const TEAM_SIZES = [
  ["size_1_5", "1–5"],
  ["size_6_20", "6–20"],
  ["size_21_50", "21–50"],
  ["size_51_200", "51–200"],
  ["size_200_plus", "200+"],
] as const;

const INTERESTS = [
  ["regime_detection", "Regime Detection"],
  ["failure_intelligence", "Failure Intelligence"],
  ["knowledge_graph", "Knowledge Graph"],
  ["evolution_engine", "Evolution Engine"],
  ["validation_governance", "Validation & Governance"],
  ["full_platform", "The full platform"],
] as const;

const SOURCES = [
  ["referral", "Referral"],
  ["search", "Search"],
  ["social", "Social"],
  ["conference", "Conference / Event"],
  ["other", "Other"],
] as const;

const FREE_EMAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|mail|zoho|yandex|pm)\.[a-z.]+$/i;

const schema = z.object({
  first_name: z.string().min(1, "Required").max(120),
  last_name: z.string().min(1, "Required").max(120),
  work_email: z
    .string()
    .min(1, "Required")
    .email("Enter a valid email")
    .refine((v) => !FREE_EMAIL.test(v), "Please use your work email so we can route your request to the right team."),
  company: z.string().min(1, "Required").max(255),
  job_title: z.string().min(1, "Required").max(255),
  firm_type: z.string().min(1, "Please select your firm type"),
  team_size: z.string().min(1, "Please select your team size"),
  use_case_description: z.string().min(20, "Minimum 20 characters").max(500, "Maximum 500 characters"),
  primary_interest: z.array(z.string()).min(1, "Select at least one"),
  source: z.string().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept the Privacy Policy to continue." }) }),
  website: z.string().optional(), // honeypot
});

type FormValues = z.infer<typeof schema>;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-destructive">{msg}</p>;
}

export function DemoForm() {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { primary_interest: [], consent: false as unknown as true },
  });

  const useCaseLen = watch("use_case_description")?.length ?? 0;

  async function onSubmit(values: FormValues) {
    try {
      await submitDemoRequest({ ...values, source: values.source || null });
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : "Submission failed." });
    }
  }

  if (isSubmitSuccessful && !errors.root) {
    return (
      <div className="rounded-2xl border border-emerald-600/40 bg-emerald-600/[0.06] p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
        <h2 className="mt-4 font-display text-2xl font-semibold">Request received. Check your inbox.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          We&apos;ve logged your request and pinged our team in real time — a real person will reach out within one
          business day to schedule your walkthrough. In the meantime, the architecture page is the fastest way to
          see what makes Stellix Labs different.
        </p>
        <Link href="/architecture" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
          Read the architecture →
        </Link>
      </div>
    );
  }

  const selectClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-accent/60";

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {/* honeypot — visually hidden, off-screen, not tab-focusable */}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" placeholder="Jane" className="mt-1.5" {...register("first_name")} />
          <FieldError msg={errors.first_name?.message} />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" placeholder="Okafor" className="mt-1.5" {...register("last_name")} />
          <FieldError msg={errors.last_name?.message} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="work_email">Work email</Label>
          <Input id="work_email" type="email" placeholder="jane@yourfirm.com" className="mt-1.5" {...register("work_email")} />
          <FieldError msg={errors.work_email?.message} />
        </div>
        <div>
          <Label htmlFor="company">Company</Label>
          <Input id="company" placeholder="Your firm" className="mt-1.5" {...register("company")} />
          <FieldError msg={errors.company?.message} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="job_title">Job title</Label>
          <Input id="job_title" placeholder="Head of Quant Research" className="mt-1.5" {...register("job_title")} />
          <FieldError msg={errors.job_title?.message} />
        </div>
        <div>
          <Label htmlFor="firm_type">Firm type</Label>
          <select id="firm_type" defaultValue="" className={cn(selectClass, "mt-1.5")} {...register("firm_type")}>
            <option value="" disabled>
              Select…
            </option>
            {FIRM_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <FieldError msg={errors.firm_type?.message} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="team_size">Team size</Label>
          <select id="team_size" defaultValue="" className={cn(selectClass, "mt-1.5")} {...register("team_size")}>
            <option value="" disabled>
              Select…
            </option>
            {TEAM_SIZES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <FieldError msg={errors.team_size?.message} />
        </div>
        <div>
          <Label htmlFor="source">How did you hear about us? (optional)</Label>
          <select id="source" defaultValue="" className={cn(selectClass, "mt-1.5")} {...register("source")}>
            <option value="">Select…</option>
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="use_case_description">Use case description</Label>
        <textarea
          id="use_case_description"
          rows={4}
          placeholder="What research problem are you trying to solve? What's failed before?"
          className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent/60"
          {...register("use_case_description")}
        />
        <div className="mt-1 flex items-center justify-between">
          <FieldError msg={errors.use_case_description?.message} />
          <span className={cn("ml-auto text-xs", useCaseLen > 500 ? "text-destructive" : "text-muted-foreground")}>
            {useCaseLen}/500 — minimum 20 characters.
          </span>
        </div>
      </div>

      <div>
        <Label>Primary interest</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {INTERESTS.map(([v, l]) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card/40 px-3 py-2.5 text-sm hover:border-accent/40"
            >
              <input type="checkbox" value={v} className="h-4 w-4 accent-[#0066FF]" {...register("primary_interest")} />
              {l}
            </label>
          ))}
        </div>
        <FieldError msg={errors.primary_interest?.message as string | undefined} />
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0066FF]" {...register("consent")} />
          <span className="text-muted-foreground">
            I agree to the{" "}
            <Link href="/docs#privacy" className="text-accent hover:underline">
              Privacy Policy
            </Link>{" "}
            and to Stellix Labs contacting me about this request.
          </span>
        </label>
        <FieldError msg={errors.consent?.message} />
      </div>

      {errors.root && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Submitting…" : "Request my demo"}
        {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </form>
  );
}
