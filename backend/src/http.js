export function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

export async function readJson(request, maxBytes) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume();
    return { error: 415 };
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxBytes) {
        request.resume();
        return { error: 413 };
      }
      chunks.push(chunk);
    }
    return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { error: 400 };
  }
}

export function isEmail(email) {
  return typeof email === 'string' && email.length <= 254 &&
    /^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email);
}
