# AI Gold Trader - Workflow Steps Refactor Plan

## Overview

**Workflow**: AI Gold Trader - Financial Structuring Pipeline
**Workflow ID**: `696d95569fc2d8af78a5bb3c`
**Total Steps**: 10
**Objective**: Refactor all workflow steps to comply with WORKFLOW-DESIGN-GUIDE.md standards

## Refactor Principles (from WORKFLOW-DESIGN-GUIDE.md)

### ✅ Schema Design Standards
- **Flat schemas**: No nested objects in input/output schemas
- **snake_case**: All field names use snake_case convention
- **Examples**: Add `examples` at schema level and field level
- **Descriptions**: All fields must have clear English descriptions
- **Enums**: Use enums for constrained values

### ✅ Prompt Standards
- **English**: All prompts (systemPrompt, userPromptTemplate) in English
- **Handlebars**: Variable references match flat schema fields (e.g., `{{field_name}}` not `{{nested.field}}`)
- **Specific**: Clear instructions with constraints and expected format

### ✅ LLM Parameters
- **Temperature**: Appropriate for task type (0.1-0.2 for factual, 0.3-0.5 for analysis, 0.6-0.8 for creative)
- **Max Tokens**:
  - Standard models: 500-2000 tokens
  - **Thinking models (Kimi K2)**: 4000-8000 tokens (IMPORTANT!)
- **Timeout**: Sufficient for model processing

---

## Step Status Matrix

| Step ID | Name | Order | Layer | Status | Issues Found | Priority |
|---------|------|-------|-------|--------|--------------|----------|
| 696d97e09fc2d8af78a5bb66 | P1 - Spot & Forward Pricing | 0 | 0 | ✅ DONE | None - Already refactored & tested | - |
| 696d97ebffbe9aed3d5dc7df | P2 - Cost Modeling Engine | 0 | 0 | ⚠️ TODO | Nested schema, Vietnamese prompts | HIGH |
| 696d97f69fc2d8af78a5bb6a | P3 - Discount Management (-5%) | 1 | 1 | ⚠️ TODO | Vietnamese prompts, depends on P1+P2 | HIGH |
| 696d9804ffbe9aed3d5dc7e4 | P4 - Margin Calculation | 1 | 1 | ⚠️ TODO | Vietnamese prompts, depends on P3 | HIGH |
| 696d980effbe9aed3d5dc7ec | P5 - Market Regime & Macro | 0 | 0 | ⚠️ TODO | Vietnamese prompts | MEDIUM |
| 696d98249fc2d8af78a5bb70 | P6 - Sentiment & Correlation | 0 | 0 | ⚠️ TODO | Vietnamese prompts | MEDIUM |
| 696d982dffbe9aed3d5dc7ef | P7 - Correlation Analysis | 0 | 0 | ⚠️ TODO | Nested schema, Vietnamese prompts | MEDIUM |
| 696d983e9fc2d8af78a5bb74 | P8 - Volatility & VaR | 0 | 0 | ⚠️ TODO | Vietnamese prompts | MEDIUM |
| 696d9849ffbe9aed3d5dc7fa | P9 - Monte Carlo Simulation | 0 | 0 | ⚠️ TODO | Vietnamese prompts | MEDIUM |
| 696d98549fc2d8af78a5bb78 | P10 - Exposure Monitoring | 1 | 1 | ⚠️ TODO | Vietnamese prompts, depends on P8+P9 | LOW |

---

## Workflow Layer Structure

```
Layer 0 (Parallel execution - no dependencies):
├── P1 - Spot & Forward Pricing ✅ DONE
├── P2 - Cost Modeling Engine ⚠️ TODO
├── P5 - Market Regime & Macro ⚠️ TODO
├── P6 - Sentiment & Correlation ⚠️ TODO
├── P7 - Correlation Analysis ⚠️ TODO
├── P8 - Volatility & VaR ⚠️ TODO
└── P9 - Monte Carlo Simulation ⚠️ TODO

Layer 1 (Depends on Layer 0):
├── P3 - Discount Management (depends on P1, P2)
├── P4 - Margin Calculation (depends on P3)
└── P10 - Exposure Monitoring (depends on P8, P9)
```

---

## Detailed Issues Analysis

### P1 - Spot & Forward Pricing Module ✅
**Status**: DONE
**Deployment**: Kimi K2 (Thinking Model)
**Issues**: None
**Notes**:
- Successfully refactored with flat schema
- English prompts
- Examples added
- max_tokens: 4000 (appropriate for thinking model)
- Tested and verified output schema compliance

---

