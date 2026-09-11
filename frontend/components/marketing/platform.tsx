import { useEffect, useRef, useState, type ReactNode } from "react";
// import { motion, useScroll } from "motion/react";
import { motion, useScroll } from "framer-motion";
import { Reveal, SectionLabel } from "./primitives";

const COLORS = {
  data: "#5BA7C7",
  regime: "#F5B544",
  strategy: "#42C98A",
  validation: "#E8EAF0",
  memory: "#8B7BE8",
  evolution: "#F05B62",
  failed: "#F04F55",
};

const STATIONS = [
  { id: "DATA", tone: COLORS.data, line: "Engineer 15+ indicators with strict temporal isolation." },
  { id: "REGIME", tone: COLORS.regime, line: "Label every bar into one of six regimes." },
  { id: "STRATEGY", tone: COLORS.strategy, line: "Compose rules in a structured strategy DSL." },
  { id: "VALIDATION", tone: COLORS.validation, line: "Five independent methods gate promotion." },
  { id: "MEMORY", tone: COLORS.memory, line: "Results persist to Postgres and Neo4j." },
  { id: "EVOLUTION", tone: COLORS.evolution, line: "Survivors mutate. Weak variants are retired." },
];

const OHLCV = [
  ["2026-03-02", "418.20", "421.66", "417.05", "420.90", "71.2M"],
  ["2026-03-03", "420.95", "422.10", "414.88", "415.40", "88.6M"],
  ["2026-03-04", "415.30", "416.02", "406.71", "408.12", "126.4M"],
];

const INDICATORS = ["rsi_14", "sma_50", "sma_200", "atr_14", "realized_vol_20", "momentum_14"];

const VALIDATORS = [
  { name: "Walk-Forward", score: 0.79 },
  { name: "Regime Cross-Val", score: 0.84 },
  { name: "Monte Carlo", score: 0.8 },
  { name: "Persistence", score: 0.86 },
  { name: "Stress Test", score: 0.81 },
];

const DSL = `{
  "operator": "AND",
  "conditions": [
    {
      "indicator": "rsi_14",
      "comparator": "<",
      "value": 30
    },
    {
      "indicator": "close",
      "comparator": "crosses_above",
      "value_ref": "sma_50"
    }
  ]
}`;

