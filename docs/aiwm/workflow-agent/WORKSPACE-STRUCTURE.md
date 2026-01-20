# Workflow Agent - Workspace Structure & Conventions

## Overview

The workflow design agent organizes its work in **dedicated directories** for each workflow. This ensures clear separation, easy tracking, and complete documentation of design decisions.

---

## Directory Structure

```
/workspace/
├── workflow-gold-trader/                    # Example workflow workspace
│   ├── REQUIREMENTS.md                      # Original business requirements
│   ├── ARCHITECTURE.md                      # High-level design analysis
│   ├── REFACTOR-PLAN.md                     # Refactoring todo list with priorities
│   ├── ANALYSIS.md                          # Design review findings & recommendations
│   ├── TEST-RESULTS.md                      # Test execution logs and results
│   ├── STEP-DESIGNS/                        # Individual step design documents
│   │   ├── P1-spot-forward-pricing.json
│   │   ├── P2-cost-modeling.json
│   │   ├── P3-discount-management.json
│   │   ├── P4-margin-calculation.json
│   │   ├── P5-market-regime.json
│   │   ├── P6-sentiment-analysis.json
│   │   ├── P7-correlation-analysis.json
│   │   ├── P8-volatility-var.json
│   │   ├── P9-monte-carlo.json
│   │   └── P10-exposure-monitoring.json
│   └── CHANGELOG.md                         # History of changes made
│
├── workflow-content-generation/             # Another workflow workspace
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── ...
│
└── README.md                                # Overview of all workflows
```

---

## File Descriptions

### 1. `REQUIREMENTS.md`

**Purpose:** Document original business requirements from user

**Format:**
```markdown
# Workflow Requirements: <Workflow Name>

## Business Context
[Why this workflow exists, what problem it solves]

## Input Sources
- Data source 1: [Description]
- Data source 2: [Description]

## Expected Outputs
- Output 1: [Description]
- Output 2: [Description]

## Constraints
- Performance: [Requirements]
- Cost: [Budget constraints]
- Compliance: [Regulatory requirements]

## Success Criteria
- [Metric 1]
- [Metric 2]
```

**Example:**
```markdown
# Workflow Requirements: AI Gold Trader

## Business Context
Automated gold trading system for private banks and family offices.
Must provide pricing, risk assessment, and hedging recommendations
in real-time based on market data.

## Input Sources
- LBMA spot prices (real-time)
- Futures data (COMEX, CME, ICE)
- FX rates (USD, EUR)
- Macroeconomic indicators (interest rates, CPI)
- News feeds (geopolitical events)

## Expected Outputs
- Optimal sale price with -5% discount
- Net margin percentage
- Risk metrics (VaR, CVaR)
- Kill-switch status
- Market regime signals

## Constraints
- Execution time: < 30 seconds for full workflow
- Cost per execution: < $0.50
- Compliance: Must provide audit trail with explainability

## Success Criteria
- 95% pricing accuracy vs manual calculations
- < 5% error rate in risk assessments
- Zero false kill-switch triggers in backtest
```

---

### 2. `ARCHITECTURE.md`

**Purpose:** Document high-level workflow architecture and layer structure

**Format:**
```markdown
# Workflow Architecture: <Name>

## Metadata
- Workflow ID: <ID>
- Version: <version>
- Status: <draft/active/archived>
- Created: <date>

## Layer Structure

### Layer 0 (Parallel - No Dependencies)
- Step P1: [Name] - [Purpose]
- Step P2: [Name] - [Purpose]
- ...

### Layer 1 (Depends on Layer 0)
- Step P3: [Name] - [Purpose] (depends on P1, P2)
- ...

### Layer N
- ...

## Data Flow Diagram

```
[ASCII diagram showing data flow between steps]
```

## Current Issues
1. ❌ [Issue description]
2. ⚠️ [Issue description]

## Recommendations
1. [Recommendation]
2. [Recommendation]
```

**Example:** See `/docs/aiwm/workflow-feature/ARCHITECTURE-REVIEW.md`

---

### 3. `REFACTOR-PLAN.md`

**Purpose:** Track refactoring tasks with priorities and status

