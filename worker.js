// ============================================================
// Naver Search Ad API - Cloudflare Worker Proxy
// 배포: https://workers.cloudflare.com (무료)
// ============================================================

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, X-SECRET, X-CUSTOMER',
        },
      });
    }

    const url = new URL(request.url);

    // /proxy/ncc/... → https://api.naver.com/ncc/...
    if (!url.pathname.startsWith('/proxy/')) {
      return new Response('Not found', { status: 404 });
    }

    const apiPath = url.pathname.replace('/proxy', '') + url.search;
    const apiBase = 'https://api.naver.com';

    // 클라이언트에서 헤더로 전달받은 API 인증 정보
    const license   = request.headers.get('X-API-KEY')  || '';
    const secret    = request.headers.get('X-SECRET')   || '';
    const customer  = request.headers.get('X-CUSTOMER') || '';

    if (!license || !secret || !customer) {
      return json({ error: 'Missing API credentials' }, 400);
    }

    // HMAC-SHA256 서명 생성
    const timestamp = Date.now().toString();
    const method    = request.method;
    const message   = `${timestamp}.${method}.${apiPath.split('?')[0]}`;

    const keyData  = new TextEncoder().encode(secret);
    const msgData  = new TextEncoder().encode(message);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuf   = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    // 네이버 API 호출
    const headers = {
      'Content-Type':  'application/json; charset=UTF-8',
      'X-Timestamp':   timestamp,
      'X-API-KEY':     license,
      'X-Customer':    customer,
      'X-Signature':   signature,
    };

    const body = (method !== 'GET' && method !== 'HEAD')
      ? await request.text()
      : undefined;

    let apiRes;
    try {
      apiRes = await fetch(apiBase + apiPath, { method, headers, body });
    } catch (e) {
      return json({ error: e.message }, 502);
    }

    const resBody = await apiRes.text();
    return new Response(resBody, {
      status: apiRes.status,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
