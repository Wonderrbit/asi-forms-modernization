// RuleAnalyst Agent — ASI_FORMS
// Extracts business rules from PL/SQL trigger code using LLM + static analysis.
// Implements: AgentInput -> RuleAnalystOutput (see CONTRACTS/agents.ts)

import { 
  RuleAnalystInput, 
  RuleAnalystOutput, 
  ExtractedRule, 
  BusinessLogicSummary,
  DataFlowMapping,
  ValidationRule,
  RuleTestCase,
  LearnedPattern,
  CrossReference,
  BlockContext
} from '../CONTRACTS/agents';
import { LLMClient, PromptTemplate } from '../api/llm-client';

export class RuleAnalystAgent {
  private llm: LLMClient;
  private promptVersion: string = 'v2.1.0';

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  async analyze(input: RuleAnalystInput): Promise<RuleAnalystOutput> {
    const { context, triggerCode, ast, crossRefs, blockContext, learnedPatterns } = input;

    // 1. Build prompt with context
    const prompt = this.buildPrompt(triggerCode, ast, crossRefs, blockContext, learnedPatterns);

    // 2. Call LLM with structured output
    const response = await this.llm.generateStructured<RuleAnalystOutput>(prompt, {
      temperature: 0.1,
      maxTokens: 8000,
      model: context.model,
      schema: this.getOutputSchema()
    });

    // 3. Post-process and validate
    const output = this.postProcess(response, blockContext);

    // 4. Store learnings for Memory Layer
    await this.storeLearnings(output, context);

    return output;
  }

  private buildPrompt(
    triggerCode: string,
    ast: any,
    crossRefs: CrossReference[],
    blockContext: BlockContext,
    learnedPatterns: LearnedPattern[]
  ): string {
    const promptTemplate = `
<role>
You are a Senior Oracle Forms Architect with 20+ years of experience in legacy modernization.
Your task: Extract EXPLICIT, TESTABLE business rules from PL/SQL trigger code.
</role>

<context>
FORM: {{formName}}
BLOCK: {{blockName}} ({{blockType}})
BASE TABLE: {{baseTable}}
ITEMS: {{items}}
OTHER TRIGGERS: {{triggerSummary}}
</context>

<learned_patterns>
{{learnedPatterns}}
</learned_patterns>

<trigger_code>
{{triggerCode}}
</trigger_code>

<cross_references>
{{crossRefs}}
</cross_references>

<instructions>
1. Analyze the trigger code and identify ALL business rules implemented.
2. Each rule must be:
   - EXPLICIT: Stated in formal, testable language
   - TRACEABLE: Linked to specific trigger lines
   - CATEGORIZED: validation | calculation | workflow | security | data_integrity | business_policy
   - RANKED: mandatory | conditional | derived | constraint
3. Identify data flows (source -> transformation -> target)
4. Extract validation rules per field
5. Summarize business logic domain, core entities, key workflows
6. Use learned patterns to recognize common Oracle Forms patterns
7. Output ONLY valid JSON matching the schema
</instructions>

<output_schema>
{
  "rules": [
    {
      "id": "string",
      "type": "validation|calculation|workflow|security|data_integrity|business_policy",
      "description": "string",
      "formalSpec": "string",
      "sourceTriggers": ["string"],
      "sourceLines": [number],
      "confidence": number,
      "category": "mandatory|conditional|derived|constraint",
      "dependencies": ["string"],
      "testCases": [{"input": {}, "expectedOutput": {}, "description": "string"}]
    }
  ],
  "businessLogic": {
    "domain": "string",
    "coreEntities": ["string"],
    "keyWorkflows": ["string"],
    "criticalRules": ["string"],
    "integrationPoints": ["string"]
  },
  "dataFlows": [
    {
      "source": "string",
      "target": "string",
      "transformation": "string",
      "triggers": ["string"],
      "conditions": ["string"]
    }
  ],
  "validationRules": [
    {
      "ruleId": "string",
      "field": "string",
      "rule": "string",
      "severity": "error|warning",
      "message": "string"
    }
  ],
  "recommendations": ["string"]
}
</output_schema>
`;

    return PromptTemplate.render(promptTemplate, {
      formName: context.formName,
      blockName: context.blockName || 'FORM_LEVEL',
      blockType: blockContext.blockType,
      baseTable: blockContext.baseTable || 'N/A',
      items: blockContext.items.map(i => `${i.name}:${i.dataType}${i.required ? '*' : ''}`).join(', '),
      triggerSummary: blockContext.triggers.map(t => `${t.name}(${t.lineCount} lines)`).join(', '),
      learnedPatterns: learnedPatterns.map(p => `${p.patternType}: ${JSON.stringify(p.pattern)}`).join('\n'),
      triggerCode,
      crossRefs: crossRefs.map(r => `${r.type}:${r.name}@L${r.line}(${r.usage})`).join(', ')
    });
  }

  private getOutputSchema(): any {
    // JSON Schema for structured output validation
    return {
      type: 'object',
      properties: {
        rules: { type: 'array', items: { type: 'object' } },
        businessLogic: { type: 'object' },
        dataFlows: { type: 'array', items: { type: 'object' } },
        validationRules: { type: 'array', items: { type: 'object' } },
        recommendations: { type: 'array', items: { type: 'string' } }
      },
      required: ['rules', 'businessLogic', 'dataFlows', 'validationRules', 'recommendations']
    };
  }

