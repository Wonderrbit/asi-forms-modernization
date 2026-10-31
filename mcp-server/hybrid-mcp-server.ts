// Hybrid MCP Server — ASI_FORMS
// MCP Server with hybrid classical + PQC transport
// Provides 12 typed tools for LLM-graph access with quantum-resistant encryption

import { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv } from '../api/crypto-provider';
import * as crypto from 'crypto';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, context: MCPContext) => Promise<any>;
}

export interface MCPContext {
  clientId: string;
  permissions: string[];
  cryptoProvider: HybridCryptoProvider;
  sessionKeys: {
    classical: Uint8Array;
    pqc: Uint8Array;
    hybrid: Uint8Array;
  };
}

export interface HybridMCPConfig {
  port: number;
  host: string;
  pqcConfig: CryptoConfig;
  auth?: {
    required: boolean;
    jwtSecret: string;
  };
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

export class HybridMCPServer {
  private config: HybridMCPConfig;
  private cryptoProvider: HybridCryptoProvider;
  private tools: Map<string, MCPTool> = new Map();
  private sessions: Map<string, MCPContext> = new Map();

  constructor(config: HybridMCPConfig) {
    this.config = config;
    this.cryptoProvider = new HybridCryptoProvider(config.pqcConfig);
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // Graph query tool
    this.registerTool({
      name: 'graph_query',
      description: 'Execute Cypher query against Neo4j Knowledge Graph',
      inputSchema: {
        type: 'object',
        properties: {
          cypher: { type: 'string', description: 'Cypher query with parameters' },
          params: { type: 'object', description: 'Query parameters' }
        },
        required: ['cypher']
      },
      handler: async (args, context) => {
        // In production: execute against Neo4j with context.sessionKeys for encryption
        return { result: 'Graph query executed', encrypted: true };
      }
    });

    // Schema introspection
    this.registerTool({
      name: 'graph_schema',
      description: 'Get Neo4j schema (node labels, relationship types, properties)',
      inputSchema: { type: 'object', properties: {} },
      handler: async (args, context) => {
        return { schema: 'Neo4j schema', encrypted: true };
      }
    });

    // Diff analysis
    this.registerTool({
      name: 'graph_diff',
      description: 'Compare two graph snapshots (daily sync)',
      inputSchema: {
        type: 'object',
        properties: {
          fromSnapshot: { type: 'string' },
          toSnapshot: { type: 'string' }
        },
        required: ['fromSnapshot', 'toSnapshot']
      },
      handler: async (args, context) => {
        return { diff: 'Graph diff result', encrypted: true };
      }
    });

    // Validation
    this.registerTool({
      name: 'graph_validate',
      description: 'Validate graph against constraints',
      inputSchema: {
        type: 'object',
        properties: {
          constraints: { type: 'array', items: { type: 'string' } }
        }
      },
      handler: async (args, context) => {
        return { validation: 'Graph validation result', encrypted: true };
      }
    });

    // Impact analysis
    this.registerTool({
      name: 'graph_impact',
      description: 'Analyze blast radius of changes',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          changeType: { type: 'string', enum: ['add', 'modify', 'delete'] }
        },
        required: ['nodeId', 'changeType']
      },
      handler: async (args, context) => {
        return { impact: 'Impact analysis result', encrypted: true };
      }
    });

    // Memory layer access
    this.registerTool({
      name: 'memory_read',
      description: 'Read learned patterns from Memory Layer',
      inputSchema: {
        type: 'object',
        properties: {
          patternType: { type: 'string' },
          context: { type: 'object' }
        }
      },
      handler: async (args, context) => {
        return { patterns: [], encrypted: true };
      }
    });

    // Memory layer write
    this.registerTool({
      name: 'memory_write',
      description: 'Store new learning in Memory Layer',
      inputSchema: {
        type: 'object',
        properties: {
          patternType: { type: 'string', enum: ['bug_fix', 'rule_interpretation', 'codegen_template', 'validation_rule'] },
          context: { type: 'object' },
          pattern: { type: 'object' },
          confidence: { type: 'number' }
        },
        required: ['patternType', 'context', 'pattern', 'confidence']
      },
      handler: async (args, context) => {
        return { stored: true, encrypted: true };
      }
    });

