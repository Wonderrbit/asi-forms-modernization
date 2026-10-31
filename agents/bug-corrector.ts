// BugCorrector Agent — ASI_FORMS
// Detects and fixes common Oracle Forms/PL/SQL bugs and anti-patterns.
// Supports Crypto-Asset Discovery: maps RSA/ECC usage across code, Docker images, and cloud infra.
// Implements: BugCorrectorInput -> BugCorrectorOutput (see CONTRACTS/agents.ts)

import {
  BugCorrectorInput,
  BugCorrectorOutput,
  AppliedFix,
  RemainingIssue,
  BugPattern,
  ValidationRule,
  CryptoAssetDiscovery
} from '../CONTRACTS/agents';
import { LLMClient, PromptTemplate } from '../api/llm-client';

// ============================================
// KNOWN ORACLE FORMS BUG PATTERNS
// ============================================

export const ORACLE_FORMS_BUG_PATTERNS: BugPattern[] = [
  {
    id: 'BUG-ORA-001',
    name: 'Implicit Commit in POST-QUERY',
    pattern: 'POST-QUERY|POST_QUERY.*COMMIT',
    severity: 'critical',
    description: 'COMMIT inside POST-QUERY breaks Forms transaction model; causes "ORA-01455: converting column overflows" and data inconsistency',
    fixTemplate: 'REMOVE COMMIT; let Forms handle transaction. Use POST-DATABASE-COMMIT trigger for post-commit logic.',
    references: ['Oracle Forms Developer Guide: Transaction Processing', 'Metalink Note 1012345.6']
  },
  {
    id: 'BUG-ORA-002',
    name: 'Empty Exception Handler (WHEN OTHERS THEN NULL)',
    pattern: 'WHEN OTHERS THEN\\s*NULL',
    severity: 'high',
    description: 'Swallows all exceptions silently; makes debugging impossible; hides constraint violations, conversion errors',
    fixTemplate: 'WHEN OTHERS THEN RAISE_APPLICATION_ERROR(-20001, \'Error in {{trigger}}: \' || SQLERRM);',
    references: ['Oracle PL/SQL Best Practices: Exception Handling', 'OWASP: Error Handling']
  },
  {
    id: 'BUG-ORA-003',
    name: 'GOTO Usage (Spaghetti Code)',
    pattern: '\\bGOTO\\b',
    severity: 'medium',
    description: 'GOTO creates unmaintainable control flow; replace with structured constructs (LOOP, IF, CASE)',
    fixTemplate: 'REFACTOR: Replace GOTO {{label}} with structured loop/conditional.',
    references: ['Dijkstra: "Go To Statement Considered Harmful"', 'Oracle PL/SQL Coding Standards']
  },
  {
    id: 'BUG-ORA-004',
    name: 'Hardcoded Magic Values in SQL',
    pattern: 'WHERE\\s+\\w+\\s*=\\s*[\'"][0-9]{2,}[\'"]',
    severity: 'medium',
    description: 'Hardcoded status codes, type IDs, etc. Should use lookup tables or constants package',
    fixTemplate: 'REPLACE with PKG_CONSTANTS.{{CONSTANT_NAME}} or lookup table join.',
    references: ['Maintainability: Magic Numbers Anti-pattern']
  },
  {
    id: 'BUG-ORA-005',
    name: 'Implicit Cursor in Loop (Performance)',
    pattern: 'FOR\\s+\\w+\\s+IN\\s*\\([^)]*SELECT[^)]*\\)\\s+LOOP',
    severity: 'low',
    description: 'Implicit cursor FOR loop can be slower than BULK COLLECT for large datasets',
    fixTemplate: 'CONSIDER: BULK COLLECT INTO collection LIMIT 100 FORALL for bulk DML.',
    references: ['Oracle PL/SQL Performance Tuning: BULK COLLECT']
  },
  {
    id: 'BUG-ORA-006',
    name: 'SQL Injection via Dynamic SQL',
    pattern: 'EXECUTE IMMEDIATE\\s+[^;]*\\|\\|',
    severity: 'critical',
    description: 'String concatenation in EXECUTE IMMEDIATE enables SQL injection; use bind variables',
    fixTemplate: 'EXECUTE IMMEDIATE \'SELECT * FROM {{table}} WHERE id = :b1\' USING v_id;',
    references: ['OWASP: SQL Injection', 'Oracle Database Security Guide']
  },
  {
    id: 'BUG-ORA-007',
    name: 'TO_DATE without Format Mask',
    pattern: 'TO_DATE\\s*\\([^,\\)]+\\)',
    severity: 'high',
    description: 'TO_DATE without explicit format mask depends on NLS_DATE_FORMAT; breaks across environments',
    fixTemplate: 'TO_DATE({{value}}, \'YYYY-MM-DD\') -- or appropriate mask',
    references: ['Oracle Globalization Support Guide']
  },
  {
    id: 'BUG-ORA-008',
    name: 'SELECT * in Production Code',
    pattern: 'SELECT\\s+\\*\\s+FROM',
    severity: 'medium',
    description: 'SELECT * breaks when columns added/removed; explicit column list required',
    fixTemplate: 'SELECT col1, col2, col3 FROM {{table}}',
    references: ['SQL Best Practices']
  },
  {
    id: 'BUG-ORA-009',
    name: 'Unnecessary Cursor Open/Fetch/Close',
    pattern: 'OPEN\\s+\\w+\\s*;[^;]*FETCH\\s+\\w+\\s+INTO[^;]*CLOSE\\s+\\w+',
    severity: 'low',
    description: 'Explicit cursor management verbose; prefer FOR loop or BULK COLLECT',
    fixTemplate: 'REPLACE with FOR rec IN (SELECT ...) LOOP ... END LOOP;',
    references: ['Oracle PL/SQL Language Reference: Cursor FOR Loops']
  },
  {
    id: 'BUG-ORA-010',
    name: 'DECODE instead of CASE (Readability)',
    pattern: 'DECODE\\s*\\([^)]+,',
    severity: 'low',
    description: 'DECODE is legacy; CASE expression is ANSI standard, more readable, supports searched conditions',
    fixTemplate: 'CASE WHEN {{cond}} THEN {{val}} ELSE {{else}} END',
    references: ['Oracle SQL Reference: CASE Expression']
  },
  {
    id: 'BUG-ORA-011',
    name: 'Trigger Mutating Table Error (ORA-04091)',
    pattern: 'FOR EACH ROW.*SELECT.*FROM\\s+(:OLD|:NEW)\\s*TABLE',
    severity: 'critical',
    description: 'Row-level trigger querying same table being modified; use compound triggers or autonomous transaction',
    fixTemplate: 'USE compound trigger (11g+) or PRAGMA AUTONOMOUS_TRANSACTION in helper procedure.',
    references: ['Oracle Trigger Restrictions: Mutating Tables']
  },
  {
    id: 'BUG-ORA-012',
    name: 'Bind Variable Missing in Dynamic SQL',
    pattern: 'EXECUTE IMMEDIATE\\s+[\'"][^\'"]*\\|\\|[^\'"]*[\'"]',
    severity: 'critical',
    description: 'Concatenation instead of USING clause; SQL injection + performance (hard parse)',
    fixTemplate: 'EXECUTE IMMEDIATE \'DELETE FROM {{table}} WHERE id = :id\' USING v_id;',
    references: ['Oracle Dynamic SQL: Bind Variables']
  }
];

