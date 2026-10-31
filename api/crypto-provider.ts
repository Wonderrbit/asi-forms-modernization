// Crypto Provider — ASI_FORMS PQC Hybrid
// Unified interface for classical + post-quantum cryptography
// Supports: RSA/ECDSA (classical) + ML-KEM/ML-DSA (PQC) hybrid operations

export type ClassicalAlgorithm = 'RSA-2048' | 'RSA-3072' | 'RSA-4096' | 'ECDSA-P256' | 'ECDSA-P384';
export type PQCAlgorithm = 'ML-KEM-512' | 'ML-KEM-768' | 'ML-KEM-1024' | 'ML-DSA-44' | 'ML-DSA-65' | 'ML-DSA-87';
export type HybridMode = 'CLASSICAL' | 'HYBRID' | 'PQC_ONLY';

export interface CryptoConfig {
  mode: HybridMode;
  classical: ClassicalAlgorithm;
  pqc: PQCAlgorithm;
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  algorithm: string;
}

export interface EncapsulationResult {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
  classicalCiphertext?: Uint8Array;
  classicalSharedSecret?: Uint8Array;
}

export interface SignatureResult {
  signature: Uint8Array;
  classicalSignature?: Uint8Array;
  algorithm: string;
}

export interface CryptoProvider {
  name: string;
  generateKeyPair(algorithm: ClassicalAlgorithm | PQCAlgorithm): Promise<KeyPair>;
  sign(privateKey: Uint8Array, data: Uint8Array): Promise<SignatureResult>;
  verify(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): Promise<boolean>;
  encapsulate(publicKey: Uint8Array): Promise<EncapsulationResult>;
  decapsulate(privateKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>;
}

export class HybridCryptoProvider implements CryptoProvider {
  name = 'hybrid';
  private config: CryptoConfig;
  private classicalProvider: CryptoProvider;
  private pqcProvider: CryptoProvider;

  constructor(config: CryptoConfig) {
    this.config = config;
    this.classicalProvider = this.createClassicalProvider();
    this.pqcProvider = this.createPQCProvider();
  }

  private createClassicalProvider(): CryptoProvider {
    return {
      name: 'classical',
      async generateKeyPair(algorithm) {
        return this.generateClassicalKeyPair(algorithm);
      },
      async sign(privateKey, data) {
        return this.classicalSign(privateKey, data);
      },
      async verify(publicKey, data, signature) {
        return this.classicalVerify(publicKey, data, signature);
      },
      async encapsulate(publicKey) {
        return this.classicalEncapsulate(publicKey);
      },
      async decapsulate(privateKey, ciphertext) {
        return this.classicalDecapsulate(privateKey, ciphertext);
      }
    };
  }

  private createPQCProvider(): CryptoProvider {
    return {
      name: 'pqc',
      async generateKeyPair(algorithm) {
        return this.generatePQCKeyPair(algorithm);
      },
      async sign(privateKey, data) {
        return this.pqcSign(privateKey, data);
      },
      async verify(publicKey, data, signature) {
        return this.pqcVerify(publicKey, data, signature);
      },
      async encapsulate(publicKey) {
        return this.pqcEncapsulate(publicKey);
      },
      async decapsulate(privateKey, ciphertext) {
        return this.pqcDecapsulate(privateKey, ciphertext);
      }
    };
  }

  // Classical implementations (using Web Crypto API / Node crypto)
  private async generateClassicalKeyPair(algorithm: ClassicalAlgorithm): Promise<KeyPair> {
    // Placeholder: integrate with Web Crypto API or @noble/curves
    throw new Error(`Classical key generation for ${algorithm} not implemented - use Web Crypto API`);
  }

  private async classicalSign(privateKey: Uint8Array, data: Uint8Array): Promise<SignatureResult> {
    throw new Error('Classical sign not implemented');
  }

  private async classicalVerify(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    throw new Error('Classical verify not implemented');
  }

  private async classicalEncapsulate(publicKey: Uint8Array): Promise<EncapsulationResult> {
    throw new Error('Classical encapsulate not implemented');
  }

  private async classicalDecapsulate(privateKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
    throw new Error('Classical decapsulate not implemented');
  }

  // PQC implementations (using liboqs / OpenSSL 3.0+ providers)
  private async generatePQCKeyPair(algorithm: PQCAlgorithm): Promise<KeyPair> {
    // Placeholder: integrate with liboqs via FFI or WASM
    throw new Error(`PQC key generation for ${algorithm} not implemented - use liboqs`);
  }

  private async pqcSign(privateKey: Uint8Array, data: Uint8Array): Promise<SignatureResult> {
    throw new Error('PQC sign not implemented');
  }

  private async pqcVerify(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    throw new Error('PQC verify not implemented');
  }

  private async pqcEncapsulate(publicKey: Uint8Array): Promise<EncapsulationResult> {
    throw new Error('PQC encapsulate not implemented');
  }

  private async pqcDecapsulate(privateKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
    throw new Error('PQC decapsulate not implemented');
  }

  // Hybrid operations
  async generateKeyPair(algorithm: ClassicalAlgorithm | PQCAlgorithm): Promise<KeyPair> {
    if (this.config.mode === 'CLASSICAL') {
      return this.classicalProvider.generateKeyPair(algorithm as ClassicalAlgorithm);
    }
    if (this.config.mode === 'PQC_ONLY') {
      return this.pqcProvider.generateKeyPair(algorithm as PQCAlgorithm);
    }
    // HYBRID: generate both
    const [classical, pqc] = await Promise.all([
      this.classicalProvider.generateKeyPair(this.config.classical),
      this.pqcProvider.generateKeyPair(this.config.pqc)
    ]);
    return {
      publicKey: new Uint8Array([...classical.publicKey, ...pqc.publicKey]),
      privateKey: new Uint8Array([...classical.privateKey, ...pqc.privateKey]),
      algorithm: `${classical.algorithm}+${pqc.algorithm}`
    };
  }

