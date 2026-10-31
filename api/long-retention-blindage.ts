// Long-Data Retention Blindage — ASI_FORMS
// Protects critical data with PQC-resistant encryption for decades-long retention
// Targets: Health data, IP, industrial secrets, contracts, financial transactions

import { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv } from './crypto-provider';
import { CryptoAgilityManager } from './crypto-agility';

export interface SensitiveDataClassification {
  category: 'health' | 'financial' | 'ip' | 'legal' | 'government' | 'industrial';
  retentionYears: number;
  regulatoryFramework?: string[]; // LGPD, HIPAA, SOX, PCI-DSS, etc.
  encryptionRequired: boolean;
  keyRotationYears: number;
}

export interface BlindagePolicy {
  dataClassifications: SensitiveDataClassification[];
  defaultClassification: SensitiveDataClassification;
  pqcConfig: CryptoConfig;
  keyManagement: KeyManagementPolicy;
  audit: AuditPolicy;
}

export interface KeyManagementPolicy {
  algorithm: 'hybrid' | 'pqc';
  keySize: number;
  rotationIntervalYears: number;
  escrowEnabled: boolean;
  hsmRequired: boolean;
  backupStrategy: 'geo-distributed' | 'single-region' | 'air-gapped';
}

export interface AuditPolicy {
  logAllAccess: boolean;
  logKeyOperations: boolean;
  retentionYears: number;
  immutableLogs: boolean;
}

export interface EncryptedDataPackage {
  data: Uint8Array;           // Encrypted payload
  metadata: {
    classification: SensitiveDataClassification;
    encryptionAlgorithm: string;
    keyId: string;
    keyVersion: number;
    encryptedAt: string;
    expiresAt?: string;
    integrityHash: string;    // SHA-256 of plaintext
  };
  keyWrap: KeyWrapPackage;
}

export interface KeyWrapPackage {
  // Classical wrap (RSA-OAEP)
  classical: {
    algorithm: string;
    wrappedKey: Uint8Array;
    wrappingKeyId: string;
  };
  // PQC wrap (ML-KEM)
  pqc: {
    algorithm: string;
    encapsulatedKey: Uint8Array;
    encapsulationKeyId: string;
  };
  // Combined secret (XOR of both)
  combinedSecret: Uint8Array;
}

export class LongRetentionBlindage {
  private policy: BlindagePolicy;
  private cryptoProvider: HybridCryptoProvider;
  private agilityManager: CryptoAgilityManager;
  private keyStore: Map<string, { key: Uint8Array; version: number; createdAt: string; classification: SensitiveDataClassification }> = new Map();
  private wrappingKeys: Map<string, { classical: Uint8Array; pqc: Uint8Array }> = new Map();

  constructor(policy: Partial<BlindagePolicy> = {}) {
    this.policy = {
      dataClassifications: policy.dataClassifications || this.getDefaultClassifications(),
      defaultClassification: policy.defaultClassification || this.getDefaultClassifications()[0],
      pqcConfig: policy.pqcConfig || { mode: 'HYBRID', classical: 'RSA-3072', pqc: 'ML-KEM-768' },
      keyManagement: policy.keyManagement || this.getDefaultKeyManagement(),
      audit: policy.audit || this.getDefaultAuditPolicy()
    };

    this.cryptoProvider = new HybridCryptoProvider(this.policy.pqcConfig);
    this.agilityManager = new CryptoAgilityManager(this.policy.pqcConfig);
  }

  private getDefaultClassifications(): SensitiveDataClassification[] {
    return [
      {
        category: 'health',
        retentionYears: 20,
        regulatoryFramework: ['LGPD', 'HIPAA', 'CFM'],
        encryptionRequired: true,
        keyRotationYears: 5
      },
      {
        category: 'financial',
        retentionYears: 10,
        regulatoryFramework: ['SOX', 'PCI-DSS', 'BACEN'],
        encryptionRequired: true,
        keyRotationYears: 3
      },
      {
        category: 'ip',
        retentionYears: 50,
        regulatoryFramework: ['LGPD', 'Industrial Property Law'],
        encryptionRequired: true,
        keyRotationYears: 7
      },
      {
        category: 'legal',
        retentionYears: 30,
        regulatoryFramework: ['LGPD', 'CPC', 'OAB'],
        encryptionRequired: true,
        keyRotationYears: 5
      },
      {
        category: 'government',
        retentionYears: 100,
        regulatoryFramework: ['LGPD', 'LAI', 'Decree 10.046'],
        encryptionRequired: true,
        keyRotationYears: 10
      },
      {
        category: 'industrial',
        retentionYears: 25,
        regulatoryFramework: ['LGPD', 'Trade Secrets Law'],
        encryptionRequired: true,
        keyRotationYears: 5
      }
    ];
  }

