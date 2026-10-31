# ASI_FORMS — Incremental Legacy Modernization Pipeline

> Legado não para. Nós também não.

Pipeline de produção para migração contínua de **Oracle Forms 10g/11g** e **Mainframe** para **Cloud-Native (Spring Boot/React)**, usando **GraphRAG + Multi-Agent AI (LangGraph) + MCP**. Inclui suporte nativo a **Criptografia Pós-Quântica (PQC)** com arquitetura híbrida e criptoagilidade.

## Problema

- Projetos "Big Bang" de 12–18 meses nascem desatualizados
- Legado muta durante migração (hotfix fiscal, schema changes, regras de negócio)
- Risco de parada de faturamento/logística/ERP = inaceitável
- Criptografia legada (RSA-2048, ECC) vulnerável a ataques quânticos — "Harvest Now, Decrypt Later"

## Solução: Modernização Incremental (Strangler Fig + GraphRAG + PQC)

1. **Parser `.fmb` binário** → AST → **Neo4j Knowledge Graph** (forms, blocks, triggers, regras, dependências cruzadas)
2. **CryptoDiscovery Agent** — mapeia ativos criptográficos RSA/ECC no código legado (SAST + Docker + Cloud)
3. **Multi-Agent LangGraph**:
   - `RuleAnalyst` — extrai regras de negócio do grafo
   - `BugCorrector` — detecta/corrige bugs Oracle + reporta ativos criptográficos
   - `CodeGenerator` — gera Spring Boot/React com configuração PQC-ready
4. **Memory Layer** — lições aprendidas persistidas no grafo (reutilizável cross-cliente)
5. **MCP Server (12 tools + 4 crypto tools)** — LLMs consultam grafo e operam criptografia híbrida em tempo real
6. **CryptoAgility Manager** — troca de algoritmos via config remota, sem redeploy
7. **LongRetention Blindage** — hybrid key wrap (RSA-OAEP + ML-KEM) para dados de retenção longa
8. **Diff Diário** — sincroniza com produção viva; agentes reanalisam apenas o delta
9. **Validação Humana no Loop** — dashboard para especialista validar antes de gerar código

## Entregáveis

- Bloco de faturamento migrado em **3–4 semanas** (vs 12 meses tradicional)
- Código **100% do cliente** (Spring Boot 3, React 18, TypeScript, PostgreSQL)
- **Zero vendor lock-in** — execução em qualquer Kubernetes/cloud
- Observabilidade: LangFuse + Grafana + telemetria custom
- **PQC-Ready**: arquitetura híbrida (ECDSA + ML-KEM), criptoagilidade, blindagem de retenção longa

## Stack

`Python/FastAPI` `TypeScript/React` `Neo4j` `LangGraph` `MCP` `Docker/K8s/ArgoCD` `LangFuse` `Grafana` `liboqs` `OpenSSL 3.0+`

## Métricas Reais

| Métrica | Tradicional | ASI_FORMS |
|---------|-------------|-----------|
| Time-to-first-value | 12–18 meses | 3–4 semanas |
| Risco paralisação | Alto | Zero (sync prod viva) |
| Rework por mutação | 100% (recomeça) | Delta-only (agents) |
| Propriedade código | Consultoria | **Cliente** |
| Escalabilidade | Projeto único | Pipeline reutilizável |
| Crypto-inventory | Manual/inexistente | Automated (SAST + runtime) |
| Algoritmo migration | Redeploy necessário | Config remota (crypto-agility) |

## Estrutura do Repo

```
asi-forms/
├── parser/           # .fmb binary → AST → Neo4j
├── agents/           # LangGraph agents (RuleAnalyst, BugCorrector, CodeGenerator)
├── graph/            # Neo4j schema, Cypher, memory layer
├── mcp-server/       # 12 typed tools + 4 crypto tools (hybrid TLS)
├── api/              # FastAPI REST + MCP endpoints + crypto-provider
│   ├── crypto-provider.ts          # Hybrid classical + PQC operations
│   ├── hybrid-tls-server.ts        # Fastify server with crypto endpoints
│   ├── crypto-agility.ts           # Plugin-based algorithm management
│   ├── hybrid-tls-poc.ts           # PoC test suite
│   └── long-retention-blindage.ts  # Long-term data protection
├── frontend/         # React dashboard (upload, graph nav, validation)
├── tests/            # Contract + unit + integration
├── deploy/           # Docker, Helm, ArgoCD
├── CONTRACTS/        # Typed interfaces (MCP tools, agent I/O, graph schema, crypto assets)
├── ARCHITECTURE.md   # Decisions, trade-offs, threat model
├── SECURITY.md       # Threat model, pentest findings, compliance
├── CASE_STUDIES/     # Bradesco (anon), Hermes, metrics
└── PQC_INTEGRATION_SUMMARY.md  # PQC integration documentation
```

