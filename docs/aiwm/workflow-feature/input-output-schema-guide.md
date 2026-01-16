# Input/Output Schema Guide for Frontend

**Version**: 1.0
**Date**: 2026-01-14
**Status**: Production Ready
**Audience**: Frontend Developers

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [JSON Schema Basics](#json-schema-basics)
3. [Complete Sample Schema](#complete-sample-schema)
4. [Frontend Component Mapping](#frontend-component-mapping)
5. [Validation Rules](#validation-rules)
6. [Real-World Examples](#real-world-examples)
7. [Implementation Guide](#implementation-guide)
8. [Best Practices](#best-practices)

---

## 1. Overview

### Purpose

This document provides comprehensive guidance for frontend developers to build dynamic input components based on `inputSchema` and `outputSchema` defined in WorkflowStep configurations.

### Schema Format

Both `inputSchema` and `outputSchema` use **JSON Schema (Draft 7)** specification:

```typescript
// WorkflowStep schema reference (see workflow-mvp-design.md)
{
  inputSchema?: Record<string, any>;   // JSON Schema for step input validation
  outputSchema?: Record<string, any>;  // JSON Schema for step output validation
}
```

### Key Characteristics

- **Standard-based**: Uses JSON Schema Draft 7 specification
- **Self-documenting**: Schema includes titles, descriptions, and examples
- **Validation-ready**: Built-in validation rules for frontend forms
- **Type-safe**: Strongly typed data structures
- **Extensible**: Supports complex nested objects and arrays

---

## 2. JSON Schema Basics

### Core Properties

Every schema property can include:

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `type` | string | Data type | `"string"`, `"number"`, `"boolean"`, `"object"`, `"array"` |
| `title` | string | Human-readable label | `"Email Address"` |
| `description` | string | Help text / tooltip | `"Enter your work email"` |
| `default` | any | Default value | `""`, `0`, `false`, `[]` |
| `examples` | array | Example values | `["user@example.com"]` |

### Required Fields

```json
{
  "type": "object",
  "properties": {
    "username": { "type": "string" },
    "email": { "type": "string" }
  },
  "required": ["username", "email"]  // Mark fields as required
}
```

### Additional Properties

```json
{
  "type": "object",
  "additionalProperties": false  // Strict mode: only defined properties allowed
}
```

---

## 3. Complete Sample Schema

### Full Input Schema Example

```json
{
  "inputSchema": {
    "type": "object",
    "title": "Step Input Schema",
    "description": "Complete sample covering all data types for frontend input component",
    "properties": {
      "textInput": {
        "type": "string",
        "title": "Text Input",
        "description": "Simple text field",
        "minLength": 1,
        "maxLength": 500,
        "default": "",
        "examples": ["Enter your text here"]
      },
      "longText": {
        "type": "string",
        "title": "Long Text / Textarea",
        "description": "Multi-line text input",
        "minLength": 10,
        "maxLength": 5000,
        "format": "textarea",
        "examples": ["This is a long text that spans\nmultiple lines\nfor detailed content"]
      },
      "email": {
        "type": "string",
        "title": "Email Address",
        "format": "email",
        "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        "examples": ["user@example.com"]
      },
      "url": {
        "type": "string",
        "title": "URL",
        "format": "uri",
        "pattern": "^https?://",
        "examples": ["https://example.com"]
      },
      "numberInteger": {
        "type": "integer",
        "title": "Integer Number",
        "description": "Whole number only",
        "minimum": 0,
        "maximum": 100,
        "default": 10,
        "examples": [42]
      },
      "numberFloat": {
        "type": "number",
        "title": "Float Number",
        "description": "Decimal number",
        "minimum": 0.0,
        "maximum": 1.0,
        "multipleOf": 0.1,
        "default": 0.5,
        "examples": [0.7, 0.95]
      },
      "temperature": {
        "type": "number",
        "title": "LLM Temperature",
        "description": "Controls randomness (0.0 = deterministic, 2.0 = very random)",
        "minimum": 0.0,
        "maximum": 2.0,
        "default": 0.7,
        "examples": [0.3, 0.7, 1.0]
      },
      "booleanFlag": {
        "type": "boolean",
        "title": "Boolean Toggle",
        "description": "True/false flag",
        "default": false,
        "examples": [true, false]
      },
      "enumSelect": {
        "type": "string",
        "title": "Single Select Dropdown",
        "description": "Select one option from predefined list",
        "enum": ["option1", "option2", "option3"],
        "default": "option1",
        "examples": ["option2"]
      },
      "enumMultiple": {
        "type": "array",
        "title": "Multi-Select Dropdown",
        "description": "Select multiple options",
        "items": {
          "type": "string",
          "enum": ["tag1", "tag2", "tag3", "tag4"]
        },
        "minItems": 1,
        "maxItems": 3,
        "uniqueItems": true,
        "default": ["tag1"],
        "examples": [["tag1", "tag2"]]
      },
      "stringArray": {
        "type": "array",
        "title": "List of Strings",
        "description": "Array of text values",
        "items": {
          "type": "string",
          "minLength": 1
        },
        "minItems": 1,
        "maxItems": 10,
        "uniqueItems": false,
        "default": [],
        "examples": [["item1", "item2", "item3"]]
      },
      "numberArray": {
        "type": "array",
        "title": "List of Numbers",
        "description": "Array of numeric values",
        "items": {
          "type": "number",
          "minimum": 0
        },
        "minItems": 1,
        "default": [],
        "examples": [[1, 2, 3, 4, 5]]
      },
      "nestedObject": {
        "type": "object",
        "title": "Nested Object",
        "description": "Object with nested properties",
        "properties": {
          "name": {
            "type": "string",
            "title": "Name",
            "minLength": 1
          },
          "age": {
            "type": "integer",
            "title": "Age",
            "minimum": 0,
            "maximum": 150
          },
          "active": {
            "type": "boolean",
            "title": "Is Active",
            "default": true
          }
        },
        "required": ["name"],
        "additionalProperties": false,
        "examples": [
          {
            "name": "John Doe",
            "age": 30,
            "active": true
          }
        ]
      },
      "arrayOfObjects": {
        "type": "array",
        "title": "Array of Objects",
        "description": "List of structured objects",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "title": "ID"
            },
            "value": {
              "type": "number",
              "title": "Value"
            }
          },
          "required": ["id"]
        },
        "minItems": 0,
        "maxItems": 5,
        "default": [],
        "examples": [
          [
            { "id": "item1", "value": 100 },
            { "id": "item2", "value": 200 }
          ]
        ]
      },
      "jsonObject": {
        "type": "object",
        "title": "Free-form JSON Object",
        "description": "Any valid JSON object",
        "additionalProperties": true,
        "examples": [
          {
            "customKey1": "value1",
            "customKey2": 123,
            "customKey3": true
          }
        ]
      },
      "dateString": {
        "type": "string",
        "title": "Date (ISO 8601)",
        "format": "date",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
        "examples": ["2026-01-14"]
      },
      "dateTimeString": {
        "type": "string",
        "title": "DateTime (ISO 8601)",
        "format": "date-time",
        "examples": ["2026-01-14T10:30:00Z"]
      },
      "oneOfType": {
        "title": "One Of Type (Union)",
        "description": "Can be either string or number",
        "oneOf": [
          { "type": "string" },
          { "type": "number" }
        ],
        "examples": ["text", 123]
      },
      "anyOfType": {
        "title": "Any Of Type (Multiple Types)",
        "description": "Can match one or more types",
        "anyOf": [
          { "type": "string", "minLength": 1 },
          { "type": "integer", "minimum": 0 }
        ],
        "examples": ["text", 42]
      },
      "conditionalField": {
        "type": "object",
        "title": "Conditional Object",
        "description": "Fields change based on 'type' value",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["text", "number"]
          }
        },
        "required": ["type"],
        "if": {
          "properties": { "type": { "const": "text" } }
        },
        "then": {
          "properties": {
            "textValue": {
              "type": "string",
              "title": "Text Value"
            }
          },
          "required": ["textValue"]
        },
        "else": {
          "properties": {
            "numericValue": {
              "type": "number",
              "title": "Numeric Value"
            }
          },
          "required": ["numericValue"]
        },
        "examples": [
          { "type": "text", "textValue": "hello" },
          { "type": "number", "numericValue": 123 }
        ]
      }
    },
    "required": [
      "textInput",
      "numberInteger",
      "booleanFlag",
      "enumSelect"
    ],
    "additionalProperties": false
  }
}
```

### Full Output Schema Example

```json
{
  "outputSchema": {
    "type": "object",
    "title": "Step Output Schema",
    "description": "Expected output structure from LLM step",
    "properties": {
      "content": {
        "type": "string",
        "title": "Generated Content",
        "description": "Main text output from LLM",
        "minLength": 1,
        "examples": ["This is the generated content..."]
      },
      "outline": {
        "type": "array",
        "title": "Outline Sections",
        "description": "Structured outline as array of strings",
        "items": {
          "type": "string"
        },
        "examples": [
          ["Introduction", "Main Points", "Conclusion"]
        ]
      },
      "metadata": {
        "type": "object",
        "title": "Response Metadata",
        "properties": {
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence score"
          },
          "tokensUsed": {
            "type": "integer",
            "minimum": 0,
            "description": "Number of tokens used"
          },
          "modelVersion": {
            "type": "string",
            "description": "Model version used"
          }
        },
        "examples": [
          {
            "confidence": 0.95,
            "tokensUsed": 420,
            "modelVersion": "gpt-4.1-turbo"
          }
        ]
      },
      "structuredData": {
        "type": "object",
        "title": "Structured Output",
        "description": "Any structured data from LLM",
        "additionalProperties": true,
        "examples": [
          {
            "summary": "Brief summary",
            "keyPoints": ["point1", "point2"],
            "sentiment": "positive"
          }
        ]
      }
    },
    "required": ["content"],
    "additionalProperties": true
  }
}
```

---

## 4. Frontend Component Mapping

### Component Type Mapping Table

| JSON Schema Type | Schema Properties | Frontend Component | UI Library Example | Notes |
|-----------------|-------------------|-------------------|-------------------|-------|
| `type: "string"` | `minLength`, `maxLength` | `<input type="text">` | `<Input>` (Ant Design)<br/>`<TextField>` (MUI) | Single line text |
| `type: "string"` + `format: "textarea"` | - | `<textarea>` | `<TextArea>` (Ant Design)<br/>`<TextField multiline>` (MUI) | Multi-line text |
| `type: "string"` + `format: "email"` | `pattern` | `<input type="email">` | `<Input type="email">` | Email validation |
| `type: "string"` + `format: "uri"` | - | `<input type="url">` | `<Input type="url">` | URL validation |
| `type: "string"` + `enum: [...]` | - | `<select>` | `<Select>` (Ant Design)<br/>`<Select>` (MUI) | Dropdown single select |
| `type: "integer"` | `minimum`, `maximum` | `<input type="number" step="1">` | `<InputNumber>` (Ant Design) | Whole numbers only |
| `type: "number"` | `minimum`, `maximum`, `multipleOf` | `<input type="number">` | `<InputNumber>` (Ant Design)<br/>`<Slider>` (if range) | Decimals allowed |
| `type: "boolean"` | - | `<input type="checkbox">` | `<Switch>` (Ant Design)<br/>`<Checkbox>` (Ant Design) | Toggle true/false |
| `type: "array"` + `items.enum` | `uniqueItems`, `minItems`, `maxItems` | `<select multiple>` | `<Select mode="multiple">` (Ant Design)<br/>`<Checkbox.Group>` | Multi-select |
| `type: "array"` + `items.type: "string"` | - | Tag input / Dynamic list | `<Select mode="tags">` (Ant Design) | Dynamic string list |
| `type: "array"` + `items.type: "number"` | - | Array input with number validation | Custom component | Dynamic number list |
| `type: "object"` | `properties`, `required` | Nested form / Fieldset | `<Form.Item>` nested (Ant Design) | Group of fields |
| `type: "array"` + `items.type: "object"` | - | Dynamic form array | `<Form.List>` (Ant Design) | Add/remove object rows |
| `type: "object"` + `additionalProperties: true` | - | JSON editor | `<CodeEditor>` (Monaco Editor)<br/>`<Input.TextArea>` (JSON mode) | Free-form JSON editor |
| `type: "string"` + `format: "date"` | - | Date picker | `<DatePicker>` (Ant Design) | Date only |
| `type: "string"` + `format: "date-time"` | - | DateTime picker | `<DatePicker showTime>` (Ant Design) | Date + time |
| `oneOf: [...]` | - | Union type selector | Custom component with type switcher | Show different input based on selection |

### Component Implementation Examples

#### 1. Text Input

```tsx
// Schema
{
  "type": "string",
  "title": "Article Topic",
  "description": "Main topic for the article",
  "minLength": 5,
  "maxLength": 200
}

// React Component (Ant Design)
<Form.Item
  label="Article Topic"
  name="topic"
  tooltip="Main topic for the article"
  rules={[
    { required: true, message: 'Please input article topic' },
    { min: 5, message: 'Topic must be at least 5 characters' },
    { max: 200, message: 'Topic must not exceed 200 characters' }
  ]}
>
  <Input placeholder="Enter your topic" />
</Form.Item>
```

#### 2. Number Input with Slider

```tsx
// Schema
{
  "type": "number",
  "title": "Temperature",
  "minimum": 0.0,
  "maximum": 2.0,
  "default": 0.7
}

// React Component (Ant Design)
<Form.Item
  label="Temperature"
  name="temperature"
  initialValue={0.7}
  tooltip="Controls randomness (0.0 = deterministic, 2.0 = very random)"
>
  <Slider
    min={0}
    max={2}
    step={0.1}
    marks={{ 0: '0.0', 1: '1.0', 2: '2.0' }}
  />
</Form.Item>
```

#### 3. Enum Select (Single)

```tsx
// Schema
{
  "type": "string",
  "title": "Target Audience",
  "enum": ["general public", "professionals", "students", "executives"],
  "default": "general public"
}

// React Component (Ant Design)
<Form.Item
  label="Target Audience"
  name="audience"
  initialValue="general public"
>
  <Select>
    <Select.Option value="general public">General Public</Select.Option>
    <Select.Option value="professionals">Professionals</Select.Option>
    <Select.Option value="students">Students</Select.Option>
    <Select.Option value="executives">Executives</Select.Option>
  </Select>
</Form.Item>
```

#### 4. Enum Multi-Select

```tsx
// Schema
{
  "type": "array",
  "title": "Tags",
  "items": {
    "type": "string",
    "enum": ["AI", "Healthcare", "Technology", "Research"]
  },
  "minItems": 1,
  "maxItems": 3,
  "uniqueItems": true
}

// React Component (Ant Design)
<Form.Item
  label="Tags"
  name="tags"
  rules={[
    { required: true, message: 'Please select at least 1 tag' },
    { type: 'array', min: 1, max: 3, message: 'Select 1-3 tags' }
  ]}
>
  <Select mode="multiple" maxTagCount={3}>
    <Select.Option value="AI">AI</Select.Option>
    <Select.Option value="Healthcare">Healthcare</Select.Option>
    <Select.Option value="Technology">Technology</Select.Option>
    <Select.Option value="Research">Research</Select.Option>
  </Select>
</Form.Item>
```

#### 5. Nested Object

```tsx
// Schema
{
  "type": "object",
  "title": "Author Info",
  "properties": {
    "name": { "type": "string", "title": "Name" },
    "age": { "type": "integer", "title": "Age", "minimum": 0 },
    "active": { "type": "boolean", "title": "Is Active" }
  },
  "required": ["name"]
}

// React Component (Ant Design)
<Form.Item label="Author Info">
  <Input.Group>
    <Form.Item
      name={["author", "name"]}
      rules={[{ required: true, message: 'Name is required' }]}
    >
      <Input placeholder="Name" />
    </Form.Item>
    <Form.Item name={["author", "age"]}>
      <InputNumber placeholder="Age" min={0} />
    </Form.Item>
    <Form.Item name={["author", "active"]} valuePropName="checked">
      <Checkbox>Is Active</Checkbox>
    </Form.Item>
  </Input.Group>
</Form.Item>
```

#### 6. Array of Objects (Dynamic List)

```tsx
// Schema
{
  "type": "array",
  "title": "Sections",
  "items": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "content": { "type": "string" }
    }
  }
}

// React Component (Ant Design)
<Form.List name="sections">
  {(fields, { add, remove }) => (
    <>
      {fields.map(({ key, name, ...restField }) => (
        <Space key={key} style={{ display: 'flex', marginBottom: 8 }}>
          <Form.Item
            {...restField}
            name={[name, 'title']}
            rules={[{ required: true, message: 'Title required' }]}
          >
            <Input placeholder="Section Title" />
          </Form.Item>
          <Form.Item
            {...restField}
            name={[name, 'content']}
          >
            <Input.TextArea placeholder="Section Content" />
          </Form.Item>
          <MinusCircleOutlined onClick={() => remove(name)} />
        </Space>
      ))}
      <Form.Item>
        <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
          Add Section
        </Button>
      </Form.Item>
    </>
  )}
</Form.List>
```

#### 7. JSON Editor (Free-form Object)

```tsx
// Schema
{
  "type": "object",
  "title": "Custom Metadata",
  "additionalProperties": true
}

// React Component with Monaco Editor
import Editor from '@monaco-editor/react';

<Form.Item
  label="Custom Metadata"
  name="metadata"
  getValueFromEvent={(value) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }}
  getValueProps={(value) => ({
    value: JSON.stringify(value, null, 2)
  })}
>
  <Editor
    height="200px"
    language="json"
    theme="vs-dark"
    options={{
      minimap: { enabled: false },
      lineNumbers: 'on'
    }}
  />
</Form.Item>
```

---

## 5. Validation Rules

### Validation Rule Mapping

Frontend must implement these validation rules based on schema properties:

```typescript
// Validation mapping from JSON Schema to frontend validators
interface ValidationRules {
  // String validations
  minLength?: number;        // Min string length
  maxLength?: number;        // Max string length
  pattern?: string;          // RegExp pattern (e.g., email, URL)
  format?: string;           // Built-in formats: email, uri, date, date-time

  // Number validations
  minimum?: number;          // Min numeric value (inclusive)
  maximum?: number;          // Max numeric value (inclusive)
  exclusiveMinimum?: number; // Min numeric value (exclusive)
  exclusiveMaximum?: number; // Max numeric value (exclusive)
  multipleOf?: number;       // Number must be multiple of this value

  // Array validations
  minItems?: number;         // Min array length
  maxItems?: number;         // Max array length
  uniqueItems?: boolean;     // Array items must be unique

  // Object validations
  required?: string[];       // Required fields in object
  additionalProperties?: boolean;  // Allow extra fields not in schema

  // Enum validation
  enum?: any[];              // Allowed values (whitelist)
}
```

### Validation Implementation Examples

#### Ant Design Form Validation

```tsx
// Example: Complete validation for text input
<Form.Item
  name="email"
  label="Email Address"
  rules={[
    { required: true, message: 'Email is required' },
    { type: 'email', message: 'Please enter a valid email' },
    {
      pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      message: 'Invalid email format'
    }
  ]}
>
  <Input placeholder="user@example.com" />
</Form.Item>

// Example: Number range validation
<Form.Item
  name="temperature"
  label="Temperature"
  rules={[
    { required: true, message: 'Temperature is required' },
    { type: 'number', min: 0.0, max: 2.0, message: 'Temperature must be between 0.0 and 2.0' }
  ]}
>
  <InputNumber min={0} max={2} step={0.1} />
</Form.Item>

// Example: Array length validation
<Form.Item
  name="tags"
  label="Tags"
  rules={[
    { required: true, message: 'At least 1 tag is required' },
    { type: 'array', min: 1, max: 5, message: 'Select between 1 and 5 tags' }
  ]}
>
  <Select mode="multiple" />
</Form.Item>
```

#### Custom Validation Functions

```typescript
// Custom validator for complex rules
const validateStepInput = (schema: any, value: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Use a JSON Schema validator library (e.g., ajv)
    const Ajv = require('ajv');
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    const valid = validate(value);

    if (!valid) {
      const errors = validate.errors?.map(err => ({
        field: err.instancePath,
        message: err.message
      }));
      reject(errors);
    } else {
      resolve();
    }
  });
};

// Usage in form
<Form.Item
  name="complexInput"
  rules={[
    {
      validator: (_, value) => validateStepInput(inputSchema, value)
    }
  ]}
>
  <Input />
</Form.Item>
```

---

## 6. Real-World Examples

### Example 1: Content Generation Pipeline Step

#### Backend Schema Definition

```json
{
  "name": "Generate Article Outline",
  "orderIndex": 0,
  "type": "llm",
  "llmConfig": {
    "deploymentId": "gpt4-deployment-prod",
    "systemPrompt": "You are an expert content strategist. Generate a clear, structured article outline.",
    "userPromptTemplate": "Topic: {{topic}}\nTarget audience: {{audience}}\nTone: {{tone}}\nNumber of sections: {{sectionCount}}",
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 500
    }
  },
  "inputSchema": {
    "type": "object",
    "title": "Outline Generation Input",
    "properties": {
      "topic": {
        "type": "string",
        "title": "Article Topic",
        "description": "Main topic for the article",
        "minLength": 5,
        "maxLength": 200,
        "examples": ["Artificial Intelligence in Healthcare"]
      },
      "audience": {
        "type": "string",
        "title": "Target Audience",
        "description": "Who will read this article?",
        "enum": ["general public", "professionals", "students", "executives"],
        "default": "general public"
      },
      "tone": {
        "type": "string",
        "title": "Writing Tone",
        "description": "Tone of the article",
        "enum": ["formal", "casual", "technical", "friendly"],
        "default": "formal"
      },
      "sectionCount": {
        "type": "integer",
        "title": "Number of Sections",
        "description": "How many main sections should the outline have?",
        "minimum": 3,
        "maximum": 10,
        "default": 5
      }
    },
    "required": ["topic", "audience"]
  },
  "outputSchema": {
    "type": "object",
    "title": "Outline Generation Output",
    "properties": {
      "outline": {
        "type": "string",
        "title": "Full Outline Text",
        "description": "Complete outline as formatted text"
      },
      "sections": {
        "type": "array",
        "title": "Section Titles",
        "description": "Array of section titles extracted from outline",
        "items": {
          "type": "string"
        },
        "minItems": 3
      },
      "metadata": {
        "type": "object",
        "properties": {
          "tokensUsed": { "type": "integer" },
          "generatedAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "required": ["outline", "sections"]
  },
  "dependencies": []
}
```

#### Frontend Form Component

```tsx
import React from 'react';
import { Form, Input, Select, InputNumber, Button } from 'antd';

interface OutlineInputFormProps {
  onSubmit: (values: any) => void;
}

const OutlineInputForm: React.FC<OutlineInputFormProps> = ({ onSubmit }) => {
  const [form] = Form.useForm();

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onSubmit}
      initialValues={{
        audience: 'general public',
        tone: 'formal',
        sectionCount: 5
      }}
    >
      <Form.Item
        label="Article Topic"
        name="topic"
        tooltip="Main topic for the article"
        rules={[
          { required: true, message: 'Please input article topic' },
          { min: 5, message: 'Topic must be at least 5 characters' },
          { max: 200, message: 'Topic must not exceed 200 characters' }
        ]}
      >
        <Input
          placeholder="e.g., Artificial Intelligence in Healthcare"
          showCount
          maxLength={200}
        />
      </Form.Item>

      <Form.Item
        label="Target Audience"
        name="audience"
        tooltip="Who will read this article?"
        rules={[{ required: true, message: 'Please select target audience' }]}
      >
        <Select>
          <Select.Option value="general public">General Public</Select.Option>
          <Select.Option value="professionals">Professionals</Select.Option>
          <Select.Option value="students">Students</Select.Option>
          <Select.Option value="executives">Executives</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item
        label="Writing Tone"
        name="tone"
        tooltip="Tone of the article"
      >
        <Select>
          <Select.Option value="formal">Formal</Select.Option>
          <Select.Option value="casual">Casual</Select.Option>
          <Select.Option value="technical">Technical</Select.Option>
          <Select.Option value="friendly">Friendly</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item
        label="Number of Sections"
        name="sectionCount"
        tooltip="How many main sections should the outline have?"
        rules={[
          { required: true, message: 'Please specify number of sections' },
          { type: 'number', min: 3, max: 10, message: 'Must be between 3 and 10' }
        ]}
      >
        <InputNumber min={3} max={10} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit">
          Generate Outline
        </Button>
      </Form.Item>
    </Form>
  );
};

export default OutlineInputForm;
```

### Example 2: Data Enrichment Step

#### Backend Schema Definition

```json
{
  "name": "Enrich User Data",
  "orderIndex": 1,
  "type": "llm",
  "llmConfig": {
    "deploymentId": "gpt4-deployment-prod",
    "systemPrompt": "You are a data enrichment specialist. Analyze user data and provide insights.",
    "userPromptTemplate": "User data: {{userData}}\nEnrichment fields: {{fields}}"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "userData": {
        "type": "object",
        "title": "User Data",
        "description": "Raw user data object",
        "additionalProperties": true,
        "examples": [
          {
            "name": "John Doe",
            "email": "john@example.com",
            "company": "Acme Corp"
          }
        ]
      },
      "fields": {
        "type": "array",
        "title": "Enrichment Fields",
        "description": "Which fields to enrich",
        "items": {
          "type": "string",
          "enum": ["industry", "location", "company_size", "revenue", "technologies"]
        },
        "minItems": 1,
        "uniqueItems": true,
        "default": ["industry", "location"]
      },
      "confidence": {
        "type": "number",
        "title": "Minimum Confidence",
        "description": "Minimum confidence score (0-1) for enriched data",
        "minimum": 0.0,
        "maximum": 1.0,
        "default": 0.7
      }
    },
    "required": ["userData", "fields"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "enrichedData": {
        "type": "object",
        "additionalProperties": true,
        "description": "User data with enriched fields"
      },
      "confidence": {
        "type": "object",
        "description": "Confidence scores for each enriched field",
        "additionalProperties": { "type": "number" }
      }
    },
    "required": ["enrichedData"]
  },
  "dependencies": [0]
}
```

---

## 7. Implementation Guide

### Step-by-Step Frontend Implementation

#### Step 1: Fetch Workflow Step Schema

```typescript
// API call to get workflow step details
const fetchWorkflowStep = async (workflowId: string, stepId: string) => {
  const response = await fetch(`/api/workflows/${workflowId}/steps/${stepId}`);
  const step = await response.json();

  return {
    inputSchema: step.inputSchema,
    outputSchema: step.outputSchema,
    llmConfig: step.llmConfig
  };
};
```

#### Step 2: Build Dynamic Form Schema Parser

```typescript
interface SchemaProperty {
  type: string;
  title?: string;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  required?: string[];
}

const parseSchemaToFormFields = (
  schema: SchemaProperty,
  parentPath: string[] = []
): FormField[] => {
  const fields: FormField[] = [];

  if (schema.type === 'object' && schema.properties) {
    Object.entries(schema.properties).forEach(([key, prop]) => {
      const fieldPath = [...parentPath, key];
      const isRequired = schema.required?.includes(key) || false;

      fields.push({
        name: fieldPath,
        label: prop.title || key,
        type: determineFieldType(prop),
        description: prop.description,
        required: isRequired,
        validation: buildValidationRules(prop, isRequired),
        options: prop.enum,
        ...extractFieldProps(prop)
      });

      // Recursively handle nested objects
      if (prop.type === 'object') {
        fields.push(...parseSchemaToFormFields(prop, fieldPath));
      }
    });
  }

  return fields;
};

const determineFieldType = (prop: SchemaProperty): string => {
  if (prop.enum) return 'select';
  if (prop.type === 'boolean') return 'checkbox';
  if (prop.type === 'integer' || prop.type === 'number') return 'number';
  if (prop.type === 'string' && prop.format === 'textarea') return 'textarea';
  if (prop.type === 'string' && prop.format === 'date') return 'date';
  if (prop.type === 'string' && prop.format === 'date-time') return 'datetime';
  if (prop.type === 'array') return 'array';
  if (prop.type === 'object') return 'object';
  return 'text';
};

const buildValidationRules = (
  prop: SchemaProperty,
  required: boolean
): ValidationRule[] => {
  const rules: ValidationRule[] = [];

  if (required) {
    rules.push({ required: true, message: `${prop.title || 'Field'} is required` });
  }

  if (prop.minLength) {
    rules.push({ min: prop.minLength, message: `Minimum length is ${prop.minLength}` });
  }

  if (prop.maxLength) {
    rules.push({ max: prop.maxLength, message: `Maximum length is ${prop.maxLength}` });
  }

  if (prop.minimum !== undefined || prop.maximum !== undefined) {
    rules.push({
      type: 'number',
      min: prop.minimum,
      max: prop.maximum,
      message: `Value must be between ${prop.minimum} and ${prop.maximum}`
    });
  }

  if (prop.pattern) {
    rules.push({
      pattern: new RegExp(prop.pattern),
      message: 'Invalid format'
    });
  }

  if (prop.format === 'email') {
    rules.push({ type: 'email', message: 'Invalid email address' });
  }

  return rules;
};
```

#### Step 3: Render Dynamic Form

```tsx
import React from 'react';
import { Form, Input, InputNumber, Select, Checkbox, DatePicker } from 'antd';

interface DynamicFormProps {
  schema: SchemaProperty;
  onSubmit: (values: any) => void;
}

const DynamicForm: React.FC<DynamicFormProps> = ({ schema, onSubmit }) => {
  const [form] = Form.useForm();
  const fields = parseSchemaToFormFields(schema);

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'text':
        return <Input placeholder={field.description} />;

      case 'textarea':
        return <Input.TextArea rows={4} placeholder={field.description} />;

      case 'number':
        return (
          <InputNumber
            min={field.minimum}
            max={field.maximum}
            step={field.multipleOf || 1}
            style={{ width: '100%' }}
          />
        );

      case 'checkbox':
        return <Checkbox>{field.label}</Checkbox>;

      case 'select':
        return (
          <Select>
            {field.options?.map(opt => (
              <Select.Option key={opt} value={opt}>
                {opt}
              </Select.Option>
            ))}
          </Select>
        );

      case 'date':
        return <DatePicker style={{ width: '100%' }} />;

      case 'datetime':
        return <DatePicker showTime style={{ width: '100%' }} />;

      default:
        return <Input />;
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={onSubmit}>
      {fields.map(field => (
        <Form.Item
          key={field.name.join('.')}
          name={field.name}
          label={field.label}
          tooltip={field.description}
          rules={field.validation}
          valuePropName={field.type === 'checkbox' ? 'checked' : 'value'}
        >
          {renderField(field)}
        </Form.Item>
      ))}

      <Form.Item>
        <Button type="primary" htmlType="submit">
          Submit
        </Button>
      </Form.Item>
    </Form>
  );
};
```

#### Step 4: Submit Workflow Execution

```typescript
const triggerWorkflowExecution = async (
  workflowId: string,
  inputData: any
) => {
  // Step 1: Create execution
  const createResponse = await fetch(`/api/workflows/${workflowId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: inputData })
  });

  const { executionId } = await createResponse.json();

  // Step 2: Start execution
  await fetch(`/api/executions/${executionId}/start`, {
    method: 'POST'
  });

  return executionId;
};

// Usage
const handleFormSubmit = async (values: any) => {
  try {
    const executionId = await triggerWorkflowExecution('workflow-123', values);
    console.log('Execution started:', executionId);

    // Navigate to execution status page or start polling
    navigate(`/executions/${executionId}`);
  } catch (error) {
    console.error('Failed to start execution:', error);
  }
};
```

---

## 8. Best Practices

### For Backend Developers

#### 1. Always Provide Examples

```json
{
  "topic": {
    "type": "string",
    "title": "Article Topic",
    "examples": [
      "Artificial Intelligence in Healthcare",
      "Climate Change Solutions",
      "Future of Work"
    ]
  }
}
```

**Why**: Examples help frontend developers understand expected input format and provide placeholder text.

#### 2. Use Clear Titles and Descriptions

```json
{
  "temperature": {
    "type": "number",
    "title": "LLM Temperature",
    "description": "Controls randomness (0.0 = deterministic, 2.0 = very random)",
    "minimum": 0.0,
    "maximum": 2.0
  }
}
```

**Why**: Non-technical users need clear explanations for LLM parameters.

#### 3. Set Sensible Defaults

```json
{
  "maxRetries": {
    "type": "integer",
    "title": "Maximum Retries",
    "minimum": 0,
    "maximum": 5,
    "default": 3
  }
}
```

**Why**: Defaults reduce friction for users and provide recommended values.

#### 4. Validate Strictly

```json
{
  "email": {
    "type": "string",
    "format": "email",
    "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  }
}
```

**Why**: Frontend validation prevents invalid data from reaching backend.

### For Frontend Developers

#### 1. Use JSON Schema Validation Libraries

```typescript
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(inputSchema);

const isValid = validate(formData);
if (!isValid) {
  console.error('Validation errors:', validate.errors);
}
```

**Why**: Don't reinvent validation logic—use battle-tested libraries.

#### 2. Show Helpful Error Messages

```tsx
<Form.Item
  name="email"
  rules={[
    { required: true, message: 'Email is required' },
    { type: 'email', message: 'Please enter a valid email address' }
  ]}
>
  <Input placeholder="user@example.com" />
</Form.Item>
```

**Why**: Users need actionable feedback to fix input errors.

#### 3. Provide Visual Feedback

```tsx
// Show character count for text inputs
<Input
  showCount
  maxLength={schema.maxLength}
  placeholder={schema.description}
/>

// Show value labels for sliders
<Slider
  marks={{
    0: '0.0 (Deterministic)',
    1: '1.0 (Balanced)',
    2: '2.0 (Random)'
  }}
/>
```

**Why**: Visual cues help users understand constraints and current values.

#### 4. Handle Loading States

```tsx
const [loading, setLoading] = useState(false);

const handleSubmit = async (values: any) => {
  setLoading(true);
  try {
    await triggerWorkflowExecution(workflowId, values);
  } finally {
    setLoading(false);
  }
};

<Button type="primary" htmlType="submit" loading={loading}>
  {loading ? 'Starting Execution...' : 'Start Workflow'}
</Button>
```

**Why**: Users need feedback that their action is being processed.

---

## 📚 Additional Resources

### JSON Schema References

- [JSON Schema Official Documentation](https://json-schema.org/)
- [Understanding JSON Schema (Free Book)](https://json-schema.org/understanding-json-schema/)
- [JSON Schema Validator (AJV)](https://ajv.js.org/)

### UI Component Libraries

- [Ant Design (React)](https://ant.design/components/form/)
- [Material-UI (React)](https://mui.com/material-ui/react-text-field/)
- [React Hook Form](https://react-hook-form.com/)
- [Monaco Editor (JSON Editor)](https://microsoft.github.io/monaco-editor/)

### Related Documentation

- [Workflow MVP Design](./workflow-mvp-design.md) - Full workflow architecture
- [Execution Schema](../../services/aiwm/src/modules/execution/execution.schema.ts) - Backend schema implementation
- [Execution DTOs](../../services/aiwm/src/modules/execution/execution.dto.ts) - Backend DTOs

---

**End of Document**
