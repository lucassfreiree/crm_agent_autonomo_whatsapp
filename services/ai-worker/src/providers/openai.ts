// ════════════════════════════════════════════════════════════════
//  Adapter OpenAI (Structured Outputs com schema strict)
//  Compatível com endpoints compatíveis com OpenAI (ex: alguns proxies).
// ════════════════════════════════════════════════════════════════
import OpenAI from "openai";
import type { LeadClassificationResult } from "@crm/shared-types";

import { SYSTEM_PROMPT, buildUserMessage } from "../humanize/prompt.js";
import { humanizeReply } from "../humanize/post-processor.js";
import type { AIProvider, ClassifyContext, ResolvedProviderConfig } from "./types.js";

/** Schema JSON que o modelo deve seguir (Structured Outputs strict). */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    temperature: { type: "string", enum: ["QUENTE", "MEDIO", "FRIO"] },
    interest_category: { type: "string", description: "tema principal do interesse" },
    summary: { type: "string", description: "resumo curto (1 frase) do que o lead quer" },
    confidence: { type: "number", description: "0 a 1" },
    next_action: { type: ["string", "null"], description: "próxima ação recomendada" },
    reply: { type: "string", description: "resposta natural em pt-BR" },
  },
  required: ["temperature", "interest_category", "summary", "confidence", "next_action", "reply"],
  additionalProperties: false,
} as const;

export class OpenAIProvider implements AIProvider {
  readonly name = "OPENAI";
  private client: OpenAI;
  private model: string;

  constructor(config: ResolvedProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model || "gpt-4o-mini";
  }

  async classifyAndReply(ctx: ClassifyContext): Promise<LeadClassificationResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(ctx) },
      ],
      // Structured Outputs garante aderência ao schema (não só JSON válido).
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lead_classification",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      } as OpenAI.ResponseFormatJSONSchema,
      temperature: 0.4, // um pouco de variação p/ parecer humano, não aleatório demais
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("OpenAI retornou resposta vazia");

    const parsed = JSON.parse(raw) as {
      temperature: "QUENTE" | "MEDIO" | "FRIO";
      interest_category: string;
      summary: string;
      confidence: number;
      next_action: string | null;
      reply: string;
    };

    return {
      temperature: parsed.temperature,
      interestCategory: parsed.interest_category,
      summary: parsed.summary,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      nextAction: parsed.next_action,
      // Camada 2: pós-processa a resposta para remover tells que escaparam do prompt.
      reply: humanizeReply(parsed.reply),
    };
  }
}
