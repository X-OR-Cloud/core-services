# Workflow Design Guide for LLM Assistants

## Overview

This guide helps LLM assistants design effective workflows and workflow steps from business requirements. Workflows orchestrate multi-step LLM pipelines where each step processes data and passes results to dependent steps.

---

## Core Concepts

### 1. Workflow
A reusable template that defines a multi-step process. Each workflow contains:
- **Name**: Descriptive workflow name (e.g., "Content Generation Pipeline")
- **Description**: Purpose and use case
- **Version**: Semantic versioning (v1.0, v2.0)
- **Status**: `draft`, `active`, or `archived`
- **Execution Mode**: `internal` (default, orchestrated by AIWM)

### 2. Workflow Step
Individual processing unit within a workflow. Each step:
- **Executes an LLM call** with specific prompts and parameters
- **Receives input** from user (layer 0) or previous steps
- **Produces output** consumed by dependent steps
- **Has dependencies** defining execution order (directed acyclic graph)

### 3. Execution Layers
Steps are organized into layers based on dependencies:
- **Layer 0**: Steps with no dependencies (parallel execution, require user input)
- **Layer 1**: Steps depending only on layer 0
- **Layer N**: Steps depending on previous layers
- **Execution Order**: By `orderIndex` and `dependencies` array

---

## Schema Design Principles

### ✅ GOOD: Flat Schema Design

**Input/Output schemas MUST be as flat as possible**. Avoid nested objects.

```json
// ✅ GOOD - Flat structure
{
  "type": "object",
  "properties": {
    "topic": { "type": "string" },
    "target_audience": { "type": "string" },
    "tone": { "type": "string", "enum": ["professional", "casual"] },
    "word_count": { "type": "number", "minimum": 100, "maximum": 5000 }
  },
  "required": ["topic"]
}

// ✅ GOOD - Flat output for market data
{
  "type": "object",
  "properties": {
    "gold_price_usd": { "type": "number" },
    "gold_price_vnd": { "type": "number" },
    "silver_price_usd": { "type": "number" },
    "price_change_percent": { "type": "number" },
    "timestamp": { "type": "string" },
    "source": { "type": "string" }
  }
}
```

### ❌ BAD: Nested Schema Design

```json
// ❌ BAD - Nested structure (avoid this!)
{
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "properties": {
        "topic": { "type": "string" },
        "settings": {
          "type": "object",
          "properties": {
            "tone": { "type": "string" },
            "length": { "type": "number" }
          }
        }
      }
    }
  }
}

// ❌ BAD - Complex nested output (avoid this!)
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "prices": {
          "type": "object",
          "properties": {
            "gold": { "type": "number" },
            "silver": { "type": "number" }
          }
        }
      }
    }
  }
}
```

**Why flat schemas?**
- Easier for LLMs to understand and generate
- Simpler validation and error messages
- Better for analytics and reporting queries
- Reduced complexity in prompt templates
- Easier to reference fields in dependent steps

---

## Step Design Patterns

### Pattern 1: Data Extraction (Layer 0)

Extract structured data from external sources or user input.

```typescript
{
  name: "Extract Market Data",
  orderIndex: 0,
  dependencies: [],
  llmConfig: {
    deploymentId: "gpt4-turbo",
    systemPrompt: "You are a data extraction specialist. Extract structured market data from the provided source.",
    userPromptTemplate: "Extract current prices for: {{commodities}}. Source: {{data_source}}",
    parameters: {
      temperature: 0.1,  // Low temperature for factual extraction
      max_tokens: 500
    }
  },
  inputSchema: {
    type: "object",
    properties: {
      commodities: { type: "string", description: "Comma-separated list of commodities" },
      data_source: { type: "string", description: "URL or text containing price data" }
    },
    required: ["commodities", "data_source"]
  },
  outputSchema: {
    type: "object",
    properties: {
      gold_price_usd: { type: "number" },
      silver_price_usd: { type: "number" },
      extraction_timestamp: { type: "string" }
    }
  }
}
```

### Pattern 2: Content Generation (Depends on Layer 0)

Generate content based on extracted data or user input.

```typescript
{
  name: "Generate Article",
  orderIndex: 1,
  dependencies: [0],  // Depends on step at orderIndex 0
  llmConfig: {
    deploymentId: "gpt4-turbo",
    systemPrompt: "You are a professional content writer. Create engaging, well-structured articles.",
    userPromptTemplate: `Write an article about {{topic}}.

