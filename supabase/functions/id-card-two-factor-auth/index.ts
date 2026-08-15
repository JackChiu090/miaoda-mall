// edge-functions/id-card-two-factor-auth.ts
//
// 自托管部署默认没有 INTEGRATIONS_API_KEY（外部二要素核验服务）。
// 未配置时返回 success=false / reason=ocr_not_configured，
// 前端静默跳过二要素自动核验，不显示错误。

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let idcard: string;
  let name: string;
  try {
    const body = await req.json();
    idcard = body.idcard;
    name = body.name;
    if (!idcard) throw new Error("Missing idcard");
    if (!name) throw new Error("Missing name");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        reason: "ocr_not_configured",
        message: "二要素核验未配置，已跳过自动核验",
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const params = new URLSearchParams({ idcard, name });
  const upstream = await fetch(
    `https://app-cj6aqssgkd8h-api-oLpZ74noWOMa-gateway.appmiaoda.com/idcard?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