### P2 - Cost Modeling Engine ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Nested outputSchema: `itemized_costs` is an object (should be flat)
2. ❌ Vietnamese systemPrompt and userPromptTemplate
3. ❌ Missing inputSchema definition
4. ❌ No examples in schemas
5. ⚠️ max_tokens: 1500 (OK for standard model)

**Expected Input Fields** (from description):
- Refining fees from partner contracts (I1.8)
- Logistics costs based on route/timeline (I1.7)
- Currency conversion using FX rates (I1.3)

**Expected Output Fields** (flatten):
- `refining_fee_per_oz`: number
- `logistics_insurance_fee`: number
- `certification_cost`: number
- `total_operational_cost_per_oz`: number
- `currency`: string
- `data_integrity_score`: number
- `cost_logic`: string (explainability)
- `fx_rate_applied`: string (explainability)

---

### P3 - Discount Management (-5%) ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ No inputSchema definition
3. ❌ No examples in schemas
4. ❌ Vague userPromptTemplate placeholders: `{{p1_output}}`, `{{p2_output}}`
5. ⚠️ max_tokens: 1000 (OK for standard model)
6. ⚠️ dependencies: [0] - should reference specific step IDs?

**Dependencies**: P1 (base_forward_price), P2 (total_operational_cost)

**Expected Input Fields**:
- From P1: `base_forward_price`
- From P2: `total_operational_cost_per_oz`
- User input: (if any)

**Expected Output Fields**:
- `optimized_sale_price`: number
- `applied_discount_rate`: string (e.g., "-5%")
- `discount_value_abs`: number
- `pricing_status`: string (enum: "PASS", "FAIL")
- `data_integrity_verified`: boolean
- `explanation`: string

---

### P4 - Margin Calculation & Synthesis ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ Nested outputSchema: `pricing_summary`, `governance_explainability`
3. ❌ No inputSchema definition
4. ❌ No examples
5. ❌ Vague userPromptTemplate: `{{p1_output}}`, `{{p2_output}}`, `{{p3_output}}`
6. ⚠️ max_tokens: 1500 (OK for standard model)
7. ⚠️ dependencies: [1] - unclear reference

**Dependencies**: P1 (base_forward_price), P2 (total_operational_cost), P3 (optimized_sale_price)

**Expected Output Fields** (flatten):
- `optimal_sale_price`: number
- `gross_margin`: number
- `net_margin_percentage`: string
- `profitability_probability`: number
- `governance_logic`: string
- `compliance_check`: string

---

### P5 - Market Regime & Macro Processing ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ Nested outputSchema: `explainability` object
3. ❌ No inputSchema definition
4. ❌ No examples
5. ⚠️ max_tokens: 1200 (OK)

**Expected Input Fields**:
- Interest rates (I1.5)
- CPI data (I1.5)
- Monetary policy (I1.5)
- Gold volatility index GVZ (I1.4)

**Expected Output Fields** (flatten):
- `market_regime`: string (enum: "Risk-on", "Risk-off", "Stress")
- `macro_signal_score`: number
- `hedge_aggressiveness_modifier`: number
- `explainability_summary`: string
- `explainability_logic_trace`: string

---

### P6 - Sentiment & Correlation Analysis ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ Nested outputSchema: `explainability` object
3. ❌ No inputSchema definition
4. ❌ No examples
5. ⚠️ max_tokens: 1200 (OK)

**Expected Input Fields**:
- News articles (I1.6)
- Geopolitical events (I1.6)

**Expected Output Fields** (flatten):
- `sentiment_score`: number
- `tail_risk_alert`: string
- `hedge_aggressiveness_modifier`: number
- `event_impact_category`: string
- `explainability_reasoning`: string
- `explainability_data_source_trace`: string

---

### P7 - Correlation Analysis ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ Nested outputSchema: `correlation_analysis`, `explainability`
3. ❌ No inputSchema definition
4. ❌ No examples
5. ⚠️ max_tokens: 1200 (OK)

**Expected Input Fields**:
- Gold prices (I1.1)
- USD strength (I1.3)
- Interest rates (I1.5)
- Geopolitical events (I1.6)

**Expected Output Fields** (flatten):
- `correlation_gold_usd`: number
- `correlation_gold_rates`: number
- `correlation_gold_geopolitics`: number
- `trade_timing_signal`: string
- `hedge_aggressiveness_modifier`: number
- `explainability_logic_summary`: string
- `explainability_data_trace`: string

---

### P8 - Volatility & VaR Analysis ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ No inputSchema definition
3. ❌ No examples
4. ⚠️ max_tokens: 1200 (OK)
5. ⚠️ maxRetries: 3 (higher than others)

**Expected Input Fields**:
- Historical price data
- Volatility metrics (I1.4)

