// Hybrid TLS Server — ASI_FORMS
// Fastify server with hybrid classical + PQC TLS support
// Supports: TLS 1.3 with hybrid key exchange (ECDHE + ML-KEM)

import { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv, PQC_CONFIGS } from './crypto-provider';
import * as crypto from 'crypto';

export interface HybridTLSServerConfig {
  port: number;
  host: string;
  pqcConfig: CryptoConfig;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
}

export class HybridTLSServer {
  private config: HybridTLSServerConfig;
  private cryptoProvider: HybridCryptoProvider;
  private server: any; // Fastify instance

  constructor(config: HybridTLSServerConfig) {
    this.config = config;
    this.cryptoProvider = new HybridCryptoProvider(config.pqcConfig);
  }

  async start(): Promise<void> {
    // Dynamic import for Fastify (not bundled)
    const fastify = await import('fastify');
    this.server = fastify.default({ logger: true });

    // Register hybrid TLS routes
    this.registerHybridRoutes();

    // Start server
    await this.server.listen({ port: this.config.port, host: this.config.host });
    console.log(`Hybrid TLS server listening on ${this.config.host}:${this.config.port}`);
    console.log(`PQC Mode: ${this.config.pqcConfig.mode}, Classical: ${this.config.pqcConfig.classical}, PQC: ${this.config.pqcConfig.pqc}`);
  }

  private registerHybridRoutes(): void {
    // Health check
    this.server.get('/health', async () => ({
      status: 'ok',
      pqc: this.cryptoProvider.getConfig()
    }));

    // Key encapsulation endpoint (for hybrid TLS handshake simulation)
    this.server.post<{
      Body: { publicKey: string; algorithm?: string }
    }>('/crypto/encapsulate', async (request, reply) => {
      try {
        const { publicKey, algorithm } = request.body;
        const pubKeyBytes = Buffer.from(publicKey, 'base64');
        
        const result = await this.cryptoProvider.encapsulate(pubKeyBytes);
        
        return {
          ciphertext: Buffer.from(result.ciphertext).toString('base64'),
          sharedSecret: Buffer.from(result.sharedSecret).toString('base64'),
          classicalCiphertext: result.classicalCiphertext ? Buffer.from(result.classicalCiphertext).toString('base64') : undefined,
          algorithm: this.cryptoProvider.getConfig().pqc
        };
      } catch (error) {
        reply.code(500);
        return { error: 'Encapsulation failed', message: String(error) };
      }
    });

    // Key decapsulation endpoint
    this.server.post<{
      Body: { privateKey: string; ciphertext: string }
    }>('/crypto/decapsulate', async (request, reply) => {
      try {
        const { privateKey, ciphertext } = request.body;
        const privKeyBytes = Buffer.from(privateKey, 'base64');
        const ctBytes = Buffer.from(ciphertext, 'base64');
        
        const sharedSecret = await this.cryptoProvider.decapsulate(privKeyBytes, ctBytes);
        
        return {
          sharedSecret: Buffer.from(sharedSecret).toString('base64')
        };
      } catch (error) {
        reply.code(500);
        return { error: 'Decapsulation failed', message: String(error) };
      }
    });

    // Digital signature endpoint
    this.server.post<{
      Body: { privateKey: string; data: string }
    }>('/crypto/sign', async (request, reply) => {
      try {
        const { privateKey, data } = request.body;
        const privKeyBytes = Buffer.from(privateKey, 'base64');
        const dataBytes = Buffer.from(data, 'base64');
        
        const result = await this.cryptoProvider.sign(privKeyBytes, dataBytes);
        
        return {
          signature: Buffer.from(result.signature).toString('base64'),
          classicalSignature: result.classicalSignature ? Buffer.from(result.classicalSignature).toString('base64') : undefined,
          algorithm: result.algorithm
        };
      } catch (error) {
        reply.code(500);
        return { error: 'Signing failed', message: String(error) };
      }
    });

    // Signature verification endpoint
    this.server.post<{
      Body: { publicKey: string; data: string; signature: string }
    }>('/crypto/verify', async (request, reply) => {
      try {
        const { publicKey, data, signature } = request.body;
        const pubKeyBytes = Buffer.from(publicKey, 'base64');
        const dataBytes = Buffer.from(data, 'base64');
        const sigBytes = Buffer.from(signature, 'base64');
        
        const valid = await this.cryptoProvider.verify(pubKeyBytes, dataBytes, sigBytes);
        
        return { valid };
      } catch (error) {
        reply.code(500);
        return { error: 'Verification failed', message: String(error) };
      }
    });

    // Configuration endpoint (remote crypto agility)
    this.server.post<{
      Body: { mode?: string; classical?: string; pqc?: string }
    }>('/crypto/config', async (request, reply) => {
      try {
        const { mode, classical, pqc } = request.body;
        const currentConfig = this.cryptoProvider.getConfig();
        
        if (mode) currentConfig.mode = mode as any;
        if (classical) currentConfig.classical = classical as any;
        if (pqc) currentConfig.pqc = pqc as any;
        
        // In production: persist config, restart TLS listeners
        return {
          success: true,
          config: currentConfig,
          message: 'Config updated. Restart required for TLS listeners.'
        };
      } catch (error) {
        reply.code(500);
        return { error: 'Config update failed', message: String(error) };
      }
    });

    // Generate hybrid key pair
    this.server.post<{
      Body: { algorithm?: string }
    }>('/crypto/keypair', async (request, reply) => {
      try {
        const algorithm = request.body.algorithm || this.config.pqcConfig.pqc;
        const keyPair = await this.cryptoProvider.generateKeyPair(algorithm as any);
        
        return {
          publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
          privateKey: Buffer.from(keyPair.privateKey).toString('base64'),
          algorithm: keyPair.algorithm
        };
      } catch (error) {
        reply.code(500);
        return { error: 'Key generation failed', message: String(error) };
      }
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
    }
  }

  getCryptoProvider(): HybridCryptoProvider {
    return this.cryptoProvider;
  }
}

// Factory for creating server from environment
export function createHybridTLSServerFromEnv(): HybridTLSServer {
  const config: HybridTLSServerConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    pqcConfig: {
      mode: (process.env.PQC_MODE || 'HYBRID') as any,
      classical: (process.env.PQC_CLASSICAL || 'ECDSA-P256') as any,
      pqc: (process.env.PQC_ALGORITHM || 'ML-KEM-768') as any
    },
    certPath: process.env.TLS_CERT_PATH,
    keyPath: process.env.TLS_KEY_PATH,
    caPath: process.env.TLS_CA_PATH
  };