**Format:**
```markdown
# Refactor Plan: <Workflow Name>

## Overview
- Total Steps: 10
- Completed: 1
- In Progress: 2
- Pending: 7

## Step Status Matrix

| Step ID | Name | Order | Layer | Status | Issues | Priority |
|---------|------|-------|-------|--------|--------|----------|
| xxx | P1 - Pricing | 0 | 0 | ✅ DONE | None | - |
| xxx | P2 - Cost | 0 | 0 | ⚠️ TODO | Nested schema | HIGH |
| ... | ... | ... | ... | ... | ... | ... |

## Phases

### Phase 1: Critical Path (HIGH Priority)
- [ ] P2 - Cost Modeling Engine
- [ ] P3 - Discount Management
- [ ] P4 - Margin Calculation

### Phase 2: Market Intelligence (MEDIUM Priority)
- [ ] P5 - Market Regime
- [ ] P6 - Sentiment Analysis
- [ ] P7 - Correlation Analysis

### Phase 3: Risk Management (LOW Priority)
- [ ] P8 - Volatility & VaR
- [ ] P9 - Monte Carlo
- [ ] P10 - Exposure Monitoring

## Quality Gates

Before marking step as DONE:
- [ ] Schema compliance (flat, snake_case, descriptions, examples)
- [ ] Prompt-schema alignment
- [ ] Translation quality (English, no Vietnamese)
- [ ] Testing passed
- [ ] Dependencies validated
```

**Example:** See `/docs/aiwm/workflow-feature/REFACTOR-PLAN.md`

---

### 4. `STEP-DESIGNS/*.json`

**Purpose:** Complete design specification for each workflow step

**Naming Convention:** `P{N}-{kebab-case-name}.json`

**Format:**
```json
{
  "stepId": "696d97e09fc2d8af78a5bb66",
  "name": "P1 - Spot & Forward Pricing",
  "description": "Calculate forward prices from LBMA spot data",
  "orderIndex": 0,
  "dependencies": [],
  "type": "llm",

  "llmConfig": {
    "deploymentId": "696df12f086778fa3069129a",
    "deploymentName": "Kimi K2 - Thinking Model",

    "systemPrompt": "You are a commodity pricing specialist...",

    "userPromptTemplate": "LBMA Spot Price: ${{lbma_spot_price}}/oz...",

    "parameters": {
      "temperature": 0.3,
      "max_tokens": 4000
    },

    "timeout": 30000
  },

  "inputSchema": {
    "type": "object",
    "properties": {
      "lbma_spot_price": {
        "type": "number",
        "description": "Current LBMA gold spot price in USD per ounce"
      }
    },
    "required": ["lbma_spot_price"],
    "examples": [
      {
        "lbma_spot_price": 2650.50,
        "delivery_timeline_days": 90
      }
    ]
  },

  "outputSchema": {
    "type": "object",
    "properties": {
      "base_forward_price": {
        "type": "number",
        "description": "Calculated forward price in USD per ounce"
      },
      "market_structure": {
        "type": "string",
        "enum": ["Contango", "Backwardation", "Flat"],
        "description": "Market structure classification"
      }
    },
    "required": ["base_forward_price", "market_structure"],
    "examples": [
      {
        "base_forward_price": 2654.32,
        "market_structure": "Contango"
      }
    ]
  },

  "designNotes": {
    "issues": [],
    "changes": [
      "Flattened nested schema",
      "Translated Vietnamese prompts to English",
      "Increased max_tokens from 1000 to 4000 (thinking model)"
    ],
    "testResults": {
      "status": "passed",
      "output": {
        "base_forward_price": 2654.32,
        "market_structure": "Contango"
      },
      "validation": "All fields present, types correct, flat structure"
    }
  }
}
```

---

### 5. `TEST-RESULTS.md`

**Purpose:** Log all test executions and results

