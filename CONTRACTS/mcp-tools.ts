// MCP Tools Type Definitions — ASI_FORMS
// Source of truth for LLM ↔ Graph contract. Auto-generates MCP server + client SDK.

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
}

// ============================================
// 1. GRAPH QUERY TOOLS
// ============================================

export const CYPHER_QUERY_TOOL: MCPTool = {
  name: "cypher_query",
  description: "Execute a read-only Cypher query against the Knowledge Graph. Use for exploration, counting, pattern matching. Parameters are strictly typed — no string interpolation.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Cypher query with $parameters only" },
      parameters: { type: "object", description: "Named parameters for the query" },
      limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 }
    },
    required: ["query", "parameters"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      records: { type: "array", items: { type: "object" } },
      summary: { type: "object", properties: { queryType: { type: "string" }, counters: { type: "object" } } }
    },
    required: ["records", "summary"]
  }
};

export const GRAPH_SCHEMA_TOOL: MCPTool = {
  name: "graph_schema",
  description: "Get the current Neo4j schema: node labels, relationship types, property keys, indexes, constraints.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
    type: "object",
    properties: {
      nodeLabels: { type: "array", items: { type: "string" } },
      relationshipTypes: { type: "array", items: { type: "string" } },
      propertyKeys: { type: "array", items: { type: "string" } },
      indexes: { type: "array", items: { type: "object" } },
      constraints: { type: "array", items: { type: "object" } }
    },
    required: ["nodeLabels", "relationshipTypes", "propertyKeys", "indexes", "constraints"]
  }
};

// ============================================
// 2. LEGACY ARTIFACT TOOLS
// ============================================

export const GET_FORM_TOOL: MCPTool = {
  name: "get_form",
  description: "Retrieve a parsed Oracle Form by name. Returns blocks, triggers, items, properties, and cross-references.",
  inputSchema: {
    type: "object",
    properties: { formName: { type: "string", pattern: "^[A-Z_][A-Z0-9_]*$" } },
    required: ["formName"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      form: { type: "object", properties: { name: { type: "string" }, version: { type: "string" }, blocks: { type: "array" } } },
      blocks: { type: "array", items: { type: "object" } },
      triggers: { type: "array", items: { type: "object" } },
      items: { type: "array", items: { type: "object" } },
      crossRefs: { type: "array", items: { type: "object" } }
    },
    required: ["form", "blocks", "triggers", "items", "crossRefs"]
  }
};

export const GET_BLOCK_TOOL: MCPTool = {
  name: "get_block",
  description: "Retrieve a specific block within a form with all its items, triggers, and dependencies.",
  inputSchema: {
    type: "object",
    properties: {
      formName: { type: "string" },
      blockName: { type: "string" }
    },
    required: ["formName", "blockName"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      block: { type: "object" },
      items: { type: "array" },
      triggers: { type: "array" },
      dependencies: { type: "array" },
      referencedBy: { type: "array" }
    },
    required: ["block", "items", "triggers", "dependencies", "referencedBy"]
  }
};

export const GET_TRIGGER_CODE_TOOL: MCPTool = {
  name: "get_trigger_code",
  description: "Get the PL/SQL source code of a specific trigger with syntax highlighting hints and cross-references.",
  inputSchema: {
    type: "object",
    properties: {
      formName: { type: "string" },
      blockName: { type: "string" },
      triggerName: { type: "string" }
    },
    required: ["formName", "blockName", "triggerName"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      trigger: { type: "object" },
      code: { type: "string" },
      ast: { type: "object" },
      crossRefs: { type: "array" },
      complexity: { type: "object" }
    },
    required: ["trigger", "code", "ast", "crossRefs", "complexity"]
  }
};

// ============================================
// 3. DEPENDENCY & IMPACT TOOLS
// ============================================

