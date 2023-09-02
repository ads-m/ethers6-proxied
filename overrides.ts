import { BytesLike, FetchCancelSignal, FetchGetUrlFunc, FetchRequest, assertArgument } from "ethers";
import http from "http";
import { gunzipSync } from "zlib";
import https from "https";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { SocksProxyAgent } from "socks-proxy-agent";


function _getBytes(value: BytesLike, name?: string, copy?: boolean): Uint8Array {
  if (value instanceof Uint8Array) {
    if (copy) { return new Uint8Array(value); }
    return value;
  }

  if (typeof (value) === "string" && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
    const result = new Uint8Array((value.length - 2) / 2);
    let offset = 2;
    for (let i = 0; i < result.length; i++) {
      result[i] = parseInt(value.substring(offset, offset + 2), 16);
      offset += 2;
    }
    return result;
  }

  assertArgument(false, "invalid BytesLike value", name || "value", value);
}

function getBytes(value: BytesLike, name?: string): Uint8Array {
  return _getBytes(value, name, false);
}



export const fetchGetUrlFunc: ((socks: string) => FetchGetUrlFunc) = (socks) => (
  req: FetchRequest,
  signal?: FetchCancelSignal,
) => {
  const protocol = req.url.split(":")[0].toLowerCase();

  if (!(protocol === "http" || protocol === "https")) {
    throw new Error(`unsupported protocol ${protocol}`);
  }

  if (!(protocol === "https" || !req.credentials || req.allowInsecureAuthentication)) {
    throw new Error("insecure authorized connections unsupported");
  }

  const agent = socks
    ? new SocksProxyAgent(socks)
    : (protocol === "http" ? new HttpAgent() : new HttpsAgent());

  const method = req.method;
  const headers = Object.assign({}, req.headers);

  const options: any = { method, headers, agent };

  const request = ((protocol === "http") ? http : https).request(req.url, options);

  request.setTimeout(req.timeout);

  const body = req.body;
  if (body) { request.write(Buffer.from(body)); }

  request.end();

  return new Promise((resolve, reject) => {
    request.once("response", (resp: http.IncomingMessage) => {
      const statusCode = resp.statusCode || 0;
      const statusMessage = resp.statusMessage || "";
      const headers = Object.keys(resp.headers || {}).reduce((accum, name) => {
        let value = resp.headers[name] || "";
        if (Array.isArray(value)) {
          value = value.join(", ");
        }
        accum[name] = value;
        return accum;
      }, <{ [name: string]: string }>{});

      let body: null | Uint8Array = null;

      resp.on("data", (chunk: Uint8Array) => {
        if (signal) {
          try {
            signal.checkSignal();
          } catch (error) {
            return reject(error);
          }
        }

        if (body == null) {
          body = chunk;
        } else {
          const newBody = new Uint8Array(body.length + chunk.length);
          newBody.set(body, 0);
          newBody.set(chunk, body.length);
          body = newBody;
        }
      });

      resp.on("end", () => {
        if (headers["content-encoding"] === "gzip" && body) {
          body = getBytes(gunzipSync(body));
        }

        resolve({ statusCode, statusMessage, headers, body });
      });

      resp.on("error", (error) => {
        (<any>error).response = { statusCode, statusMessage, headers, body };
        reject(error);
      });
    });

    request.on("error", (error) => { reject(error); });
  });
}

export const ethers6SetSocks = (socks: string) => {
  FetchRequest.registerGetUrl(fetchGetUrlFunc(socks));
};
