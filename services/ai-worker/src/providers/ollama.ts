// ════════════════════════════════════════════════════════════════
//  Adapter Ollama (modelo local — privacidade total, sem API key)
//  Ollama expõe uma API compatível com OpenAI em http://host:11434/v1.
//  Usamos o SDK OpenAI apontando para o endpoint local.
//  Privacidade: nenhum dado de lead sai da VPS.
// ════════════════════════════════════════════════════════════════
import OpenAI from "openai";
import type { LeadClassificationResult } from "@crm/shared-types";

import { SYSTEM_PROMPT, buildUserMessage } from "../humanize/prompt.js";
import { humanizeReply } from "../humanize/post-processor.js";
import type { AIProvider, ClassifyContext, ResolvedProviderConfig } from "./types.js";

export class OllamaProvider implements AIProvider {
  readonly name = "OLLAMA";
  private client: OpenAI;
  private model: string;

  constructor(config: ResolvedProviderConfig) {
    // Ollama é compatível com OpenAI; apiKey dummy mas obrigatória pelo SDK.
    this.client = new OpenAI({
      apiKey: config.apiKey || "ollama",
      baseURL: config.baseUrl || "http://localhost:11434/v1",
    });
    this.model = config.model || "llama3.1:8b";
  }

  async classifyAndReply(ctx: ClassifyContext): Promise<LeadClassificationResult> {
    // Modelos locais são menos confiáveis em JSON strict; pedimos JSON
    // no prompt e fazemos parse defensivo.
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(ctx) },
      ],
      response_format: { type: "json_object" } as OpenAI.ResponseFormatJSONObject,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Ollama retornou resposta vazia");

    const parsed = safeParseJson(raw);
    return {
      temperature: normalizeTemperature(parsed.temperature),
      interestCategory: String(parsed.interest_category ?? parsed.interestCategory ?? "geral"),
      summary: String(parsed.summary ?? ""),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      nextAction: (parsed.next_action ?? parsed.nextAction ?? null) as string | null,
      reply: humanizeReply(String(parsed.reply ?? "")),
    };
  }
}

/** Tenta parsear JSON mesmo com texto extra ao redor (modelos locais falham às vezes). */
function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fallthrough */
      }
    }
    return {};
  }
}

function normalizeTemperature(v: unknown): "QUENTE" | "MEDIO" | "FRIO" {
  if (v === "QUENTE" || v === "MEDIO" || v === "FRIO") return v;
  return "FRIO";
}
