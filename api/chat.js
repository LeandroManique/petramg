"use strict";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DEFAULT_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const SPECIALIST_NAME = "Limana";
const SPECIALIST_PHONE = "+55 51 9552-7203";
const SPECIALIST_WA = "555195527203";

const CATALOG_CONTEXT = [
  "Catalogo autorizado Petram Guns (nao indicar produtos fora desta lista):",
  "1) INFORCE WILD1",
  "- 1000 lumens, 25.000 candela, alcance 312m, autonomia 1,5h, CR123.",
  "- Construido em aluminio 6061-T6 com anodizacao MIL-SPEC.",
  "- Vedacao: ate 20m.",
  "- Preco/oferta: R$ 1.900,00 (32% OFF).",
  "",
  "2) INFORCE WMLx White Gen 3",
  "- 1100 lumens, 25.000 candela, alcance 316m, autonomia 2h em 2x CR123A.",
  "- Corpo em nylon reforcado em fibra de vidro.",
  "- Vedacao: ate 20m.",
  "- Preco/oferta: R$ 2.099,00 (15% OFF).",
  "- Perfil principal: rifle/PCC e usuarios que priorizam autonomia + performance.",
  "",
  "3) INFORCE WILD2",
  "- 1000 lumens, 25.000 candela, alcance 316m, autonomia 1,5h.",
  "- Construido em aluminio 6061-T6 anodizado tipo III.",
  "- Vedacao: ate 20m.",
  "- Preco/oferta: R$ 2.290,00 (28% OFF)."
].join("\n");

const SYSTEM_INSTRUCTIONS = [
  "Voce e a PETRAM GUNS IA.",
  "Responda sempre em portugues brasileiro.",
  "Postura: especialista tecnica + consultora comercial de alta conversao.",
  "Nunca invente dados, nunca chute especificacoes e nunca recomende produtos fora do catalogo autorizado.",
  "Quando faltar dado, diga claramente que nao ha confirmacao no catalogo e ofereca validacao humana.",
  "Se houver intencao de compra, encaminhe para WhatsApp do especialista:",
  `- ${SPECIALIST_NAME}: https://wa.me/${SPECIALIST_WA}`,
  "Use respostas objetivas, confiantes, com recomendacao justificada por cenario de uso.",
  "Mantenha foco comercial sem parecer robotico."
].join("\n");

