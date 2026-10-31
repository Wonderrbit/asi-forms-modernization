// Agent Input/Output Contracts — ASI_FORMS
// Strictly typed interfaces for LangGraph agents. Used by agents, tests, and MCP validation.

// ============================================
// SHARED TYPES
// ============================================

export interface AgentContext {
  formName: string;
  blockName?: string;
  triggerName?: string;
  runId: string;              // correlation ID for tracing
  promptVersion: string;      // e.g., "v2.3.1"
  model: string;              // e.g., "gemini-1.5-pro"
  temperature: number;
  maxTokens: number;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  errors?: AgentError[];
  metadata: AgentMetadata;
}

export interface AgentError {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  location?: string;          // e.g., "trigger:PRE-INSERT:line:42"
}

export interface AgentMetadata {
  durationMs: number;
  tokensUsed: { input: number; output: number; total: number };
  model: string;
  promptVersion: string;
  agentName: string;
  timestamp: string;          // ISO 8601
}

// ============================================
// RULE ANALYST AGENT
// ============================================

export interface RuleAnalystInput {
  context: AgentContext;
  triggerCode: string;        // PL/SQL source
  ast: PLSQLAST;              // parsed AST
  crossRefs: CrossReference[]; // tables, procedures, items referenced
  blockContext: BlockContext; // block items, other triggers, base table
  learnedPatterns: LearnedPattern[]; // from Memory Layer
}

export interface PLSQLAST {
  type: "block" | "statement" | "expression" | "declaration";
  children: PLSQLAST[];
  metadata: {
    line: number;
    column: number;
    nodeType: string;         // e.g., "IF_STATEMENT", "CURSOR_LOOP", "EXCEPTION_HANDLER"
  };
}

export interface CrossReference {
  type: "table" | "procedure" | "package" | "item" | "column" | "trigger" | "form";
  name: string;
  schema?: string;
  usage: "read" | "write" | "execute" | "reference";
  line: number;
}

export interface BlockContext {
  formName: string;
  blockName: string;
  blockType: "BASE_TABLE" | "CONTROL" | "NON_DATABASE" | "FROM_CLAUSE";
  baseTable?: string;
  items: ItemContext[];
  triggers: TriggerSummary[];
}

export interface ItemContext {
  name: string;
  type: string;
  dataType: string;
  required: boolean;
  triggers: string[];         // trigger names attached
}

export interface TriggerSummary {
  name: string;
  type: string;
  lineCount: number;
  complexity: number;
}

export interface LearnedPattern {
  id: string;
  patternType: "bug_fix" | "rule_interpretation" | "codegen_template" | "validation_rule";
  context: Record<string, any>;
  pattern: Record<string, any>;
  confidence: number;
  applicabilityScore: number;
}

export interface RuleAnalystOutput {
  rules: ExtractedRule[];
  businessLogic: BusinessLogicSummary;
  dataFlow: DataFlowMapping[];
  validationRules: ValidationRule[];
  recommendations: string[];
}

export interface ExtractedRule {
  id: string;                 // e.g., "RULE-FAT-001"
  type: "validation" | "calculation" | "workflow" | "security" | "data_integrity" | "business_policy";
  description: string;        // human-readable
  formalSpec: string;         // structured specification (OCL-like or natural language)
  sourceTriggers: string[];   // trigger names that implement this rule
  sourceLines: number[];      // line numbers in trigger code
  confidence: number;         // 0.0 - 1.0
  category: "mandatory" | "conditional" | "derived" | "constraint";
  dependencies: string[];     // other rule IDs this depends on
  testCases: RuleTestCase[];  // for validation
}

export interface RuleTestCase {
  input: Record<string, any>;
  expectedOutput: Record<string, any>;
  description: string;
}

export interface BusinessLogicSummary {
  domain: string;             // e.g., "faturamento", "estoque", "financeiro"
  coreEntities: string[];     // main tables/entities
  keyWorkflows: string[];     // e.g., "emissao_nf", "cancelamento", "estorno"
  criticalRules: string[];    // rule IDs marked as critical
  integrationPoints: string[]; // external systems (PIX, SEFAZ, ERP)
}

export interface DataFlowMapping {
  source: string;             // table/column or item
  target: string;             // table/column or item
  transformation: string;     // description of transformation
  triggers: string[];         // triggers involved
  conditions: string[];       // when this flow executes
}

export interface ValidationRule {
  ruleId: string;
  field: string;              // item/column name
  rule: string;               // e.g., "NOT NULL", "REGEX ^[0-9]{10}$", "CUSTOM: validar_cnpj"
  severity: "error" | "warning";
  message: string;
}

// ============================================
// BUG CORRECTOR AGENT
// ============================================

export interface BugCorrectorInput {
  context: AgentContext;
  triggerCode: string;
  ast: PLSQLAST;
  crossRefs: CrossReference[];
  knownBugPatterns: BugPattern[];      // from Memory Layer + static analysis
  ruleAnalysis: RuleAnalystOutput;     // output from RuleAnalyst (rules to preserve)
}

export interface BugPattern {
  id: string;                 // e.g., "BUG-ORA-001"
  name: string;               // e.g., "Implicit Commit in POST-QUERY"
  pattern: string;            // regex or AST pattern
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  fixTemplate: string;        // parameterized fix
  references: string[];       // Oracle docs, Metalink notes
}