  private getDefaultKeyManagement(): KeyManagementPolicy {
    return {
      algorithm: 'hybrid',
      keySize: 256,
      rotationIntervalYears: 5,
      escrowEnabled: true,
      hsmRequired: true,
      backupStrategy: 'geo-distributed'
    };
  }

  private getDefaultAuditPolicy(): AuditPolicy {
    return {
      logAllAccess: true,
      logKeyOperations: true,
      retentionYears: 10,
      immutableLogs: true
    };
  }

  // Get classification for data category
  getClassification(category: string): SensitiveDataClassification {
    return this.policy.dataClassifications.find(c => c.category === category) 
      || this.policy.defaultClassification;
  }

  // Encrypt data for long-term retention
  async encryptForRetention(
    plaintext: Uint8Array,
    category: string,
    keyId?: string
  ): Promise<EncryptedDataPackage> {
    const classification = this.getClassification(category);
    const actualKeyId = keyId || `key-${category}-${Date.now()}`;

    // Get or generate data encryption key (DEK)
    const dek = await this.getOrGenerateDEK(actualKeyId, classification);

    // Encrypt data with DEK (AES-256-GCM)
    const encryptedData = await this.encryptAES256GCM(plaintext, dek);

    // Calculate integrity hash
    const integrityHash = await this.sha256(plaintext);

    // Wrap DEK with hybrid key wrap (classical + PQC)
    const keyWrap = await this.wrapKey(dek, actualKeyId, classification);

    const package_: EncryptedDataPackage = {
      data: encryptedData.ciphertext,
      metadata: {
        classification,
        encryptionAlgorithm: 'AES-256-GCM',
        keyId: actualKeyId,
        keyVersion: this.keyStore.get(actualKeyId)?.version || 1,
        encryptedAt: new Date().toISOString(),
        expiresAt: this.calculateExpiry(classification),
        integrityHash
      },
      keyWrap
    };

    // Audit log
    this.auditLog('encrypt', { keyId: actualKeyId, category, dataSize: plaintext.length });

    return package_;
  }

  // Decrypt data from long-term retention
  async decryptFromRetention(
    pkg: EncryptedDataPackage,
    keyId: string
  ): Promise<Uint8Array> {
    // Unwrap DEK
    const dek = await this.unwrapKey(pkg.keyWrap, keyId);

    // Decrypt data
    const plaintext = await this.decryptAES256GCM(
      pkg.data,
      dek,
      pkg.metadata.integrityHash
    );

    // Verify integrity
    const computedHash = await this.sha256(plaintext);
    if (computedHash !== pkg.metadata.integrityHash) {
      throw new Error('Integrity verification failed: data may be corrupted');
    }

    // Audit log
    this.auditLog('decrypt', { keyId, category: pkg.metadata.classification.category, dataSize: plaintext.length });

    return plaintext;
  }