Audience: {{target_audience}}
Tone: {{tone}}
Word count: {{word_count}}

Use this data for facts: {{previous_step_output}}`,
    parameters: {
      temperature: 0.7,  // Higher temperature for creative content
      max_tokens: 2000
    }
  },
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string" },
      target_audience: { type: "string" },
      tone: { type: "string", enum: ["professional", "casual", "technical"] },
      word_count: { type: "number", minimum: 300, maximum: 2000 }
    },
    required: ["topic"]
  },
  outputSchema: {
    type: "object",
    properties: {
      article_title: { type: "string" },
      article_body: { type: "string" },
      word_count: { type: "number" },
      key_points: { type: "string" }  // Comma-separated string, not array
    }
  }
}
```

### Pattern 3: Review & Enhancement (Depends on Previous Step)

Review and improve output from previous steps.

```typescript
{
  name: "Review and Enhance",
  orderIndex: 2,
  dependencies: [1],  // Depends on content generation step
  llmConfig: {
    deploymentId: "gpt4-turbo",
    systemPrompt: "You are an editor. Review content for quality, accuracy, and engagement.",
    userPromptTemplate: `Review and enhance this article:

Title: {{article_title}}
Content: {{article_body}}

Improve clarity, fix errors, and enhance readability.`,
    parameters: {
      temperature: 0.5,
      max_tokens: 2500
    }
  },
  inputSchema: {
    type: "object",
    properties: {
      article_title: { type: "string" },
      article_body: { type: "string" }
    },
    required: ["article_body"]
  },
  outputSchema: {
    type: "object",
    properties: {
      final_title: { type: "string" },
      final_body: { type: "string" },
      changes_made: { type: "string" },
      quality_score: { type: "number", minimum: 0, maximum: 10 }
    }
  }
}
```

### Pattern 4: Parallel Processing (Multiple Layer 0 Steps)

Execute independent tasks in parallel.

```typescript
// Step 1: Market Data Extraction
{
  name: "Extract Gold Prices",
  orderIndex: 0,
  dependencies: [],
  llmConfig: { /* ... */ },
  inputSchema: {
    type: "object",
    properties: {
      data_source: { type: "string" }
    }
  },
  outputSchema: {
    type: "object",
    properties: {
      gold_price_usd: { type: "number" },
      gold_price_vnd: { type: "number" }
    }
  }
}

// Step 2: News Summarization (parallel to Step 1)
{
  name: "Summarize News",
  orderIndex: 0,  // Same orderIndex = parallel execution
  dependencies: [],
  llmConfig: { /* ... */ },
  inputSchema: {
    type: "object",
    properties: {
      news_articles: { type: "string" }
    }
  },
  outputSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] }
    }
  }
}

// Step 3: Combine Results (depends on both parallel steps)
{
  name: "Generate Report",
  orderIndex: 1,
  dependencies: [0, 0],  // Depends on both steps at orderIndex 0
  llmConfig: {
    systemPrompt: "Combine market data and news sentiment into a comprehensive report.",
    userPromptTemplate: `Market Data:
Gold (USD): {{gold_price_usd}}
Gold (VND): {{gold_price_vnd}}

News Summary: {{summary}}
Sentiment: {{sentiment}}

Create a market report.`
  }
}
```

---

## Prompt Template Guidelines

### Using Handlebars Syntax

Prompts use Handlebars syntax to reference input fields and previous step outputs:

```handlebars
{{field_name}}           - Direct field reference
{{previous_output}}      - Output from previous step (auto-mapped)
```

### Best Practices

1. **Be Specific**: Clearly define expected output format
2. **Provide Context**: Include relevant data from previous steps
3. **Set Constraints**: Word count, tone, format requirements
4. **Use Examples**: Show desired output structure when helpful

```handlebars
✅ GOOD:
Write a {{tone}} article about {{topic}}.
Target audience: {{audience}}
Word count: exactly {{word_count}} words
Format: Introduction, 3 main points, conclusion

❌ BAD:
Write something about {{topic}}.
```

---

## LLM Parameter Guidelines

### Temperature Settings

- **0.0 - 0.2**: Factual extraction, data processing, structured output
- **0.3 - 0.5**: Technical writing, editing, reviewing
- **0.6 - 0.8**: Creative content, marketing copy, storytelling
- **0.9 - 1.0**: Highly creative tasks, brainstorming

