import { invoke } from "@tauri-apps/api/core";

export interface VaultSummary {
  id: string;
  name: string;
  created_at: number;
  biometric_enabled: boolean;
}

export interface SessionInfo {
  unlocked: boolean;
  vault_id: string;
  name: string;
  biometric_enabled: boolean;
  biometric_available: boolean;
}

export interface HistoryEntry {
  password: string;
  changed_at: number;
}

export interface Credential {
  id: string;
  provider: string;
  username: string;
  password: string;
  url: string;
  category: string;
  notes: string;
  favorite: boolean;
  totp_secret: string;
  history: HistoryEntry[];
  created_at: number;
  updated_at: number;
}

export interface TotpCode {
  code: string;
  seconds_remaining: number;
}

export function emptyCredential(): Credential {
  return {
    id: "",
    provider: "",
    username: "",
    password: "",
    url: "",
    category: "",
    notes: "",
    favorite: false,
    totp_secret: "",
    history: [],
    created_at: 0,
    updated_at: 0,
  };
}

export const api = {
  // vaults
  listVaults: () => invoke<VaultSummary[]>("list_vaults"),
  sessionInfo: () => invoke<SessionInfo>("session_info"),
  createVault: (name: string, password: string) =>
    invoke<{ vault_id: string; recovery_key: string }>("create_vault", {
      name,
      password,
    }),
  unlock: (vaultId: string, secret: string, useRecovery: boolean) =>
    invoke<SessionInfo>("unlock", { vaultId, secret, useRecovery }),
  unlockBiometric: (vaultId: string) =>
    invoke<SessionInfo>("unlock_biometric", { vaultId }),
  lock: () => invoke<void>("lock"),
  deleteVault: (vaultId: string, password: string) =>
    invoke<void>("delete_vault", { vaultId, password }),

  // biometric
  biometricStatus: () => invoke<boolean>("biometric_status"),
  biometricReason: () => invoke<string>("biometric_reason"),
  enableBiometric: () => invoke<void>("enable_biometric"),
  disableBiometric: () => invoke<void>("disable_biometric"),

  // credentials
  listEntries: () => invoke<Credential[]>("list_entries"),
  upsertEntry: (entry: Credential) => invoke<Credential>("upsert_entry", { entry }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  changeMasterPassword: (currentPassword: string, newPassword: string) =>
    invoke<void>("change_master_password", { currentPassword, newPassword }),

  // totp
  totpCode: (secret: string) => invoke<TotpCode>("totp_code", { secret }),

  // import/export
  importEncrypted: (json: string) =>
    invoke<VaultSummary>("import_encrypted", { json }),
  exportEncrypted: () => invoke<string>("export_encrypted"),
  exportPlaintext: () => invoke<string>("export_plaintext"),
  importPlaintext: (json: string) => invoke<number>("import_plaintext", { json }),
};
