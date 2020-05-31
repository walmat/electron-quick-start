const { uuid } = require('uuidv4');
const { net, session } = require('electron');
const tough = require('tough-cookie');

const defaults = {
  timeout: 15000,
  method: 'GET',
  headers: {},
  redirect: 'manual'
};

const formatProxy = (proxy) => {
  const splitProxy = proxy.split('@');
  return splitProxy[splitProxy.length - 1];
};

const proxySessions = {};

const processCookies = (jar, url, cookies) => {
  let parsed;

  if (cookies instanceof Array)
    parsed = cookies.map(tough.Cookie.parse);
  else parsed = [tough.Cookie.parse(cookies)];

  for (const cookie of parsed) {
    const { origin } = new URL(url);
    jar.setCookie(cookie.toString(), origin);
  }
};

module.exports.request = (opts) => {
  const {
    url,
    jar,
    proxy,
    headers,
    qs,
    body,
    form,
    json,
    timeout = 15000,
    followRedirect = false,
    followAllRedirects = false
  } = opts;

  return new Promise(async (resolve, reject) => {
    try {
      let proxySession;

      if (proxy) {
        if (proxySessions[proxy]) {
          proxySession = proxySessions[proxy];
        } else {
          proxySession = session.fromPartition(uuid());
          if (proxy?.length > 0) {
            proxySession.setProxy({ proxyRules: formatProxy(proxy) });
          } else {
            proxySession.setProxy({ proxyRules: '' });
          }

          proxySessions[proxy] = proxySession;
        }
      }

      const options = {
        ...defaults,
        ...opts,
        session: proxySession,
        useSessionCookies: false
      };

      if (qs) {
        options.url += `?${Object.entries(qs)
          .map(
            ([key, value]) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
          )
          .join('&')}`;
      }

      const request = net.request(options);
      for (const header in headers) {
        if (header) {
          request.setHeader(header, headers[header]);
        }
      }

      setTimeout(() => {
        try {
          request.abort();
        } catch (e) {
          // Silently let it fail
        }
        reject(new Error('Connection error: ETIMEDOUT'));
      }, timeout);

      if (jar) {
        const { origin } = new URL(url);
        const cookies = await jar.getCookieString(origin);
        if (cookies?.length) {
          request.setHeader('Cookie', cookies);
        }
      }

      if (body) {
        request.write(body);
      }

      if (form) {
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        if (typeof form === 'string') {
          request.write(form);
        } else {
          // assume it's an objectified form
          const body = Object.entries(form)
            .map(
              ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            )
            .join('&');
          request.write(body);
        }
      }

      if (json) {
        request.setHeader('Content-Type', 'application/json');
        if (typeof json !== 'boolean') {
          request.write(JSON.stringify(json));
        }
      }

      request.on('error', err => {
        reject(err);
      });

      request.on('login', (_, callback) => {
        const splitProxy = options.proxy
          .split('@')[0]
          .split('http://')[1]
          .split(':');

        callback(splitProxy[0], splitProxy[1]);
      });

      let currentUrl = url;
      let respBody = '';
      let redirects = false;
      if (followRedirect || followAllRedirects) {
        redirects = true;
      }

      request.on('response', response => {
        if (jar && response.headers['set-cookie']) {
          processCookies(jar, url, response.headers['set-cookie']);
        }

        response.on('error', (error) => {
          reject(error);
        });

        response.on('data', chunk => {
          respBody += chunk.toString();
        });

        response.on('end', () => {
          if (json) {
            try {
              respBody = JSON.parse(respBody);
            } catch (e) {}
          }

          if (response.headers?.location) {
            [response.headers.location] = response.headers.location;
          }

          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: respBody,
            request: {
              uri: {
                href: currentUrl
              }
            }
          });
        });
      });

      request.on('redirect', (statusCode, _, redirectUrl, responseHeaders) => {
        // NOTE: THIS IS ALWAYS `undefined` no matter if we follow redirects or not
        console.log('Redirect cookies: ', responseHeaders['set-cookie']);

        if (jar && responseHeaders['set-cookie']) {
          processCookies(jar, url, responseHeaders['set-cookie']);
        }

        if (redirects !== false) {
          currentUrl = redirectUrl;
          request.followRedirect();
        } else {
          if (responseHeaders.location) {
            [responseHeaders.location] = responseHeaders.location;
          }

          resolve({
            statusCode,
            headers: responseHeaders,
            body: respBody,
            request: {
              uri: {
                href: currentUrl
              }
            }
          });
        }
      });

      request.end();
    } catch (e) {
      console.error(e);
      reject(new Error('Unknown connection error'));
    }
  });
};