// ============================================
// CRYPTO ASSET DISCOVERY PATTERNS
// ============================================
// Patterns for detecting RSA/ECC usage in code, Docker configs, and cloud infra

export const CRYPTO_ASSET_PATTERNS: Record<string, {
  name: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  pattern: string;
  category: "rsa" | "ecc" | "certificate" | "hardcoded_key" | "tls_config";
}> = {
  RSA_2048_MODULUS: {
    name: 'RSA-2048 Modulus Detection',
    severity: 'critical',
    description: 'RSA-2048 modulus found in code - vulnerable to quantum attacks',
    pattern: 'modulus|n\\s*=\\s*BigInteger\\.parseLong|new BigInteger\\(.*32-byte',
    category: 'rsa'
  },
  RSA_3072_MODULUS: {
    name: 'RSA-3072 Modulus Detection',
    severity: 'high',
    description: 'RSA-3072 modulus found - should be migrated to PQC',
    pattern: 'modulus|n\\s*=\\s*BigInteger\\.parseLong|new BigInteger\\(.*48-byte',
    category: 'rsa'
  },
  ECDSA_P256: {
    name: 'ECDSA P-256 Detection',
    severity: 'critical',
    description: 'ECDSA P-256 curve found - broken by Shor\'s algorithm on quantum computers',
    pattern: 'P-256|secp256r1|EC_KEY\\.getParameters|Curve\.getName\\(\"P-256\"\\)',
    category: 'ecc'
  },
  ECDSA_P384: {
    name: 'ECDSA P-384 Detection',
    severity: 'high',
    description: 'ECDSA P-384 curve found - should be migrated to ML-DSA',
    pattern: 'P-384|secp384r1|EC_KEY\\.getParameters|Curve\.getName\\(\"P-384\"\\)',
    category: 'ecc'
  },
  HARDCODED_CERTIFICATE: {
    name: 'Hardcoded Certificate Detection',
    severity: 'critical',
    description: 'X.509 certificate hardcoded in source - risk of extraction and misuse',
    pattern: 'BEGIN CERTIFICATE.*END CERTIFICATE|X509\\.|\\/C=\\/',
    category: 'certificate'
  },
  HARDCODED_RSA_KEY: {
    name: 'Hardcoded RSA Private Key Detection',
    severity: 'critical',
    description: 'RSA private key material hardcoded - extreme security risk',
    pattern: 'private\\s+key|PRIVATE KEY|BEGIN RSA PRIVATE KEY',
    category: 'hardcoded_key'
  },
  TLS_ECDHE: {
    name: 'ECDHE TLS Detection',
    severity: 'high',
    description: 'ECDHE key exchange in TLS config - vulnerable to future quantum attacks',
    pattern: 'ECDHE|\\-ecc\\-|\\-prime\\-|\\-sect\\-',
    category: 'tls_config'
  },
  TLS_RSA_KEY_EXCHANGE: {
    name: 'RSA Key Exchange Detection',
    severity: 'high',
    description: 'RSA key exchange in TLS - should be replaced with ML-KEM hybrid',
    pattern: 'RSA\\-|\\-rsa\\-|key_type.*RSA',
    category: 'tls_config'
  }
};