  // Hybrid key wrap: classical (RSA-OAEP) + PQC (ML-KEM)
  private async wrapKey(
    dek: Uint8Array,
    keyId: string,
    classification: SensitiveDataClassification
  ): Promise<KeyWrapPackage> {
    // Get or generate wrapping keys
    const wrappingKeyId = `wrap-${classification.category}-${Date.now()}`;
    const wrappingKeys = await this.getOrGenerateWrappingKeys(wrappingKeyId);

    // Classical wrap: RSA-OAEP
    const classicalWrapped = await this.rsaOaepWrap(dek, wrappingKeys.classical);

    // PQC wrap: ML-KEM encapsulation
    const pqcProvider = new HybridCryptoProvider({ mode: 'PQC_ONLY', classical: 'RSA-3072', pqc: 'ML-KEM-768' });
    const pqcKP = await pqcProvider.generateKeyPair('ML-KEM-768');
    const encapsulation = await pqcProvider.encapsulate(pqcKP.publicKey);

    // Combine secrets (XOR)
    const combinedSecret = this.xorBytes(
      await this.rsaOaepUnwrap(classicalWrapped, wrappingKeys.classical),
      encapsulation.sharedSecret
    );

    // Store PQC wrapping key for later unwrapping
    this.wrappingKeys.set(`${keyId}-pqc`, { 
      classical: pqcKP.privateKey, 
      pqc: pqcKP.privateKey 
    });

    return {
      classical: {
        algorithm: 'RSA-OAEP-256',
        wrappedKey: classicalWrapped,
        wrappingKeyId
      },
      pqc: {
        algorithm: 'ML-KEM-768',
        encapsulatedKey: encapsulation.ciphertext,
        encapsulationKeyId: `${wrappingKeyId}-pqc`
      },
      combinedSecret
    };
  }

  // Hybrid key unwrap
  private async unwrapKey(
    keyWrap: KeyWrapPackage,
    keyId: string
  ): Promise<Uint8Array> {
    // Get classical wrapping key
    const wrappingKeyEntry = Array.from(this.wrappingKeys.entries())
      .find(([k]) => k === keyWrap.classical.wrappingKeyId);
    
    if (!wrappingKeyEntry) {
      throw new Error(`Classical wrapping key not found: ${keyWrap.classical.wrappingKeyId}`);
    }
    const classicalWrappingKey = wrappingKeyEntry[1].classical;

    // Classical unwrap
    const classicalDek = await this.rsaOaepUnwrap(keyWrap.classical.wrappedKey, classicalWrappingKey);

    // PQC unwrap
    const pqcKeyEntry = this.wrappingKeys.get(keyWrap.pqc.encapsulationKeyId);
    if (!pqcKeyEntry) {
      throw new Error(`PQC encapsulation key not found: ${keyWrap.pqc.encapsulationKeyId}`);
    }

    const pqcProvider = new HybridCryptoProvider({ mode: 'PQC_ONLY', classical: 'RSA-3072', pqc: 'ML-KEM-768' });
    const pqcDek = await pqcProvider.decapsulate(pqcKeyEntry.pqc, keyWrap.pqc.encapsulatedKey);

    // Combine (XOR) - both must succeed
    return this.xorBytes(classicalDek, pqcDek);
  }

  // Get or generate Data Encryption Key
  private async getOrGenerateDEK(
    keyId: string,
    classification: SensitiveDataClassification
  ): Promise<Uint8Array> {
    const existing = this.keyStore.get(keyId);
    if (existing) {
      // Check if rotation needed
      const ageYears = (Date.now() - new Date(existing.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (ageYears < classification.keyRotationYears) {
        return existing.key;
      }
    }

    // Generate new DEK
    const dek = crypto.getRandomValues(new Uint8Array(32)); // 256-bit
    this.keyStore.set(keyId, {
      key: dek,
      version: (existing?.version || 0) + 1,
      createdAt: new Date().toISOString(),
      classification
    });

    this.auditLog('key_generate', { keyId, category: classification.category });
    return dek;
  }

  // Get or generate wrapping keys
  private async getOrGenerateWrappingKeys(wrappingKeyId: string): Promise<{ classical: Uint8Array; pqc: Uint8Array }> {
    const existing = this.wrappingKeys.get(wrappingKeyId);
    if (existing) return existing;

    // Generate classical RSA key pair (for wrapping)
    const classicalProvider = new HybridCryptoProvider({ mode: 'CLASSICAL', classical: 'RSA-3072', pqc: 'ML-KEM-768' });
    const classicalKP = await classicalProvider.generateKeyPair('RSA-3072');

    // Generate PQC key pair (for encapsulation)
    const pqcProvider = new HybridCryptoProvider({ mode: 'PQC_ONLY', classical: 'RSA-3072', pqc: 'ML-KEM-768' });
    const pqcKP = await pqcProvider.generateKeyPair('ML-KEM-768');

    const keys = { classical: classicalKP.privateKey, pqc: pqcKP.privateKey };
    this.wrappingKeys.set(wrappingKeyId, keys);

    return keys;
  }

  // AES-256-GCM encryption
  private async encryptAES256GCM(plaintext: Uint8Array, key: Uint8Array): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array }> {
    // Using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext);
    
    // Extract tag (last 16 bytes)
    const ctArray = new Uint8Array(ciphertext);
    const tag = ctArray.slice(-16);
    const actualCiphertext = ctArray.slice(0, -16);

    return { ciphertext: actualCiphertext, iv, tag };
  }

  // AES-256-GCM decryption
  private async decryptAES256GCM(ciphertext: Uint8Array, key: Uint8Array, expectedHash: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
    // Note: In production, you'd need the IV and tag from the package metadata
    // This is simplified for demonstration
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, cryptoKey, ciphertext);
    return new Uint8Array(plaintext);
  }

