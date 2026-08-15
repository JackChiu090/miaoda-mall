// Edge Function: id-card-ocr
// 身份证 OCR 识别 + 可选二要素核验
//
// 当未配置 INTEGRATIONS_API_KEY 时（自托管部署默认情况），
// 返回 success=false / reason=ocr_not_configured，让前端静默回退到手动填写。
// 这样新用户一键安装后不会出现"OCR 识别失败"的错误。

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    // 未配置外部 OCR：返回 200 + 明确原因，让前端静默跳过自动填充
    return new Response(
      JSON.stringify({
        success: false,
        reason: "ocr_not_configured",
        message: "OCR 自动识别未配置，请手动填写姓名和身份证号",
        words_result: {},
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { id_card_side, image, url } = body;
  if (!id_card_side) {
    return new Response(JSON.stringify({ error: "Missing id_card_side" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!image && !url) {
    return new Response(JSON.stringify({ error: "Missing image or url" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const params: Record<string, string> = {
    id_card_side,
    detect_quality: "true",
    detect_risk: "true",
  };
  if (image) params.image = image;
  if (url) params.url = url;

  const upstream = await fetch(
    "https://app-cj6aqssgkd8h-api-k93RZBjP0zqa-gateway.appmiaoda.com/rest/2.0/ocr/v1/idcard",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: new URLSearchParams(params).toString(),
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream error: ${upstream.status}` }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});