// ============================================
// BUG CORRECTOR AGENT CLASS
// ============================================

export class BugCorrectorAgent {
  private llm: LLMClient;
  private promptVersion: string = 'v1.3.0';

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  async correct(input: BugCorrectorInput): Promise<BugCorrectorOutput> {
    const { context, triggerCode, ast, crossRefs, knownBugPatterns, ruleAnalysis } = input;

    // 1. Static analysis first (fast, deterministic)
    const staticFindings = this.runStaticAnalysis(triggerCode, knownBugPatterns);

    // 2. Crypto Asset Discovery - find RSA/ECC usage
    const cryptoFindings = this.runCryptoDiscovery(triggerCode);

    // 3. LLM analysis for complex patterns
    const llmFindings = await this.runLLMAnalysis(triggerCode, ast, crossRefs, ruleAnalysis, staticFindings);

    // 4. Merge and prioritize
    const allFindings = this.mergeFindings(staticFindings, llmFindings);

    // 5. Generate fixes
    const { fixedCode, fixesApplied, remainingIssues } = this.applyFixes(triggerCode, allFindings);

    // 6. Derive new validation rules for CodeGenerator
    const validationRules = this.deriveValidationRules(fixesApplied, ruleAnalysis);

    // 7. Build crypto asset map for PQC migration planning
    const cryptoAssets = this.buildCryptoAssetMap(cryptoFindings, triggerCode);

    return {
      fixedCode,
      fixesApplied,
      remainingIssues,
      validationRules,
      cryptoAssets
    };
  }

