"use strict";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DEFAULT_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const SPECIALIST_NAME = "Limana";
const SPECIALIST_PHONE = "+55 51 9552-7203";
const SPECIALIST_WA = "555195527203";

const CATALOG_CONTEXT = [
  "Catalogo tecnico autorizado (somente estes 3 produtos):",
  "1) INFORCE WILD1",
  "- 1000 lumens, 25.000 candela, alcance 312m, autonomia 1,5h.",
  "- Montagem em trilho 1913 ou universal.",
  "- Corpo em aluminio 6061-T6 com anodizacao MIL-SPEC.",
  "- Vedacao: ate 20m.",
  "",
  "2) INFORCE WMLx White Gen 3",
  "- 1100 lumens, 25.000 candela, alcance 316m, autonomia 2h com 2x CR123A.",
  "- Corpo em nylon reforcado com fibra de vidro.",
  "- Montagem em trilho MIL-STD-1913.",
  "- Vedacao: ate 20m.",
  "",
  "3) INFORCE WILD2",
  "- 1000 lumens, 25.000 candela, alcance 316m, autonomia 1,5h.",
  "- Montagem em trilho 1913 ou Glock Universal.",
  "- Corpo em aluminio 6061-T6 com anodizacao tipo III.",
  "- Vedacao: ate 20m."
].join("\n");

