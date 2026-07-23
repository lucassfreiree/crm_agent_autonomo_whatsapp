// Script de verificação da Etapa 0 — valida que @crm/db está funcional.
// Executa CRUD completo + valida enums contra o Postgres real.
import { config } from "dotenv";
config({ path: "../../.env" });

const { prisma } = await import("../src/index.ts");

console.log("→ Conectando ao Postgres via @crm/db...");
const total = await prisma.contact.count();
console.log("✓ Cliente conectado. Contatos existentes:", total);

console.log("→ Testando insert (Contact)...");
const c = await prisma.contact.create({
  data: { phone: "+5511999990000", name: "Teste Etapa0", jid: "5511999990000@s.whatsapp.net" },
});
console.log("✓ Insert OK — contact id:", c.id);

console.log("→ Testando enum FunnelStage (Lead)...");
const lead = await prisma.lead.create({
  data: { contactId: c.id, funnelStage: "NOVOS" },
});
console.log("✓ Lead criado, funnelStage:", lead.funnelStage);

console.log("→ Testando relação Lead → LeadClassification...");
const cls = await prisma.leadClassification.create({
  data: {
    leadId: lead.id,
    temperature: "QUENTE",
    interestCategory: "preco",
    summary: "Lead pediu tabela de preços — alto interesse.",
    confidence: 0.9,
    nextAction: "Enviar proposta",
  },
});
console.log("✓ Classificação criada, temperature:", cls.temperature);

console.log("→ Cleanup...");
await prisma.leadClassification.delete({ where: { id: cls.id } });
await prisma.lead.delete({ where: { id: lead.id } });
await prisma.contact.delete({ where: { id: c.id } });
await prisma.$disconnect();
console.log("✅ Etapa 0 validada: cliente @crm/db funcional (CRUD + enums + relações OK).");