export interface BugCorrectorOutput {
  fixedCode: string;
  fixesApplied: AppliedFix[];
  remainingIssues: RemainingIssue[];
  validationRules: ValidationRule[];  // new rules to add to codegen
  cryptoAssets: CryptoAssetDiscovery[]; // RSA/ECC usage map from crypto discovery
}

export interface CryptoAssetDiscovery {
  id: string;                  // e.g., "CRYPTO-RSA_2048_MODULUS"
  category: "rsa" | "ecc" | "certificate" | "hardcoded_key" | "tls_config";
  severity: "critical" | "high" | "medium" | "low";
  name: string;
  location: { line: number; column: number };
  description: string;
  codeSnippet: string;
  recommendation: string;      // e.g., "Replace with ML-KEM-768 hybrid"
}

export interface AppliedFix {
  bugPatternId: string;
  location: { line: number; column: number; length: number };
  originalCode: string;
  fixedCode: string;
  explanation: string;
  confidence: number;
  requiresHumanReview: boolean;
  cryptoAsset?: {
    category: "rsa" | "ecc" | "certificate" | "hardcoded_key" | "tls_config";
    severity: "critical" | "high" | "medium" | "low";
    name: string;
  };
}

export interface RemainingIssue {
  bugPatternId: string;
  location: { line: number; column: number };
  description: string;
  reason: "complex_refactor_needed" | "business_logic_unclear" | "risk_too_high";
  suggestion: string;
}

// ============================================
// CODE GENERATOR AGENT
// ============================================

export interface CodeGeneratorInput {
  context: AgentContext;
  blockContext: BlockContext;
  rules: ExtractedRule[];
  fixedTriggerCode: Record<string, string>;  // triggerName -> fixed code
  learnedTemplates: CodegenTemplate[];
  targetStack: TargetStack;
}

export interface CodegenTemplate {
  id: string;
  name: string;               // e.g., "spring-boot-entity", "react-form-component"
  template: string;           // Jinja2/Handlebars template
  parameters: TemplateParameter[];
  appliesTo: string[];        // rule types, block types, etc.
  version: string;
}

export interface TemplateParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description: string;
  default?: any;
}

export interface TargetStack {
  backend: "spring-boot" | "nestjs" | "fastapi";
  frontend: "react" | "vue" | "angular";
  database: "postgresql" | "oracle" | "sqlserver";
  orm: "jpa" | "mybatis" | "prisma" | "sqlalchemy";
  buildTool: "maven" | "gradle" | "npm" | "pnpm";
  testFramework: "junit" | "jest" | "vitest" | "pytest";
}

export interface CodeGeneratorOutput {
  backend: GeneratedArtifact[];
  frontend: GeneratedArtifact[];
  tests: GeneratedArtifact[];
  config: GeneratedArtifact[];
  validation: ValidationResult;
}

export interface GeneratedArtifact {
  path: string;               // relative path in project
  content: string;
  language: string;           // "java", "typescript", "xml", "yaml", "sql"
  purpose: "entity" | "repository" | "service" | "controller" | "dto" | "component" | "hook" | "test" | "config" | "migration";
  dependencies: string[];     // other artifact paths this depends on
}

export interface ValidationResult {
  compiles: boolean;
  compileErrors: string[];
  ruleCoverage: number;       // % of rules implemented
  testCoverage: number;       // estimated
  staticAnalysis: StaticAnalysisResult;
}

export interface StaticAnalysisResult {
  tool: string;               // "semgrep" | "sonarqube" | "spotbugs"
  issues: StaticIssue[];
  passed: boolean;
}

export interface StaticIssue {
  ruleId: string;
  severity: "blocker" | "critical" | "major" | "minor" | "info";
  message: string;
  file: string;
  line: number;
}

// ============================================
// AGENT STATE (LangGraph)
// ============================================

export interface AgentState {
  // Input
  formName: string;
  blockName?: string;
  triggerName?: string;
  
  // Pipeline state
  currentAgent: "RuleAnalyst" | "BugCorrector" | "CodeGenerator" | "HumanValidation";
  runId: string;
  
  // Agent outputs (accumulated)
  ruleAnalysis?: RuleAnalystOutput;
  bugFixes?: BugCorrectorOutput;
  codegen?: CodeGeneratorOutput;
  
  // Human validation
  humanFeedback?: HumanFeedback;
  validated: boolean;
  
  // Memory
  usedLearnings: string[];    // learning IDs applied
  newLearnings: NewLearning[];
  
  // Errors & retries
  errors: AgentError[];
  retryCount: number;
  maxRetries: number;
}

export interface HumanFeedback {
  validator: string;
  timestamp: string;
  approved: boolean;
  comments: string;
  modifications: HumanModification[];
}

export interface HumanModification {
  artifactPath: string;
  originalContent: string;
  modifiedContent: string;
  reason: string;
}

export interface NewLearning {
  patternType: "bug_fix" | "rule_interpretation" | "codegen_template" | "validation_rule";
  context: Record<string, any>;
  pattern: Record<string, any>;
  confidence: number;
  source: "human_feedback" | "agent_correction" | "validation_result";
}