function normalize(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectProduct(text) {
  const t = normalize(text);
  if (t.includes("wild1") || t.includes("wild 1")) return "wild1";
  if (t.includes("wild2") || t.includes("wild 2")) return "wild2";
  if (t.includes("wmlx") || t.includes("gen 3") || t.includes("gen3")) return "wmlx";
  return null;
}

function isBuyIntent(text) {
  const t = normalize(text);
  return /(quero comprar|vou comprar|fechar compra|como comprar|link de compra|falar com vendedor|falar com especialista|tenho interesse|me atende|quero esse|quero fechar|orcamento|prazo|entrega|pagamento|parcelamento)/.test(t);
}

function waLink(productKey) {
  const productName = productKey === "wild1"
    ? "INFORCE WILD1"
    : productKey === "wild2"
      ? "INFORCE WILD2"
      : productKey === "wmlx"
        ? "INFORCE WMLx White Gen 3"
        : "uma lanterna tatica";
  const message = `Ola ${SPECIALIST_NAME}, quero fechar compra da ${productName}. Pode me ajudar?`;
  return `https://wa.me/${SPECIALIST_WA}?text=${encodeURIComponent(message)}`;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
  return text;
}

function localFallback(question) {
  const q = normalize(question);
  const productKey = detectProduct(q);

  if (isBuyIntent(q)) {
    return `Perfeito, vamos para fechamento. Fale com ${SPECIALIST_NAME} no WhatsApp (${SPECIALIST_PHONE}): ${waLink(productKey)}`;
  }

  if (/(lente|quebra|fragil|resiste|durabil|impact|queda|aluminio|nylon|corpo)/.test(q)) {
    return [
      "Pergunta importante.",
      "WMLx Gen 3 usa corpo em nylon reforcado com fibra de vidro, resistente para uso operacional.",
      "WILD1 e WILD2 usam aluminio 6061-T6 com anodizacao MIL-SPEC/tipo III.",
      "Os 3 modelos tem vedacao ate 20m.",
      "Se seu foco for rifle com autonomia maior e robustez geral, a recomendacao tende ao WMLx Gen 3."
    ].join("\n");
  }

  if (/(compar|diferenc|vs|versus|qual melhor)/.test(q)) {
    return [
      "Comparativo rapido:",
      "- WILD1: entrada mais agressiva de preco para pistola compacta.",
      "- WMLx White Gen 3: 1100 lumens e 2h de autonomia, opcao mais equilibrada para performance e uso em rifle/PCC.",
      "- WILD2: perfil premium profissional para pistola."
    ].join("\n");
  }

  if (/(rifle|carabina|pcc|alcance|autonomia)/.test(q)) {
    return "Para rifle/PCC com foco em alcance + autonomia, WMLx White Gen 3 e a principal recomendacao (1100 lumens, 25.000 candela, 316m, 2h).";
  }

  if (/(outra marca|outro produto|fora do catalogo|nao tenho no catalogo)/.test(q)) {
    return `No momento so tenho dados oficiais de WILD1, WMLx Gen 3 e WILD2. Para pedido fora desse escopo, falo com ${SPECIALIST_NAME}: ${waLink(productKey)}`;
  }

  return [
    "Posso te orientar em modo tecnico-comercial com recomendacao objetiva.",
    "Me diga: plataforma principal (pistola, PCC ou rifle) e prioridade (alcance, autonomia, resistencia ou preco)."
  ].join("\n");
}

function needsHumanSupport(answer) {
  const t = normalize(answer || "");
  return /(nao tenho|nao sei|sem confirmacao|nao ha|validacao humana|confirmar com especialista|nao consta|fora do escopo|fora de escopo|fora desse escopo)/.test(t);
}

function mapHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-8)
    .map((item) => {
      const role = item?.role === "assistant" ? "model" : "user";
      const text = typeof item?.text === "string" ? item.text.trim() : "";
      if (!text) return null;
      return { role, parts: [{ text }] };
    })
    .filter(Boolean);
}

async function askGemini(question, history) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const payload = {
    systemInstruction: {
      parts: [{ text: `${SYSTEM_INSTRUCTIONS}\n\n${CATALOG_CONTEXT}` }]
    },
    contents: [
      ...mapHistory(history),
      {
        role: "user",
        parts: [{ text: `Pergunta do cliente: ${question}` }]
      }
    ],
    generationConfig: {
      temperature: Number(process.env.GEMINI_TEMPERATURE || 0.2),
      maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 800)
    }
  };

  const endpoint = `${DEFAULT_BASE_URL}/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Gemini status ${response.status}`);
  }

  const data = await response.json();
  return extractGeminiText(data);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1500) : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!question) {
      return res.status(400).json({ error: "Pergunta obrigatoria" });
    }

    let answer = "";
    try {
      answer = (await askGemini(question, history)) || "";
    } catch (_error) {
      answer = "";
    }

    if (!answer) {
      answer = localFallback(question);
    }

    const buyIntent = isBuyIntent(question);
    const unknownInfo = needsHumanSupport(answer);

    if (!buyIntent && !unknownInfo) {
      answer = answer.replace(/https:\/\/wa\.me\/[^\s<]+/g, "").trim();
    }

    if ((buyIntent || unknownInfo) && !/wa\.me\/\d+/.test(answer)) {
      answer += `\n\nContato ${SPECIALIST_NAME} (${SPECIALIST_PHONE}): ${waLink(detectProduct(question))}`;
    }

    return res.status(200).json({ answer });
  } catch (_error) {
    return res.status(500).json({
      answer: "No momento estou sem conexao com a IA generativa. Posso continuar com atendimento tecnico imediato ou te conectar ao Limana: https://wa.me/555195527203"
    });
  }
};