  // RSA-OAEP wrap (simplified)
  private async rsaOaepWrap(data: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
    // Placeholder: use Web Crypto API with RSA-OAEP
    return data; // In production: actual RSA encryption
  }

  private async rsaOaepUnwrap(wrapped: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    // Placeholder: use Web Crypto API with RSA-OAEP
    return wrapped; // In production: actual RSA decryption
  }

  // SHA-256 hash
  private async sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // XOR utility
  private xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const len = Math.min(a.length, b.length);
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) result[i] = a[i] ^ b[i];
    return result;
  }

  // Calculate expiry date
  private calculateExpiry(classification: SensitiveDataClassification): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() + classification.retentionYears);
    return date.toISOString();
  }

  // Audit logging
  private auditLog(action: string, details: any): void {
    if (!this.policy.audit.logAllAccess) return;
    
    console.log(`[AUDIT] ${new Date().toISOString()} ${action}`, details);
    // In production: write to immutable audit log
  }

  // Key rotation for long-term data
  async rotateKeys(category: string): Promise<string[]> {
    const classification = this.getClassification(category);
    const rotatedKeys: string[] = [];

    for (const [keyId, keyData] of this.keyStore.entries()) {
      if (keyData.classification.category === category) {
        const ageYears = (Date.now() - new Date(keyData.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (ageYears >= classification.keyRotationYears) {
          // Generate new key version
          const newKeyId = `${keyId}-v${keyData.version + 1}`;
          const dek = crypto.getRandomValues(new Uint8Array(32));
          this.keyStore.set(newKeyId, {
            key: dek,
            version: keyData.version + 1,
            createdAt: new Date().toISOString(),
            classification
          });
          
          this.auditLog('key_rotate', { oldKeyId: keyId, newKeyId, category });
          rotatedKeys.push(newKeyId);
        }
      }
    }

    return rotatedKeys;
  }

  // Consultancy framework for regulated sectors
  generateConsultancyReport(): string {
    const report = [
      '# ASI_FORMS PQC Long-Retention Blindage Assessment',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Policy: ${this.policy.pqcConfig.mode} (${this.policy.pqcConfig.classical} + ${this.policy.pqcConfig.pqc})`,
      '',
      '## Data Classification Coverage',
      ''
    ];

    for (const c of this.policy.dataClassifications) {
      report.push(`### ${c.category.toUpperCase()}`);
      report.push(`- Retention: ${c.retentionYears} years`);
      report.push(`- Regulations: ${c.regulatoryFramework?.join(', ') || 'None'}`);
      report.push(`- Encryption: ${c.encryptionRequired ? 'Required' : 'Optional'}`);
      report.push(`- Key Rotation: Every ${c.keyRotationYears} years`);
      report.push('');
    }

    report.push('## Key Management');
    report.push(`- Algorithm: ${this.policy.keyManagement.algorithm}`);
    report.push(`- Key Size: ${this.policy.keyManagement.keySize} bits`);
    report.push(`- Rotation: ${this.policy.keyManagement.rotationIntervalYears} years`);
    report.push(`- HSM Required: ${this.policy.keyManagement.hsmRequired ? 'Yes' : 'No'}`);
    report.push(`- Backup: ${this.policy.keyManagement.backupStrategy}`);
    report.push('');

    report.push('## Migration Recommendations');
    report.push('1. **Immediate**: Enable hybrid TLS for all data-in-transit');
    report.push('2. **Short-term (6 months)**: Implement hybrid key wrap for data-at-rest');
    report.push('3. **Medium-term (1 year)**: Complete PQC migration for new data');
    report.push('4. **Long-term (3 years)**: Re-encrypt legacy data with PQC');
    report.push('');

    report.push('## Compliance Mapping');
    for (const c of this.policy.dataClassifications) {
      if (c.regulatoryFramework) {
        report.push(`- **${c.category}**: ${c.regulatoryFramework.join(', ')}`);
      }
    }

    return report.join('\n');
  }

  // Get current policy
  getPolicy(): BlindagePolicy {
    return { ...this.policy };
  }

  // Update policy (crypto-agility)
  async updatePolicy(newPolicy: Partial<BlindagePolicy>, reason: string): Promise<void> {
    this.policy = { ...this.policy, ...newPolicy };
    this.cryptoProvider = new HybridCryptoProvider(this.policy.pqcConfig);
    this.agilityManager = new CryptoAgilityManager(this.policy.pqcConfig);
    this.auditLog('policy_update', { reason });
  }
}

// Factory
export function createLongRetentionBlindageFromEnv(): LongRetentionBlindage {
  return new LongRetentionBlindage({
    pqcConfig: {
      mode: (process.env.PQC_MODE || 'HYBRID') as any,
      classical: (process.env.PQC_CLASSICAL || 'RSA-3072') as any,
      pqc: (process.env.PQC_ALGORITHM || 'ML-KEM-768') as any
    }
  });
}

// Sector-specific configurations
export const SECTOR_CONFIGS = {
  fintech: {
    dataClassifications: [
      { category: 'financial' as const, retentionYears: 10, regulatoryFramework: ['SOX', 'PCI-DSS', 'BACEN'], encryptionRequired: true, keyRotationYears: 3 },
      { category: 'legal' as const, retentionYears: 30, regulatoryFramework: ['LGPD', 'CPC'], encryptionRequired: true, keyRotationYears: 5 }
    ],
    keyManagement: { algorithm: 'hybrid' as const, keySize: 256, rotationIntervalYears: 3, escrowEnabled: true, hsmRequired: true, backupStrategy: 'geo-distributed' as const }
  },
  healthtech: {
    dataClassifications: [
      { category: 'health' as const, retentionYears: 20, regulatoryFramework: ['LGPD', 'HIPAA', 'CFM'], encryptionRequired: true, keyRotationYears: 5 },
      { category: 'legal' as const, retentionYears: 30, regulatoryFramework: ['LGPD', 'CPC'], encryptionRequired: true, keyRotationYears: 5 }
    ],
    keyManagement: { algorithm: 'hybrid' as const, keySize: 256, rotationIntervalYears: 5, escrowEnabled: true, hsmRequired: true, backupStrategy: 'geo-distributed' as const }
  },
  legaltech: {
    dataClassifications: [
      { category: 'legal' as const, retentionYears: 30, regulatoryFramework: ['LGPD', 'CPC', 'OAB'], encryptionRequired: true, keyRotationYears: 5 },
      { category: 'financial' as const, retentionYears: 10, regulatoryFramework: ['SOX'], encryptionRequired: true, keyRotationYears: 3 }
    ],
    keyManagement: { algorithm: 'hybrid' as const, keySize: 256, rotationIntervalYears: 5, escrowEnabled: true, hsmRequired: true, backupStrategy: 'air-gapped' as const }
  },
  govtech: {
    dataClassifications: [
      { category: 'government' as const, retentionYears: 100, regulatoryFramework: ['LGPD', 'LAI', 'Decree 10.046'], encryptionRequired: true, keyRotationYears: 10 },
      { category: 'legal' as const, retentionYears: 30, regulatoryFramework: ['LGPD', 'CPC'], encryptionRequired: true, keyRotationYears: 5 }
    ],
    keyManagement: { algorithm: 'hybrid' as const, keySize: 256, rotationIntervalYears: 10, escrowEnabled: true, hsmRequired: true, backupStrategy: 'air-gapped' as const }
  }
} as const;

export { HybridCryptoProvider, CryptoConfig, createCryptoProviderFromEnv } from './crypto-provider';
export { CryptoAgilityManager } from './crypto-agility';