**Expected Output Fields**:
- `volatility_forecast`: string
- `var_99_percent`: number
- `cvar_expected_shortfall`: number
- `risk_signal`: string
- `explainability`: string

---

### P9 - Monte Carlo Simulation ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ No inputSchema definition
3. ❌ No examples
4. ⚠️ max_tokens: 1500 (OK)

**Expected Input Fields**:
- Price volatility data
- Delivery period duration
- Historical price paths

**Expected Output Fields**:
- `simulated_price_paths`: number (integer - number of paths)
- `probability_of_margin_call`: number
- `worst_case_scenario_price`: number
- `hedge_stability_score`: number
- `explainability`: string

---

### P10 - Exposure Monitoring & Kill-Switch ⚠️
**Status**: TODO
**Deployment**: GPT-4 Turbo (694970b17770c21561e515bf)
**Current Issues**:
1. ❌ Vietnamese systemPrompt and userPromptTemplate
2. ❌ No inputSchema definition
3. ❌ No examples
4. ❌ Vague userPromptTemplate: `{{p8_output}}`, `{{p9_output}}`
5. ⚠️ max_tokens: 1200 (OK)
6. ⚠️ maxRetries: 3 (higher)
7. ⚠️ dependencies: [0] - unclear reference

**Dependencies**: P8 (VaR data), P9 (Monte Carlo results)

**Expected Output Fields**:
- `delta_exposure`: number
- `gamma_exposure`: number
- `kill_switch_status`: string (enum: "ACTIVE", "INACTIVE", "TRIGGERED")
- `hedge_aggressiveness_modifier`: number
- `emergency_action`: string
- `explainability`: string

---

## Refactor Execution Strategy

### Phase 1: Critical Path (Layer 0 → Layer 1 Dependencies)
**Priority**: HIGH
**Reason**: These steps form the core pricing pipeline

1. ✅ **P1 - Spot & Forward Pricing** (DONE)
2. **P2 - Cost Modeling Engine** (Layer 0)
3. **P3 - Discount Management** (Layer 1, depends on P1+P2)
4. **P4 - Margin Calculation** (Layer 1, depends on P3)

**Estimated effort**: 4-6 hours

### Phase 2: Market Intelligence (Layer 0 Independent)
**Priority**: MEDIUM
**Reason**: These provide market context but don't block pricing

5. **P5 - Market Regime & Macro**
6. **P6 - Sentiment Analysis**
7. **P7 - Correlation Analysis**

**Estimated effort**: 3-4 hours

### Phase 3: Risk Management (Layer 0 + Layer 1)
**Priority**: MEDIUM-LOW
**Reason**: Risk monitoring is important but downstream

8. **P8 - Volatility & VaR**
9. **P9 - Monte Carlo Simulation**
10. **P10 - Exposure Monitoring** (depends on P8+P9)

**Estimated effort**: 3-4 hours

---

## Refactor Checklist Template

For each step, ensure:

### ✅ Schema Refactoring
- [ ] Flatten all nested objects in inputSchema
- [ ] Flatten all nested objects in outputSchema
- [ ] All field names use snake_case
- [ ] Add `description` for every field (English)
- [ ] Add `examples` at schema level
- [ ] Add `examples` at field level
- [ ] Define `enum` for constrained values
- [ ] Mark all `required` fields

### ✅ Prompt Refactoring
- [ ] Translate systemPrompt to English
- [ ] Translate userPromptTemplate to English
- [ ] Update Handlebars variables to match flat schema
- [ ] Add clear instructions and constraints
- [ ] Specify expected output format

### ✅ Prompt-Schema Alignment (CRITICAL!)
- [ ] **Review systemPrompt understanding of input schema**:
  - [ ] Verify systemPrompt correctly describes all input fields after flattening
  - [ ] Check that business logic accounts for new flat field names
  - [ ] Ensure no references to old nested field paths
- [ ] **Review systemPrompt understanding of output schema**:
  - [ ] Verify systemPrompt instructs LLM to generate all required output fields
  - [ ] Check that output field descriptions match flattened schema
  - [ ] Ensure LLM understands the exact JSON structure to produce
- [ ] **Review userPromptTemplate data flow**:
  - [ ] Verify all Handlebars variables reference correct flat fields
  - [ ] Check that examples in prompt match schema examples
  - [ ] Ensure prompt clearly shows how to map inputs → outputs
- [ ] **Validate constraints consistency**:
  - [ ] Business rules in systemPrompt align with schema constraints (enums, ranges, required fields)
  - [ ] Error handling logic matches schema validation requirements
  - [ ] Output format instructions explicitly mention flat structure (no nested objects)

