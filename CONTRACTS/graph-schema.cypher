// Neo4j Graph Schema — ASI_FORMS Knowledge Graph
// Source of truth for parser, agents, MCP tools, and dashboard.
// Run in Neo4j Browser or via migration script.

// ============================================
// CONSTRAINTS & INDEXES
// ============================================

// Unique constraints
CREATE CONSTRAINT form_name_unique IF NOT EXISTS FOR (f:Form) REQUIRE f.name IS UNIQUE;
CREATE CONSTRAINT block_composite_unique IF NOT EXISTS FOR (b:Block) REQUIRE (b.formName, b.name) IS UNIQUE;
CREATE CONSTRAINT trigger_composite_unique IF NOT EXISTS FOR (t:Trigger) REQUIRE (t.formName, t.blockName, t.name) IS UNIQUE;
CREATE CONSTRAINT item_composite_unique IF NOT EXISTS FOR (i:Item) REQUIRE (i.formName, i.blockName, i.name) IS UNIQUE;
CREATE CONSTRAINT procedure_name_unique IF NOT EXISTS FOR (p:Procedure) REQUIRE p.name IS UNIQUE;
CREATE CONSTRAINT table_name_unique IF NOT EXISTS FOR (t:Table) REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT package_name_unique IF NOT EXISTS FOR (p:Package) REQUIRE p.name IS UNIQUE;
CREATE CONSTRAINT learning_id_unique IF NOT EXISTS FOR (l:Learning) REQUIRE l.id IS UNIQUE;

// Indexes for query performance
CREATE INDEX form_version_idx IF NOT EXISTS FOR (f:Form) ON (f.version);
CREATE INDEX block_type_idx IF NOT EXISTS FOR (b:Block) ON (b.type);
CREATE INDEX trigger_type_idx IF NOT EXISTS FOR (t:Trigger) ON (t.type);
CREATE INDEX item_type_idx IF NOT EXISTS FOR (i:Item) ON (i.type);
CREATE INDEX learning_type_idx IF NOT EXISTS FOR (l:Learning) ON (l.patternType);
CREATE INDEX learning_context_idx IF NOT EXISTS FOR (l:Learning) ON (l.context);
CREATE INDEX diff_date_idx IF NOT EXISTS FOR (d:DailyDiff) ON (d.date);
CREATE INDEX migration_status_idx IF NOT EXISTS FOR (m:MigrationStatus) ON (m.formName, m.blockName);

// ============================================
// NODE LABELS & PROPERTIES
// ============================================

// Form (Oracle Forms .fmb)
/*
:Form {
  name: String,           // e.g., "FATURAMENTO"
  version: String,        // e.g., "10.1.2.0"
  path: String,           // original .fmb path
  parsedAt: DateTime,
  parserVersion: String,
  blockCount: Integer,
  triggerCount: Integer,
  itemCount: Integer,
  loc: Integer,           // lines of PL/SQL
  status: String,         // "parsed" | "analyzed" | "rules_extracted" | "bugs_fixed" | "codegen_ready" | "validated" | "deployed"
  metadata: Map           // additional parser metadata
}
*/

// Block (Form block)
/*
:Block {
  formName: String,
  name: String,           // e.g., "BLOCO_FATURA"
  type: String,           // "BASE_TABLE" | "CONTROL" | "NON_DATABASE" | "FROM_CLAUSE"
  tableName: String?,     // base table if BASE_TABLE
  whereClause: String?,   // block WHERE clause
  orderByClause: String?, // block ORDER BY
  itemCount: Integer,
  triggerCount: Integer,
  loc: Integer,
  status: String,
  coordinates: Map?       // x, y, width, height for visual nav
}
*/

// Item (Block item/field)
/*
:Item {
  formName: String,
  blockName: String,
  name: String,           // e.g., "NUM_NF"
  type: String,           // "TEXT_ITEM" | "DISPLAY_ITEM" | "LIST_ITEM" | "CHECKBOX" | "RADIO_GROUP" | "BUTTON" | "IMAGE" | "CHART" | "BEAN_AREA"
  dataType: String,       // "CHAR" | "NUMBER" | "DATE" | "DATETIME" | "LONG" | "RAW"
  length: Integer?,
  precision: Integer?,
  scale: Integer?,
  required: Boolean,
  defaultValue: String?,
  formatMask: String?,    // e.g., "99/99/9999"
  lovName: String?,       // List of Values reference
  canvasName: String?,
  coordinates: Map?,      // x, y, width, height
  triggers: [String],     // trigger names attached to this item
  dependencies: [String]  // other items/blocks this depends on
}
*/

