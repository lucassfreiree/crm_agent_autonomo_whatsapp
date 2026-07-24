// Cria um contato/conversa/mensagem de teste e publica o evento no Redis.
// IMPORTANTE: carrega o dotenv ANTES de importar @crm/db (que valida no import).
import { config } from "dotenv";
config({ path: "../../.env" });

const { prisma } = await import("@crm/db");
const { Redis } = await import("ioredis");
const { REDIS_CHANNELS } = await import("@crm/shared-types");

const PHONE = "+551188880001";
const redis = new Redis(process.env["REDIS_URL"]!);

const contact = await prisma.contact.upsert({
  where: { phone: PHONE },
  create: { phone: PHONE, name: "Lead Teste B", jid: "551188880001@s.whatsapp.net" },
  update: { name: "Lead Teste B", jid: "551188880001@s.whatsapp.net" },
});

const conversation = await prisma.conversation.create({
  data: { contactId: contact.id, status: "active", lastMessageAt: new Date() },
});

const message = await prisma.message.create({
  data: {
    conversationId: conversation.id,
    direction: "INBOUND",
    body: "Oi, vi seu anúncio e queria saber o preço do produto, tenho interesse",
  },
});

const event = {
  messageId: message.id,
  conversationId: conversation.id,
  contactId: contact.id,
  body: message.body,
  timestamp: new Date().toISOString(),
};

await redis.publish(REDIS_CHANNELS.NEW_MESSAGE, JSON.stringify(event));
console.log("✓ Evento publicado:", { contactId: contact.id, messageId: message.id });
console.log("  (rode o worker em paralelo para vê-lo consumir)");
await redis.quit();
await prisma.$disconnect();