export function Platform() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end end"] });
  const [active, setActive] = useState(0);

  useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (value) => {
      const index = Math.min(STATIONS.length - 1, Math.floor(value * STATIONS.length));
      setActive(index);
    });

    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <section id="platform" className="relative w-full border-t border-[#1b1d27] bg-[#090a10] py-28 md:py-36">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 18% 18%, rgba(139,123,232,0.11), transparent 22%),
            radial-gradient(circle at 78% 42%, rgba(139,123,232,0.08), transparent 26%),
            radial-gradient(circle at 45% 78%, rgba(82,42,111,0.12), transparent 28%),
            linear-gradient(rgba(139,123,232,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,123,232,0.045) 1px, transparent 1px)
          `,
          backgroundSize: "auto, auto, auto, 48px 48px, 48px 48px",
          backgroundPosition: "center, center, center, center, center",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-8 sm:px-10 md:px-16 lg:px-20 xl:px-24">
        <Reveal>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8B7BE8]">
            The platform
          </span>
          <h2 className="text-balance-tight mt-7 max-w-5xl font-display text-5xl font-semibold leading-[1.05] text-[#f1f2f6] md:text-[68px]" style={{ fontFamily: "var(--font-figtree)" }}>
            Built for the full research lifecycle — not just the backtest.
          </h2>
        </Reveal>

        <div ref={ref} className="mt-20 grid grid-cols-1 gap-14 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-20" style={{ fontFamily: "var(--font-figtree)" }}>
          {/* Research machine stays fixed while the right side scrolls */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#737887]">
              Research machine
            </span>

            <ol className="mt-7">
              {STATIONS.map((station, index) => {
                const completed = index < active;
                const current = index === active;
                const visible = index <= active;

                return (
                  <li key={station.id} className="relative min-h-[82px] pl-8">
                    {index < STATIONS.length - 1 && (
                      <div className="absolute left-[6px] top-[17px] h-[calc(100%-6px)] w-px bg-[#242733]">
                        <motion.div
                          className="w-px origin-top"
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: completed ? 1 : current ? 0.45 : 0 }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          style={{ height: "100%", backgroundColor: station.tone }}
                        />
                      </div>
                    )}

                    <motion.span
                      className="absolute left-0 top-[7px] block h-[13px] w-[13px] rounded-full border"
                      animate={{
                        backgroundColor: visible ? station.tone : "transparent",
                        borderColor: visible ? station.tone : "#3a3d49",
                        boxShadow: current ? `0 0 18px ${station.tone}` : "none",
                      }}
                      transition={{ duration: 0.35 }}
                    />

                    <div className="pb-8">
                      <motion.span
                        className="font-mono text-[12px] font-semibold tracking-[0.17em]"
                        animate={{ color: visible ? station.tone : "#666b78" }}
                        transition={{ duration: 0.35 }}
                      >
                        {station.id}
                      </motion.span>

                      <p className="mt-2 max-w-[210px] font-mono text-[10px] leading-[1.8] tracking-[0.12em] uppercase" style={{ color: visible ? "#8d92a0" : "#555966" }}>
                        {station.line}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Research lifecycle */}
          <div className="flex min-w-0 flex-col gap-28">
            {/* DATA */}
            <Station title="Data" caption="OHLCV ingestion · strict temporal isolation">
              <table className="w-full border-collapse font-mono text-[11px] text-[#b8bdc9]">
                <thead>
                  <tr className="text-[#687080]" style={{ fontFamily: "var(--font-figtree)" }}>
                    {["date", "open", "high", "low", "close", "volume"].map((header) => (
                      <th key={header} className="border-b border-[#242733] py-3 text-left font-normal tracking-[0.1em] uppercase">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {OHLCV.map((row, index) => (
                    <motion.tr
                      key={row[0]}
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border-b border-[#1d2029] py-3 tabular-nums">
                          {cell}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 flex flex-wrap gap-2">
                {INDICATORS.map((indicator, index) => (
                  <motion.span
                    key={indicator}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + index * 0.06 }}
                    className="border border-[#24404d] bg-[#0b1015] px-3 py-1.5 font-mono text-[10px]"
                    style={{ color: COLORS.data }}
                  >
                    {indicator}
                  </motion.span>
                ))}
                <span className="px-3 py-1.5 font-mono text-[10px] text-[#687080]">+9 more</span>
              </div>
            </Station>

            {/* REGIME */}
            <Station title="Regime" caption="Four-model ensemble labels every bar">
              <div className="grid grid-cols-2 gap-px bg-[#242733] sm:grid-cols-4">
                {["HMM", "PELT", "GMM", "GARCH"].map((model, index) => (
                  <motion.div
                    key={model}
                    initial={{ opacity: 0.2 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-[#0a0b11] p-5"
                  >
                    <div className="font-mono text-[13px] tracking-[0.14em] text-[#d8dbe2]">{model}</div>
                    <div className="mt-2 font-mono text-[10px] tracking-[0.15em]" style={{ color: COLORS.regime }}>
                      ONLINE
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-5 flex h-7 gap-px overflow-hidden">
                {Array.from({ length: 42 }).map((_, index) => {
                  const tones = [COLORS.strategy, COLORS.data, "#7e8792", COLORS.failed, COLORS.regime];

                  return (
                    <motion.span
                      key={index}
                      className="flex-1 origin-bottom"
                      style={{ backgroundColor: tones[index % tones.length] }}
                      initial={{ scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.012, duration: 0.25 }}
                    />
                  );
                })}
              </div>
            </Station>

            {/* STRATEGY */}
            <Station title="Strategy" caption="Structured JSON strategy DSL">
              <pre className="overflow-x-auto border border-[#242733] bg-[#0b0c12] p-5 font-mono text-[11px] leading-[1.8] text-[#858b99]">
                <code>{DSL}</code>
              </pre>
            </Station>

            {/* VALIDATION */}
            <Station title="Validation" caption="Five methods · one promotion gate">
              <div className="grid grid-cols-1 gap-px bg-[#242733] sm:grid-cols-5">
                {VALIDATORS.map((validator, index) => (
                  <motion.div
                    key={validator.name}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.08 }}
                    className="bg-[#0a0b11] p-5"
                  >
                    <div className="font-mono text-[10px] leading-tight tracking-[0.1em] text-[#737887]">
                      {validator.name}
                    </div>
                    <div className="mt-4 font-mono text-xl tabular-nums text-[#f1f2f6]">
                      {validator.score.toFixed(2)}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap items-end gap-10 border border-[#242733] bg-[#0b0c12] p-6">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#737887]">
                    Robustness score
                  </div>
                  <div className="mt-2 font-display text-6xl font-semibold text-[#f1f2f6]">0.82</div>
                </div>

                <div>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#737887]">
                    Promotion
                  </div>
                  <div className="mt-3 font-mono text-[14px] tracking-[0.16em]" style={{ color: COLORS.strategy }}>
                    ELIGIBLE
                  </div>
                </div>

                <p className="ml-auto max-w-[240px] font-mono text-[10px] leading-relaxed tracking-[0.12em] uppercase text-[#666c79]">
                  Below 0.70 → cannot become active
                </p>
              </div>
            </Station>

            {/* MEMORY */}
            <Station title="Memory" caption="Relational truth + graph relationships">
              <div className="grid grid-cols-1 gap-px bg-[#242733] sm:grid-cols-2">
                {[
                  { db: "PostgreSQL", note: "Runs, metrics, immutable failure records" },
                  { db: "Neo4j", note: "Nodes, lineage, 8 relationship types" },
                ].map((database, index) => (
                  <motion.div
                    key={database.db}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.15 }}
                    className="bg-[#0a0b11] p-6"
                  >
                    <div className="font-mono text-[13px] tracking-[0.14em]" style={{ color: COLORS.memory }}>
                      {database.db}
                    </div>
                    <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-[0.1em] uppercase text-[#737887]">
                      {database.note}
                    </p>
                  </motion.div>
                ))}
              </div>
            </Station>

            {/* EVOLUTION */}
            <Station title="Evolution" caption="Strategy lineage · survivors continue">
              <svg viewBox="0 0 420 200" className="w-full overflow-visible">
                {[
                  "M210 16 L120 70",
                  "M210 16 L300 70",
                  "M120 70 L70 140",
                  "M120 70 L170 140",
                  "M300 70 L260 140",
                  "M300 70 L350 140",
                ].map((path, index) => (
                  <motion.path
                    key={path}
                    d={path}
                    stroke={COLORS.memory}
                    strokeOpacity={0.65}
                    strokeWidth="1.5"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.65, delay: 0.15 + index * 0.1 }}
                  />
                ))}

                {[
                  { x: 210, y: 16, t: "PARENT", tone: COLORS.strategy },
                  { x: 120, y: 70, t: "MUT_A", tone: COLORS.strategy },
                  { x: 300, y: 70, t: "MUT_B", tone: COLORS.regime },
                  { x: 70, y: 140, t: "V1 · FAILED", tone: COLORS.failed },
                  { x: 170, y: 140, t: "V2 · ACTIVE", tone: COLORS.strategy },
                  { x: 260, y: 140, t: "V3 · FAILED", tone: COLORS.failed },
                  { x: 350, y: 140, t: "V4 · CANDIDATE", tone: COLORS.regime },
                ].map((node, index) => (
                  <motion.g
                    key={node.t}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.25 + index * 0.08 }}
                  >
                    <circle cx={node.x} cy={node.y} r="4.5" fill={node.tone} />
                    <text
                      x={node.x}
                      y={node.y + 20}
                      textAnchor="middle"
                      fill="#b5bac6"
                      style={{ font: "10px 'JetBrains Mono', monospace", letterSpacing: "0.1em" }}
                    >
                      {node.t}
                    </text>
                  </motion.g>
                ))}

                <text
                  x="214"
                  y="46"
                  fill={COLORS.memory}
                  style={{ font: "10px 'JetBrains Mono', monospace", letterSpacing: "0.14em" }}
                >
                  MUTATED_FROM
                </text>
              </svg>
            </Station>
          </div>
        </div>
      </div>
    </section>
  );
}

function Station({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <Reveal>
      <div className="border-t border-[#242733] pt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h3 className="font-display text-3xl font-semibold tracking-tight text-[#eceef3] md:text-4xl" style={{ fontFamily: "var(--font-figtree)" }}>
            {title}
          </h3>
          <span className="font-mono text-[10px] tracking-[0.17em] uppercase text-[#6d7381]">
            {caption}
          </span>
        </div>
        <div className="mt-7">{children}</div>
      </div>
    </Reveal>
  );
}