  private postProcess(raw: any, blockContext: BlockContext): RuleAnalystOutput {
    // Validate and enrich
    const rules: ExtractedRule[] = (raw.rules || []).map((r: any, i: number) => ({
      id: r.id || `RULE-${blockContext.blockName}-${String(i+1).padStart(3,'0')}`,
      type: r.type || 'business_policy',
      description: r.description || '',
      formalSpec: r.formalSpec || r.description || '',
      sourceTriggers: r.sourceTriggers || [],
      sourceLines: r.sourceLines || [],
      confidence: Math.max(0, Math.min(1, r.confidence || 0.8)),
      category: r.category || 'mandatory',
      dependencies: r.dependencies || [],
      testCases: r.testCases || []
    }));

    return {
      rules,
      businessLogic: raw.businessLogic || {
        domain: 'unknown',
        coreEntities: [],
        keyWorkflows: [],
        criticalRules: [],
        integrationPoints: []
      },
      dataFlows: raw.dataFlows || [],
      validationRules: raw.validationRules || [],
      recommendations: raw.recommendations || []
    };
  }

  private async storeLearnings(output: RuleAnalystOutput, context: RuleAnalystInput): Promise<void> {
    // In production: write to Neo4j Learning nodes via MCP
    // For now: emit structured log for observability
    console.log(JSON.stringify({
      type: 'RULE_ANALYST_LEARNINGS',
      runId: context.runId,
      formName: context.formName,
      blockName: context.blockName,
      rulesExtracted: output.rules.length,
      domain: output.businessLogic.domain,
      timestamp: new Date().toISOString()
    }));
  }
}

// ============================================
// PL/SQL Static Analysis Helpers
// ============================================

export function extractRulesStatically(code: string, ast: any): ExtractedRule[] {
  // Fallback/static analysis when LLM unavailable
  const rules: ExtractedRule[] = [];
  let ruleCounter = 0;

  // Pattern: Validation rules (WHEN-VALIDATE-ITEM)
  if (code.includes('WHEN-VALIDATE-ITEM') || code.includes('WHEN_VALIDATE_ITEM')) {
    rules.push({
      id: `STATIC-VAL-${++ruleCounter}`,
      type: 'validation',
      description: 'Item-level validation trigger detected',
      formalSpec: 'Validate item value before commit',
      sourceTriggers: ['WHEN-VALIDATE-ITEM'],
      sourceLines: findLines(code, 'WHEN-VALIDATE-ITEM'),
      confidence: 0.7,
      category: 'mandatory',
      dependencies: [],
      testCases: []
    });
  }

  // Pattern: POST-QUERY (data enrichment after fetch)
  if (code.includes('POST-QUERY') || code.includes('POST_QUERY')) {
    rules.push({
      id: `STATIC-PQ-${++ruleCounter}`,
      type: 'calculation',
      description: 'Post-query logic: derived fields populated after record fetch',
      formalSpec: 'For each fetched record, compute derived fields',
      sourceTriggers: ['POST-QUERY'],
      sourceLines: findLines(code, 'POST-QUERY'),
      confidence: 0.8,
      category: 'derived',
      dependencies: [],
      testCases: []
    });
  }

  // Pattern: PRE-INSERT/PRE-UPDATE (audit, defaults)
  if (code.includes('PRE-INSERT') || code.includes('PRE_INSERT') || 
      code.includes('PRE-UPDATE') || code.includes('PRE_UPDATE')) {
    rules.push({
      id: `STATIC-AUDIT-${++ruleCounter}`,
      type: 'data_integrity',
      description: 'Audit fields (created_by, created_date, updated_by, updated_date) set on DML',
      formalSpec: 'Set audit metadata before insert/update',
      sourceTriggers: ['PRE-INSERT', 'PRE-UPDATE'],
      sourceLines: [...findLines(code, 'PRE-INSERT'), ...findLines(code, 'PRE-UPDATE')],
      confidence: 0.85,
      category: 'mandatory',
      dependencies: [],
      testCases: []
    });
  }

  // Pattern: COMMIT/ROLLBACK in triggers (anti-pattern)
  if (/\bCOMMIT\b|\bROLLBACK\b/i.test(code)) {
    rules.push({
      id: `STATIC-ANTIPATTERN-${++ruleCounter}`,
      type: 'security',
      description: 'Explicit transaction control in trigger (anti-pattern)',
      formalSpec: 'Triggers must not issue COMMIT/ROLLBACK; let Forms manage transactions',
      sourceTriggers: ['TRANSACTION_CONTROL'],
      sourceLines: findLines(code, 'COMMIT').concat(findLines(code, 'ROLLBACK')),
      confidence: 0.95,
      category: 'constraint',
      dependencies: [],
      testCases: [{
        input: {},
        expectedOutput: { hasCommitRollback: false },
        description: 'Trigger should not contain COMMIT or ROLLBACK'
      }]
    });
  }

  return rules;
}

function findLines(code: string, keyword: string): number[] {
  const lines: number[] = [];
  const regex = new RegExp(keyword, 'gi');
  let match;
  while ((match = regex.exec(code)) !== null) {
    const lineNum = code.substring(0, match.index).split('\n').length;
    lines.push(lineNum);
  }
  return lines;
}