// Hybrid TLS PoC — ASI_FORMS
// Proof of Concept: Hybrid TLS 1.3 with ML-KEM key encapsulation
// Demonstrates quantum-resistant key exchange for API communication

import { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv } from './crypto-provider';
import { HybridTLSServer } from './hybrid-tls-server';
import { HybridMCPServer } from '../mcp-server/hybrid-mcp-server';

export interface PoCResult {
  name: string;
  success: boolean;
  durationMs: number;
  details: any;
  error?: string;
}

export class HybridTLSPoC {
  private provider: HybridCryptoProvider;
  private results: PoCResult[] = [];

  constructor(config?: CryptoConfig) {
    this.provider = config 
      ? new HybridCryptoProvider(config)
      : createCryptoProviderFromEnv();
  }

  async runAllTests(): Promise<PoCResult[]> {
    console.log('=== ASI_FORMS Hybrid TLS PoC ===');
    console.log(`Mode: ${this.provider.getConfig().mode}`);
    console.log(`Classical: ${this.provider.getConfig().classical}`);
    console.log(`PQC: ${this.provider.getConfig().pqc}`);
    console.log('');

    await this.testKeyGeneration();
    await this.testHybridEncapsulation();
    await this.testHybridSignatures();
    await this.testModeSwitching();
    await this.testPerformance();
    await this.testInteroperability();

    this.printSummary();
    return this.results;
  }

  private async test(name: string, fn: () => Promise<any>): Promise<PoCResult> {
    const start = Date.now();
    try {
      const details = await fn();
      const result: PoCResult = {
        name,
        success: true,
        durationMs: Date.now() - start,
        details
      };
      this.results.push(result);
      console.log(`✓ ${name} (${result.durationMs}ms)`);
      return result;
    } catch (error) {
      const result: PoCResult = {
        name,
        success: false,
        durationMs: Date.now() - start,
        details: {},
        error: String(error)
      };
      this.results.push(result);
      console.log(`✗ ${name}: ${error}`);
      return result;
    }
  }

