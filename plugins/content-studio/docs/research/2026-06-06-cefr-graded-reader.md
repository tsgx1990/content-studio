# CEFR 分级读物（graded reader）受控可读性 — 调研记录

- **日期**: 2026-06-06
- **目的**: 为 `english-learning-story` 垂直线设计一个**确定性 gate**——把分级读物（graded reader）公认的、可机械复核的受控可读性事实（CEFR 等级、句长上限、目标词复现、超纲词预算）变成校验项。哪些是"教学质量好不好"留给 `content-review`，哪些是"分级硬底线"由脚本强制。
- **方法**: SearXNG 英文检索（`language: en`），交叉印证：出版社分级读物手册（Oxford Bookworms / Penguin Readers）、Extensive Reading Foundation 量表、Nation & Waring《Teaching Extensive Reading》、学术语料研究、CEFR 官方与词汇量综述。不臆造精确数字；多源不一致时记录区间。

## 关键发现（gate 据此取阈值）

### 1. CEFR 六级 + 受控词汇是分级读物的核心
- 分级读物 = "为外语学习者编写、词汇受严格控制的读物"（Nation & Waring）。出版社按 **core structures + vocabulary + book length** 分级；headword（词表）数是公开的控制量。
- 决定：`cefr_level` 枚举 `A1/A2/B1/B2/C1/C2`，是每篇课文的必填等级标签。

### 2. 句长上限（按级递增）
- 跨出版社语料研究（*Graded Readers: Validating Reading Levels across Publishers*, academia.edu）：平均句长 **最低 6.8、最高 21.8 词/句**，随级别递增。
- 决定（每句词数上限，grounded 取整 + 容差）：A1 **8**、A2 **10**、B1 **14**、B2 **18**、C1 **22**、C2 **26**。gate 检查每个句子的词数 ≤ 该级上限，并报告最超标的句子。（A1≈7、顶级≈22 与文献吻合，上限略放宽以容纳标点切分误差。）

### 3. 词表规模 / 超纲词受控（"beyond-core 必须预先声明"）
- headword 区间（多源）：A1（Starter）~200–300（LIRE: A1 200；ER Japan: basic 75–300），A2 ~600–800（LIRE: A2 800），B1 ~1200–1500，B2 ~2500，C1 ~3000+；Nation & Waring：系列从 ~300–500 起，到 ~2000–2500。Oxford 3000 覆盖 A1–B2，Oxford 5000 增补 B2–C1。
- CEFR 通用词汇量（接收性，区间大、各源不一）：A1 ~500–600、A2 ~1000–1200、B1 ~2000–2500、B2 ~3250–5000、C1 ~5000–9000、C2 ~16000+。
- 关键洞察：受控不是"列全词表"，而是**高频核心词随便用、超出核心的词必须被作为"目标词/生词"显式声明（带释义）**。这正是分级读物"控制生词引入速率"的做法。
- 决定：仓库内置一个**高频核心词表**（`scripts/lib/english-core-vocab.mjs`，~高频功能词 + 最常用实词；可经 `allowed_extra` 扩展）。gate 计算 **未受控词比例** = 既不在核心、又不在已声明目标词、又非专有名词/数字的词 / 总词数，须 ≤ 该级上限。上限**随级别放宽**（高级别本就允许更多罕见词）：A1 **0.10**、A2 **0.15**、B1 **0.25**、B2 **0.40**、C1 **0.60**、C2 **0.80**。

### 4. 目标词必须真的"教到"（复现）
- 分级读物会**重复新词**以促成留存；"教了却没用"是无效课文。
- 决定：每个 `target_vocabulary[].word` 必须在课文中出现 ≥ `min_target_repetitions`（默认 **2**，inflection-aware：headword 及其常见词形变化都算）。少于此即 fail——你不能声称教一个你没用够的词。

### 5. 单篇课文词数区间（非整本书）
- 整本分级读物 5,000–12,000 词；但本垂直线产出的是**单篇课文故事**，不是整本书。故取适合单篇的小区间。
- 决定（按级）：A1 {60,250}、A2 {150,500}、B1 {300,900}、B2 {500,1500}、C1 {700,2500}、C2 {900,3500}。可经 schema 覆盖。

## gate 设计（`scripts/check-graded-reader.mjs`，零依赖）

机械、可复现地校验 `.lesson.json`：
1. 符合 `schemas/english-learning-story.schema.json`；
2. `cefr_level` 已知，载入该级默认（句长/词数/未受控比例上限）；
3. **每句词数 ≤ 该级上限**（报告最超标句）；
4. **课文词数在该级区间内**；
5. **每个目标词出现 ≥ min_target_repetitions**（inflection-aware）；
6. **未受控词比例 ≤ 该级上限**（核心 ∪ 目标词 ∪ allowed_extra ∪ 专有名词 ∪ 数字 之外的词；报告未受控词清单，便于作者加进生词表或改简单）。

"课文好不好读、教学法是否得当、文化是否得体"由 `content-review` 判定；脚本只守可复现的分级底线。

## 诚实声明 / 局限

- 内置核心词表是**起步高频核心**（源自 Dolch service words / GSL-NGSL 高频 / Oxford 3000 A1 核心等公认、稳定的高频集合），**非权威 CEFR 词表**，可经 `allowed_extra` 按项目扩展。多家在线 CEFR checker 也都自承是"approximate mapping"——本 gate 同样是**近似下限**，不是权威分级器。
- inflection 匹配用简单后缀剥离（-s/-es/-ed/-ing/-d/-er/-est/-ly/-ies→y/缩写），可能漏判不规则变化（go/went）；故 gate 报告未受控词供人工复核，而非据此武断判分。
- CEFR 词汇量各源差异大（A1 500–600，C2 16000+），文中记录区间而非单一值。

## 来源（observed via SearXNG，2026-06-06）

- *Graded Readers: Validating Reading Levels across Publishers* — academia.edu/44020427（平均句长 6.8–21.8 词/句；均 9344 词/本、47 页）
- Nation & Waring, *Teaching Extensive Reading in Another Language* — scribd 666597798（受控词汇定义；系列 300–500 起到 2000–2500）
- *Using Graded Readers*（LIRE / Innovative steps）— projectlire.com / expolpedagogika.sk（A1 200 headwords；A2 800 headwords）
- Extensive Reading in Japan（JALT ERJ 11.2）— er.jalt.org（basic 75–300、intermediate 300–800、advanced 700+ headwords）
- Extensive Reading Foundation, *ERF Graded Reader Scale* — erfoundation.org（跨出版社按自然频率对齐 headword 级别）
- Oxford University Press, *Graded Readers* / Oxford Learner's Dictionaries CEFR — oupjapan.co.jp / oxfordlearnersdictionaries.com（headword 定义；Oxford 3000=A1–B2，5000=+B2–C1）
- Penguin Readers Handbook — penguinreaders.co.uk（A1 Starter–B2 分级）
- CEFR 官方等级 — coe.int（A1–C2 六级量表）
- CEFR 词汇量综述（区间）— iifls.com、scribd 838316424、quora（A1 500→C2 16000+，各源差异大）
- 在线 CEFR Text Level Checker 的"approximate mapping"免责声明 — readabilit.com、lingoharvest.com、cefrlevels.com（印证"近似、非权威"的定位）