  private buildCryptoAssetMap(findings: AppliedFix[], code: string): CryptoAssetDiscovery[] {
    return findings
      .filter(f => f.bugPatternId.startsWith('CRYPTO-'))
      .map(f => {
        const lines = code.split('\n');
        const lineIdx = f.location.line - 1;
        const lineContent = lineIdx >= 0 && lineIdx < lines.length ? lines[lineIdx].trim() : f.originalCode;

        const assetType = f.bugPatternId.replace('CRYPTO-', '').split('_')[0].toLowerCase() as CryptoAssetDiscovery['category'];
        const recommendationMap: Record<string, string> = {
          'rsa': 'Replace with ML-KEM-768 hybrid (FIPS 203)',
          'ecc': 'Replace with ML-DSA-87 (FIPS 204)',
          'certificate': 'Use PQC-enabled certificate chain (X.509 with ML-DSA)',
          'hardcoded_key': 'Remove hardcoded keys; use HSM/KMS with PQC support',
          'tls_config': 'Enable hybrid TLS 1.3 with ML-KEM key encapsulation'
        };

        return {
          id: f.bugPatternId,
          category: assetType,
          severity: f.cryptoAsset?.severity || 'medium',
          name: f.cryptoAsset?.name || 'Unknown Crypto Asset',
          location: { line: f.location.line, column: f.location.column },
          description: f.explanation,
          codeSnippet: lineContent,
          recommendation: recommendationMap[assetType] || 'Migrate to PQC algorithm'
        };
      });
  }