  private async testKeyGeneration(): Promise<void> {
    await this.test('Key Generation (Classical)', async () => {
      const provider = new HybridCryptoProvider({ mode: 'CLASSICAL', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' });
      const kp = await provider.generateKeyPair('ECDSA-P256');
      return { publicKeyLen: kp.publicKey.length, privateKeyLen: kp.privateKey.length, algorithm: kp.algorithm };
    });

    await this.test('Key Generation (PQC)', async () => {
      const provider = new HybridCryptoProvider({ mode: 'PQC_ONLY', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' });
      const kp = await provider.generateKeyPair('ML-KEM-768');
      return { publicKeyLen: kp.publicKey.length, privateKeyLen: kp.privateKey.length, algorithm: kp.algorithm };
    });

    await this.test('Key Generation (Hybrid)', async () => {
      const kp = await this.provider.generateKeyPair('ML-KEM-768');
      return { publicKeyLen: kp.publicKey.length, privateKeyLen: kp.privateKey.length, algorithm: kp.algorithm };
    });
  }

  private async testHybridEncapsulation(): Promise<void> {
    await this.test('Hybrid Encapsulation/Decapsulation', async () => {
      // Server generates key pair
      const serverKP = await this.provider.generateKeyPair(this.provider.getConfig().pqc);
      
      // Client encapsulates to server's public key
      const encapsulation = await this.provider.encapsulate(serverKP.publicKey);
      
      // Server decapsulates
      const sharedSecret = await this.provider.decapsulate(serverKP.privateKey, encapsulation.ciphertext);
      
      // Verify secrets match
      const match = Buffer.from(sharedSecret).equals(Buffer.from(encapsulation.sharedSecret));
      
      return {
        ciphertextLen: encapsulation.ciphertext.length,
        sharedSecretLen: sharedSecret.length,
        secretsMatch: match,
        hasClassicalComponent: !!encapsulation.classicalCiphertext
      };
    });

    await this.test('Multiple Encapsulations (Session Simulation)', async () => {
      const serverKP = await this.provider.generateKeyPair(this.provider.getConfig().pqc);
      const sessions = 10;
      let success = 0;
      
      for (let i = 0; i < sessions; i++) {
        const enc = await this.provider.encapsulate(serverKP.publicKey);
        const secret = await this.provider.decapsulate(serverKP.privateKey, enc.ciphertext);
        if (Buffer.from(secret).equals(Buffer.from(enc.sharedSecret))) success++;
      }
      
      return { sessions, successful: success, successRate: success / sessions };
    });
  }

  private async testHybridSignatures(): Promise<void> {
    await this.test('Hybrid Sign/Verify', async () => {
      const kp = await this.provider.generateKeyPair(this.provider.getConfig().pqc);
      const data = Buffer.from('ASI_FORMS PQC test message for signing');
      
      const signature = await this.provider.sign(kp.privateKey, data);
      const verified = await this.provider.verify(kp.publicKey, data, signature.signature);
      
      return {
        signatureLen: signature.signature.length,
        algorithm: signature.algorithm,
        verified
      };
    });

    await this.test('Signature Verification Failure', async () => {
      const kp = await this.provider.generateKeyPair(this.provider.getConfig().pqc);
      const data = Buffer.from('Original message');
      const tamperedData = Buffer.from('Tampered message');
      
      const signature = await this.provider.sign(kp.privateKey, data);
      const verified = await this.provider.verify(kp.publicKey, tamperedData, signature.signature);
      
      return { verified, expectedFalse: !verified };
    });
  }

  private async testModeSwitching(): Promise<void> {
    await this.test('Runtime Mode Switch: CLASSICAL -> HYBRID', async () => {
      const provider = new HybridCryptoProvider({ mode: 'CLASSICAL', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' });
      provider.setMode('HYBRID');
      const kp = await provider.generateKeyPair('ML-KEM-768');
      return { newMode: provider.getConfig().mode, algorithm: kp.algorithm };
    });

    await this.test('Runtime Mode Switch: HYBRID -> PQC_ONLY', async () => {
      const provider = new HybridCryptoProvider({ mode: 'HYBRID', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' });
      provider.setMode('PQC_ONLY');
      const kp = await provider.generateKeyPair('ML-KEM-768');
      return { newMode: provider.getConfig().mode, algorithm: kp.algorithm };
    });
  }

  private async testPerformance(): Promise<void> {
    await this.test('Performance: 100 Encapsulations', async () => {
      const serverKP = await this.provider.generateKeyPair(this.provider.getConfig().pqc);
      const iterations = 100;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const enc = await this.provider.encapsulate(serverKP.publicKey);
        await this.provider.decapsulate(serverKP.privateKey, enc.ciphertext);
      }
      
      const totalMs = Date.now() - start;
      return {
        iterations,
        totalMs,
        avgMs: totalMs / iterations,
        opsPerSec: Math.round(iterations / (totalMs / 1000))
      };
    });

    await this.test('Performance: 100 Sign/Verify', async () => {
      const kp = await this.provider.generateKeyPair(this.provider.getConfig().pqc);
      const data = Buffer.from('Performance test data for signing');
      const iterations = 100;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const sig = await this.provider.sign(kp.privateKey, data);
        await this.provider.verify(kp.publicKey, data, sig.signature);
      }
      
      const totalMs = Date.now() - start;
      return {
        iterations,
        totalMs,
        avgMs: totalMs / iterations,
        opsPerSec: Math.round(iterations / (totalMs / 1000))
      };
    });
  }

  private async testInteroperability(): Promise<void> {
    await this.test('Cross-Mode Compatibility', async () => {
      // Test that classical keys work in hybrid mode
      const classicalProvider = new HybridCryptoProvider({ mode: 'CLASSICAL', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' });
      const hybridProvider = new HybridCryptoProvider({ mode: 'HYBRID', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' });
      
      const classicalKP = await classicalProvider.generateKeyPair('ECDSA-P256');
      const hybridKP = await hybridProvider.generateKeyPair('ML-KEM-768');
      
      // Both should generate valid keys
      return {
        classicalKeyLen: classicalKP.publicKey.length,
        hybridKeyLen: hybridKP.publicKey.length,
        classicalAlg: classicalKP.algorithm,
        hybridAlg: hybridKP.algorithm
      };
    });

    await this.test('Configuration Export/Import', async () => {
      const config = this.provider.getConfig();
      const exported = JSON.stringify(config);
      const imported = JSON.parse(exported);
      
      const newProvider = new HybridCryptoProvider(imported);
      return { exported, imported, modesMatch: newProvider.getConfig().mode === config.mode };
    });
  }

  private printSummary(): void {
    console.log('\n=== PoC Summary ===');
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const totalMs = this.results.reduce((sum, r) => sum + r.durationMs, 0);
    
    console.log(`Total: ${this.results.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total time: ${totalMs}ms`);
    console.log(`Mode tested: ${this.provider.getConfig().mode}`);
    
    if (failed > 0) {
      console.log('\nFailed tests:');
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }
  }
}

// Run PoC if executed directly
if (require.main === module) {
  const poc = new HybridTLSPoC();
  poc.runAllTests().then(results => {
    const failed = results.filter(r => !r.success).length;
    process.exit(failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('PoC failed:', err);
    process.exit(1);
  });
}

// Export for integration testing
export { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv } from './crypto-provider';