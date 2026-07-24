// ════════════════════════════════════════════════════════════════
//  Adapter Anthropic Claude (tool use para saída estruturada)
//  Claude não tem "json_schema strict" nativo; usamos tool use para
//  forçar o schema. Haiku é a camada rápida/barata recomendada.
// ════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk";
import type { LeadClassificationResult } from "@crm/shared-types";

import { SYSTEM_PROMPT, buildUserMessage } from "../humanize/prompt.js";
import { humanizeReply } from "../humanize/post-processor.js";
import type { AIProvider, ClassifyContext, ResolvedProviderConfig } from "./types.js";

export class AnthropicProvider implements AIProvider {
  readonly name = "ANTHROPIC";
  private client: Anthropic;
  private model: string;

  constructor(config: ResolvedProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model || "claude-haiku-4-5";
  }

  async classifyAndReply(ctx: ClassifyContext): Promise<LeadClassificationResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(ctx) }],
      // Força saída estruturada via tool use (única tool = resposta garantida no schema).
      tools: [
        {
          name: "classify_lead",
          description: "Classifica o lead e gera a resposta ao cliente",
          input_schema: {
            type: "object",
            properties: {
              temperature: { type: "string", enum: ["QUENTE", "MEDIO", "FRIO"] },
              interest_category: { type: "string" },
              summary: { type: "string" },
              confidence: { type: "number" },
              next_action: { type: ["string", "null"] },
              reply: { type: "string" },
            },
            required: [
              "temperature",
              "interest_category",
              "summary",
              "confidence",
              "next_action",
              "reply",
            ],
          },
        },
      ],
      tool_choice: { type: "tool", name: "classify_lead" },
      temperature: 0.4,
    });

    // Extrai o input da tool call.
    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Anthropic não retornou tool_use");
    }
    const parsed = toolUse.input as {
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
      reply: humanizeReply(parsed.reply),
    };
  }
}
