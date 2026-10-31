// Crypto-Agility Module — ASI_FORMS
// Plugin-based algorithm selection with remote configuration updates
// Enables algorithm changes without code redeployment

import { HybridCryptoProvider, CryptoConfig, ClassicalAlgorithm, PQCAlgorithm, HybridMode } from '../api/crypto-provider';

export interface AlgorithmPlugin {
  name: string;
  version: string;
  type: 'classical' | 'pqc' | 'hybrid';
  algorithms: (ClassicalAlgorithm | PQCAlgorithm)[];
  provider: HybridCryptoProvider;
  initialize(config: CryptoConfig): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export interface AgilityConfig {
  current: CryptoConfig;
  available: Record<string, AlgorithmPlugin>;
  policy: AgilityPolicy;
  auditLog: AgilityAuditEntry[];
}

export interface AgilityPolicy {
  allowRemoteUpdate: boolean;
  allowedModes: HybridMode[];
  allowedClassical: ClassicalAlgorithm[];
  allowedPQC: PQCAlgorithm[];
  requireApproval: boolean;
  approvalThreshold: 'critical' | 'high' | 'medium' | 'low';
  rollbackWindowMs: number;
}

export interface AgilityAuditEntry {
  timestamp: string;
  action: 'config_change' | 'algorithm_added' | 'algorithm_removed' | 'rollback';
  previousConfig: CryptoConfig;
  newConfig: CryptoConfig;
  initiatedBy: string;
  approvedBy?: string;
  reason: string;
}

export class CryptoAgilityManager {
  private config: AgilityConfig;
  private listeners: Set<(config: CryptoConfig) => void> = new Set();
  private rollbackTimer: NodeJS.Timeout | null = null;

  constructor(initialConfig: CryptoConfig, policy: Partial<AgilityPolicy> = {}) {
    this.config = {
      current: initialConfig,
      available: {},
      policy: {
        allowRemoteUpdate: policy.allowRemoteUpdate ?? true,
        allowedModes: policy.allowedModes ?? ['CLASSICAL', 'HYBRID', 'PQC_ONLY'],
        allowedClassical: policy.allowedClassical ?? ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'],
        allowedPQC: policy.allowedPQC ?? ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024', 'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'],
        requireApproval: policy.requireApproval ?? true,
        approvalThreshold: policy.approvalThreshold ?? 'high',
        rollbackWindowMs: policy.rollbackWindowMs ?? 300000 // 5 minutes
      },
      auditLog: []
    };

    // Register default plugins
    this.registerDefaultPlugins();
  }

  private registerDefaultPlugins(): void {
    // Classical provider plugin
    this.registerPlugin({
      name: 'classical-provider',
      version: '1.0.0',
      type: 'classical',
      algorithms: ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'],
      provider: new HybridCryptoProvider({ mode: 'CLASSICAL', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' }),
      async initialize(config) { /* no-op */ },
      async healthCheck() { return true; }
    });

    // PQC provider plugin
    this.registerPlugin({
      name: 'pqc-provider',
      version: '1.0.0',
      type: 'pqc',
      algorithms: ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024', 'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'],
      provider: new HybridCryptoProvider({ mode: 'PQC_ONLY', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' }),
      async initialize(config) { /* no-op */ },
      async healthCheck() { return true; }
    });

    // Hybrid provider plugin
    this.registerPlugin({
      name: 'hybrid-provider',
      version: '1.0.0',
      type: 'hybrid',
      algorithms: ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024', 'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'],
      provider: new HybridCryptoProvider({ mode: 'HYBRID', classical: 'ECDSA-P256', pqc: 'ML-KEM-768' }),
      async initialize(config) { /* no-op */ },
      async healthCheck() { return true; }
    });
  }

  registerPlugin(plugin: AlgorithmPlugin): void {
    this.config.available[plugin.name] = plugin;
  }

  unregisterPlugin(name: string): void {
    delete this.config.available[name];
  }

  getCurrentConfig(): CryptoConfig {
    return { ...this.config.current };
  }

  getAvailablePlugins(): AlgorithmPlugin[] {
    return Object.values(this.config.available);
  }

  getPolicy(): AgilityPolicy {
    return { ...this.config.policy };
  }

  getAuditLog(): AgilityAuditEntry[] {
    return [...this.config.auditLog];
  }

  // Subscribe to config changes
  onConfigChange(listener: (config: CryptoConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.config.current);
    }
  }

  // Update configuration with validation and audit
  async updateConfig(
    newConfig: Partial<CryptoConfig>,
    initiatedBy: string,
    reason: string,
    approvedBy?: string
  ): Promise<{ success: boolean; config: CryptoConfig; requiresApproval: boolean }> {
    const previousConfig = { ...this.config.current };
    const mergedConfig = { ...previousConfig, ...newConfig };

    // Validate against policy
    const validation = this.validateConfig(mergedConfig);
    if (!validation.valid) {
      return {
        success: false,
        config: previousConfig,
        requiresApproval: false
      };
    }

    // Check if approval required
    const requiresApproval = this.config.policy.requireApproval && 
      this.requiresApproval(previousConfig, mergedConfig);

    if (requiresApproval && !approvedBy) {
      return {
        success: false,
        config: previousConfig,
        requiresApproval: true
      };
    }

    // Apply configuration
    const oldProvider = this.getProviderForMode(previousConfig.mode);
    const newProvider = this.getProviderForMode(mergedConfig.mode);

    if (newProvider) {
      await newProvider.initialize(mergedConfig);
    }

    this.config.current = mergedConfig;

    // Audit log
    this.config.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'config_change',
      previousConfig,
      newConfig: mergedConfig,
      initiatedBy,
      approvedBy,
      reason
    });

    // Setup rollback timer
    this.setupRollback(previousConfig);

    // Notify listeners
    this.notifyListeners();

    return { success: true, config: mergedConfig, requiresApproval: false };
  }

  private validateConfig(config: CryptoConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.policy.allowedModes.includes(config.mode)) {
      errors.push(`Mode ${config.mode} not allowed`);
    }

    if (!this.config.policy.allowedClassical.includes(config.classical)) {
      errors.push(`Classical algorithm ${config.classical} not allowed`);
    }

    if (!this.config.policy.allowedPQC.includes(config.pqc)) {
      errors.push(`PQC algorithm ${config.pqc} not allowed`);
    }

    // Check if plugin exists for the mode
    const provider = this.getProviderForMode(config.mode);
    if (!provider) {
      errors.push(`No provider registered for mode ${config.mode}`);
    }

    return { valid: errors.length === 0, errors };
  }