// Trigger (PL/SQL code attached to form/block/item)
/*
:Trigger {
  formName: String,
  blockName: String?,
  itemName: String?,      // null if form-level or block-level
  name: String,           // e.g., "PRE-INSERT", "WHEN-VALIDATE-ITEM", "KEY-EXIT"
  type: String,           // trigger category
  code: String,           // full PL/SQL source
  ast: Map,               // parsed AST (JSON)
  complexity: Map,        // cyclomatic, nesting, lines, calls
  crossRefs: [String],    // tables, procedures, packages, items referenced
  calledProcedures: [String],
  calledPackages: [String],
  referencedTables: [String],
  referencedColumns: [String],
  status: String,         // "raw" | "analyzed" | "bugs_fixed" | "validated"
  bugsFound: Integer,
  bugsFixed: Integer
}
*/

// Procedure (Database stored procedure)
/*
:Procedure {
  name: String,           // e.g., "PKG_FATURA.GERAR_NF"
  packageName: String?,
  schema: String,
  code: String,
  ast: Map,
  parameters: [Map],      // [{name, type, mode, default}]
  returns: String?,       // return type
  complexity: Map,
  crossRefs: [String],    // tables, other procs, packages
  calledBy: [String],     // triggers/forms that call this
  status: String
}
*/

// Package (PL/SQL package)
/*
:Package {
  name: String,           // e.g., "PKG_FATURA"
  schema: String,
  specCode: String,       // package specification
  bodyCode: String?,      // package body (may be wrapped)
  procedures: [String],   // procedure names
  functions: [String],    // function names
  types: [String],        // custom types
  constants: [Map],       // constant declarations
  status: String
}
*/

// Table (Database table)
/*
:Table {
  name: String,           // e.g., "FATURA"
  schema: String,
  columns: [Map],         // [{name, type, nullable, pk, fk, default}]
  primaryKey: [String],
  foreignKeys: [Map],     // [{column, refTable, refColumn}]
  indexes: [Map],         // [{name, columns, unique}]
  rowCount: Long?,        // estimated
  partitions: [Map]?,     // partition info
  status: String
}
*/

// DailyDiff (Schema/.fmb changes detected)
/*
:DailyDiff {
  date: Date,
  formName: String?,
  changeType: String,     // "ADDED" | "REMOVED" | "MODIFIED"
  nodeType: String,       // "Form" | "Block" | "Trigger" | "Item" | "Table" | "Procedure" | "Package"
  nodeId: String,         // composite key
  details: Map,           // what changed (old vs new)
  risk: String,           // "critical" | "high" | "medium" | "low"
  detectedAt: DateTime,
  processed: Boolean,
  reanalysisJobId: String?
}
*/

// MigrationStatus (Per form/block tracking)
/*
:MigrationStatus {
  formName: String,
  blockName: String?,     // null = form-level
  status: String,         // "parsed" | "analyzed" | "rules_extracted" | "bugs_fixed" | "codegen_ready" | "human_validated" | "deployed"
  startedAt: DateTime,
  completedAt: DateTime?,
  validatedBy: String?,   // human validator
  validatedAt: DateTime?,
  codegenVersion: String?,
  deployedVersion: String?,
  blockers: [String],
  notes: String
}
*/

// Learning (Memory Layer - cross-client patterns)
/*
:Learning {
  id: String,             // UUID
  patternType: String,    // "bug_fix" | "rule_interpretation" | "codegen_template" | "validation_rule"
  context: Map,           // {formType, blockType, triggerType, tablePattern, ...}
  pattern: Map,           // the actual learned pattern (structured)
  validatedBy: String,    // human expert
  confidence: Float,      // 0.0 - 1.0
  createdAt: DateTime,
  usedCount: Integer,     // how many times applied successfully
  successRate: Float,     // 0.0 - 1.0
  clientIds: [String]     // anonymized client identifiers where applied
}
*/

// AgentRun (Audit trail for agent executions)
/*
:AgentRun {
  id: String,             // UUID
  agentName: String,      // "RuleAnalyst" | "BugCorrector" | "CodeGenerator"
  formName: String,
  blockName: String?,
  triggerName: String?,   // if trigger-level
  input: Map,             // agent input
  output: Map,            // agent output
  status: String,         // "success" | "partial" | "failed"
  durationMs: Integer,
  tokensUsed: Integer,
  model: String,          // e.g., "gemini-1.5-pro", "claude-3.5-sonnet"
  promptVersion: String,
  errors: [String],
  createdAt: DateTime
}
*/

// ============================================
// RELATIONSHIPS
// ============================================