**Format:**
```markdown
# Test Results: <Workflow Name>

## Individual Step Tests

### P1 - Spot & Forward Pricing
**Test Date:** 2025-01-20 10:30:00

**Input:**
```json
{
  "lbma_spot_price": 2650.50,
  "delivery_timeline_days": 90
}
```

**Output:**
```json
{
  "base_forward_price": 2654.32,
  "market_structure": "Contango",
  "calculation_method": "Linear interpolation"
}
```

**Validation:**
- ✅ Output schema compliant
- ✅ All required fields present
- ✅ Flat structure (no nested objects)
- ✅ Field types correct
- ✅ finish_reason: "stop"

**Execution Time:** 4.2s
**Token Usage:** 2847 tokens (reasoning: 1234, output: 1613)

---

### P2 - Cost Modeling Engine
**Test Date:** 2025-01-20 11:00:00

**Status:** ❌ FAILED

**Error:**
```
ValidationError: Output does not match schema
- Missing required field: "total_operational_cost_per_oz"
- Unexpected nested object: "itemized_costs"
```

**Action Required:** Refactor outputSchema to flatten nested structure

---

## Full Workflow Tests

### Test 1: Happy Path
**Test Date:** 2025-01-20 12:00:00
**Status:** ✅ PASSED

**Input:**
```json
{
  "P1_step_id": { "lbma_spot_price": 2650.50 },
  "P2_step_id": { "refining_contract": "..." }
}
```

**Output:** [Full workflow output]

**Execution Time:** 28.5s
**Total Cost:** $0.42

---

## Performance Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Execution time | < 30s | 28.5s | ✅ PASS |
| Cost per run | < $0.50 | $0.42 | ✅ PASS |
| Error rate | < 5% | 0% | ✅ PASS |
```

---

### 6. `ANALYSIS.md`

**Purpose:** Document design review findings and recommendations

**Format:**
```markdown
# Workflow Analysis: <Name>

## Executive Summary
[2-3 sentence overview of findings]

## Strengths
1. ✅ [What's working well]
2. ✅ [What's working well]

## Issues Found

### Critical (Must Fix)
1. ❌ **Issue:** [Description]
   - **Impact:** [Impact on workflow]
   - **Recommendation:** [How to fix]
   - **Effort:** [Estimated time]

### Important (Should Fix)
2. ⚠️ **Issue:** [Description]
   - **Impact:** [Impact]
   - **Recommendation:** [Fix]

### Nice to Have (Optional)
3. 💡 **Suggestion:** [Description]

## Field Naming Conflicts

| Field Name | Steps | Conflict? | Proposed Rename |
|------------|-------|-----------|-----------------|
| currency | P1, P2 | ⚠️ YES | base_currency, cost_currency |
| explainability | P5-P9 | ⚠️ YES | {step}_explainability |

## Dependency Analysis

```
LAYER 0: [Steps]
LAYER 1: [Steps] (depends on...)
LAYER 2: [Steps] (depends on...)
```

**Issues:**
- ❌ P4 should be Layer 2 (not Layer 1)
- ❌ Dependencies use indices (should use step IDs)

## Recommendations

### Short-term (Immediate)
1. [Action 1]
2. [Action 2]

### Long-term (Future)
1. [Action 1]
2. [Action 2]

## Next Steps
1. [ ] [Task]
2. [ ] [Task]
```

---

### 7. `CHANGELOG.md`

**Purpose:** History of all changes made to the workflow

**Format:**
```markdown
# Changelog: <Workflow Name>

## [Unreleased]
- Work in progress...

## [2025-01-20] - Phase 1 Refactor
### Changed
- P2: Flattened outputSchema (removed itemized_costs nesting)
- P2: Translated Vietnamese prompts to English
- P3: Updated dependencies from [0] to specific step IDs
- P4: Moved from Layer 1 to Layer 2

### Fixed
- P1: Increased max_tokens from 1000 to 4000 (thinking model)
- P3: Fixed field references in userPromptTemplate

### Tested
- P1: Individual step test passed ✅
- P2: Individual step test passed ✅

## [2025-01-19] - Initial Analysis
### Added
- Created workspace structure
- Documented architecture in ARCHITECTURE.md
- Identified 12 critical issues in REFACTOR-PLAN.md

## [2025-01-18] - Workflow Creation
### Added
- Initial workflow created by user
- 10 steps defined
```

---

### 8. `/workspace/README.md`

**Purpose:** Overview of all workflows in workspace