export const GET_DEPENDENCIES_TOOL: MCPTool = {
  name: "get_dependencies",
  description: "Get all dependencies (tables, procedures, packages, other forms) for a form/block/trigger. Direction: 'outgoing' (what it calls) or 'incoming' (what calls it).",
  inputSchema: {
    type: "object",
    properties: {
      nodeId: { type: "string" },
      direction: { type: "string", enum: ["outgoing", "incoming", "both"] },
      depth: { type: "integer", minimum: 1, maximum: 5, default: 2 }
    },
    required: ["nodeId"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      nodes: { type: "array", items: { type: "object" } },
      edges: { type: "array", items: { type: "object" } },
      summary: { type: "object" }
    },
    required: ["nodes", "edges", "summary"]
  }
};

export const IMPACT_ANALYSIS_TOOL: MCPTool = {
  name: "impact_analysis",
  description: "Given a change (e.g., table column rename, procedure signature change), compute blast radius: all forms, blocks, triggers, procedures affected.",
  inputSchema: {
    type: "object",
    properties: {
      changeType: { type: "string", enum: ["table_column", "table_drop", "proc_signature", "proc_drop", "package_change"] },
      target: { type: "string" },
      details: { type: "object" }
    },
    required: ["changeType", "target"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      affectedForms: { type: "array", items: { type: "string" } },
      affectedBlocks: { type: "array", items: { type: "object" } },
      affectedTriggers: { type: "array", items: { type: "object" } },
      affectedProcedures: { type: "array", items: { type: "object" } },
      riskScore: { type: "number", minimum: 0, maximum: 100 },
      migrationPriority: { type: "string", enum: ["critical", "high", "medium", "low"] }
    },
    required: ["affectedForms", "affectedBlocks", "affectedTriggers", "affectedProcedures", "riskScore", "migrationPriority"]
  }
};

// ============================================
// 4. MIGRATION & VALIDATION TOOLS
// ============================================

export const GET_MIGRATION_STATUS_TOOL: MCPTool = {
  name: "get_migration_status",
  description: "Get the migration status of a form/block: parsed, analyzed, rules_extracted, bugs_fixed, codegen_ready, human_validated, deployed.",
  inputSchema: {
    type: "object",
    properties: {
      formName: { type: "string" },
      blockName: { type: "string", description: "Optional: filter by block" }
    },
    required: ["formName"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      form: { type: "string" },
      blocks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, status: { type: "string" }, validatedAt: { type: "string" }, validatedBy: { type: "string" } } } },
      overallProgress: { type: "number", minimum: 0, maximum: 100 },
      blockers: { type: "array", items: { type: "string" } }
    },
    required: ["form", "blocks", "overallProgress", "blockers"]
  }
};

export const VALIDATE_CODEGEN_TOOL: MCPTool = {
  name: "validate_codegen",
  description: "Validate generated Spring Boot/React code against the Knowledge Graph rules. Returns compilation errors, rule violations, test results.",
  inputSchema: {
    type: "object",
    properties: {
      formName: { type: "string" },
      blockName: { type: "string" },
      generatedCode: { type: "object", properties: { backend: { type: "string" }, frontend: { type: "string" } } }
    },
    required: ["formName", "blockName", "generatedCode"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      compilationErrors: { type: "array", items: { type: "string" } },
      ruleViolations: { type: "array", items: { type: "object" } },
      testResults: { type: "object" },
      suggestions: { type: "array", items: { type: "string" } }
    },
    required: ["valid", "compilationErrors", "ruleViolations", "testResults", "suggestions"]
  }
};

// ============================================
// 5. DIFF & SYNC TOOLS
// ============================================

export const GET_DAILY_DIFF_TOOL: MCPTool = {
  name: "get_daily_diff",
  description: "Get the daily diff between production schema/.fmb and the Knowledge Graph. Returns added/removed/changed nodes with risk classification.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", format: "date", description: "Defaults to yesterday" },
      formName: { type: "string", description: "Optional filter" }
    },
    required: [],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      date: { type: "string" },
      changes: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["added", "removed", "modified"] }, nodeId: { type: "string" }, nodeType: { type: "string" }, details: { type: "object" }, risk: { type: "string", enum: ["critical", "high", "medium", "low"] } } } },
      summary: { type: "object" },
      recommendedActions: { type: "array", items: { type: "string" } }
    },
    required: ["date", "changes", "summary", "recommendedActions"]
  }
};

