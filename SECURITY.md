# Security Documentation — ASI_FORMS

## Pentest-Informed Design
Background: DESEC Pentest V1/V2 (500h+), CPENT, exploit development (x86/x64 buffer overflow), OWASP Top 10, PTES methodology.

## Threat Model (Resumo)
Ver [ARCHITECTURE.md#threat-model-stride](ARCHITECTURE.md#threat-model-stride)

## Vulnerability Management

### Parser (.fmb Binary)
- **Risco:** Malformed binary → parser crash / RCE
- **Mitigação:** 
  - Sandboxed parsing (gVisor/Firecracker)
  - Input validation: magic bytes, size limits, checksum
  - Fuzzing contínuo (AFL++ em CI)
  - Zero-trust: parser não tem acesso a rede/FS

### MCP Server
- **Risco:** Tool injection, unauthorized graph access, DoS
- **Mitigação:**
  - mTLS entre clientes e MCP
  - OAuth2/OIDC com scopes granulares (`graph:read`, `graph:write`, `diff:read`)
  - Rate limiting por client_id (token bucket)
  - Input validation: Cypher parameterization (zero string concat)
  - Audit log imutável (append-only, signed)

### Agents (LangGraph)
- **Risco:** Prompt injection, hallucinated code, PII leakage
- **Mitigação:**
  - System prompts versionados e assinados
  - Output validation: SAST (Bandit, Semgrep) em codegen
  - PII masking nos logs (LangFuse processors)
  - Human-in-the-loop obrigatório para `CodeGenerator`

### Codegen Templates
- **Risco:** Supply chain attack, vulnerable dependencies
- **Mitigação:**
  - Templates versionados em repo separado (signed releases)
  - `cargo-audit` / `npm audit` / `pip-audit` em CI
  - SBOM (CycloneDX) gerado por build
  - Dependabot + Renovate automatizado

### Neo4j Knowledge Graph
- **Risco:** Data exfiltration, injection, privilege escalation
- **Mitigação:**
  - RBAC nativo (roles: `parser`, `agent`, `human`, `admin`)
  - Encryption at rest (AES-256) + in transit (TLS 1.3)
  - Query allowlist para roles não-admin
  - Backup criptografado, teste de restore mensal

## Compliance

| Standard | Status | Evidência |
|----------|--------|-----------|
| LGPD | ✅ Conforme | DPIA, data mapping, retention, consent |
| PCI-DSS v4 | ✅ Escopo reduzido | No card data, tokenization, segmentation |
| SOX | ✅ Controles | Immutable audit trail, GitOps, segregation |
| ISO 27001 | 🔄 Em andamento | ISMS, risk treatment, internal audit Q4/2026 |

## Pentest Findings (Internos - Resumo)

| Componente | Severidade | Finding | Status |
|------------|------------|---------|--------|
| Parser | Medium | Path traversal via crafted .fmb | ✅ Fixed (sandbox + validation) |
| MCP | Low | Info disclosure via error messages | ✅ Fixed (generic errors) |
| Agent | Medium | Prompt injection via user upload | ✅ Fixed (input sanitization + output validation) |
| Codegen | Low | Outdated dependency in template | ✅ Fixed (Renovate + pinned versions) |

## Incident Response
1. **Detecção:** Alertas Grafana (anomalia tráfego, erro rate, latência)
2. **Contenção:** Feature flags (kill switch por componente), network policies
3. **Erradicação:** Root cause analysis (5 Whys), patch + deploy via ArgoCD
4. **Recuperação:** Restore point (GitOps), validação smoke tests
5. **Lição:** Post-mortem blameless, atualização threat model, regressão em CI

## Bug Bounty / Responsible Disclosure
- **Escopo:** `*.asi-forms.com`, `api.asi-forms.com`, `mcp.asi-forms.com`
- **Excluído:** Infraestrutura cloud provider, DNS, email
- **Contato:** security@asi-forms.com (PGP: `0x...`)
- **SLA:** Triagem 48h, fix crítico 7d, divulgação coordenada 90d

## Secure Development Lifecycle (SDL)

| Fase | Atividade | Tool/Gate |
|------|-----------|-----------|
| Design | Threat model (STRIDE), ADR review | Architecture review meeting |
| Code | SAST (Semgrep, Bandit), Secrets scan (TruffleHog) | PR gate (fail on high) |
| Build | Dependency scan (OSV, Grype), SBOM | CI gate |
| Test | DAST (OWASP ZAP), Fuzzing (AFL++), Contract tests | Nightly pipeline |
| Deploy | Image signing (Cosign), Admission policy (Kyverno) | ArgoCD sync wave |
| Operate | Runtime security (Falco), Audit log (Falco + Kyverno) | Alerting Grafana |

## References
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [NIST AI RMF](https://airc.nist.gov/AI_RMF_Knowledge_Base)
- [MITRE ATLAS](https://atlas.mitre.org/)
- [DESEC Pentest Methodology](https://desec.security/metodologia)