  private requiresApproval(oldConfig: CryptoConfig, newConfig: CryptoConfig): boolean {
    // Require approval for mode changes or algorithm downgrades
    if (oldConfig.mode !== newConfig.mode) return true;
    if (oldConfig.pqc !== newConfig.pqc) return true;
    if (oldConfig.classical !== newConfig.classical) return true;
    return false;
  }

  private getProviderForMode(mode: HybridMode): AlgorithmPlugin | undefined {
    const modeMap: Record<HybridMode, string> = {
      CLASSICAL: 'classical-provider',
      HYBRID: 'hybrid-provider',
      PQC_ONLY: 'pqc-provider'
    };
    return this.config.available[modeMap[mode]];
  }

  private setupRollback(previousConfig: CryptoConfig): void {
    if (this.rollbackTimer) {
      clearTimeout(this.rollbackTimer);
    }

    this.rollbackTimer = setTimeout(() => {
      this.rollback(previousConfig, 'auto-rollback', 'Rollback window expired');
    }, this.config.policy.rollbackWindowMs);
  }

  async rollback(previousConfig: CryptoConfig, initiatedBy: string, reason: string): Promise<void> {
    const currentConfig = { ...this.config.current };
    this.config.current = previousConfig;

    const provider = this.getProviderForMode(previousConfig.mode);
    if (provider) {
      await provider.initialize(previousConfig);
    }

    this.config.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'rollback',
      previousConfig: currentConfig,
      newConfig: previousConfig,
      initiatedBy,
      reason
    });

    this.notifyListeners();
  }

  // Get provider for current config
  getProvider(): HybridCryptoProvider {
    const provider = this.getProviderForMode(this.config.current.mode);
    return provider?.provider || new HybridCryptoProvider(this.config.current);
  }

  // Remote update endpoint (for API integration)
  async handleRemoteUpdate(request: {
    config: Partial<CryptoConfig>;
    initiatedBy: string;
    reason: string;
    approvalToken?: string;
  }): Promise<{ success: boolean; config: CryptoConfig; message: string }> {
    if (!this.config.policy.allowRemoteUpdate) {
      return { success: false, config: this.config.current, message: 'Remote updates disabled' };
    }

    const result = await this.updateConfig(
      request.config,
      request.initiatedBy,
      request.reason,
      request.approvalToken
    );

    return {
      success: result.success,
      config: result.config,
      message: result.requiresApproval ? 'Approval required' : result.success ? 'Config updated' : 'Validation failed'
    };
  }

  // Export configuration for backup/sync
  exportConfig(): string {
    return JSON.stringify({
      current: this.config.current,
      policy: this.config.policy,
      plugins: Object.keys(this.config.available)
    }, null, 2);
  }

  // Import configuration
  async importConfig(json: string, initiatedBy: string): Promise<boolean> {
    try {
      const imported = JSON.parse(json);
      const result = await this.updateConfig(
        imported.current,
        initiatedBy,
        'Config import',
        'system'
      );
      return result.success;
    } catch {
      return false;
    }
  }
}

// Factory for creating agility manager from environment
export function createCryptoAgilityManagerFromEnv(): CryptoAgilityManager {
  const initialConfig: CryptoConfig = {
    mode: (process.env.PQC_MODE || 'HYBRID') as HybridMode,
    classical: (process.env.PQC_CLASSICAL || 'ECDSA-P256') as ClassicalAlgorithm,
    pqc: (process.env.PQC_ALGORITHM || 'ML-KEM-768') as PQCAlgorithm
  };

  return new CryptoAgilityManager(initialConfig, {
    allowRemoteUpdate: process.env.PQC_REMOTE_UPDATE !== 'false',
    requireApproval: process.env.PQC_REQUIRE_APPROVAL !== 'false',
    approvalThreshold: (process.env.PQC_APPROVAL_THRESHOLD as any) || 'high'
  });
}

// React hook for frontend crypto agility
export function createUseCryptoAgility() {
  let manager: CryptoAgilityManager | null = null;
  let listeners: Set<(config: CryptoConfig) => void> = new Set();

  return {
    initialize: (mgr: CryptoAgilityManager) => {
      manager = mgr;
      manager.onConfigChange((config) => {
        listeners.forEach(l => l(config));
      });
    },
    getConfig: (): CryptoConfig | null => manager?.getCurrentConfig() || null,
    updateConfig: async (config: Partial<CryptoConfig>, reason: string) => {
      if (!manager) throw new Error('Not initialized');
      return manager.updateConfig(config, 'frontend', reason);
    },
    onChange: (listener: (config: CryptoConfig) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getAuditLog: () => manager?.getAuditLog() || [],
    getPolicy: () => manager?.getPolicy()
  };
}

// Export types and classes
export { HybridCryptoProvider, CryptoConfig, ClassicalAlgorithm, PQCAlgorithm, HybridMode } from '../api/crypto-provider';