// ════════════════════════════════════════════════════════════════
//  Interop CJS↔ESM para Baileys 6.7.15
//  Baileys 6.7.x é CommonJS. Em runtime ESM (tsx/Node ESM) os exports
//  nomeados resolvem corretamente, mas o export "default" NÃO é a
//  função makeWASocket (é um objeto). Confirmado em runtime:
//    typeof makeWASocket (named) === 'function'  ✓
//    typeof default === 'object'                  ✗ (não é a função)
//  Portanto importamos makeWASocket como NOME, não como default.
//  Este módulo centraliza o acesso para isolar qualquer ajuste futuro.
// ════════════════════════════════════════════════════════════════
export {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";

export type {
  WASocket,
  proto,
  WAMessage,
  AuthenticationState,
} from "@whiskeysockets/baileys";
