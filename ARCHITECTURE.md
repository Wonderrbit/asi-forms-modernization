# Architecture Decision Records (ADRs) — ASI_FORMS

## ADR-001: Incremental Migration vs Big Bang
**Status:** Accepted
**Context:** Oracle Forms/Mainframe systems cannot be frozen for 12+ months.
**Decision:** Strangler Fig pattern with daily diff synchronization.
**Consequences:** 
- + Zero downtime, continuous value delivery
- + Rework limited to delta (agents re-analyze only changes)
- - Requires robust parser + graph diff engine
- - Human validation loop mandatory for each block

## ADR-002: GraphRAG (Neo4j) vs Vector-Only RAG
**Status:** Accepted
**Context:** Legacy systems have explicit cross-references (triggers calling procedures, blocks referencing tables, copy/paste code).
**Decision:** Neo4j Knowledge Graph as primary context store; pgvector as supplement for documentation/comments.
**Consequences:**
- + Dependencies traversable via Cypher (impact analysis, blast radius)
- + Agents reason over structure, not just similarity
- - Higher infra complexity (Neo4j cluster)
- - Parser must extract full AST + cross-refs

## ADR-003: Multi-Agent (LangGraph) vs Single LLM Call
**Status:** Accepted
**Context:** Migration requires distinct capabilities: rule extraction, bug detection, code generation, validation.
**Decision:** Specialized agents with shared Memory Layer (Neo4j), orchestrated via LangGraph.
**Consequences:**
- + Separation of concerns, testable individually
- + Memory persistence across runs (cross-client learning)
- + Human-in-the-loop at each stage
- - More complex orchestration, debugging

## ADR-004: MCP Server for LLM-Graph Access
**Status:** Accepted
**Context:** Agents and human dashboard need consistent, typed access to Knowledge Graph.
**Decision:** MCP Server exposing 12 typed tools (Cypher query, schema introspection, diff, validation, etc.)
**Consequences:**
- + LLMs use tools reliably (function calling)
- + Single source of truth for graph access
- + Audit trail of all graph interactions
- - Additional service to deploy/monitor

## ADR-005: Code Generation → Spring Boot/React (Not Proprietary Framework)
**Status:** Accepted
**Context:** Clients must own and run code without vendor dependency.
**Decision:** Generate standard Spring Boot 3 + React 18 + TypeScript + PostgreSQL.
**Consequences:**
- + Zero vendor lock-in, standard hiring pool
- + Client runs on any K8s/cloud
- - Templates must cover enterprise patterns (security, audit, config)

## ADR-006: Security-First Design (Pentest Background Applied)
**Status:** Accepted
**Context:** Legacy systems handle financial/regulated data; migration must not introduce vulnerabilities.
**Decision:** Threat model per component; pentest findings feed BugCorrector agent; generated code passes SAST/DAST gates.
**Consequences:**
- + Security as enabler, not blocker
- + Compliance (LGPD, PCI-DSS, SOX) baked in
- - Slower initial codegen (more validation gates)

## ADR-007: Observability Stack (LangFuse + Grafana + OpenTelemetry)
**Status:** Accepted
**Context:** Multi-agent systems are non-deterministic; need traceability for debugging and audit.
**Decision:** LangFuse for LLM traces/generations/scores; Grafana for infra/business metrics; OTel for distributed tracing.
**Consequences:**
- + End-to-end visibility (user request → agent → graph → codegen → validation)
- + Cost tracking per model/feature
- - Instrumentation overhead

## ADR-008: CI/CD with ArgoCD + GitOps
**Status:** Accepted
**Context:** Production deployments must be auditable, rollbackable, environment-consistent.
**Decision:** ArgoCD managing Helm charts; environments as Git branches; promotion via PR.
**Consequences:**
- + Audit trail, rollback in seconds
- + Environment parity
- - Requires GitOps maturity

---

## Trade-offs Summary

| Decisão | Ganho | Custo | Mitigação |
|---------|-------|-------|-----------|
| GraphRAG (Neo4j) | Dependency reasoning, impact analysis | Infra complexity | Managed Neo4j (Aura) or k8s operator |
| Multi-Agent | Specialization, testability, memory | Orchestration complexity | LangGraph state machine, observability |
| MCP Server | Typed LLM-graph contract | Extra service | Auto-generated from CONTRACTS/ |
| Spring Boot/React gen | Zero lock-in, standard talent | Template maintenance | Versioned templates, golden path |
| Security-first | Compliance, trust | Velocity | Automated gates, pentest-informed agents |

---

## Threat Model (STRIDE)

| Componente | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|------------|----------|-----------|-------------|-----------------|-----|-----------|
| Parser (.fmb upload) | ✅ Signed uploads | ✅ Hash validation | ✅ Audit log | ✅ Encryption at rest | ✅ Rate limit | ✅ RBAC |
| MCP Server | ✅ mTLS | ✅ Input validation | ✅ Request signing | ✅ Field-level encryption | ✅ Quotas | ✅ OAuth2/OIDC |
| Agents (LangGraph) | ✅ Tool auth | ✅ Output validation | ✅ Trace logging | ✅ PII masking | ✅ Circuit breaker | ✅ Least privilege |
| Codegen Templates | ✅ Signed releases | ✅ SAST gate | ✅ Provenance | ✅ No secrets in templates | ✅ Build isolation | ✅ Supply chain scan |
| Neo4j Graph | ✅ Auth | ✅ ACID | ✅ Audit log | ✅ Encryption | ✅ Cluster HA | ✅ RBAC |

---

## Compliance Mapping

| Regulamento | Controle ASI_FORMS |
|-------------|-------------------|
| LGPD | PII masking in logs, data minimization, retention policies, DPIA per client |
| PCI-DSS | No card data in graph, tokenization, network segmentation, quarterly pentest |
| SOX | Audit trail immutable, change control via GitOps, access logging, segregation of duties |
| Open Banking | Consent management, API security (FAPI), encryption, monitoring |