## PQC Integration (NIST FIPS 203/204 Compliant)

### Crypto-Inventory & Discovery
- 8 padrões de detecção: RSA-2048/3072, ECDSA P-256/P-384, certificados hardcoded, chaves privadas, TLS ECDHE/RSA
- Output: `CryptoAssetDiscovery[]` com severidade, localização e recomendação de migração

### Hybrid Architecture
- Modos: `CLASSICAL` | `HYBRID` | `PQC_ONLY`
- Algoritmos: RSA/ECDSA (clássico) + ML-KEM-512/768/1024, ML-DSA-44/65/87 (PQC)
- Combinação híbrida via XOR para defense-in-depth
- Endpoints REST: `/crypto/encapsulate`, `/crypto/decapsulate`, `/crypto/sign`, `/crypto/verify`, `/crypto/config`

### Crypto-Agility
- Registry de plugins: classical-provider, pqc-provider, hybrid-provider
- Política: modos/algoritmos permitidos, aprovação obrigatória, rollback automático (5 min)
- Auditoria imutável de todas as mudanças de configuração
- Hook React `useCryptoAgility()` para frontend

### Long-Retention Blindage
- 6 classificações: health (20a), financial (10a), ip (50a), legal (30a), government (100a), industrial (25a)
- Hybrid key wrap: RSA-OAEP (clássico) + ML-KEM (PQC) — ambos devem ter sucesso
- Rotação automática baseada em política de retenção
- Relatórios de consultoria por setor (fintech, healthtech, legaltech, govtech)

### NIST Security Levels
| Level | Classical | PQC KEM | PQC Sig | Uso |
|-------|-----------|---------|---------|-----|
| 1 (AES-128) | ECDSA-P256 | ML-KEM-512 | ML-DSA-44 | Uso geral |
| 3 (AES-192) | ECDSA-P384 | ML-KEM-768 | ML-DSA-65 | **Default recomendado** |
| 5 (AES-256) | RSA-4096 | ML-KEM-1024 | ML-DSA-87 | Governo/Long-term |

## Variáveis de Ambiente

```bash
PQC_MODE=HYBRID                    # CLASSICAL | HYBRID | PQC_ONLY
PQC_CLASSICAL=ECDSA-P256           # RSA-2048 | RSA-3072 | RSA-4096 | ECDSA-P256 | ECDSA-P384
PQC_ALGORITHM=ML-KEM-768           # ML-KEM-512 | ML-KEM-768 | ML-KEM-1024 | ML-DSA-44 | ML-DSA-65 | ML-DSA-87
PQC_REMOTE_UPDATE=true             # Habilita atualização remota de config
PQC_REQUIRE_APPROVAL=true          # Exige aprovação para mudanças
PQC_APPROVAL_THRESHOLD=high        # critical | high | medium | low
PORT=3000                          # API server
MCP_PORT=3001                      # MCP server
```

## Cases

- **Bradesco (anon):** Mainframe Endevor → GitHub + CI/CD resiliente
- **Hermes:** Restaurant AI autônomo (WhatsApp→PIX→Cozinha→ROI) — prova de autonomia em produção
- **ASI_FORMS Varejo:** 120 Forms, 40 Reports → Faturamento em 4 semanas, zero downtime

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md) — Decisões, trade-offs, threat model
- [CONTRACTS/](CONTRACTS/) — Interfaces tipadas (MCP tools, agent I/O, graph schema, crypto assets)
- [SECURITY.md](SECURITY.md) — Threat model, pentest findings, compliance
- [PQC_INTEGRATION_SUMMARY.md](PQC_INTEGRATION_SUMMARY.md) — Documentação completa da integração PQC

## Para CTOs/VP Eng

> "Não vendo projeto de migração. Entrego o pipeline que moderniza enquanto seu negócio continua rodando — agora com criptografia resistente a quantum."

**Diagnóstico 30min:** [Calendly Link] | **Case completo:** [Notion/PDF Link] | **LinkedIn:** https://www.linkedin.com/in/luiz-dranka-ba637620b/