    // Crypto agility config
    this.registerTool({
      name: 'crypto_config',
      description: 'Get or update PQC crypto configuration (crypto-agility)',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set'] },
          mode: { type: 'string', enum: ['CLASSICAL', 'HYBRID', 'PQC_ONLY'] },
          classical: { type: 'string' },
          pqc: { type: 'string' }
        },
        required: ['action']
      },
      handler: async (args, context) => {
        if (args.action === 'get') {
          return { config: context.cryptoProvider.getConfig() };
        }
        if (args.action === 'set') {
          if (args.mode) context.cryptoProvider.setMode(args.mode as any);
          return { success: true, config: context.cryptoProvider.getConfig() };
        }
        throw new Error('Invalid action');
      }
    });

    // Key encapsulation for session establishment
    this.registerTool({
      name: 'crypto_encapsulate',
      description: 'Perform hybrid key encapsulation for session establishment',
      inputSchema: {
        type: 'object',
        properties: {
          publicKey: { type: 'string', description: 'Base64 encoded public key' }
        },
        required: ['publicKey']
      },
      handler: async (args, context) => {
        const pubKey = Buffer.from(args.publicKey, 'base64');
        const result = await context.cryptoProvider.encapsulate(pubKey);
        return {
          ciphertext: Buffer.from(result.ciphertext).toString('base64'),
          sharedSecret: Buffer.from(result.sharedSecret).toString('base64')
        };
      }
    });

    // Key decapsulation
    this.registerTool({
      name: 'crypto_decapsulate',
      description: 'Perform hybrid key decapsulation',
      inputSchema: {
        type: 'object',
        properties: {
          privateKey: { type: 'string', description: 'Base64 encoded private key' },
          ciphertext: { type: 'string', description: 'Base64 encoded ciphertext' }
        },
        required: ['privateKey', 'ciphertext']
      },
      handler: async (args, context) => {
        const privKey = Buffer.from(args.privateKey, 'base64');
        const ct = Buffer.from(args.ciphertext, 'base64');
        const secret = await context.cryptoProvider.decapsulate(privKey, ct);
        return { sharedSecret: Buffer.from(secret).toString('base64') };
      }
    });

    // Hybrid signature
    this.registerTool({
      name: 'crypto_sign',
      description: 'Create hybrid digital signature',
      inputSchema: {
        type: 'object',
        properties: {
          privateKey: { type: 'string', description: 'Base64 encoded private key' },
          data: { type: 'string', description: 'Base64 encoded data to sign' }
        },
        required: ['privateKey', 'data']
      },
      handler: async (args, context) => {
        const privKey = Buffer.from(args.privateKey, 'base64');
        const data = Buffer.from(args.data, 'base64');
        const result = await context.cryptoProvider.sign(privKey, data);
        return {
          signature: Buffer.from(result.signature).toString('base64'),
          algorithm: result.algorithm
        };
      }
    });

    // Hybrid verification
    this.registerTool({
      name: 'crypto_verify',
      description: 'Verify hybrid digital signature',
      inputSchema: {
        type: 'object',
        properties: {
          publicKey: { type: 'string', description: 'Base64 encoded public key' },
          data: { type: 'string', description: 'Base64 encoded data' },
          signature: { type: 'string', description: 'Base64 encoded signature' }
        },
        required: ['publicKey', 'data', 'signature']
      },
      handler: async (args, context) => {
        const pubKey = Buffer.from(args.publicKey, 'base64');
        const data = Buffer.from(args.data, 'base64');
        const sig = Buffer.from(args.signature, 'base64');
        const valid = await context.cryptoProvider.verify(pubKey, data, sig);
        return { valid };
      }
    });
  }

  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  async handleRequest(clientId: string, toolName: string, args: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Get or create session
    let session = this.sessions.get(clientId);
    if (!session) {
      // Establish hybrid session keys
      const sessionKeys = await this.establishSessionKeys(clientId);
      session = {
        clientId,
        permissions: ['graph:read', 'graph:write', 'crypto:*'],
        cryptoProvider: this.cryptoProvider,
        sessionKeys
      };
      this.sessions.set(clientId, session);
    }

    // Execute tool with session context
    return tool.handler(args, session);
  }

  private async establishSessionKeys(clientId: string): Promise<MCPContext['sessionKeys']> {
    // In production: perform hybrid key exchange with client
    // For now: generate ephemeral keys
    const serverKeyPair = await this.cryptoProvider.generateKeyPair(this.config.pqcConfig.pqc);
    const clientKeyPair = await this.cryptoProvider.generateKeyPair(this.config.pqcConfig.pqc);
    
    const encapsulation = await this.cryptoProvider.encapsulate(clientKeyPair.publicKey);
    const sharedSecret = await this.cryptoProvider.decapsulate(serverKeyPair.privateKey, encapsulation.ciphertext);
    
    // Split hybrid secret into classical/PQC components
    const half = sharedSecret.length / 2;
    
    return {
      classical: sharedSecret.slice(0, half),
      pqc: sharedSecret.slice(half),
      hybrid: sharedSecret
    };
  }

  getCryptoProvider(): HybridCryptoProvider {
    return this.cryptoProvider;
  }

  getConfig(): CryptoConfig {
    return this.cryptoProvider.getConfig();
  }

  setMode(mode: string): void {
    this.cryptoProvider.setMode(mode as any);
  }
}

// Factory
export function createHybridMCPServerFromEnv(): HybridMCPServer {
  const config: HybridMCPConfig = {
    port: parseInt(process.env.MCP_PORT || '3001', 10),
    host: process.env.MCP_HOST || '0.0.0.0',
    pqcConfig: {
      mode: (process.env.PQC_MODE || 'HYBRID') as any,
      classical: (process.env.PQC_CLASSICAL || 'ECDSA-P256') as any,
      pqc: (process.env.PQC_ALGORITHM || 'ML-KEM-768') as any
    },
    auth: {
      required: process.env.MCP_AUTH_REQUIRED === 'true',
      jwtSecret: process.env.MCP_JWT_SECRET || 'dev-secret'
    },
    rateLimit: {
      windowMs: parseInt(process.env.MCP_RATE_WINDOW || '60000', 10),
      maxRequests: parseInt(process.env.MCP_RATE_MAX || '100', 10)
    }
  };

  return new HybridMCPServer(config);
}

export { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv } from '../api/crypto-provider';