### Max Tokens

- **100-500**: Short summaries, data extraction
- **500-1000**: Standard articles, reports
- **1000-2000**: Long-form content
- **2000-4000**: Comprehensive documents

### Top P

- Default: **1.0** (full diversity)
- Use **0.9** for more focused outputs
- Use **0.95** for balanced creativity/consistency

---

## Complete Workflow Example

### Use Case: Gold Market Analysis Workflow

**Business Requirement:**
"Generate daily gold market reports combining current prices with market sentiment analysis from news."

**Workflow Design:**

```typescript
// Workflow
{
  name: "Daily Gold Market Report",
  description: "Automated workflow to generate comprehensive gold market analysis",
  version: "v1.0",
  status: "active",
  executionMode: "internal"
}

// Step 1: Extract Gold Prices (Layer 0)
{
  name: "Extract Gold Prices",
  orderIndex: 0,
  dependencies: [],
  type: "llm",
  llmConfig: {
    deploymentId: "gpt4-turbo",
    systemPrompt: "Extract current gold prices from the provided market data. Return only numerical values.",
    userPromptTemplate: "Extract gold prices (USD and VND) from: {{market_data_source}}",
    parameters: {
      temperature: 0.1,
      max_tokens: 300
    }
  },
  inputSchema: {
    type: "object",
    properties: {
      market_data_source: {
        type: "string",
        description: "URL or text containing gold price information"
      }
    },
    required: ["market_data_source"]
  },
  outputSchema: {
    type: "object",
    properties: {
      gold_spot_usd: { type: "number", description: "Gold spot price in USD per ounce" },
      gold_spot_vnd: { type: "number", description: "Gold price in VND per tael" },
      price_change_percent: { type: "number" },
      extraction_time: { type: "string" }
    }
  }
}

// Step 2: Analyze Market News (Layer 0 - parallel)
{
  name: "Analyze Market Sentiment",
  orderIndex: 0,
  dependencies: [],
  type: "llm",
  llmConfig: {
    deploymentId: "gpt4-turbo",
    systemPrompt: "Analyze gold market news and provide sentiment analysis. Be objective and fact-based.",
    userPromptTemplate: "Analyze these news articles about gold market: {{news_articles}}. Provide sentiment and key factors.",
    parameters: {
      temperature: 0.3,
      max_tokens: 500
    }
  },
  inputSchema: {
    type: "object",
    properties: {
      news_articles: {
        type: "string",
        description: "News articles text (combined)"
      }
    },
    required: ["news_articles"]
  },
  outputSchema: {
    type: "object",
    properties: {
      overall_sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
      confidence_level: { type: "number", minimum: 0, maximum: 1 },
      key_factors: { type: "string", description: "Comma-separated factors affecting price" },
      summary: { type: "string", description: "Brief market summary" }
    }
  }
}

// Step 3: Generate Comprehensive Report (Layer 1)
{
  name: "Generate Market Report",
  orderIndex: 1,
  dependencies: [0, 0],  // Depends on both layer 0 steps
  type: "llm",
  llmConfig: {
    deploymentId: "gpt4-turbo",
    systemPrompt: "You are a financial analyst. Create clear, actionable gold market reports for investors.",
    userPromptTemplate: `Generate a gold market report using this data:

CURRENT PRICES:
- Spot Gold (USD): ${{gold_spot_usd}}/oz
- Gold (VND): {{gold_spot_vnd}} VND/tael
- Price Change: {{price_change_percent}}%

MARKET SENTIMENT:
- Overall: {{overall_sentiment}}
- Confidence: {{confidence_level}}
- Key Factors: {{key_factors}}
- Summary: {{summary}}

Report Format:
1. Executive Summary
2. Current Market Snapshot
3. Sentiment Analysis
4. Price Outlook
5. Key Takeaways

Target audience: Retail investors
Tone: Professional but accessible
Length: 300-500 words`,
    parameters: {
      temperature: 0.6,
      max_tokens: 1500
    }
  },
  inputSchema: {
    type: "object",
    properties: {
      gold_spot_usd: { type: "number" },
      gold_spot_vnd: { type: "number" },
      price_change_percent: { type: "number" },
      overall_sentiment: { type: "string" },
      confidence_level: { type: "number" },
      key_factors: { type: "string" },
      summary: { type: "string" }
    },
    required: ["gold_spot_usd", "overall_sentiment"]
  },
  outputSchema: {
    type: "object",
    properties: {
      report_title: { type: "string" },
      report_body: { type: "string" },
      executive_summary: { type: "string" },
      price_outlook: { type: "string", enum: ["positive", "negative", "stable"] },
      recommendation: { type: "string" },
      word_count: { type: "number" }
    }
  }
}
```

