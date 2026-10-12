// 골목카페 AI — type에 따라 세 가지 일을 한다.
//   review : 리뷰 한 개의 감정(좋음·보통·아쉬움) + 사장님 답글 초안
//   promo  : 메뉴와 분위기로 SNS 홍보 문구 3개
//   brief  : 오늘 숫자로 세 줄 브리핑
// OpenRouter 키는 Secrets의 OPENROUTER_API_KEY에서만 읽는다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// 앞에서부터 차례로 시도하고, 실패하면 다음 모델로 넘어간다.
const MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function clamp(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

// ── 모델 호출 ─────────────────────────────────────────────
async function callModel(model: string, system: string, user: string, key: string): Promise<string> {
  // 추론형 모델은 생각하는 데 토큰을 먼저 쓰므로, 생각을 짧게 하고 답할 여유를 넉넉히 준다.
  const isReasoning = /nemotron/.test(model);
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
    max_tokens: isReasoning ? 4000 : 1500,
  };
  if (isReasoning) payload.reasoning = { effort: "low" };

  const send = () =>
    fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Golmok Cafe Dashboard",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(40_000),
    });

  let res = await send();
  if (res.status === 429) {
    // 무료 모델의 순간 요청 제한: 잠깐 쉬고 한 번만 다시 시도한다.
    await new Promise((r) => setTimeout(r, 2500));
    res = await send();
  }
  if (!res.ok) throw new Error(`${model} 응답 오류 ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(`${model} 빈 응답`);
  return text;
}

// 모델이 ```json 으로 감싸거나 앞뒤에 말을 붙여도 JSON만 꺼낸다.
function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON이 없음");
  return JSON.parse(text.slice(start, end + 1));
}