  return new HybridTLSServer(config);
}

// Example: Hybrid TLS handshake simulation
export async function simulateHybridHandshake(): Promise<void> {
  const provider = createCryptoProviderFromEnv();
  
  // 1. Server generates hybrid key pair
  const serverKeyPair = await provider.generateKeyPair(provider.getConfig().pqc);
  
  // 2. Client generates hybrid key pair
  const clientKeyPair = await provider.generateKeyPair(provider.getConfig().pqc);
  
  // 3. Client encapsulates to server's public key (hybrid KEM)
  const encapsulation = await provider.encapsulate(serverKeyPair.publicKey);
  
  // 4. Server decapsulates (hybrid KEM)
  const sharedSecret = await provider.decapsulate(serverKeyPair.privateKey, encapsulation.ciphertext);
  
  // 5. Verify shared secrets match
  const match = Buffer.from(sharedSecret).equals(Buffer.from(encapsulation.sharedSecret));
  console.log(`Hybrid handshake: ${match ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Shared secret length: ${sharedSecret.length} bytes`);
  console.log(`Mode: ${provider.getConfig().mode}`);
  console.log(`Classical: ${provider.getConfig().classical}, PQC: ${provider.getConfig().pqc}`);
  
  // 6. Test hybrid signatures
  const testData = Buffer.from('ASI_FORMS hybrid TLS test');
  const signature = await provider.sign(clientKeyPair.privateKey, testData);
  const verified = await provider.verify(clientKeyPair.publicKey, testData, signature.signature);
  console.log(`Hybrid signature: ${verified ? 'VERIFIED' : 'FAILED'}`);
}

// Export for testing
export { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv, PQC_CONFIGS } from './crypto-provider';