import type { WASocket } from "@whiskeysockets/baileys";

/**
 * Estado mutável do daemon, compartilhado entre os módulos.
 * Mantido num único objeto para evitar variáveis globais espalhadas.
 */
export const waState = {
  /** Socket Baileys atual (null quando desconectado). */
  sock: null as WASocket | null,
  /** True quando o usuário desligou pelo painel — impede reconexão automática. */
  manuallyStopped: true,
  /** True quando uma conexão está em andamento (evita start concorrente). */
  connecting: false,
  /** Número conectado (só dígitos) quando state === connected. */
  phoneNumber: undefined as string | undefined,
  /** Último QR emitido (para GET /status responder imediato). */
  lastQr: undefined as string | undefined,
};

/** Reseta campos derivados quando a conexão cai. */
export function resetConnectionFields(): void {
  waState.sock = null;
  waState.phoneNumber = undefined;
}