**Format:**
```markdown
# Workflow Agent Workspace

This workspace contains design, analysis, and refactoring work for AIWM workflows.

## Active Workflows

### 1. Gold Trader (workflow-gold-trader/)
- **Status:** Refactoring Phase 1
- **Priority:** HIGH
- **Completion:** 20% (2/10 steps done)
- **Owner:** Backend Team
- **Last Updated:** 2025-01-20

### 2. Content Generation (workflow-content-generation/)
- **Status:** Design Review
- **Priority:** MEDIUM
- **Completion:** 0% (analysis only)
- **Owner:** Content Team
- **Last Updated:** 2025-01-18

## Workflow Status Legend
- 🟢 **Active** - Currently being worked on
- 🟡 **Review** - Waiting for approval
- ⚪ **Archived** - Completed or deprecated
- 🔴 **Blocked** - Waiting for dependencies

## Quick Links
- [Design Guide](../WORKFLOW-DESIGN-GUIDE.md)
- [System Prompt](./SYSTEM-PROMPT.md)
- [Workspace Structure](./WORKSPACE-STRUCTURE.md)
```

---

## Naming Conventions

### Workflow Directories
- **Format:** `workflow-{kebab-case-name}/`
- **Examples:**
  - `workflow-gold-trader/`
  - `workflow-content-generation/`
  - `workflow-sentiment-analysis/`

### Step Design Files
- **Format:** `P{N}-{kebab-case-name}.json`
- **Examples:**
  - `P1-spot-forward-pricing.json`
  - `P2-cost-modeling.json`
  - `P10-exposure-monitoring.json`

### Step IDs in Dependencies
- **Always use actual MongoDB ObjectIds**
- **Never use array indices**
- **Example:** `"dependencies": ["696d97e09fc2d8af78a5bb66"]`

---

## Best Practices

### 1. One Workflow = One Directory
Never mix multiple workflows in the same directory.

### 2. Keep Documents Updated
Update `REFACTOR-PLAN.md` and `CHANGELOG.md` after each change.

### 3. Test Before Marking Done
Always test steps individually before marking as ✅ DONE in REFACTOR-PLAN.md.

### 4. Document Design Decisions
Use `designNotes` in step JSON files to explain why changes were made.

### 5. Version Control Friendly
Use consistent JSON formatting (2-space indent, sorted keys) for easy diffing.

### 6. Cross-Reference
Link related documents:
```markdown
See [ARCHITECTURE.md](./ARCHITECTURE.md) for layer structure.
See [P2-cost-modeling.json](./STEP-DESIGNS/P2-cost-modeling.json) for details.
```

---

## Example: Complete Workflow Workspace

```
/workspace/workflow-gold-trader/
├── REQUIREMENTS.md              (2 KB)
├── ARCHITECTURE.md              (12 KB)
├── REFACTOR-PLAN.md            (8 KB)
├── ANALYSIS.md                  (6 KB)
├── TEST-RESULTS.md             (15 KB)
├── CHANGELOG.md                 (3 KB)
└── STEP-DESIGNS/
    ├── P1-spot-forward-pricing.json         (4 KB) ✅
    ├── P2-cost-modeling.json                (3 KB) ⚠️
    ├── P3-discount-management.json          (3 KB) 🔄
    ├── P4-margin-calculation.json           (4 KB)
    ├── P5-market-regime.json                (3 KB)
    ├── P6-sentiment-analysis.json           (3 KB)
    ├── P7-correlation-analysis.json         (3 KB)
    ├── P8-volatility-var.json               (3 KB)
    ├── P9-monte-carlo.json                  (3 KB)
    └── P10-exposure-monitoring.json         (4 KB)

Legend:
✅ Completed & tested
⚠️ Issues identified
🔄 Work in progress
(no icon) Not started
```

---

## Integration with Agent Workflow

When agent starts work on a workflow:

1. **Check if workspace exists:**
   ```bash
   ls /workspace/workflow-{name}/
   ```

2. **If not, create structure:**
   ```bash
   mkdir -p /workspace/workflow-{name}/STEP-DESIGNS
   touch /workspace/workflow-{name}/{REQUIREMENTS,ARCHITECTURE,REFACTOR-PLAN,ANALYSIS,TEST-RESULTS,CHANGELOG}.md
   ```

3. **Fetch workflow data via API**

4. **Populate documents**

5. **Begin refactoring workflow**

6. **Keep documents updated** throughout process

---

This structure ensures:
- ✅ Complete documentation trail
- ✅ Easy tracking of progress
- ✅ Clear separation of concerns
- ✅ Version control friendly
- ✅ Shareable with team members