// 고른 모델(preferred)을 먼저, 실패하면 나머지를 차례로 시도해서
// 검증을 통과한 첫 결과를 돌려준다. 목록에 없는 모델 이름은 무시한다.
async function askJson<T>(
  system: string,
  user: string,
  key: string,
  validate: (obj: Record<string, unknown>) => T | null,
  preferred = "",
): Promise<{ model: string; result: T }> {
  const errors: string[] = [];
  const order = MODELS.includes(preferred)
    ? [preferred, ...MODELS.filter((m) => m !== preferred)]
    : MODELS;
  for (const model of order) {
    try {
      const text = await callModel(model, system, user, key);
      const result = validate(parseJson(text));
      if (result) return { model, result };
      errors.push(`${model} 형식 불일치`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(`모든 모델이 실패했어요: ${errors.join(" / ")}`);
}

// ── type별 처리 ───────────────────────────────────────────
const SENTIMENTS: Record<string, { label: string; code: string }> = {
  "좋음": { label: "좋음", code: "positive" },
  "보통": { label: "보통", code: "neutral" },
  "아쉬움": { label: "아쉬움", code: "negative" },
  "positive": { label: "좋음", code: "positive" },
  "neutral": { label: "보통", code: "neutral" },
  "negative": { label: "아쉬움", code: "negative" },
};

function strings(value: unknown, count: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
  return list.length >= count ? list.slice(0, count) : null;
}

async function handleReview(body: Record<string, unknown>, key: string) {
  const content = clamp(body.content, 1000);
  if (!content) return json({ error: "content(리뷰 내용)가 필요해요." }, 400);
  const rating = Number(body.rating);
  const ratingText = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? `별점 ${rating}점 / 5점` : "별점 없음";

  const system =
    "너는 동네 카페 사장님을 돕는 비서야. 손님 리뷰를 읽고 JSON으로만 답해. " +
    '형식: {"sentiment":"좋음|보통|아쉬움 중 하나","reply":"사장님 답글"}. ' +
    "답글은 한국어 존댓말로 2~3문장, 따뜻하고 진솔하게. 불만이 있으면 먼저 사과하고 개선 의지를 보여 줘. " +
    "리뷰에 없는 사실(할인, 환불 약속 등)은 지어내지 마. JSON 밖의 말은 쓰지 마.";
  const user = `${ratingText}\n리뷰: ${content}`;

  const { model, result } = await askJson(system, user, key, (o) => {
    const s = SENTIMENTS[String(o.sentiment ?? "").trim()];
    const reply = String(o.reply ?? "").trim();
    return s && reply ? { sentiment: s.label, sentiment_code: s.code, reply } : null;
  }, clamp(body.model, 100));
  return json({ type: "review", model, ...result });
}

async function handlePromo(body: Record<string, unknown>, key: string) {
  const menu = clamp(body.menu, 80);
  const mood = clamp(body.mood, 80);
  if (!menu) return json({ error: "menu(메뉴)가 필요해요." }, 400);

  const system =
    "너는 동네 카페의 SNS 홍보 문구를 쓰는 카피라이터야. JSON으로만 답해. " +
    '형식: {"captions":["문구1","문구2","문구3"]}. ' +
    "문구는 한국어로 서로 다른 느낌으로 3개, 각각 1~2문장에 이모지는 1~2개만, 해시태그 2~3개를 끝에 붙여. " +
    "없는 가격이나 이벤트는 지어내지 마. JSON 밖의 말은 쓰지 마.";
  const user = `메뉴: ${menu}\n분위기: ${mood || "따뜻하고 편안한"}`;

  const { model, result } = await askJson(system, user, key, (o) => {
    const captions = strings(o.captions, 3);
    return captions ? { captions } : null;
  }, clamp(body.model, 100));
  return json({ type: "promo", model, ...result });
}

async function handleBrief(body: Record<string, unknown>, key: string) {
  // 숫자는 그대로 받아 문장에만 쓴다. 숫자가 하나도 없으면 거절한다.
  const stats = (body.stats && typeof body.stats === "object" ? body.stats : body) as Record<string, unknown>;
  const fields: Record<string, string> = {
    revenue: "오늘 매출(원)",
    orders: "오늘 주문 수(건)",
    avg_rating: "평균 별점(5점 만점)",
    low_stock_count: "재고 부족 메뉴 수(개)",
    low_stock_names: "재고 부족 메뉴",
    yesterday_revenue: "어제 매출(원)",
    week_revenue: "최근 7일 매출(원, 오래된 날부터 오늘까지)",
  };
  const lines = Object.keys(fields)
    .filter((k) => stats[k] !== undefined && stats[k] !== null && String(stats[k]) !== "")
    .map((k) => `${fields[k]}: ${clamp(Array.isArray(stats[k]) ? (stats[k] as unknown[]).join(", ") : stats[k], 200)}`);
  if (lines.length === 0) return json({ error: "revenue, orders 등 오늘 숫자가 필요해요." }, 400);

  const system =
    "너는 동네 카페 사장님의 아침 브리핑 비서야. 받은 숫자만 사용해서 JSON으로만 답해. " +
    '형식: {"lines":["첫째 줄","둘째 줄","셋째 줄"]}. ' +
    "정확히 3줄, 한국어 존댓말, 줄마다 한 문장. 1줄은 매출·주문 상황(최근 7일 흐름이 있으면 함께), 2줄은 손님 반응(별점), 3줄은 해야 할 일(재고 등). " +
    "주어지지 않은 숫자는 지어내지 마. JSON 밖의 말은 쓰지 마.";
  const user = lines.join("\n");

  const { model, result } = await askJson(system, user, key, (o) => {
    const l = strings(o.lines, 3);
    return l ? { lines: l } : null;
  }, clamp(body.model, 100));
  return json({ type: "brief", model, ...result });
}

// ── 진입점 ────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST로 보내 주세요." }, 405);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json({ error: "OPENROUTER_API_KEY가 Secrets에 설정되지 않았어요." }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON 형식으로 보내 주세요." }, 400);
  }

  try {
    switch (body.type) {
      case "review": return await handleReview(body, key);
      case "promo": return await handlePromo(body, key);
      case "brief": return await handleBrief(body, key);
      default: return json({ error: "type은 review, promo, brief 중 하나여야 해요." }, 400);
    }
  } catch (e) {
    // 키나 요청 내용은 로그·응답에 남기지 않는다.
    return json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, 502);
  }
});
