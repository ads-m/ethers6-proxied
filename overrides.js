"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ethers6SetSocks = exports.fetchGetUrlFunc = void 0;
const ethers_1 = require("ethers");
const http_1 = __importDefault(require("http"));
const zlib_1 = require("zlib");
const https_1 = __importDefault(require("https"));
const http_2 = require("http");
const https_2 = require("https");
const socks_proxy_agent_1 = require("socks-proxy-agent");
function _getBytes(value, name, copy) {
    if (value instanceof Uint8Array) {
        if (copy) {
            return new Uint8Array(value);
        }
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
    (0, ethers_1.assertArgument)(false, "invalid BytesLike value", name || "value", value);
}
function getBytes(value, name) {
    return _getBytes(value, name, false);
}
const fetchGetUrlFunc = (socks) => (req, signal) => {
    const protocol = req.url.split(":")[0].toLowerCase();
    if (!(protocol === "http" || protocol === "https")) {
        throw new Error(`unsupported protocol ${protocol}`);
    }
    if (!(protocol === "https" || !req.credentials || req.allowInsecureAuthentication)) {
        throw new Error("insecure authorized connections unsupported");
    }
    const agent = socks
        ? new socks_proxy_agent_1.SocksProxyAgent(socks)
        : (protocol === "http" ? new http_2.Agent() : new https_2.Agent());
    const method = req.method;
    const headers = Object.assign({}, req.headers);
    const options = { method, headers, agent };
    const request = ((protocol === "http") ? http_1.default : https_1.default).request(req.url, options);
    request.setTimeout(req.timeout);
    const body = req.body;
    if (body) {
        request.write(Buffer.from(body));
    }
    request.end();
    return new Promise((resolve, reject) => {
        request.once("response", (resp) => {
            const statusCode = resp.statusCode || 0;
            const statusMessage = resp.statusMessage || "";
            const headers = Object.keys(resp.headers || {}).reduce((accum, name) => {
                let value = resp.headers[name] || "";
                if (Array.isArray(value)) {
                    value = value.join(", ");
                }
                accum[name] = value;
                return accum;
            }, {});
            let body = null;
            resp.on("data", (chunk) => {
                if (signal) {
                    try {
                        signal.checkSignal();
                    }
                    catch (error) {
                        return reject(error);
                    }
                }
                if (body == null) {
                    body = chunk;
                }
                else {
                    const newBody = new Uint8Array(body.length + chunk.length);
                    newBody.set(body, 0);
                    newBody.set(chunk, body.length);
                    body = newBody;
                }
            });
            resp.on("end", () => {
                if (headers["content-encoding"] === "gzip" && body) {
                    body = getBytes((0, zlib_1.gunzipSync)(body));
                }
                resolve({ statusCode, statusMessage, headers, body });
            });
            resp.on("error", (error) => {
                error.response = { statusCode, statusMessage, headers, body };
                reject(error);
            });
        });
        request.on("error", (error) => { reject(error); });
    });
};
exports.fetchGetUrlFunc = fetchGetUrlFunc;
const ethers6SetSocks = (socks) => {
    ethers_1.FetchRequest.registerGetUrl((0, exports.fetchGetUrlFunc)(socks));
};
exports.ethers6SetSocks = ethers6SetSocks;
