// ════════════════════════════════════════════════════════════════
//  Pós-processador determinístico (camada 2 da humanização)
//  Remove "tells" mecânicos de IA que escapam do prompt. Função pura,
//  rápida e gratuita. Roda sobre o campo "reply" antes de enviar.
// ════════════════════════════════════════════════════════════════

/** Aberturas de IA para remover do início da resposta. */
const AI_OPENERS = [
  /^(claro|com certeza|certo|perfeito|entendi|compreendi|ótima pergunta|que bom|beleza|pronto|tá certo|tá bom)[,!。\s]*/i,
  /^(que bom que|fico feliz em|fico feliz de|espero que isso|estou aqui para)/i,
];

/** Fechos de IA para remover do fim da resposta. */
const AI_CLOSERS = [
  /\s*(espero que isso (?:te )?ajude!?)\.?$/i,
  /\s*(me (?:avise|avisa|chame) se (?:precisar|quiser).*)\.?$/i,
  /\s*(estou à disposição.*)\.?$/i,
  /\s*(qualquer (?:coisa|dúvida),?(?: é só)? (?:chamar|avisar|falar).*)\.?$/i,
];

/** Vocabulário de IA para substituir por alternativas naturais. */
const AI_VOCAB: Array<[RegExp, string]> = [
  [/\bmergulhar\b/gi, "entrar"],
  [/\bpaisagem\b/gi, "cenário"],
  [/\btestemunho de\b/gi, "mostra"],
  [/\breflexo de\b/gi, "resultado de"],
  [/\bpotencializar\b/gi, "melhorar"],
  [/\bvibrante\b/gi, "animado"],
  [/\bjornada\b/gi, "processo"],
  [/\bcrucial\b/gi, "importante"],
  [/\bfundamental\b/gi, "importante"],
  [/\ba fim de\b/gi, "para"],
  [/\bdevido ao fato de que\b/gi, "porque"],
  [/\bno que diz respeito a\b/gi, "sobre"],
  [/\bdito isso\b/gi, "então"],
];

/**
 * Humaniza um texto de resposta removendo tells mecânicos de IA.
 * Função pura e idempotente.
 */
export function humanizeReply(text: string): string {
  let out = text;

  // 1. Remove aspas/marcadores de citação residuais.
  out = out.replace(/^["'`]|["'`]$/g, "");

  // 2. Travessões e traços → vírgula/ponto/espaço (proibido em WhatsApp natural).
  out = out
    .replace(/—/g, ", ") // em-dash
    .replace(/–/g, ", ") // en-dash
    .replace(/\s--\s/g, ", "); // double-hyphen

  // 3. Markdown: remove negrito/itálico/listas, colapsa em prosa.
  out = out
    .replace(/\*\*(.+?)\*\*/g, "$1") // **negrito**
    .replace(/__(.+?)__/g, "$1") // __itálico__
    .replace(/(?<=^|\s)[-*•]\s+/gm, "") // marcadores de lista no início
    .replace(/^\s*\d+[.)]\s+/gm, ""); // listas numeradas

  // 4. Remove aberturas de IA (pode haver várias encadeadas).
  for (let i = 0; i < 3; i++) {
    const before = out;
    for (const re of AI_OPENERS) out = out.replace(re, "");
    out = out.trim();
    if (out === before) break;
  }

  // 5. Remove fechos de IA.
  for (const re of AI_CLOSERS) out = out.replace(re, "");

  // 6. Substitui vocabulário de IA.
  for (const [re, rep] of AI_VOCAB) out = out.replace(re, rep);

  // 7. Normaliza pontuação repetida (!!! → !, ?? → ?).
  out = out.replace(/([!?])\1{1,}/g, "$1");

  // 8. Remove emojis decorativos no início da linha (mantém máximo 1 no fim).
  out = out.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s+/u, "");

  // 9. Colapsa espaços múltiplos e quebras excessivas.
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // 10. Capitaliza primeira letra (pós-remoção de abertura pode ficar minúscula).
  if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);

  return out;
}
