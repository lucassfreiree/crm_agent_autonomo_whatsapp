// ════════════════════════════════════════════════════════════════
//  Criptografia simétrica (AES-256-GCM) para a API key da IA
//  - Cifra antes de gravar em AIProviderConfig.apiKey
//  - Decifra apenas no worker (e no painel ao editar config)
//  - Usa AI_CONFIG_ENCRYPTION_KEY (32 bytes, base64) do .env
// ════════════════════════════════════════════════════════════════
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM recomenda 96 bits

/** Lê e valida a chave de criptografia (deve ser 32 bytes após base64-decode). */
function getKey(): Buffer {
  const raw = process.env["AI_CONFIG_ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error(
      "AI_CONFIG_ENCRYPTION_KEY não definida. Gere com: openssl rand -base64 32",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `AI_CONFIG_ENCRYPTION_KEY inválida: esperado 32 bytes, recebeu ${key.length}. ` +
        'Gere com: openssl rand -base64 32',
    );
  }
  return key;
}

/**
 * Cifra um texto plano → string serializada "iv:authTag:ciphertext" (tudo base64).
 * Use para gravar a API key da IA no banco.
 */
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/**
 * Decifra uma string gerada por encryptApiKey de volta ao texto plano.
 * Lança erro se a chave mudou (authTag inválida) — sinal de chave errada.
 */
export function decryptApiKey(serialized: string): string {
  const key = getKey();
  const parts = serialized.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de API key criptografada inválido");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** True se há chave de criptografia configurada (sem lançar). */
export function hasEncryptionKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