export const TRIGGER_REANALYSIS_TOOL: MCPTool = {
  name: "trigger_reanalysis",
  description: "Trigger re-analysis of specific nodes affected by daily diff. Agents (RuleAnalyst, BugCorrector) will re-process only the delta.",
  inputSchema: {
    type: "object",
    properties: {
      nodeIds: { type: "array", items: { type: "string" } },
      agents: { type: "array", items: { type: "string", enum: ["RuleAnalyst", "BugCorrector", "CodeGenerator"] }, default: ["RuleAnalyst", "BugCorrector"] }
    },
    required: ["nodeIds"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      jobId: { type: "string" },
      status: { type: "string", enum: ["queued", "running", "completed", "failed"] },
      estimatedDurationSeconds: { type: "integer" }
    },
    required: ["jobId", "status", "estimatedDurationSeconds"]
  }
};

// ============================================
// 6. MEMORY & LEARNING TOOLS
// ============================================

export const GET_LEARNED_PATTERNS_TOOL: MCPTool = {
  name: "get_learned_patterns",
  description: "Retrieve learned patterns from Memory Layer: common bug fixes, rule interpretations, codegen templates that worked across clients.",
  inputSchema: {
    type: "object",
    properties: {
      patternType: { type: "string", enum: ["bug_fix", "rule_interpretation", "codegen_template", "validation_rule"] },
      context: { type: "object", description: "Optional filter: form type, block type, trigger type" },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }
    },
    required: ["patternType"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      patterns: { type: "array", items: { type: "object" } },
      applicabilityScore: { type: "number", minimum: 0, maximum: 1 }
    },
    required: ["patterns", "applicabilityScore"]
  }
};

export const STORE_LEARNING_TOOL: MCPTool = {
  name: "store_learning",
  description: "Store a new learning (human-validated correction, successful pattern) into the Memory Layer for cross-client reuse.",
  inputSchema: {
    type: "object",
    properties: {
      patternType: { type: "string", enum: ["bug_fix", "rule_interpretation", "codegen_template", "validation_rule"] },
      context: { type: "object" },
      pattern: { type: "object" },
      validatedBy: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    },
    required: ["patternType", "context", "pattern", "validatedBy", "confidence"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: { learningId: { type: "string" }, stored: { type: "boolean" } },
    required: ["learningId", "stored"]
  }
};

// ============================================
// 7. EXPORT TOOLS
// ============================================

export const EXPORT_GRAPH_TOOL: MCPTool = {
  name: "export_graph",
  description: "Export subgraph as GraphML/JSON for external analysis or backup.",
  inputSchema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["graphml", "json", "cypher"], default: "json" },
      filter: { type: "object", description: "Cypher WHERE clause as object" }
    },
    required: [],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: { data: { type: "string" }, format: { type: "string" }, nodeCount: { type: "integer" }, edgeCount: { type: "integer" } },
    required: ["data", "format", "nodeCount", "edgeCount"]
  }
};

// ============================================
// ALL TOOLS REGISTRY
// ============================================

export const ALL_MCP_TOOLS: MCPTool[] = [
  CYPHER_QUERY_TOOL,
  GRAPH_SCHEMA_TOOL,
  GET_FORM_TOOL,
  GET_BLOCK_TOOL,
  GET_TRIGGER_CODE_TOOL,
  GET_DEPENDENCIES_TOOL,
  IMPACT_ANALYSIS_TOOL,
  GET_MIGRATION_STATUS_TOOL,
  VALIDATE_CODEGEN_TOOL,
  GET_DAILY_DIFF_TOOL,
  TRIGGER_REANALYSIS_TOOL,
  GET_LEARNED_PATTERNS_TOOL,
  STORE_LEARNING_TOOL,
  EXPORT_GRAPH_TOOL
];

export const TOOL_NAMES = ALL_MCP_TOOLS.map(t => t.name) as const;
export type MCPToolName = typeof TOOL_NAMES[number];