/*
(:Form)-[:HAS_BLOCK]->(:Block)
(:Block)-[:HAS_ITEM]->(:Item)
(:Block)-[:HAS_TRIGGER]->(:Trigger)
(:Item)-[:HAS_TRIGGER]->(:Trigger)
(:Form)-[:HAS_TRIGGER]->(:Trigger)  // form-level triggers

(:Trigger)-[:CALLS_PROCEDURE]->(:Procedure)
(:Trigger)-[:CALLS_PACKAGE]->(:Package)
(:Trigger)-[:REFERENCES_TABLE]->(:Table)
(:Trigger)-[:REFERENCES_COLUMN]->(:Table)  // via column property on rel
(:Trigger)-[:REFERENCES_ITEM]->(:Item)

(:Procedure)-[:BELONGS_TO_PACKAGE]->(:Package)
(:Procedure)-[:CALLS_PROCEDURE]->(:Procedure)
(:Procedure)-[:REFERENCES_TABLE]->(:Table)

(:Package)-[:CONTAINS_PROCEDURE]->(:Procedure)

(:Block)-[:BASED_ON_TABLE]->(:Table)
(:Item)-[:MAPS_TO_COLUMN]->(:Table)  // via column property on rel

(:DailyDiff)-[:AFFECTS]->(:Form|Block|Trigger|Item|Table|Procedure|Package)
(:DailyDiff)-[:TRIGGERS_REANALYSIS]->(:AgentRun)

(:MigrationStatus)-[:TRACKS]->(:Form)
(:MigrationStatus)-[:TRACKS_BLOCK]->(:Block)

(:Learning)-[:APPLICABLE_TO]->(:Form|Block|Trigger|Table|Procedure)
(:Learning)-[:DERIVED_FROM]->(:AgentRun)

(:AgentRun)-[:PROCESSED]->(:Form|Block|Trigger)
(:AgentRun)-[:USED_LEARNING]->(:Learning)
*/

// ============================================
// SAMPLE QUERIES FOR AGENTS
// ============================================

// RuleAnalyst: Get all triggers for a block with their code and cross-refs
/*
MATCH (f:Form {name: $formName})-[:HAS_BLOCK]->(b:Block {name: $blockName})-[:HAS_TRIGGER]->(t:Trigger)
OPTIONAL MATCH (t)-[:CALLS_PROCEDURE]->(p:Procedure)
OPTIONAL MATCH (t)-[:REFERENCES_TABLE]->(tab:Table)
RETURN t, collect(DISTINCT p.name) as procedures, collect(DISTINCT tab.name) as tables
*/

// BugCorrector: Find triggers with common Oracle bugs (simplified)
/*
MATCH (t:Trigger)
WHERE t.code CONTAINS "POST-QUERY" AND t.code CONTAINS "COMMIT"
   OR t.code CONTAINS "EXCEPTION WHEN OTHERS THEN NULL"
   OR t.code CONTAINS "GOTO"
RETURN t.formName, t.blockName, t.name, t.code
*/

// CodeGenerator: Get full context for a block (rules + fixed bugs + dependencies)
/*
MATCH (f:Form {name: $formName})-[:HAS_BLOCK]->(b:Block {name: $blockName})
OPTIONAL MATCH (b)-[:HAS_ITEM]->(i:Item)
OPTIONAL MATCH (b)-[:HAS_TRIGGER]->(t:Trigger)
OPTIONAL MATCH (t)-[:REFERENCES_TABLE]->(tab:Table)
OPTIONAL MATCH (t)-[:CALLS_PROCEDURE]->(p:Procedure)
OPTIONAL MATCH (l:Learning)-[:APPLICABLE_TO]->(b)
WHERE l.patternType IN ["codegen_template", "validation_rule"]
RETURN b, collect(i) as items, collect(t) as triggers, collect(DISTINCT tab) as tables, collect(DISTINCT p) as procedures, collect(l) as learnings
*/

// Impact Analysis: Blast radius for a table change
/*
MATCH (tab:Table {name: $tableName})<-[:REFERENCES_TABLE]-(t:Trigger)
OPTIONAL MATCH (t)<-[:HAS_TRIGGER]-(b:Block)<-[:HAS_BLOCK]-(f:Form)
OPTIONAL MATCH (t)-[:CALLS_PROCEDURE]->(p:Procedure)
RETURN f.name as form, collect(DISTINCT b.name) as blocks, collect(DISTINCT t.name) as triggers, collect(DISTINCT p.name) as procedures
*/

// Daily Diff Processing: Get unprocessed high/critical changes
/*
MATCH (d:DailyDiff {processed: false})
WHERE d.risk IN ["critical", "high"]
RETURN d ORDER BY d.detectedAt
*/

// Migration Dashboard: Progress per form
/*
MATCH (ms:MigrationStatus)
RETURN ms.formName, ms.blockName, ms.status, ms.overallProgress, ms.blockers
ORDER BY ms.formName, ms.blockName
*/