### ✅ LLM Parameters
- [ ] Verify temperature is appropriate for task
- [ ] Check max_tokens:
  - [ ] Standard models: 500-2000
  - [ ] Thinking models (Kimi K2): 4000-8000
- [ ] Verify timeout is sufficient
- [ ] Verify deploymentId is correct and active

### ✅ Dependencies
- [ ] Verify dependencies array is correct
- [ ] Check that dependent steps output required fields
- [ ] Update userPromptTemplate to reference specific fields

### ✅ Testing
- [ ] Test step individually using API endpoint
- [ ] Verify output matches outputSchema
- [ ] Check that dependent steps can consume output
- [ ] Validate with real/sample data

---

## Next Steps

1. **Start with Phase 1**: Focus on P2 → P3 → P4 (critical pricing path)
2. **For each step**:
   - Create detailed input/output schema design
   - Translate prompts to English
   - Flatten nested structures
   - Add examples
   - Test individually
3. **Validate dependencies**: Ensure Layer 1 steps can properly consume Layer 0 outputs
4. **Document**: Update this plan as we progress

---

## Notes

### Thinking Models (Kimi K2) Configuration
- P1 uses Kimi K2 (deployment: 696df12f086778fa3069129a)
- **IMPORTANT**: max_tokens must be 4000-8000 for thinking models
- Thinking models generate internal reasoning (500-2000 tokens) + final output
- System automatically handles `reasoning_content` field extraction

### Standard Models (GPT-4 Turbo)
- Most steps use GPT-4 Turbo (deployment: 694970b17770c21561e515bf)
- max_tokens: 1000-2000 is usually sufficient
- No special handling needed

### Vietnamese → English Translation
- All systemPrompt must be translated
- All userPromptTemplate must be translated
- Maintain technical accuracy and business logic
- Keep specific financial terminology in English (e.g., "Contango", "Backwardation", "VaR", "CVaR")

### Prompt-Schema Alignment Quality Assurance
**Why this matters**:
- After flattening nested objects, field names change significantly
- Example: `market_data.lbma_spot_price` → `lbma_spot_price`
- Example: `itemized_costs.refining_fee_per_oz` → `refining_fee_per_oz`
- LLM must understand the new flat structure to generate correct output

**Common pitfalls to avoid**:
1. ❌ SystemPrompt still describes nested structure after schema is flattened
2. ❌ SystemPrompt instructs LLM to output nested JSON when schema expects flat
3. ❌ UserPromptTemplate uses old nested variable names (e.g., `{{data.field}}` instead of `{{field}}`)
4. ❌ Business logic in prompt contradicts schema constraints (e.g., prompt says "optional" but schema has it in `required`)
5. ❌ Output field descriptions in systemPrompt don't match actual outputSchema field names

**Best practices**:
1. ✅ After flattening schema, rewrite systemPrompt from scratch to describe flat structure
2. ✅ Explicitly instruct LLM: "Output must be flat JSON with no nested objects"
3. ✅ List all output fields by name in systemPrompt to ensure LLM knows what to generate
4. ✅ Include example output structure in systemPrompt when complex
5. ✅ Test with real data to verify LLM actually produces schema-compliant output

---

---

## Quality Gates

Before marking any step as "DONE", it must pass these quality gates:

### Gate 1: Schema Compliance
- [ ] All schemas are 100% flat (no nested objects)
- [ ] All field names use snake_case
- [ ] All fields have English descriptions
- [ ] Examples provided at both schema and field levels
- [ ] All enums are defined for constrained values

### Gate 2: Prompt-Schema Alignment
- [ ] SystemPrompt describes flat schema structure correctly
- [ ] SystemPrompt lists all output fields that must be generated
- [ ] SystemPrompt explicitly instructs: "Generate flat JSON, no nested objects"
- [ ] UserPromptTemplate uses correct flat field names in Handlebars
- [ ] No references to old nested field paths anywhere in prompts

### Gate 3: Translation Quality
- [ ] All Vietnamese text translated to English
- [ ] Technical terminology preserved correctly
- [ ] Business logic maintained accurately
- [ ] No loss of specificity or constraints

### Gate 4: Testing & Validation
- [ ] Step tested individually with sample input
- [ ] Output validates against outputSchema
- [ ] Output is actually flat (no nested objects in real response)
- [ ] All required fields are present in output
- [ ] Field types match schema definitions

### Gate 5: Dependencies
- [ ] Dependent steps can consume this step's output
- [ ] No breaking changes to existing workflows
- [ ] Data flow is correct end-to-end

**Only after passing all 5 gates can a step be marked as ✅ DONE**

---

**Last Updated**: 2026-01-20
**Updated By**: Claude Code Assistant
**Status**: Ready for Phase 1 execution