  async sign(privateKey: Uint8Array, data: Uint8Array): Promise<SignatureResult> {
    if (this.config.mode === 'CLASSICAL') {
      return this.classicalProvider.sign(privateKey, data);
    }
    if (this.config.mode === 'PQC_ONLY') {
      return this.pqcProvider.sign(privateKey, data);
    }
    // HYBRID: sign with both
    const [classicalResult, pqcResult] = await Promise.all([
      this.classicalProvider.sign(privateKey.slice(0, privateKey.length / 2), data),
      this.pqcProvider.sign(privateKey.slice(privateKey.length / 2), data)
    ]);
    return {
      signature: new Uint8Array([...classicalResult.signature, ...pqcResult.signature]),
      classicalSignature: classicalResult.signature,
      algorithm: `hybrid-sign`
    };
  }

  async verify(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    if (this.config.mode === 'CLASSICAL') {
      return this.classicalProvider.verify(publicKey, data, signature);
    }
    if (this.config.mode === 'PQC_ONLY') {
      return this.pqcProvider.verify(publicKey, data, signature);
    }
    // HYBRID: verify both signatures
    const classicalPubKey = publicKey.slice(0, publicKey.length / 2);
    const pqcPubKey = publicKey.slice(publicKey.length / 2);
    const classicalSig = signature.slice(0, signature.length / 2);
    const pqcSig = signature.slice(signature.length / 2);

    const [classicalValid, pqcValid] = await Promise.all([
      this.classicalProvider.verify(classicalPubKey, data, classicalSig),
      this.pqcProvider.verify(pqcPubKey, data, pqcSig)
    ]);

    // Both must be valid for hybrid mode
    return classicalValid && pqcValid;
  }

  async encapsulate(publicKey: Uint8Array): Promise<EncapsulationResult> {
    if (this.config.mode === 'CLASSICAL') {
      return this.classicalProvider.encapsulate(publicKey);
    }
    if (this.config.mode === 'PQC_ONLY') {
      return this.pqcProvider.encapsulate(publicKey);
    }
    // HYBRID: encapsulate with both
    const classicalPubKey = publicKey.slice(0, publicKey.length / 2);
    const pqcPubKey = publicKey.slice(publicKey.length / 2);

    const [classicalResult, pqcResult] = await Promise.all([
      this.classicalProvider.encapsulate(classicalPubKey),
      this.pqcProvider.encapsulate(pqcPubKey)
    ]);

    // Combine shared secrets (XOR for hybrid key derivation)
    const combinedSecret = this.xorBytes(classicalResult.sharedSecret, pqcResult.sharedSecret);

    return {
      ciphertext: new Uint8Array([...classicalResult.ciphertext, ...pqcResult.ciphertext]),
      sharedSecret: combinedSecret,
      classicalCiphertext: classicalResult.ciphertext,
      classicalSharedSecret: classicalResult.sharedSecret
    };
  }

  async decapsulate(privateKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
    if (this.config.mode === 'CLASSICAL') {
      return this.classicalProvider.decapsulate(privateKey, ciphertext);
    }
    if (this.config.mode === 'PQC_ONLY') {
      return this.pqcProvider.decapsulate(privateKey, ciphertext);
    }
    // HYBRID: decapsulate both
    const halfLen = privateKey.length / 2;
    const classicalPrivKey = privateKey.slice(0, halfLen);
    const pqcPrivKey = privateKey.slice(halfLen);
    const classicalCtLen = ciphertext.length / 2;
    const classicalCiphertext = ciphertext.slice(0, classicalCtLen);
    const pqcCiphertext = ciphertext.slice(classicalCtLen);

    const [classicalSecret, pqcSecret] = await Promise.all([
      this.classicalProvider.decapsulate(classicalPrivKey, classicalCiphertext),
      this.pqcProvider.decapsulate(pqcPrivKey, pqcCiphertext)
    ]);

    return this.xorBytes(classicalSecret, pqcSecret);
  }

  private xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const len = Math.min(a.length, b.length);
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  }

  // Config management
  getConfig(): CryptoConfig {
    return { ...this.config };
  }

  setMode(mode: HybridMode): void {
    this.config.mode = mode;
  }
}

// Factory for creating providers from environment
export function createCryptoProviderFromEnv(): HybridCryptoProvider {
  const mode = (process.env.PQC_MODE || 'HYBRID') as HybridMode;
  const classical = (process.env.PQC_CLASSICAL || 'ECDSA-P256') as ClassicalAlgorithm;
  const pqc = (process.env.PQC_ALGORITHM || 'ML-KEM-768') as PQCAlgorithm;

  return new HybridCryptoProvider({ mode, classical, pqc });
}

// Default configurations per security level
export const PQC_CONFIGS = {
  // NIST Level 1 (AES-128 equivalent)
  level1: { mode: 'HYBRID', classical: 'ECDSA-P256', pqc: 'ML-KEM-512' } as CryptoConfig,
  // NIST Level 3 (AES-192 equivalent)
  level3: { mode: 'HYBRID', classical: 'ECDSA-P384', pqc: 'ML-KEM-768' } as CryptoConfig,
  // NIST Level 5 (AES-256 equivalent)
  level5: { mode: 'HYBRID', classical: 'RSA-4096', pqc: 'ML-KEM-1024' } as CryptoConfig,
} as const;