import fs from 'fs';
import path from 'path';
import Handlebars from "handlebars";
import YAML from "yaml";

export const parseUrl = (url, burl) => {
  let nurl, pth, typ, raw;
  if (burl && url.indexOf("/") === 0) {
    url = burl + url;
  }
  if (url.indexOf("http") === 0) {
    nurl = url;
    typ = "url";
  } else if (url.indexOf("@") === 0) {
    const cmp = url.substring(1).split("/");
    typ = cmp[2];
    cmp.splice(2, 0, "main");
    nurl = `https://raw.githubusercontent.com/` + cmp.join("/");
  } else if (Buffer.from(url, 'base64').toString('base64') === url) {
    raw = Buffer.from(url, 'base64').toString('ascii');
    typ = "base64";
  } else {
    pth = url
    typ = "path";
  }
  return { nurl, pth, typ, raw }
}

export const normalizeUrl = async (nurl, encoding = "utf-8") => {
  let output;
  try {
    const response = await fetch(nurl, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    output = Buffer.from(arrayBuffer).toString(encoding);
  } catch (error) { console.log(error) }
  return output;
};

export const normalizePath = async (pth, encoding = "utf-8") => {
  let output;
  try {
    output = fs.readFileSync(path.resolve(pth), { encoding });
  } catch (error) { console.log(error) }
  return output;
};

export const normalize = async (url, opt = {}) => {
  let output;
  const { baseUrl, encoding, src, yml, json } = opt;
  const { nurl, pth, raw } = parseUrl(url, baseUrl);

  if (nurl) {
    output = await normalizeUrl(nurl, encoding)
  } else if (pth) {
    output = await normalizePath(pth, encoding);
  } else if (raw) {
    output = raw;
  }

  if (src) {
    const n = typeof src === "string" ? await normalize(src) : src;
    const template = Handlebars.compile(output);
    output = template(n);
  }

  if(yml) {
      output = YAML.parse(output);
  }

  if(json) {
      output = JSON.parse(output);
  }

  return output;
};