const SYSTEM_INSTRUCTIONS = [
  "Voce e a PETRAM GUNS IA.",
  "Responda sempre em portugues brasileiro.",
  "Escopo obrigatorio: SOMENTE perguntas tecnicas sobre WILD1, WMLx Gen 3 e WILD2.",
  "Nao responda assuntos fora do escopo tecnico dos 3 produtos.",
  "Se a pergunta fugir do escopo tecnico, responda educadamente e direcione para o especialista no WhatsApp.",
  "Se faltar informacao tecnica confirmada, diga explicitamente que nao tem confirmacao e direcione para o especialista.",
  "Nunca invente especificacoes e nunca recomende produtos fora do catalogo autorizado.",
  "Respostas curtas, objetivas e tecnicas."
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

function isTechnicalScope(text) {
  const t = normalize(text);
  const hasProduct = /(wild1|wild2|wmlx|gen 3|inforce)/.test(t);
  const technicalIntent = /(lumen|candela|alcance|distancia|autonomia|bateria|cr123|montagem|trilho|1913|glock|universal|material|aluminio|nylon|vedacao|ipx|agua|peso|comprimento|diametro|dimens|paddle|switch|ambidestro|momentaneo|constante|estrobo|lockout|feixe|hotspot|spill|resistencia|durabilidade|operacao|instalacao|manual|especifica)/.test(t);
  const nonTechnicalIntent = /(preco|valor|desconto|oferta|cupom|pagamento|parcel|pix|boleto|frete|envio|entrega|prazo|chega|devolucao|troca|site|loja|endereco|horario)/.test(t);
  if (nonTechnicalIntent && !technicalIntent) return false;
  if (technicalIntent) return true;
  return hasProduct && !nonTechnicalIntent;
}

function waLink(productKey) {
  const productName = productKey === "wild1"
    ? "INFORCE WILD1"
    : productKey === "wild2"
      ? "INFORCE WILD2"
      : productKey === "wmlx"
        ? "INFORCE WMLx White Gen 3"
        : "uma lanterna tatica";
  const message = `Ola ${SPECIALIST_NAME}, quero atendimento especializado sobre ${productName}. Pode me ajudar?`;
  return `https://wa.me/${SPECIALIST_WA}?text=${encodeURIComponent(message)}`;
}

function outOfScopeMessage(productKey) {
  return `Eu respondo somente perguntas tecnicas sobre WILD1, WMLx Gen 3 e WILD2. Para assuntos fora desse escopo, fale com o especialista: ${waLink(productKey)}`;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function containsWaLink(text) {
  return /wa\.me\/\d+/.test(text || "");
}

function stripWaLinks(text) {
  return (text || "").replace(/https:\/\/wa\.me\/[^\s<]+/g, "").trim();
}

function needsHumanSupport(answer) {
  const t = normalize(answer || "");
  return /(nao tenho|nao sei|sem confirmacao|nao ha|validacao humana|confirmar com especialista|nao consta|fora do escopo|fora de escopo|fora desse escopo)/.test(t);
}

function productSummary(productKey) {
  if (productKey === "wild1") {
    return "INFORCE WILD1: 1000 lumens, 25.000 candela, alcance 312m, autonomia 1,5h, aluminio 6061-T6 e vedacao ate 20m.";
  }
  if (productKey === "wmlx") {
    return "INFORCE WMLx White Gen 3: 1100 lumens, 25.000 candela, alcance 316m, autonomia 2h em 2x CR123A, nylon reforcado e vedacao ate 20m.";
  }
  if (productKey === "wild2") {
    return "INFORCE WILD2: 1000 lumens, 25.000 candela, alcance 316m, autonomia 1,5h, aluminio 6061-T6 e vedacao ate 20m.";
  }
  return "";
}

function localFallback(question) {
  const q = normalize(question);
  const productKey = detectProduct(q);

  if (isBuyIntent(q)) {
    return `Perfeito. Para fechamento, fale com ${SPECIALIST_NAME} (${SPECIALIST_PHONE}): ${waLink(productKey)}`;
  }

  if (!isTechnicalScope(q)) {
    return outOfScopeMessage(productKey);
  }

  if (/(compar|diferenc|vs|versus|qual melhor)/.test(q)) {
    return [
      "Comparativo tecnico rapido:",
      "- WILD1: foco em pistola compacta, 1000 lumens, 312m, 1,5h.",
      "- WMLx Gen 3: 1100 lumens, 316m e 2h, foco em rifle/PCC.",
      "- WILD2: 1000 lumens, 316m, 1,5h, perfil profissional multi-plataforma."
    ].join("\n");
  }

  if (/(lente|quebra|fragil|resiste|durabil|impact|queda|material|aluminio|nylon)/.test(q)) {
    return [
      "Resumo tecnico de resistencia:",
      "- WMLx Gen 3: nylon reforcado com fibra de vidro.",
      "- WILD1/WILD2: aluminio 6061-T6 com anodizacao MIL-SPEC/tipo III.",
      "- Os 3 modelos: vedacao ate 20m."
    ].join("\n");
  }

  if (/(autonomia|bateria|duracao|pilha|tempo ligado)/.test(q)) {
    return "Autonomia: WMLx Gen 3 = 2h (2x CR123A); WILD1 = 1,5h; WILD2 = 1,5h.";
  }

  if (/(lumen|potencia|candela|feixe|alcance|distancia)/.test(q)) {
    return "Saida e alcance: WMLx Gen 3 = 1100 lm / 25.000 cd / 316m; WILD1 = 1000 lm / 25.000 cd / 312m; WILD2 = 1000 lm / 25.000 cd / 316m.";
  }

  if (/(trilho|montagem|1913|glock|universal|paddle|ambidestro|switch|estrobo|momentaneo|constante|lockout)/.test(q)) {
    return "Montagem e controles: WILD1/WILD2 aceitam 1913 (WILD2 tambem Glock Universal); WMLx Gen 3 integra clamp MIL-STD-1913; os modelos operam com acionamento lateral e modos tecnicos conforme manual.";
  }

  if (productKey) {
    return productSummary(productKey);
  }

  return "Posso responder somente conteudo tecnico de WILD1, WMLx Gen 3 e WILD2. Pergunte sobre potencia, alcance, autonomia, montagem, material, vedacao ou operacao.";
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

    const productKey = detectProduct(question);
    const buyIntent = isBuyIntent(question);
    const inScope = isTechnicalScope(question);

    if (!buyIntent && !inScope) {
      return res.status(200).json({ answer: outOfScopeMessage(productKey) });
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

    const unknownInfo = needsHumanSupport(answer);

    if (!buyIntent && !unknownInfo) {
      answer = stripWaLinks(answer);
    }

    if ((buyIntent || unknownInfo) && !containsWaLink(answer)) {
      answer += `\n\nFalar com o especialista (${SPECIALIST_PHONE}): ${waLink(productKey)}`;
    }

    return res.status(200).json({ answer });
  } catch (_error) {
    return res.status(500).json({
      answer: `No momento estou sem conexao com a IA. Eu consigo responder apenas assuntos tecnicos dos 3 produtos. Para apoio humano, fale com o especialista: https://wa.me/${SPECIALIST_WA}`
    });
  }
};