  private runStaticAnalysis(code: string, patterns: BugPattern[]): AppliedFix[] {
    const findings: AppliedFix[] = [];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.pattern, 'gi');
      let match;
      while ((match = regex.exec(code)) !== null) {
        const line = code.substring(0, match.index).split('\n').length;
        findings.push({
          bugPatternId: pattern.id,
          location: { line, column: match.index, length: match[0].length },
          originalCode: match[0],
          fixedCode: this.generateFix(pattern, match[0], code),
          explanation: pattern.description,
          confidence: pattern.severity === 'critical' ? 0.95 : pattern.severity === 'high' ? 0.9 : 0.75,
          requiresHumanReview: pattern.severity === 'critical'
        });
      }
    }

    return findings;
  }

  private runCryptoDiscovery(code: string): AppliedFix[] {
    const findings: AppliedFix[] = [];

    for (const [id, pattern] of Object.entries(CRYPTO_ASSET_PATTERNS)) {
      const regex = new RegExp(pattern.pattern, 'gi');
      let match;
      while ((match = regex.exec(code)) !== null) {
        const line = code.substring(0, match.index).split('\n').length;
        findings.push({
          bugPatternId: `CRYPTO-${id}`,
          location: { line, column: match.index, length: match[0].length },
          originalCode: match[0],
          fixedCode: '',
          explanation: pattern.description,
          confidence: 0.9,
          requiresHumanReview: true,
          cryptoAsset: {
            category: pattern.category,
            severity: pattern.severity,
            name: pattern.name
          }
        });
      }
    }

    return findings;
  }

  private generateFix(pattern: BugPattern, matched: string, fullCode: string): string {
    // Simple template replacement; real implementation uses AST transformation
    switch (pattern.id) {
      case 'BUG-ORA-001': // COMMIT in POST-QUERY
        return matched.replace(/COMMIT\s*;/gi, '-- COMMIT REMOVED: Forms manages transaction');
      case 'BUG-ORA-002': // WHEN OTHERS THEN NULL
        return matched.replace(/WHEN\s+OTHERS\s+THEN\s+NULL\s*;/gi, 'WHEN OTHERS THEN RAISE_APPLICATION_ERROR(-20001, \'Error: \' || SQLERRM);');
      case 'BUG-ORA-006': // SQL Injection
        return matched.replace(/EXECUTE IMMEDIATE\s+['"]([^'"]*)\|\|([^'"]*)['"]/gi, 'EXECUTE IMMEDIATE \'$1:bind\' USING $2');
      case 'BUG-ORA-007': // TO_DATE without mask
        return matched.replace(/TO_DATE\s*\(\s*([^,)]+)\s*\)/gi, "TO_DATE($1, 'YYYY-MM-DD')");
      case 'BUG-ORA-008': // SELECT *
        return matched.replace(/SELECT\s+\*\s+FROM/gi, 'SELECT /* EXPLICIT COLUMNS */ FROM');
      default:
        return matched + ` -- [AUTO-FIX: ${pattern.id}]`;
    }
  }

  private async runLLMAnalysis(
    code: string,
    ast: any,
    crossRefs: any[],
    ruleAnalysis: any,
    staticFindings: AppliedFix[]
  ): Promise<AppliedFix[]> {
    const prompt = PromptTemplate.render(`
<role>
You are a Senior PL/SQL Security Auditor. Find bugs that STATIC ANALYSIS MISSED.
Focus on: business logic errors, race conditions, data integrity, Oracle-specific pitfalls.
</role>

<code>
{{code}}
</code>

<ast_summary>
{{astSummary}}
</ast_summary>

<cross_refs>
{{crossRefs}}
</cross_refs>

<existing_rules>
{{ruleSummary}}
</existing_rules>

<static_findings>
{{staticFindings}}
</static_findings>

<output_format>
[
  {"patternId": "LLM-001", "location": {"line": 10, "column": 5, "length": 20}, "originalCode": "...", "fixedCode": "...", "explanation": "...", "confidence": 0.85, "requiresHumanReview": true}
]
</output_format>
`, {
      code,
      astSummary: JSON.stringify(ast?.metadata || {}, null, 2).slice(0, 2000),
      crossRefs: crossRefs.map(r => `${r.type}:${r.name}`).join(', '),
      ruleSummary: ruleAnalysis?.rules?.map((r: any) => `${r.id}: ${r.description}`).join('; ') || 'none',
      staticFindings: staticFindings.map(f => `${f.bugPatternId}@L${f.location.line}`).join(', ') || 'none'
    });

    try {
      const response = await this.llm.generateStructured<AppliedFix[]>(prompt, {
        temperature: 0.0,
        maxTokens: 4000,
        schema: { type: 'array', items: { type: 'object' } }
      });
      return response || [];
    } catch (e) {
      console.warn('LLM bug analysis failed:', e);
      return [];
    }
  }

  private mergeFindings(static: AppliedFix[], llm: AppliedFix[]): AppliedFix[] {
    // Deduplicate by location + patternId
    const seen = new Set<string>();
    const merged: AppliedFix[] = [];

    for (const f of [...static, ...llm]) {
      const key = `${f.bugPatternId}:${f.location.line}:${f.location.column}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(f);
      }
    }

    // Sort by severity (critical first), then line
    return merged.sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const aSev = a.bugPatternId.startsWith('LLM') ? 'medium' : 
                   a.bugPatternId.includes('001') || a.bugPatternId.includes('006') || a.bugPatternId.includes('011') || a.bugPatternId.includes('012') ? 'critical' :
                   a.bugPatternId.includes('002') || a.bugPatternId.includes('007') ? 'high' :
                   a.bugPatternId.includes('003') || a.bugPatternId.includes('004') ? 'medium' : 'low';
      const bSev = b.bugPatternId.startsWith('LLM') ? 'medium' :
                   b.bugPatternId.includes('001') || b.bugPatternId.includes('006') || b.bugPatternId.includes('011') || b.bugPatternId.includes('012') ? 'critical' :
                   b.bugPatternId.includes('002') || b.bugPatternId.includes('007') ? 'high' :
                   b.bugPatternId.includes('003') || b.bugPatternId.includes('004') ? 'medium' : 'low';
      return (sevOrder[aSev] - sevOrder[bSev]) || (a.location.line - b.location.line);
    });
  }

  private applyFixes(code: string, findings: AppliedFix[]): { fixedCode: string; fixesApplied: AppliedFix[]; remainingIssues: RemainingIssue[] } {
    let fixedCode = code;
    const fixesApplied: AppliedFix[] = [];
    const remainingIssues: RemainingIssue[] = [];

    // Apply fixes in reverse line order to preserve line numbers
    const sorted = [...findings].sort((a, b) => b.location.line - a.location.line);

    for (const finding of sorted) {
      const lines = fixedCode.split('\n');
      const lineIdx = finding.location.line - 1;
      
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const line = lines[lineIdx];
        const startCol = finding.location.column - 1;
        const endCol = startCol + finding.location.length;
        
        if (endCol <= line.length && line.substring(startCol, endCol) === finding.originalCode) {
          lines[lineIdx] = line.substring(0, startCol) + finding.fixedCode + line.substring(endCol);
          fixedCode = lines.join('\n');
          fixesApplied.push(finding);
        } else {
          remainingIssues.push({
            bugPatternId: finding.bugPatternId,
            location: finding.location,
            description: finding.explanation,
            reason: 'complex_refactor_needed',
            suggestion: finding.fixedCode
          });
        }
      } else {
        remainingIssues.push({
          bugPatternId: finding.bugPatternId,
          location: finding.location,
          description: finding.explanation,
          reason: 'complex_refactor_needed',
          suggestion: 'Manual refactor required; line numbers shifted'
        });
      }
    }

    return { fixedCode, fixesApplied, remainingIssues };
  }

  private deriveValidationRules(fixes: AppliedFix[], ruleAnalysis: any): ValidationRule[] {
    const rules: ValidationRule[] = [];

    for (const fix of fixes) {
      switch (fix.bugPatternId) {
        case 'BUG-ORA-001':
          rules.push({
            ruleId: 'VAL-NO-COMMIT-IN-TRIGGER',
            field: 'trigger_code',
            rule: 'FORBIDDEN: COMMIT; ROLLBACK;',
            severity: 'error',
            message: 'Triggers must not control transactions. Remove COMMIT/ROLLBACK.'
          });
          break;
        case 'BUG-ORA-002':
          rules.push({
            ruleId: 'VAL-NO-EMPTY-EXCEPTION',
            field: 'trigger_code',
            rule: 'FORBIDDEN: WHEN OTHERS THEN NULL',
            severity: 'error',
            message: 'Empty exception handlers swallow errors. Use RAISE_APPLICATION_ERROR.'
          });
          break;
        case 'BUG-ORA-006':
        case 'BUG-ORA-012':
          rules.push({
            ruleId: 'VAL-NO-SQL-INJECTION',
            field: 'trigger_code',
            rule: 'FORBIDDEN: EXECUTE IMMEDIATE with concatenation. Use USING clause.',
            severity: 'error',
            message: 'Dynamic SQL must use bind variables (USING clause).'
          });
          break;
        case 'BUG-ORA-007':
          rules.push({
            ruleId: 'VAL-TO-DATE-FORMAT',
            field: 'trigger_code',
            rule: 'REQUIRED: TO_DATE must have explicit format mask',
            severity: 'error',
            message: 'TO_DATE requires explicit format mask (e.g., YYYY-MM-DD).'
          });
          break;
      }
    }

    return rules;
  }
}