---

## Workflow Execution

### Input Format

When executing workflows, layer 0 steps require input keyed by stepId:

```json
{
  "input": {
    "<stepId1>": {
      "market_data_source": "https://example.com/gold-prices"
    },
    "<stepId2>": {
      "news_articles": "Article 1 text... Article 2 text..."
    }
  },
  "sync": false
}
```

### Execution Modes

- **Async (default)**: Returns `executionId` immediately, executes in background queue
- **Sync**: Waits for completion, returns final output

### Output Structure

```json
{
  "executionId": "696dd54bd22de143969dec4b",
  "status": "completed",
  "message": "Workflow execution completed successfully",
  "output": {
    "report_title": "Gold Market Update: Prices Surge Amid...",
    "report_body": "...",
    "executive_summary": "...",
    "price_outlook": "positive"
  }
}
```

---

## Design Checklist

When designing workflows, ensure:

### ✅ Schema Design
- [ ] All schemas are **flat** (no nested objects)
- [ ] Use snake_case for field names
- [ ] Required fields are clearly marked
- [ ] Enum values for constrained fields
- [ ] Descriptions provided for clarity

### ✅ Step Dependencies
- [ ] Dependencies form a valid DAG (no cycles)
- [ ] `orderIndex` matches dependency layers
- [ ] Layer 0 steps have no dependencies
- [ ] Each step's input matches previous outputs

### ✅ Prompt Design
- [ ] Handlebars variables match inputSchema fields
- [ ] Clear instructions and constraints
- [ ] Appropriate tone and format specified
- [ ] Examples included when helpful

### ✅ LLM Configuration
- [ ] Temperature appropriate for task type
- [ ] max_tokens sufficient for expected output
- [ ] deploymentId exists and is active

### ✅ Validation
- [ ] Input schemas validate user input
- [ ] Output schemas match prompt expectations
- [ ] Error handling considered
- [ ] Edge cases documented

---

## Anti-Patterns to Avoid

### ❌ Deep Nesting
```json
// Don't do this
{
  "data": {
    "result": {
      "prices": {
        "gold": 2650
      }
    }
  }
}
```

### ❌ Arrays for Simple Lists
```json
// Instead of array
{ "tags": ["finance", "gold", "market"] }

// Use comma-separated string
{ "tags": "finance, gold, market" }
```

### ❌ Circular Dependencies
```typescript
// Don't do this
Step A depends on Step B
Step B depends on Step A
```

### ❌ Vague Prompts
```handlebars
// Bad
Write about {{topic}}.

// Good
Write a professional 500-word article about {{topic}} for {{audience}}.
Include: introduction, 3 key points, conclusion.
```

---

## API Endpoints Reference

### Get Workflow Input Schema
```bash
GET /executions/workflows/:workflowId/input-schema
```

Returns metadata about required inputs for UI rendering.

### Execute Workflow
```bash
POST /executions/workflows/:workflowId/execute
Content-Type: application/json

{
  "input": { "<stepId>": { "field": "value" } },
  "sync": false
}
```

### Test Single Step
```bash
POST /executions/workflows/:workflowId/steps/:stepId/test
Content-Type: application/json

{
  "input": { "field": "value" }
}
```

### Get Execution Status
```bash
GET /executions/:executionId/status
```

---

## Summary

**Key Principles:**
1. **Flat schemas** - No nested objects
2. **Clear dependencies** - DAG structure with layers
3. **Specific prompts** - Detailed instructions and constraints
4. **Appropriate LLM params** - Temperature/tokens match task
5. **Validation** - Input/output schemas ensure data quality

**Workflow Design Process:**
1. Understand business requirement
2. Identify independent tasks (layer 0)
3. Map dependencies between tasks
4. Design flat input/output schemas
5. Write specific prompts with constraints
6. Configure LLM parameters
7. Test individual steps
8. Execute full workflow

This approach ensures maintainable, efficient, and reliable multi-step LLM pipelines.
