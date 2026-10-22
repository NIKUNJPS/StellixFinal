# 06 - References

> Covers checklist item **"Verified academic papers and references"**. BibTeX: [`references.bib`](references.bib).

**What "verified" means here.** Each entry below was checked on 2026-10-21 against an external record (publisher,
arXiv, SSRN, JMLR/IEEE/NBER pages, or a bibliographic index) found by web search. The *existence, authors, venue,
year, volume and pages* were confirmed. **The full texts were not read for this document**, so the one-line
"used for" notes describe how the *code* uses the method, not a reading of each paper. Where a source did not show a
DOI or page range, it is omitted instead of guessed. Before submission, the project authors should confirm they have
consulted each paper they cite as having informed the design.

## A. Regime detection and change-point methods (`app/regime/`)

1. J. D. Hamilton (1989). *A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle.*
   Econometrica 57(2): 357-384. [Econometric Society](https://www.econometricsociety.org/publications/econometrica/1989/03/01/new-approach-economic-analysis-nonstationary-time-series-and);
   JSTOR stable id 1912559. *Used for:* the regime-switching idea behind labelling markets by hidden states.
2. L. R. Rabiner (1989). *A tutorial on hidden Markov models and selected applications in speech recognition.*
   Proceedings of the IEEE 77(2): 257-286. [IEEE Xplore 18626](https://ieeexplore.ieee.org/document/18626).
   *Used for:* the HMM detector (4-state Gaussian HMM).
3. T. Bollerslev (1986). *Generalized autoregressive conditional heteroskedasticity.* Journal of Econometrics 31(3):
   307-327. doi:[10.1016/0304-4076(86)90063-1](https://doi.org/10.1016/0304-4076(86)90063-1). *Used for:* the GARCH(1,1)
   detector and Crisis override.
4. R. Killick, P. Fearnhead, I. A. Eckley (2012). *Optimal detection of changepoints with a linear computational cost.*
   Journal of the American Statistical Association 107(500): 1590-1598.
   doi:[10.1080/01621459.2012.737745](https://doi.org/10.1080/01621459.2012.737745); [arXiv:1101.1438](https://arxiv.org/abs/1101.1438).
   *Used for:* the PELT change-point detector.
5. C. Truong, L. Oudre, N. Vayatis (2020). *Selective review of offline change point detection methods.* Signal Processing
   167: 107299. doi:[10.1016/j.sigpro.2019.107299](https://doi.org/10.1016/j.sigpro.2019.107299);
   [arXiv:1801.00718](https://arxiv.org/abs/1801.00718). *Used for:* the `ruptures` library that implements PELT.
6. A. Ang, A. Timmermann (2012). *Regime Changes and Financial Markets.* Annual Review of Financial Economics 4:
   313-337. [NBER Working Paper 17182](https://www.nber.org/papers/w17182). *Background:* motivation for regime-conditioned
   asset behaviour.
7. F. Pedregosa et al. (2011). *Scikit-learn: Machine Learning in Python.* Journal of Machine Learning Research 12:
   2825-2830. [JMLR](https://jmlr.org/papers/v12/pedregosa11a.html). *Used for:* the Gaussian-mixture detector.

## B. Backtest overfitting, validation and statistics (`app/validation/`, experiments)

8. D. H. Bailey, M. López de Prado (2014). *The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting
   and Non-Normality.* Journal of Portfolio Management 40(5): 94-107. doi:[10.3905/jpm.2014.40.5.094](https://doi.org/10.3905/jpm.2014.40.5.094);
   [SSRN 2460551](https://papers.ssrn.com/abstract=2460551). *Relevance:* the multiple-testing problem for the 121-strategy
   book; **not implemented** (proposed experiment P5).
9. D. H. Bailey, J. M. Borwein, M. López de Prado, Q. J. Zhu (2017). *The Probability of Backtest Overfitting.* Journal of
   Computational Finance 20(4). doi:[10.21314/jcf.2016.322](https://doi.org/10.21314/jcf.2016.322);
   [SSRN 2326253](https://papers.ssrn.com/abstract=2326253). *Relevance:* same; **not implemented** (P5).
10. C. R. Harvey, Y. Liu, H. Zhu (2016). *... and the Cross-Section of Expected Returns.* Review of Financial Studies 29(1).
    doi:[10.1093/rfs/hhv059](https://doi.org/10.1093/rfs/hhv059). *Relevance:* published findings need much higher
    significance hurdles when many strategies are tried.
11. H. White (2000). *A Reality Check for Data Snooping.* Econometrica 68(5): 1097-1126.
    doi:[10.1111/1468-0262.00152](https://doi.org/10.1111/1468-0262.00152). *Relevance:* testing the best of many
    rules against a benchmark; **not implemented**.
12. M. López de Prado (2018). *Advances in Financial Machine Learning.* Wiley. ISBN 978-1-119-48208-6. *Relevance:*
    walk-forward and purged cross-validation practice; the platform's walk-forward is simpler (no purging or embargo).
13. B. Efron (1979). *Bootstrap Methods: Another Look at the Jackknife.* Annals of Statistics 7(1): 1-26.
    doi:[10.1214/aos/1176344552](https://doi.org/10.1214/aos/1176344552). *Used for:* the Monte Carlo resampling and the
    bootstrap confidence intervals in the experiments.
14. F. Allen, R. Karjalainen (1999). *Using genetic algorithms to find technical trading rules.* Journal of Financial
    Economics 51: 245-271. doi:[10.1016/S0304-405X(98)00052-X](https://doi.org/10.1016/S0304-405X(98)00052-X).
    *Relevance:* closest prior work to the evolution engine; reported no consistent out-of-sample excess return over
    buy-and-hold after costs, which our Experiment B echoes.

## C. Failure attribution and models (`app/failure/`)

15. S. M. Lundberg, S.-I. Lee (2017). *A Unified Approach to Interpreting Model Predictions.* NeurIPS 30.
    [arXiv:1705.07874](https://arxiv.org/abs/1705.07874). *Used for:* SHAP values.
16. S. M. Lundberg et al. (2020). *From local explanations to global understanding with explainable AI for trees.* Nature
    Machine Intelligence 2(1): 56-67. doi:[10.1038/s42256-019-0138-9](https://doi.org/10.1038/s42256-019-0138-9).
    *Used for:* `TreeExplainer`.
17. G. Ke et al. (2017). *LightGBM: A Highly Efficient Gradient Boosting Decision Tree.* NeurIPS 30.
    [NeurIPS page](https://neurips.cc/virtual/2017/poster/9099). *Used for:* the surrogate regressor behind attributions.

## D. Evolutionary search (`app/evolution/`)

18. F.-A. Fortin, F.-M. De Rainville, M.-A. Gardner, M. Parizeau, C. Gagné (2012). *DEAP: Evolutionary Algorithms Made
    Easy.* Journal of Machine Learning Research 13: 2171-2175. [JMLR](https://jmlr.csail.mit.edu/papers/volume13/fortin12a/fortin12a.pdf).
    *Used for:* the GA operators.
19. J. Bergstra, Y. Bengio (2012). *Random Search for Hyper-Parameter Optimization.* Journal of Machine Learning Research
    13: 281-305. [JMLR](https://jmlr.org/papers/v13/bergstra12a.html). *Used for:* justification of random search as the
    baseline in Experiment B.

## E. Knowledge graph and LLM agents (`app/graph/`, `app/agents/`)

20. A. Hogan et al. (2021). *Knowledge Graphs.* ACM Computing Surveys 54(4), Article 71.
    doi:[10.1145/3447772](https://doi.org/10.1145/3447772); [arXiv:2003.02320](https://arxiv.org/abs/2003.02320).
    *Background:* property-graph modelling of research lineage.
21. Y. Xiao, E. Sun, D. Luo, W. Wang (2024). *TradingAgents: Multi-Agents LLM Financial Trading Framework.*
    [arXiv:2412.20138](https://arxiv.org/abs/2412.20138) (listed on arXiv as an oral at the Multi-Agent AI in the Real World
    workshop, AAAI 2025). **The multi-agent desk is built on this open-source framework** (`docs/THIRD_PARTY_NOTICES.md`,
    ADR 0009); the paper's reported results are the authors' own and are not reproduced or validated here.
22. N. Shinn, F. Cassano, E. Berman, A. Gopinath, K. Narasimhan, S. Yao (2023). *Reflexion: Language Agents with Verbal
    Reinforcement Learning.* [arXiv:2303.11366](https://arxiv.org/abs/2303.11366) (NeurIPS 2023 per a secondary source).
    *Relevance:* verbal reflection stored in memory; conceptually related to the desk's settlement-and-reflection step.
23. A. Lopez-Lira, Y. Tang (2023, revised through 2025). *Can ChatGPT Forecast Stock Price Movements? Return Predictability
    and Large Language Models.* [arXiv:2304.07619](https://arxiv.org/abs/2304.07619). *Relevance:* LLM return-predictability
    claims are contested and evolve across versions; motivates the platform's "no price prediction" safeguard.

## F. Gaps in this bibliography

- No reference is given for the specific **self-consistency weighting** used by the regime ensemble; it is described in
  the code as an ensemble technique, and no source for it was verified.
- No peer-reviewed validation of the **0.70 gate** or of the **component weights (30/30/20/10/10)** exists; they are design
  decisions recorded in ADR 0008 and the original specification, not literature results.
- Recent (2025-2026) work on regime-aware strategy evaluation and on look-ahead bias in language models was not surveyed
  for this document; the bibliography leans on foundational methods.
