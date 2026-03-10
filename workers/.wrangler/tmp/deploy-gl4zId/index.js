var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return this.bodyCache.parsedBody ??= await parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data2) {
    this.#validatedData[target] = data2;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data2, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data2, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data2, arg, headers) => this.#newResponse(data2, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { basePath: this._basePath, path, method, handler };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const defaults = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: []
  };
  const opts = {
    ...defaults,
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// node_modules/hono/dist/helper/factory/index.js
var createMiddleware = /* @__PURE__ */ __name((middleware) => middleware, "createMiddleware");

// src/middleware/auth.ts
var authMiddleware = createMiddleware(async (c, next) => {
  const body = await c.req.json().catch(() => ({}));
  c.set("playerId", "");
  c._body = body;
  const guestToken = body.guestToken;
  if (!guestToken) {
    return c.json({ success: false, error: "missing guestToken" }, 401);
  }
  const row = await c.env.DB.prepare(
    "SELECT playerId FROM players WHERE guestToken = ?"
  ).bind(guestToken).first();
  if (!row) {
    return c.json({ success: false, error: "invalid_token" }, 401);
  }
  c.set("playerId", row.playerId);
  await next();
});
function getBody(c) {
  return c._body || {};
}
__name(getBody, "getBody");

// src/utils/helpers.ts
async function sha256(input) {
  const encoder = new TextEncoder();
  const data2 = encoder.encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", data2);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function uuid() {
  return crypto.randomUUID();
}
__name(uuid, "uuid");
function todayUTC8() {
  const now = /* @__PURE__ */ new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1e3);
  return utc8.toISOString().split("T")[0];
}
__name(todayUTC8, "todayUTC8");
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(isoNow, "isoNow");
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
__name(safeJsonParse, "safeJsonParse");
function generatePlayerId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "P";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
__name(generatePlayerId, "generatePlayerId");
function createSeededRng(seed) {
  let t = seed | 0;
  return () => {
    t = t + 1831565813 | 0;
    let x = Math.imul(t ^ t >>> 15, 1 | t);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
__name(createSeededRng, "createSeededRng");

// src/utils/pusher.ts
async function triggerPusherEvent(config, event) {
  if (!config.appId || !config.key || !config.secret) {
    return;
  }
  const body = JSON.stringify({
    name: event.name,
    channel: event.channel,
    data: JSON.stringify(event.data)
  });
  const path = `/apps/${config.appId}/events`;
  const timestamp = Math.floor(Date.now() / 1e3).toString();
  const md5Hash = await md5(body);
  const params = {
    auth_key: config.key,
    auth_timestamp: timestamp,
    auth_version: "1.0",
    body_md5: md5Hash
  };
  const sortedQuery = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const sigString = `POST
${path}
${sortedQuery}`;
  const authSig = await hmacSHA256(config.secret, sigString);
  const url = `https://api-${config.cluster}.pusher.com${path}?${sortedQuery}&auth_signature=${authSig}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
}
__name(triggerPusherEvent, "triggerPusherEvent");
async function hmacSHA256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacSHA256, "hmacSHA256");
async function md5(message) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("MD5", enc.encode(message));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(md5, "md5");
async function pushToPlayer(config, playerId, eventName, data2) {
  return triggerPusherEvent(config, {
    channel: `private-player-${playerId}`,
    name: eventName,
    data: data2
  });
}
__name(pushToPlayer, "pushToPlayer");

// src/routes/save.ts
var save = new Hono2();
function upsertItemStmt(db, playerId, itemId, delta) {
  const now = isoNow();
  return db.prepare(
    `INSERT INTO inventory (playerId, itemId, quantity, updatedAt)
     VALUES (?1, ?2, MAX(0, ?3), ?4)
     ON CONFLICT(playerId, itemId) DO UPDATE SET
       quantity = MAX(0, inventory.quantity + ?3),
       updatedAt = ?4`
  ).bind(playerId, itemId, delta, now);
}
__name(upsertItemStmt, "upsertItemStmt");
function grantRewardsStmts(db, playerId, rewards) {
  const stmts = [];
  const resourceDeltas = {};
  const itemDeltas = [];
  for (const r of rewards) {
    if (!r.itemId || (r.quantity || 0) <= 0) continue;
    if (r.itemId === "gold" || r.itemId === "diamond" || r.itemId === "exp") {
      resourceDeltas[r.itemId] = (resourceDeltas[r.itemId] || 0) + r.quantity;
    } else if (r.itemId === "stardust" || r.itemId === "currency_stardust") {
      itemDeltas.push({ itemId: "currency_stardust", quantity: r.quantity });
    } else {
      itemDeltas.push(r);
    }
  }
  const resCols = Object.keys(resourceDeltas);
  if (resCols.length > 0) {
    const sets = resCols.map((col) => `${col} = ${col} + ?`).join(", ");
    const vals = resCols.map((col) => resourceDeltas[col]);
    stmts.push(
      db.prepare(`UPDATE save_data SET ${sets} WHERE playerId = ?`).bind(...vals, playerId)
    );
  }
  for (const r of itemDeltas) {
    stmts.push(upsertItemStmt(db, playerId, r.itemId, r.quantity));
  }
  return stmts;
}
__name(grantRewardsStmts, "grantRewardsStmts");
async function getCurrencies(db, playerId) {
  const row = await db.prepare("SELECT gold, diamond, exp FROM save_data WHERE playerId = ?").bind(playerId).first();
  return row ?? { gold: 0, diamond: 0, exp: 0 };
}
__name(getCurrencies, "getCurrencies");
save.post("/load-save", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const saveData = await db.prepare(
    "SELECT * FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if (!saveData) {
    return c.json({ success: true, isNew: true, saveData: null, heroes: [] });
  }
  const heroes = await db.prepare(
    "SELECT * FROM hero_instances WHERE playerId = ?"
  ).bind(playerId).all();
  const parsedSave = {
    ...saveData,
    storyProgress: safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 }),
    formation: safeJsonParse(saveData.formation, [null, null, null, null, null, null]),
    gachaPity: safeJsonParse(saveData.gachaPity, { pullsSinceLastSSR: 0, guaranteedFeatured: false })
  };
  const parsedHeroes = heroes.results.map((h) => ({
    ...h,
    equippedItems: safeJsonParse(h.equippedItems, {})
  }));
  const ownedHeroIds = [...new Set(parsedHeroes.map((h) => h.heroId))];
  return c.json({
    success: true,
    saveData: parsedSave,
    heroes: parsedHeroes,
    isNew: false,
    ownedHeroIds
  });
});
save.post("/init-save", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const existing = await db.prepare(
    "SELECT 1 FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if (existing) {
    return c.json({ success: true, alreadyExists: true });
  }
  const now = isoNow();
  const starterHeroIds = [6, 1, 9];
  const starterInstanceIds = [];
  const autoFormation = [String(starterHeroIds[0]), String(starterHeroIds[1]), String(starterHeroIds[2]), null, null, null];
  const stmts = [];
  stmts.push(db.prepare(
    `INSERT INTO save_data (
      playerId, displayName, diamond, gold, stardust,
      resourceTimerStage, resourceTimerLastCollect,
      towerFloor, storyProgress, formation, lastSaved,
      gachaPity,
      checkinDay, checkinLastDate,
      arenaChallengesLeft, arenaHighestRank, arenaLastReset,
      pwaRewardClaimed
    ) VALUES (
      ?, ?, 500, 10000, 0,
      '1-1', ?,
      0, '{"chapter":1,"stage":1}', ?, ?,
      '{"pullsSinceLastSSR":0,"guaranteedFeatured":false}',
      0, '',
      5, 500, '',
      0
    )`
  ).bind(
    playerId,
    "\u5016\u5B58\u8005#" + playerId.replace("P", ""),
    now,
    JSON.stringify(autoFormation),
    now
  ));
  for (let i = 0; i < starterHeroIds.length; i++) {
    const hid = starterHeroIds[i];
    const instId = `${playerId}_${hid}_${Date.now() + i}`;
    starterInstanceIds.push(instId);
    stmts.push(db.prepare(
      `INSERT INTO hero_instances (instanceId, playerId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
       VALUES (?, ?, ?, 1, 0, 0, '{}', ?, 0)`
    ).bind(instId, playerId, hid, now));
  }
  await db.batch(stmts);
  return c.json({
    success: true,
    alreadyExists: false,
    starterHeroInstanceId: starterInstanceIds[0]
  });
});
save.post("/save-formation", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  if (!body.formation) return c.json({ success: false, error: "missing formation" });
  const now = isoNow();
  await c.env.DB.prepare(
    "UPDATE save_data SET formation = ?, lastSaved = ? WHERE playerId = ?"
  ).bind(JSON.stringify(body.formation), now, playerId).run();
  return c.json({ success: true });
});
save.post("/add-hero", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const heroId = body.heroId;
  if (!heroId) return c.json({ success: false, error: "missing heroId" });
  const instanceId = `${playerId}_${heroId}_${Date.now()}`;
  const now = isoNow();
  await c.env.DB.prepare(
    `INSERT INTO hero_instances (instanceId, playerId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
     VALUES (?, ?, ?, 1, 0, 0, '{}', ?, 0)`
  ).bind(instanceId, playerId, heroId, now).run();
  return c.json({ success: true, instanceId });
});
save.post("/collect-resources", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const saveData = await db.prepare(
    "SELECT * FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  const stageId = saveData.resourceTimerStage || "1-1";
  const lastCollect = saveData.resourceTimerLastCollect;
  if (!lastCollect) return c.json({ success: false, error: "timer_not_started" });
  const sp = safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 });
  if (sp.chapter === 1 && sp.stage === 1) {
    return c.json({ success: true, gold: 0, exp: 0, message: "not_unlocked" });
  }
  const elapsed = (Date.now() - new Date(lastCollect).getTime()) / (3600 * 1e3);
  const hours = Math.min(24, Math.max(0, elapsed));
  const parts = stageId.split("-");
  const ch = parseInt(parts[0]) || 1;
  const st = parseInt(parts[1]) || 1;
  const progress = (ch - 1) * 8 + st;
  const goldPerHour = 100 + progress * 50;
  const expPerHour = Math.max(100, progress * 50);
  const goldGain = Math.floor(goldPerHour * hours);
  const expGain = Math.floor(expPerHour * hours);
  if (goldGain <= 0 && expGain <= 0) {
    return c.json({ success: true, gold: 0, exp: 0, message: "nothing_to_collect" });
  }
  const now = isoNow();
  const newGold = saveData.gold + goldGain;
  const newExp = (saveData.exp ?? 0) + expGain;
  await db.prepare(
    "UPDATE save_data SET gold = ?, exp = ?, resourceTimerLastCollect = ?, lastSaved = ? WHERE playerId = ?"
  ).bind(newGold, newExp, now, now, playerId).run();
  return c.json({
    success: true,
    gold: goldGain,
    exp: expGain,
    newGoldTotal: newGold,
    newExpTotal: newExp,
    hoursElapsed: Math.round(hours * 10) / 10,
    currencies: { gold: newGold, diamond: saveData.diamond ?? 0, exp: newExp },
    resourceTimerLastCollect: now
  });
});
var save_default = save;

// src/routes/mail.ts
var mail = new Hono2();
function grantRewardsMailStmts(db, playerId, rewards) {
  return grantRewardsStmts(db, playerId, rewards);
}
__name(grantRewardsMailStmts, "grantRewardsMailStmts");
async function getPlayerMails(db, playerId) {
  const now = isoNow();
  const rows = await db.prepare(
    `SELECT * FROM mailbox
     WHERE (playerId = ? OR playerId = '*') AND (deletedAt IS NULL OR deletedAt = '') AND (expiresAt IS NULL OR expiresAt = '' OR expiresAt > ?)
     ORDER BY
       CASE WHEN read = 0 THEN 0 ELSE 1 END,
       createdAt DESC`
  ).bind(playerId, now).all();
  return rows.results || [];
}
__name(getPlayerMails, "getPlayerMails");
function insertMailStmt(db, mailId, playerId, title, body, rewards, expiresAt) {
  return db.prepare(
    `INSERT INTO mailbox (mailId, playerId, title, body, rewards, claimed, read, createdAt, expiresAt)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).bind(mailId, playerId, title.slice(0, 50), body.slice(0, 500), JSON.stringify(rewards), isoNow(), expiresAt || "");
}
__name(insertMailStmt, "insertMailStmt");
async function insertMail(db, playerId, title, body, rewards, expiresAt) {
  const mailId = uuid();
  await insertMailStmt(db, mailId, playerId, title, body, rewards, expiresAt).run();
  return mailId;
}
__name(insertMail, "insertMail");
mail.post("/load-mail", async (c) => {
  const playerId = c.get("playerId");
  const mails = await getPlayerMails(c.env.DB, playerId);
  let unreadCount = 0;
  const result = mails.map((m) => {
    if (!m.read) unreadCount++;
    return {
      mailId: m.mailId,
      title: m.title || "",
      body: m.body || "",
      rewards: safeJsonParse(m.rewards, []),
      claimed: !!m.claimed,
      read: !!m.read,
      createdAt: m.createdAt || "",
      expiresAt: m.expiresAt || null
    };
  });
  return c.json({ success: true, mails: result, unreadCount });
});
mail.post("/read-mail", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const mailId = body.mailId;
  if (!mailId) return c.json({ success: false, error: "missing mailId" });
  const row = await c.env.DB.prepare(`SELECT mailId FROM mailbox WHERE mailId = ? AND playerId = ? AND (deletedAt IS NULL OR deletedAt = '')`).bind(mailId, playerId).first();
  if (!row) return c.json({ success: false, error: "mail_not_found" });
  await c.env.DB.prepare("UPDATE mailbox SET read = 1 WHERE mailId = ?").bind(mailId).run();
  return c.json({ success: true });
});
mail.post("/claim-mail-reward", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const mailId = body.mailId;
  if (!mailId) return c.json({ success: false, error: "missing mailId" });
  const m = await db.prepare(`SELECT * FROM mailbox WHERE mailId = ? AND playerId = ? AND (deletedAt IS NULL OR deletedAt = '')`).bind(mailId, playerId).first();
  if (!m) return c.json({ success: false, error: "mail_not_found" });
  if (m.claimed) return c.json({ success: false, error: "already_claimed" });
  const rewards = safeJsonParse(m.rewards, []);
  if (rewards.length === 0) return c.json({ success: false, error: "no_rewards" });
  const stmts = grantRewardsMailStmts(db, playerId, rewards);
  stmts.push(db.prepare("UPDATE mailbox SET claimed = 1, read = 1 WHERE mailId = ?").bind(mailId));
  await db.batch(stmts);
  const currencies = await getCurrencies(db, playerId);
  return c.json({ success: true, rewards, currencies });
});
mail.post("/claim-all-mail", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const mails = await getPlayerMails(db, playerId);
  let claimedCount = 0;
  const totalMap = {};
  const allStmts = [];
  for (const m of mails) {
    if (m.claimed) continue;
    const rewards = safeJsonParse(m.rewards, []);
    if (rewards.length === 0) continue;
    allStmts.push(...grantRewardsMailStmts(db, playerId, rewards));
    allStmts.push(db.prepare("UPDATE mailbox SET claimed = 1, read = 1 WHERE mailId = ?").bind(m.mailId));
    claimedCount++;
    for (const r of rewards) {
      totalMap[r.itemId] = (totalMap[r.itemId] || 0) + (r.quantity || 0);
    }
  }
  if (allStmts.length > 0) await db.batch(allStmts);
  const totalRewards = Object.entries(totalMap).map(([itemId, quantity]) => ({ itemId, quantity }));
  const currencies = await getCurrencies(db, playerId);
  return c.json({ success: true, claimedCount, totalRewards, currencies });
});
mail.post("/delete-mail", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const mailId = body.mailId;
  if (!mailId) return c.json({ success: false, error: "missing mailId" });
  const m = await c.env.DB.prepare(`SELECT * FROM mailbox WHERE mailId = ? AND playerId = ? AND (deletedAt IS NULL OR deletedAt = '')`).bind(mailId, playerId).first();
  if (!m) return c.json({ success: false, error: "mail_not_found" });
  const rewards = safeJsonParse(m.rewards, []);
  if (rewards.length > 0 && !m.claimed) return c.json({ success: false, error: "has_unclaimed_rewards" });
  await c.env.DB.prepare("UPDATE mailbox SET deletedAt = ? WHERE mailId = ?").bind(isoNow(), mailId).run();
  return c.json({ success: true });
});
mail.post("/delete-all-read", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const mails = await getPlayerMails(db, playerId);
  const now = isoNow();
  const stmts = [];
  for (const m of mails) {
    if (!m.read) continue;
    const rewards = safeJsonParse(m.rewards, []);
    if (rewards.length > 0 && !m.claimed) continue;
    stmts.push(db.prepare("UPDATE mailbox SET deletedAt = ? WHERE mailId = ?").bind(now, m.mailId));
  }
  if (stmts.length > 0) await db.batch(stmts);
  return c.json({ success: true, deletedCount: stmts.length });
});
mail.post("/send-mail", async (c) => {
  const body = getBody(c);
  const targetIds = body.targetPlayerIds || [];
  const title = (body.title || "").slice(0, 50);
  const mailBody = (body.body || "").slice(0, 500);
  const rewards = body.rewards || [];
  const expiresAt = body.expiresAt || "";
  const db = c.env.DB;
  const stmts = [];
  const mailInfos = [];
  for (const pid of targetIds) {
    const mailId = uuid();
    const upperPid = pid.toUpperCase();
    stmts.push(insertMailStmt(db, mailId, upperPid, title, mailBody, rewards, expiresAt || void 0));
    mailInfos.push({ pid: upperPid, mailId });
  }
  if (stmts.length > 0) await db.batch(stmts);
  for (const { pid, mailId } of mailInfos) {
    try {
      await pushToPlayer(
        { appId: c.env.PUSHER_APP_ID, key: c.env.PUSHER_KEY, secret: c.env.PUSHER_SECRET, cluster: c.env.PUSHER_CLUSTER },
        pid,
        "new-mail",
        { mailId, title }
      );
    } catch {
    }
  }
  return c.json({ success: true, sentCount: stmts.length });
});
mail.post("/claim-pwa-reward", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const upd = await db.prepare(
    "UPDATE save_data SET pwaRewardClaimed = 1 WHERE playerId = ? AND pwaRewardClaimed = 0"
  ).bind(playerId).run();
  if (!upd.meta.changes) {
    const exists = await db.prepare("SELECT 1 FROM save_data WHERE playerId = ?").bind(playerId).first();
    return c.json({ success: false, error: exists ? "already_claimed" : "no_save_data" });
  }
  const pwaMailId = uuid();
  await insertMailStmt(
    db,
    pwaMailId,
    playerId,
    "\u{1F4F1} \u52A0\u5165\u4E3B\u756B\u9762\u734E\u52F5",
    "\u611F\u8B1D\u5C07\u5168\u7403\u611F\u67D3\u52A0\u5165\u4E3B\u756B\u9762\uFF01\u4EAB\u53D7\u66F4\u5FEB\u7684\u8F09\u5165\u901F\u5EA6\u8207\u66F4\u7A69\u5B9A\u7684\u904A\u6232\u9AD4\u9A57\u3002\u9019\u662F\u60A8\u7684\u5B89\u88DD\u734E\u52F5\uFF01",
    [{ itemId: "diamond", quantity: 100 }, { itemId: "gold", quantity: 3e3 }]
  ).run();
  try {
    await pushToPlayer(
      { appId: c.env.PUSHER_APP_ID, key: c.env.PUSHER_KEY, secret: c.env.PUSHER_SECRET, cluster: c.env.PUSHER_CLUSTER },
      playerId,
      "new-mail",
      { title: "\u{1F4F1} \u52A0\u5165\u4E3B\u756B\u9762\u734E\u52F5" }
    );
  } catch {
  }
  return c.json({ success: true, message: "PWA \u5B89\u88DD\u734E\u52F5\u5DF2\u767C\u9001" });
});
var mail_default = mail;

// src/routes/auth.ts
var auth = new Hono2();
auth.post("/register-guest", async (c) => {
  const { guestToken } = await c.req.json();
  if (!guestToken) return c.json({ success: false, error: "missing guestToken" });
  const existing = await c.env.DB.prepare(
    "SELECT playerId, displayName FROM players WHERE guestToken = ?"
  ).bind(guestToken).first();
  if (existing) {
    return c.json({
      success: true,
      playerId: existing.playerId,
      displayName: existing.displayName,
      alreadyExists: true
    });
  }
  let playerId;
  for (let attempt = 0; attempt < 10; attempt++) {
    playerId = generatePlayerId();
    const dup = await c.env.DB.prepare(
      "SELECT 1 FROM players WHERE playerId = ?"
    ).bind(playerId).first();
    if (!dup) break;
  }
  playerId = playerId;
  const now = isoNow();
  const displayName = "\u5016\u5B58\u8005#" + playerId.replace("P", "");
  const mailId = uuid();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO players (playerId, guestToken, email, passwordHash, displayName, createdAt, lastLogin, isBound)
       VALUES (?, ?, '', '', ?, ?, ?, 0)`
    ).bind(playerId, guestToken, displayName, now, now),
    insertMailStmt(
      c.env.DB,
      mailId,
      playerId,
      "\u{1F389} \u6B61\u8FCE\u4F86\u5230\u5168\u7403\u611F\u67D3\uFF01",
      "\u611F\u8B1D\u52A0\u5165\u672B\u65E5\u751F\u5B58\u4E4B\u65C5\uFF01\u9019\u662F\u4F60\u7684\u65B0\u624B\u79AE\u5305\uFF0C\u795D\u4F60\u5728\u611F\u67D3\u7684\u4E16\u754C\u4E2D\u5B58\u6D3B\u4E0B\u4F86\uFF01",
      [
        { itemId: "diamond", quantity: 300 },
        { itemId: "gold", quantity: 1e4 },
        { itemId: "exp", quantity: 6500 },
        { itemId: "gacha_ticket_hero", quantity: 10 },
        { itemId: "gacha_ticket_equip", quantity: 10 }
      ]
    )
  ]);
  return c.json({
    success: true,
    playerId,
    displayName,
    alreadyExists: false
  });
});
auth.post("/login-guest", async (c) => {
  const { guestToken } = await c.req.json();
  if (!guestToken) return c.json({ success: false, error: "missing guestToken" });
  const row = await c.env.DB.prepare(
    "SELECT playerId, displayName, isBound FROM players WHERE guestToken = ?"
  ).bind(guestToken).first();
  if (!row) return c.json({ success: false, error: "token_not_found" });
  await c.env.DB.prepare(
    "UPDATE players SET lastLogin = ? WHERE guestToken = ?"
  ).bind(isoNow(), guestToken).run();
  return c.json({
    success: true,
    playerId: row.playerId,
    displayName: row.displayName,
    isBound: row.isBound === 1
  });
});
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email) return c.json({ success: false, error: "missing email" });
  if (!password) return c.json({ success: false, error: "missing password" });
  const row = await c.env.DB.prepare(
    "SELECT playerId, guestToken, displayName, passwordHash FROM players WHERE email = ?"
  ).bind(email).first();
  if (!row) return c.json({ success: false, error: "email_not_found" });
  const hash = await sha256(password);
  if (hash !== row.passwordHash) return c.json({ success: false, error: "wrong_password" });
  await c.env.DB.prepare(
    "UPDATE players SET lastLogin = ? WHERE playerId = ?"
  ).bind(isoNow(), row.playerId).run();
  return c.json({
    success: true,
    playerId: row.playerId,
    guestToken: row.guestToken,
    displayName: row.displayName
  });
});
auth.post("/bind-account", async (c) => {
  const body = await c.req.json();
  const token = body.guestToken;
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!token) return c.json({ success: false, error: "missing guestToken" });
  if (!email) return c.json({ success: false, error: "missing email" });
  if (!password || password.length < 6) return c.json({ success: false, error: "password must be >= 6 chars" });
  const player = await c.env.DB.prepare(
    "SELECT playerId, isBound FROM players WHERE guestToken = ?"
  ).bind(token).first();
  if (!player) return c.json({ success: false, error: "token_not_found" });
  const emailOwner = await c.env.DB.prepare(
    "SELECT playerId FROM players WHERE email = ?"
  ).bind(email).first();
  if (emailOwner && emailOwner.playerId !== player.playerId) {
    return c.json({ success: false, error: "email_taken" });
  }
  const hash = await sha256(password);
  if (player.isBound === 0) {
    const mailId = uuid();
    const now = isoNow();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE players SET email = ?, passwordHash = ?, isBound = 1 WHERE guestToken = ?"
      ).bind(email, hash, token),
      insertMailStmt(
        c.env.DB,
        mailId,
        player.playerId,
        "\u{1F517} \u5E33\u865F\u7D81\u5B9A\u734E\u52F5",
        "\u606D\u559C\u5B8C\u6210\u5E33\u865F\u7D81\u5B9A\uFF01\u60A8\u7684\u5E33\u865F\u73FE\u5728\u66F4\u5B89\u5168\u4E86\uFF0C\u53EF\u4EE5\u8DE8\u88DD\u7F6E\u767B\u5165\u4FDD\u7559\u6240\u6709\u9032\u5EA6\u3002\u9019\u662F\u60A8\u7684\u7D81\u5B9A\u734E\u52F5\uFF01",
        [
          { itemId: "diamond", quantity: 200 },
          { itemId: "gold", quantity: 5e3 }
        ]
      )
    ]);
    await pushToPlayer(
      {
        appId: c.env.PUSHER_APP_ID,
        key: c.env.PUSHER_KEY,
        secret: c.env.PUSHER_SECRET,
        cluster: c.env.PUSHER_CLUSTER
      },
      player.playerId,
      "new-mail",
      { title: "\u{1F517} \u5E33\u865F\u7D81\u5B9A\u734E\u52F5" }
    );
  } else {
    await c.env.DB.prepare(
      "UPDATE players SET email = ?, passwordHash = ?, isBound = 1 WHERE guestToken = ?"
    ).bind(email, hash, token).run();
  }
  return c.json({ success: true, message: "\u5E33\u865F\u7D81\u5B9A\u6210\u529F" });
});
var NAME_CHANGE_COST = 200;
auth.post("/change-name", async (c) => {
  const body = await c.req.json();
  const token = body.guestToken;
  const newName = (body.newName || "").trim();
  if (!token) return c.json({ success: false, error: "missing guestToken" });
  if (!newName || newName.length < 1 || newName.length > 20)
    return c.json({ success: false, error: "name must be 1-20 chars" });
  const player = await c.env.DB.prepare(
    "SELECT playerId FROM players WHERE guestToken = ?"
  ).bind(token).first();
  if (!player) return c.json({ success: false, error: "token_not_found" });
  const sd = await c.env.DB.prepare(
    "SELECT nameChangeCount, diamond FROM save_data WHERE playerId = ?"
  ).bind(player.playerId).first();
  const changeCount = sd?.nameChangeCount ?? 0;
  const diamond = sd?.diamond ?? 0;
  const cost = changeCount === 0 ? 0 : NAME_CHANGE_COST;
  if (cost > 0 && diamond < cost) {
    return c.json({ success: false, error: "insufficient_diamond", cost, diamond });
  }
  const stmts = [
    c.env.DB.prepare("UPDATE players SET displayName = ? WHERE playerId = ?").bind(newName, player.playerId),
    c.env.DB.prepare(
      "UPDATE save_data SET displayName = ?, nameChangeCount = nameChangeCount + 1, diamond = diamond - ? WHERE playerId = ?"
    ).bind(newName, cost, player.playerId),
    c.env.DB.prepare("UPDATE arena_rankings SET displayName = ? WHERE playerId = ?").bind(newName, player.playerId)
  ];
  await c.env.DB.batch(stmts);
  const updated = await c.env.DB.prepare(
    "SELECT diamond, nameChangeCount FROM save_data WHERE playerId = ?"
  ).bind(player.playerId).first();
  return c.json({
    success: true,
    diamond: updated?.diamond ?? diamond - cost,
    nameChangeCount: updated?.nameChangeCount ?? changeCount + 1,
    cost
  });
});
auth.post("/change-password", async (c) => {
  const body = await c.req.json();
  const token = body.guestToken;
  if (!token) return c.json({ success: false, error: "missing guestToken" });
  if (!body.oldPassword) return c.json({ success: false, error: "missing oldPassword" });
  if (!body.newPassword || body.newPassword.length < 6)
    return c.json({ success: false, error: "new password must be >= 6 chars" });
  const player = await c.env.DB.prepare(
    "SELECT passwordHash, isBound FROM players WHERE guestToken = ?"
  ).bind(token).first();
  if (!player) return c.json({ success: false, error: "token_not_found" });
  if (player.isBound === 0) return c.json({ success: false, error: "account_not_bound" });
  const oldHash = await sha256(body.oldPassword);
  if (oldHash !== player.passwordHash) return c.json({ success: false, error: "wrong_password" });
  const newHash = await sha256(body.newPassword);
  await c.env.DB.prepare(
    "UPDATE players SET passwordHash = ? WHERE guestToken = ?"
  ).bind(newHash, token).run();
  return c.json({ success: true, message: "\u5BC6\u78BC\u5DF2\u66F4\u65B0" });
});
var auth_default = auth;

// src/routes/inventory.ts
var inventory = new Hono2();
var SHOP_CATALOG = {
  daily_exp_s: { price: 1e3, currency: "gold", rewards: [{ itemId: "exp", quantity: 500 }], dailyLimit: 10 },
  daily_exp_m: { price: 5e3, currency: "gold", rewards: [{ itemId: "exp", quantity: 1500 }], dailyLimit: 5 },
  daily_exp_l: { price: 20, currency: "diamond", rewards: [{ itemId: "exp", quantity: 2e3 }], dailyLimit: 3 },
  mat_class_power: { price: 1e4, currency: "gold", rewards: [{ itemId: "asc_class_power", quantity: 1 }], dailyLimit: 0 },
  mat_class_agility: { price: 1e4, currency: "gold", rewards: [{ itemId: "asc_class_agility", quantity: 1 }], dailyLimit: 0 },
  mat_class_defense: { price: 1e4, currency: "gold", rewards: [{ itemId: "asc_class_defense", quantity: 1 }], dailyLimit: 0 },
  mat_class_universal: { price: 50, currency: "diamond", rewards: [{ itemId: "asc_class_universal", quantity: 1 }], dailyLimit: 0 },
  // ── 星塵兌換 ──
  sd_exp_5000: { price: 10, currency: "stardust", rewards: [{ itemId: "exp", quantity: 5e3 }], dailyLimit: 0 },
  sd_gold_50k: { price: 15, currency: "stardust", rewards: [{ itemId: "gold", quantity: 5e4 }], dailyLimit: 0 },
  sd_class_universal: { price: 20, currency: "stardust", rewards: [{ itemId: "asc_class_universal", quantity: 2 }], dailyLimit: 0 },
  sd_chest_gold: { price: 50, currency: "stardust", rewards: [{ itemId: "chest_gold", quantity: 1 }], dailyLimit: 3 },
  sd_diamond_100: { price: 80, currency: "stardust", rewards: [{ itemId: "diamond", quantity: 100 }], dailyLimit: 0 },
  // ── 特殊商店 ──
  special_gold_pack: { price: 30, currency: "diamond", rewards: [{ itemId: "gold", quantity: 1e4 }], dailyLimit: 5 },
  special_ticket_hero: { price: 50, currency: "diamond", rewards: [{ itemId: "gacha_ticket_hero", quantity: 1 }], dailyLimit: 3 },
  special_ticket_equip: { price: 50, currency: "diamond", rewards: [{ itemId: "gacha_ticket_equip", quantity: 1 }], dailyLimit: 3 },
  sd_ticket_hero: { price: 30, currency: "stardust", rewards: [{ itemId: "gacha_ticket_hero", quantity: 1 }], dailyLimit: 0 },
  sd_ticket_equip: { price: 30, currency: "stardust", rewards: [{ itemId: "gacha_ticket_equip", quantity: 1 }], dailyLimit: 0 },
  // ── 碎片兌換店 ──
  scrap_chest_equip: { price: 10, currency: "equip_scrap", rewards: [{ itemId: "chest_equipment", quantity: 1 }], dailyLimit: 0 },
  // ── 競技兌換店 ──
  arena_exp_3000: { price: 5, currency: "arena", rewards: [{ itemId: "exp", quantity: 3e3 }], dailyLimit: 0 },
  arena_gold_20k: { price: 5, currency: "arena", rewards: [{ itemId: "gold", quantity: 2e4 }], dailyLimit: 0 },
  arena_diamond_30: { price: 10, currency: "arena", rewards: [{ itemId: "diamond", quantity: 30 }], dailyLimit: 0 },
  arena_class_universal: { price: 15, currency: "arena", rewards: [{ itemId: "asc_class_universal", quantity: 1 }], dailyLimit: 0 },
  arena_chest_equip: { price: 8, currency: "arena", rewards: [{ itemId: "chest_equipment", quantity: 1 }], dailyLimit: 0 },
  arena_ticket_hero: { price: 20, currency: "arena", rewards: [{ itemId: "gacha_ticket_hero", quantity: 1 }], dailyLimit: 0 }
};
inventory.post("/load-item-definitions", async (c) => {
  const items = await c.env.DB.prepare("SELECT * FROM item_definitions").all();
  const parsed = items.results.map((row) => ({
    itemId: row.itemId,
    name: row.name,
    category: row.type || "",
    rarity: row.rarity,
    description: row.description,
    icon: row.icon,
    stackLimit: row.stackable || 999,
    useAction: row.useAction || ""
  }));
  return c.json({ success: true, items: parsed });
});
inventory.post("/shop-daily-status", async (c) => {
  const playerId = c.get("playerId");
  const today = isoNow().slice(0, 10);
  const rows = await c.env.DB.prepare(
    "SELECT shopItemId, count FROM shop_purchases WHERE playerId = ? AND purchaseDate = ?"
  ).bind(playerId, today).all();
  const purchases = {};
  for (const r of rows.results) {
    purchases[r.shopItemId] = r.count;
  }
  return c.json({ success: true, purchases });
});
inventory.post("/load-inventory", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const items = await db.prepare(
    "SELECT * FROM inventory WHERE playerId = ?"
  ).bind(playerId).all();
  const equipment = await db.prepare(
    "SELECT * FROM equipment_instances WHERE playerId = ?"
  ).bind(playerId).all();
  const heroRows = await db.prepare(
    "SELECT instanceId, heroId FROM hero_instances WHERE playerId = ?"
  ).bind(playerId).all();
  const heroIdToInstanceId = /* @__PURE__ */ new Map();
  for (const hr of heroRows.results) {
    heroIdToInstanceId.set(hr.heroId, hr.instanceId);
  }
  const fixStmts = [];
  const fixedEquipment = equipment.results.map((eq) => {
    if (eq.equippedBy && eq.equippedBy.startsWith("local_")) {
      const parts = eq.equippedBy.split("_");
      const heroId = Number(parts[1]);
      const realId = heroIdToInstanceId.get(heroId);
      if (realId) {
        fixStmts.push(db.prepare(
          "UPDATE equipment_instances SET equippedBy = ? WHERE equipId = ? AND playerId = ?"
        ).bind(realId, eq.equipId, playerId));
        return { ...eq, equippedBy: realId };
      } else {
        fixStmts.push(db.prepare(
          "UPDATE equipment_instances SET equippedBy = '' WHERE equipId = ? AND playerId = ?"
        ).bind(eq.equipId, playerId));
        return { ...eq, equippedBy: "" };
      }
    }
    return eq;
  });
  if (fixStmts.length > 0) {
    await db.batch(fixStmts).catch(() => {
    });
  }
  return c.json({
    success: true,
    items: items.results,
    equipment: fixedEquipment
  });
});
inventory.post("/add-items", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const items = body.items;
  if (!items?.length) return c.json({ success: false, error: "missing items" });
  const stmts = items.map((item) => upsertItemStmt(c.env.DB, playerId, item.itemId, Number(item.quantity) || 0));
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  const updated = await c.env.DB.prepare(
    "SELECT * FROM inventory WHERE playerId = ?"
  ).bind(playerId).all();
  return c.json({ success: true, inventory: updated.results });
});
inventory.post("/remove-items", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const items = body.items;
  if (!items?.length) return c.json({ success: false, error: "missing items" });
  for (const item of items) {
    const row = await c.env.DB.prepare(
      "SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?"
    ).bind(playerId, item.itemId).first();
    const have = row?.quantity ?? 0;
    if (have < Number(item.quantity)) {
      return c.json({ success: false, error: `insufficient_${item.itemId} (have=${have},need=${item.quantity})` });
    }
  }
  const rmStmts = items.map((item) => upsertItemStmt(c.env.DB, playerId, item.itemId, -(Number(item.quantity) || 0)));
  if (rmStmts.length > 0) await c.env.DB.batch(rmStmts);
  const updated = await c.env.DB.prepare(
    "SELECT * FROM inventory WHERE playerId = ?"
  ).bind(playerId).all();
  return c.json({ success: true, inventory: updated.results });
});
inventory.post("/shop-buy", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const shopItemId = body.shopItemId;
  const buyQty = Math.max(1, Math.min(999, Math.floor(Number(body.quantity) || 1)));
  if (!shopItemId) return c.json({ success: false, error: "missing shopItemId" });
  const catalog = SHOP_CATALOG[shopItemId];
  if (!catalog) return c.json({ success: false, error: "invalid_shop_item" });
  const totalPrice = catalog.price * buyQty;
  let currentBalance = 0;
  if (catalog.currency === "stardust" || catalog.currency === "equip_scrap" || catalog.currency === "arena") {
    const invItemId = catalog.currency === "stardust" ? "currency_stardust" : catalog.currency === "arena" ? "pvp_coin" : "equip_scrap";
    const row = await db.prepare(
      "SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?"
    ).bind(playerId, invItemId).first();
    currentBalance = row?.quantity ?? 0;
  } else {
    const saveData = await db.prepare(
      "SELECT gold, diamond FROM save_data WHERE playerId = ?"
    ).bind(playerId).first();
    if (!saveData) return c.json({ success: false, error: "save_not_found" });
    currentBalance = saveData[catalog.currency];
  }
  if (currentBalance < totalPrice) return c.json({ success: false, error: `insufficient_${catalog.currency}` });
  const today = isoNow().slice(0, 10);
  let remainingToday = Infinity;
  if (catalog.dailyLimit > 0) {
    const row = await db.prepare(
      "SELECT count FROM shop_purchases WHERE playerId = ? AND shopItemId = ? AND purchaseDate = ?"
    ).bind(playerId, shopItemId, today).first();
    const bought = row?.count ?? 0;
    remainingToday = Math.max(0, catalog.dailyLimit - bought);
    if (remainingToday <= 0) {
      return c.json({ success: false, error: "daily_limit_reached" });
    }
    if (buyQty > remainingToday) {
      return c.json({ success: false, error: "exceeds_daily_limit", remaining: remainingToday });
    }
  }
  const stmts = [];
  if (catalog.dailyLimit > 0) {
    stmts.push(db.prepare(
      `INSERT INTO shop_purchases (playerId, shopItemId, purchaseDate, count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(playerId, shopItemId, purchaseDate) DO UPDATE SET count = count + ?`
    ).bind(playerId, shopItemId, today, buyQty, buyQty));
  }
  if (catalog.currency === "stardust" || catalog.currency === "equip_scrap" || catalog.currency === "arena") {
    const invItemId = catalog.currency === "stardust" ? "currency_stardust" : catalog.currency === "arena" ? "pvp_coin" : "equip_scrap";
    stmts.push(upsertItemStmt(db, playerId, invItemId, -totalPrice));
  } else {
    stmts.push(db.prepare(
      `UPDATE save_data SET ${catalog.currency} = ${catalog.currency} - ? WHERE playerId = ?`
    ).bind(totalPrice, playerId));
  }
  const resDelta = {};
  for (const reward of catalog.rewards) {
    const totalReward = reward.quantity * buyQty;
    if (reward.itemId === "gold" || reward.itemId === "diamond" || reward.itemId === "exp") {
      resDelta[reward.itemId] = (resDelta[reward.itemId] || 0) + totalReward;
    } else {
      stmts.push(upsertItemStmt(db, playerId, reward.itemId, totalReward));
    }
  }
  const resCols = Object.keys(resDelta);
  if (resCols.length > 0) {
    const sets = resCols.map((col) => `${col} = ${col} + ?`).join(", ");
    stmts.push(db.prepare(
      `UPDATE save_data SET ${sets} WHERE playerId = ?`
    ).bind(...resCols.map((col) => resDelta[col]), playerId));
  }
  await db.batch(stmts);
  const currencies = await getCurrencies(db, playerId);
  return c.json({
    success: true,
    quantity: buyQty,
    spent: totalPrice,
    currency: catalog.currency,
    rewards: catalog.rewards.map((r) => ({ ...r, quantity: r.quantity * buyQty })),
    newBalance: currentBalance - totalPrice,
    currencies
  });
});
inventory.post("/use-item", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const itemId = body.itemId;
  const qty = Number(body.quantity) || 1;
  const row = await db.prepare(
    "SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?"
  ).bind(playerId, itemId).first();
  if ((row?.quantity ?? 0) < qty) return c.json({ success: false, error: "insufficient_item" });
  if (itemId === "chest_equipment") {
    const equipment = body.equipment;
    const chestStmts = [upsertItemStmt(db, playerId, itemId, -qty)];
    if (equipment) {
      const newEquips = Array.isArray(equipment) ? equipment : [equipment];
      const now = isoNow();
      for (const eq of newEquips) {
        chestStmts.push(db.prepare(
          `INSERT OR IGNORE INTO equipment_instances
           (playerId, equipId, templateId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy, locked, obtainedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          playerId,
          eq.equipId || `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          eq.templateId || "",
          eq.setId || "",
          eq.slot || "",
          eq.rarity || "N",
          eq.mainStat || "",
          eq.mainStatValue ?? eq.mainValue ?? 0,
          eq.enhanceLevel ?? eq.level ?? 0,
          JSON.stringify(eq.subStats || []),
          "",
          eq.locked ? 1 : 0,
          now
        ));
      }
    }
    const BATCH_LIMIT = 50;
    for (let i = 0; i < chestStmts.length; i += BATCH_LIMIT) {
      await db.batch(chestStmts.slice(i, i + BATCH_LIMIT));
    }
    return c.json({ success: true, result: { used: itemId, quantity: qty, type: "equipment", equipment } });
  }
  if (itemId === "chest_bronze" || itemId === "chest_silver" || itemId === "chest_gold") {
    const chestRewards = generateChestRewards(itemId, qty);
    const chestStmts = [upsertItemStmt(db, playerId, itemId, -qty)];
    const resDelta = {};
    if (chestRewards.gold > 0) resDelta.gold = chestRewards.gold;
    if (chestRewards.diamond > 0) resDelta.diamond = chestRewards.diamond;
    if (chestRewards.exp > 0) resDelta.exp = chestRewards.exp;
    const resCols = Object.keys(resDelta);
    if (resCols.length > 0) {
      const sets = resCols.map((col) => `${col} = ${col} + ?`).join(", ");
      chestStmts.push(db.prepare(
        `UPDATE save_data SET ${sets} WHERE playerId = ?`
      ).bind(...resCols.map((col) => resDelta[col]), playerId));
    }
    for (const ri of chestRewards.items) {
      chestStmts.push(upsertItemStmt(db, playerId, ri.itemId, ri.quantity));
    }
    await db.batch(chestStmts);
    const currencies = await getCurrencies(db, playerId);
    return c.json({
      success: true,
      result: { used: itemId, quantity: qty, type: "chest", ...chestRewards },
      currencies
    });
  }
  await upsertItemStmt(db, playerId, itemId, -qty).run();
  return c.json({ success: true, result: { used: itemId, quantity: qty } });
});
function generateChestRewards(chestId, qty) {
  let gold = 0, diamond = 0, exp = 0;
  const itemMap = {};
  for (let q = 0; q < qty; q++) {
    if (chestId === "chest_bronze") {
      gold += 1e3 + Math.floor(Math.random() * 2e3);
      if (Math.random() < 0.5) exp += 200;
      if (Math.random() < 0.15) diamond += 3 + Math.floor(Math.random() * 5);
    } else if (chestId === "chest_silver") {
      gold += 3e3 + Math.floor(Math.random() * 4e3);
      diamond += 10 + Math.floor(Math.random() * 20);
      if (Math.random() < 0.8) exp += 1e3;
      if (Math.random() < 0.25) itemMap["chest_equipment"] = (itemMap["chest_equipment"] || 0) + 1;
    } else if (chestId === "chest_gold") {
      gold += 8e3 + Math.floor(Math.random() * 7e3);
      diamond += 30 + Math.floor(Math.random() * 50);
      exp += 4e3;
      if (Math.random() < 0.4) itemMap["chest_equipment"] = (itemMap["chest_equipment"] || 0) + 1;
      if (Math.random() < 0.2) itemMap["gacha_ticket_hero"] = (itemMap["gacha_ticket_hero"] || 0) + 1;
    }
  }
  const items = Object.entries(itemMap).map(([itemId, quantity]) => ({ itemId, name: itemId, quantity }));
  return { gold, diamond, exp, items };
}
__name(generateChestRewards, "generateChestRewards");
inventory.post("/equip-item", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const equipId = body.equipId;
  let heroInstanceId = body.heroInstanceId;
  if (!equipId || !heroInstanceId) return c.json({ success: false, error: "missing params" });
  const db = c.env.DB;
  if (heroInstanceId.startsWith("local_")) {
    const parts = heroInstanceId.split("_");
    const heroId = Number(parts[1]);
    if (heroId > 0) {
      const realHero = await db.prepare(
        "SELECT instanceId FROM hero_instances WHERE playerId = ? AND heroId = ? LIMIT 1"
      ).bind(playerId, heroId).first();
      if (realHero) {
        heroInstanceId = realHero.instanceId;
      } else {
        return c.json({ success: false, error: "hero_not_found" });
      }
    }
  }
  const equip = await db.prepare(
    "SELECT slot FROM equipment_instances WHERE equipId = ? AND playerId = ?"
  ).bind(equipId, playerId).first();
  if (!equip) return c.json({ success: false, error: "equip_not_found" });
  await db.batch([
    db.prepare(
      "UPDATE equipment_instances SET equippedBy = '' WHERE playerId = ? AND equippedBy = ? AND slot = ? AND equipId != ?"
    ).bind(playerId, heroInstanceId, equip.slot, equipId),
    db.prepare(
      "UPDATE equipment_instances SET equippedBy = ? WHERE equipId = ? AND playerId = ?"
    ).bind(heroInstanceId, equipId, playerId)
  ]);
  return c.json({ success: true, heroInstanceId });
});
inventory.post("/unequip-item", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const equipId = body.equipId;
  if (!equipId) return c.json({ success: false, error: "missing equipId" });
  const res = await c.env.DB.prepare(
    "UPDATE equipment_instances SET equippedBy = '' WHERE equipId = ? AND playerId = ?"
  ).bind(equipId, playerId).run();
  if (!res.meta.changes) return c.json({ success: false, error: "equip_not_found" });
  return c.json({ success: true });
});
inventory.post("/lock-equipment", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const equipId = body.equipId;
  const locked = body.locked ? 1 : 0;
  await c.env.DB.prepare(
    "UPDATE equipment_instances SET locked = ? WHERE equipId = ? AND playerId = ?"
  ).bind(locked, equipId, playerId).run();
  return c.json({ success: true });
});
var DECOMPOSE_REWARDS = {
  N: { gold: 100, scrap: 1 },
  R: { gold: 300, scrap: 2 },
  SR: { gold: 800, scrap: 5 },
  SSR: { gold: 2e3, scrap: 10 }
};
inventory.post("/decompose-equipment", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const equipIds = body.equipIds;
  if (!equipIds?.length) return c.json({ success: false, error: "missing equipIds" });
  const CHUNK_SIZE = 50;
  const allRows = [];
  for (let i = 0; i < equipIds.length; i += CHUNK_SIZE) {
    const chunk = equipIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    try {
      const rows = await db.prepare(
        `SELECT equipId, rarity, equippedBy, locked, enhanceLevel FROM equipment_instances WHERE playerId = ? AND equipId IN (${placeholders})`
      ).bind(playerId, ...chunk).all();
      allRows.push(...rows.results);
    } catch (e) {
      console.error(`decompose chunk query failed (offset=${i}, size=${chunk.length}):`, e);
    }
  }
  if (allRows.length === 0) return c.json({ success: false, error: "no_valid_equipment", requestedCount: equipIds.length });
  const decomposable = allRows.filter((e) => !e.equippedBy && !e.locked);
  if (decomposable.length === 0) {
    const hasEquipped = allRows.some((e) => !!e.equippedBy);
    const hasLocked = allRows.some((e) => !!e.locked);
    const reason = hasEquipped && hasLocked ? "all_equipped_or_locked" : hasEquipped ? "cannot_decompose_equipped" : "cannot_decompose_locked";
    return c.json({ success: false, error: reason });
  }
  let totalGold = 0;
  let totalScrap = 0;
  const stmts = [];
  for (const eq of decomposable) {
    const reward = DECOMPOSE_REWARDS[eq.rarity] || DECOMPOSE_REWARDS["N"];
    const enhBaseGold = { N: 200, R: 500, SR: 1e3, SSR: 2e3 };
    const ebg = enhBaseGold[eq.rarity] || 500;
    let enhanceRefund = 0;
    for (let lv = 0; lv < eq.enhanceLevel; lv++) {
      enhanceRefund += Math.floor(ebg * (1 + lv * 0.3));
    }
    totalGold += reward.gold + enhanceRefund;
    totalScrap += reward.scrap;
    stmts.push(db.prepare(
      "DELETE FROM equipment_instances WHERE equipId = ? AND playerId = ?"
    ).bind(eq.equipId, playerId));
  }
  stmts.push(db.prepare(
    "UPDATE save_data SET gold = gold + ? WHERE playerId = ?"
  ).bind(totalGold, playerId));
  stmts.push(upsertItemStmt(db, playerId, "equip_scrap", totalScrap));
  const BATCH_SIZE = 50;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await db.batch(stmts.slice(i, i + BATCH_SIZE));
  }
  const currencies = await getCurrencies(db, playerId);
  return c.json({
    success: true,
    decomposed: decomposable.length,
    goldGained: totalGold,
    scrapGained: totalScrap,
    skippedLocked: allRows.length - decomposable.length,
    currencies
  });
});
var inventory_default = inventory;

// src/routes/progression.ts
var progression = new Hono2();
async function resolveInstanceId(db, playerId, instanceId) {
  if (!instanceId.startsWith("local_")) return instanceId;
  const parts = instanceId.split("_");
  const heroId = Number(parts[1]);
  if (!heroId || heroId <= 0) return null;
  const row = await db.prepare(
    "SELECT instanceId FROM hero_instances WHERE playerId = ? AND heroId = ? LIMIT 1"
  ).bind(playerId, heroId).first();
  return row?.instanceId ?? null;
}
__name(resolveInstanceId, "resolveInstanceId");
function expForLevel(level) {
  return level * 100;
}
__name(expForLevel, "expForLevel");
var ASCENSION_LEVEL_CAP = {
  0: 20,
  1: 40,
  2: 60,
  3: 80,
  4: 90,
  5: 100
};
var STAR_FRAGMENT_COST = [5, 10, 20, 40, 80, 160];
progression.post("/upgrade-hero", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const rawInstanceId = body.instanceId;
  const expAmount = Number(body.expAmount) || 0;
  const materials = body.materials;
  let totalExpInput = expAmount;
  if ((!totalExpInput || totalExpInput <= 0) && materials?.length) {
    const EXP_MATERIALS = { exp_core_s: 100, exp_core_m: 500, exp_core_l: 2e3 };
    for (const mat of materials) {
      totalExpInput += (EXP_MATERIALS[mat.itemId] || 0) * (Number(mat.quantity) || 0);
    }
  }
  if (!rawInstanceId || totalExpInput <= 0) return c.json({ success: false, error: "missing params" });
  const instanceId = await resolveInstanceId(db, playerId, rawInstanceId);
  if (!instanceId) return c.json({ success: false, error: "hero_not_found" });
  const hero = await db.prepare(
    "SELECT * FROM hero_instances WHERE instanceId = ? AND playerId = ?"
  ).bind(instanceId, playerId).first();
  if (!hero) return c.json({ success: false, error: "hero_not_found" });
  const saveData = await db.prepare(
    "SELECT exp FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  const playerExp = saveData?.exp ?? 0;
  const usableExp = Math.min(totalExpInput, playerExp);
  if (usableExp <= 0) return c.json({ success: false, error: "insufficient_exp" });
  const levelCap = ASCENSION_LEVEL_CAP[hero.ascension] ?? 20;
  let level = hero.level;
  let exp = hero.exp + usableExp;
  while (level < levelCap) {
    const needed = expForLevel(level);
    if (exp >= needed) {
      exp -= needed;
      level++;
    } else {
      break;
    }
  }
  if (level >= levelCap) {
    level = levelCap;
    exp = 0;
  }
  await db.batch([
    db.prepare(
      "UPDATE save_data SET exp = exp - ? WHERE playerId = ?"
    ).bind(usableExp, playerId),
    db.prepare(
      "UPDATE hero_instances SET level = ?, exp = ? WHERE instanceId = ?"
    ).bind(level, exp, instanceId)
  ]);
  return c.json({
    success: true,
    newLevel: level,
    newExp: exp,
    expConsumed: usableExp,
    currencies: await getCurrencies(db, playerId)
  });
});
progression.post("/ascend-hero", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const rawInstanceId = body.instanceId;
  if (!rawInstanceId) return c.json({ success: false, error: "missing instanceId" });
  const instanceId = await resolveInstanceId(db, playerId, rawInstanceId);
  if (!instanceId) return c.json({ success: false, error: "hero_not_found" });
  const hero = await db.prepare(
    "SELECT * FROM hero_instances WHERE instanceId = ? AND playerId = ?"
  ).bind(instanceId, playerId).first();
  if (!hero) return c.json({ success: false, error: "hero_not_found" });
  if (hero.ascension >= 5) return c.json({ success: false, error: "max_ascension" });
  const levelCap = ASCENSION_LEVEL_CAP[hero.ascension] ?? 20;
  if (hero.level < levelCap) return c.json({ success: false, error: "level_not_at_cap" });
  const fragId = `asc_fragment_${hero.heroId}`;
  const fragCost = [10, 20, 30, 50, 80][hero.ascension] ?? 30;
  const fragRow = await db.prepare(
    "SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?"
  ).bind(playerId, fragId).first();
  if ((fragRow?.quantity ?? 0) < fragCost) return c.json({ success: false, error: "insufficient_fragments" });
  const heroData = await db.prepare(
    "SELECT type FROM heroes WHERE heroId = ?"
  ).bind(hero.heroId).first();
  const classStoneMap = {
    Power: "asc_class_power",
    Agility: "asc_class_agility",
    Defense: "asc_class_defense"
  };
  const classStoneId = classStoneMap[heroData?.type || ""] || "asc_class_universal";
  const classCost = [5, 10, 15, 20, 30][hero.ascension] ?? 10;
  const classRow = await db.prepare(
    "SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?"
  ).bind(playerId, classStoneId).first();
  if ((classRow?.quantity ?? 0) < classCost) return c.json({ success: false, error: "insufficient_class_stones" });
  const goldCost = [5e3, 1e4, 2e4, 4e4, 8e4][hero.ascension] ?? 1e4;
  const saveData = await db.prepare(
    "SELECT gold FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if ((saveData?.gold ?? 0) < goldCost) return c.json({ success: false, error: "insufficient_gold" });
  const newAscension = hero.ascension + 1;
  await db.batch([
    upsertItemStmt(db, playerId, fragId, -fragCost),
    upsertItemStmt(db, playerId, classStoneId, -classCost),
    db.prepare(
      "UPDATE save_data SET gold = gold - ? WHERE playerId = ?"
    ).bind(goldCost, playerId),
    db.prepare(
      "UPDATE hero_instances SET ascension = ? WHERE instanceId = ?"
    ).bind(newAscension, instanceId)
  ]);
  return c.json({
    success: true,
    newAscension,
    newLevelCap: ASCENSION_LEVEL_CAP[newAscension] ?? 20,
    currencies: await getCurrencies(db, playerId)
  });
});
progression.post("/star-up-hero", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const rawInstanceId = body.instanceId;
  if (!rawInstanceId) return c.json({ success: false, error: "missing instanceId" });
  const instanceId = await resolveInstanceId(db, playerId, rawInstanceId);
  if (!instanceId) return c.json({ success: false, error: "hero_not_found" });
  const hero = await db.prepare(
    "SELECT * FROM hero_instances WHERE instanceId = ? AND playerId = ?"
  ).bind(instanceId, playerId).first();
  if (!hero) return c.json({ success: false, error: "hero_not_found" });
  if (hero.stars >= 6) return c.json({ success: false, error: "max_stars" });
  const fragId = `asc_fragment_${hero.heroId}`;
  const cost = STAR_FRAGMENT_COST[hero.stars] ?? 999;
  const fragRow = await db.prepare(
    "SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?"
  ).bind(playerId, fragId).first();
  if ((fragRow?.quantity ?? 0) < cost) return c.json({ success: false, error: "insufficient_fragments" });
  const newStars = hero.stars + 1;
  await db.batch([
    upsertItemStmt(db, playerId, fragId, -cost),
    db.prepare(
      "UPDATE hero_instances SET stars = ? WHERE instanceId = ?"
    ).bind(newStars, instanceId)
  ]);
  return c.json({ success: true, newStars, fragmentsConsumed: cost });
});
progression.post("/enhance-equipment", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const equipId = body.equipId;
  if (!equipId) return c.json({ success: false, error: "missing equipId" });
  const equip = await db.prepare(
    "SELECT * FROM equipment_instances WHERE equipId = ? AND playerId = ?"
  ).bind(equipId, playerId).first();
  if (!equip) return c.json({ success: false, error: "equip_not_found" });
  const baseGoldMap = { N: 200, R: 500, SR: 1e3, SSR: 2e3 };
  const baseGold = baseGoldMap[equip.rarity] || 500;
  const goldCost = Math.floor(baseGold * (1 + equip.enhanceLevel * 0.3));
  const saveData = await db.prepare(
    "SELECT gold FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if ((saveData?.gold ?? 0) < goldCost) return c.json({ success: false, error: "insufficient_gold" });
  const newLevel = equip.enhanceLevel + 1;
  await db.batch([
    db.prepare(
      "UPDATE save_data SET gold = gold - ? WHERE playerId = ?"
    ).bind(goldCost, playerId),
    db.prepare(
      "UPDATE equipment_instances SET enhanceLevel = ? WHERE equipId = ?"
    ).bind(newLevel, equipId)
  ]);
  return c.json({
    success: true,
    newLevel,
    newMainStatValue: equip.mainStatValue,
    // 回傳 base 值，前端自行計算
    goldConsumed: goldCost,
    currencies: await getCurrencies(db, playerId)
  });
});
var progression_default = progression;

// src/domain/battleEngine.ts
var ENERGY_CONFIG = { maxEnergy: 1e3, onAttack: 200, onBeAttacked: 150, onKill: 100, perTurn: 50 };
function addEnergy(hero, amount) {
  const prev = hero.energy;
  hero.energy = Math.min(ENERGY_CONFIG.maxEnergy, hero.energy + amount);
  return hero.energy - prev;
}
__name(addEnergy, "addEnergy");
function turnStartEnergy(hero) {
  return addEnergy(hero, ENERGY_CONFIG.perTurn);
}
__name(turnStartEnergy, "turnStartEnergy");
function onAttackEnergy(hero) {
  return addEnergy(hero, ENERGY_CONFIG.onAttack);
}
__name(onAttackEnergy, "onAttackEnergy");
function onBeAttackedEnergy(hero) {
  return hero.currentHP <= 0 ? 0 : addEnergy(hero, ENERGY_CONFIG.onBeAttacked);
}
__name(onBeAttackedEnergy, "onBeAttackedEnergy");
function onKillEnergy(hero) {
  return addEnergy(hero, ENERGY_CONFIG.onKill);
}
__name(onKillEnergy, "onKillEnergy");
function consumeEnergy(hero) {
  hero.energy = 0;
}
__name(consumeEnergy, "consumeEnergy");
function canCastUltimate(hero) {
  return hero.energy >= ENERGY_CONFIG.maxEnergy && hero.activeSkill != null && !isSilenced(hero);
}
__name(canCastUltimate, "canCastUltimate");
var DOT_TYPES = ["dot_burn", "dot_poison", "dot_bleed"];
var CONTROL_TYPES = ["stun", "freeze", "silence", "fear"];
var BUFF_TYPES = [
  "atk_up",
  "def_up",
  "spd_up",
  "crit_rate_up",
  "crit_dmg_up",
  "dmg_reduce",
  "shield",
  "regen",
  "energy_boost",
  "dodge_up",
  "reflect",
  "taunt"
];
function isDebuff(type) {
  return !BUFF_TYPES.includes(type) && type !== "immunity" && type !== "cleanse";
}
__name(isDebuff, "isDebuff");
function applyStatus(target, effect) {
  if (isDebuff(effect.type) && hasStatus(target, "immunity")) return false;
  const existing = target.statusEffects.find((s) => s.type === effect.type);
  if (existing) {
    if (CONTROL_TYPES.includes(effect.type)) {
      existing.duration = Math.max(existing.duration, effect.duration);
      return true;
    }
    if (existing.stacks < existing.maxStacks) {
      existing.stacks++;
      existing.value += effect.value;
    }
    existing.duration = Math.max(existing.duration, effect.duration);
    return true;
  }
  target.statusEffects.push({ ...effect, stacks: 1 });
  return true;
}
__name(applyStatus, "applyStatus");
function cleanse(target, count = 1) {
  const removed = [];
  for (let i = 0; i < count; i++) {
    const idx = target.statusEffects.findIndex((s) => isDebuff(s.type));
    if (idx >= 0) {
      removed.push(target.statusEffects[idx].type);
      target.statusEffects.splice(idx, 1);
    }
  }
  return removed;
}
__name(cleanse, "cleanse");
function getStatusValue(hero, type) {
  return hero.statusEffects.filter((s) => s.type === type).reduce((sum, s) => sum + s.value * s.stacks, 0);
}
__name(getStatusValue, "getStatusValue");
function hasStatus(hero, type) {
  return hero.statusEffects.some((s) => s.type === type);
}
__name(hasStatus, "hasStatus");
function isControlled(hero) {
  return hasStatus(hero, "stun") || hasStatus(hero, "freeze");
}
__name(isControlled, "isControlled");
function isSilenced(hero) {
  return hasStatus(hero, "silence");
}
__name(isSilenced, "isSilenced");
function isFeared(hero) {
  return hasStatus(hero, "fear");
}
__name(isFeared, "isFeared");
function hasTaunt(hero) {
  return hasStatus(hero, "taunt");
}
__name(hasTaunt, "hasTaunt");
function processDotEffects(hero, allHeroes) {
  const results = [];
  for (const status of hero.statusEffects) {
    if (!DOT_TYPES.includes(status.type)) continue;
    const source = allHeroes.find((h) => h.uid === status.sourceHeroId);
    let dmg = 0;
    switch (status.type) {
      case "dot_burn":
        dmg = Math.floor((source?.finalStats.ATK ?? 0) * 0.3 * status.stacks);
        break;
      case "dot_poison":
        dmg = Math.floor(hero.maxHP * 0.03 * status.stacks);
        break;
      case "dot_bleed":
        dmg = Math.floor((source?.finalStats.ATK ?? 0) * 0.25 * status.stacks);
        break;
    }
    if (dmg > 0) {
      hero.currentHP = Math.max(0, hero.currentHP - dmg);
      results.push({ type: status.type, damage: dmg, sourceUid: status.sourceHeroId });
    }
  }
  return results;
}
__name(processDotEffects, "processDotEffects");
function processRegen(hero) {
  let total = 0;
  for (const s of hero.statusEffects) {
    if (s.type !== "regen") continue;
    const heal = Math.floor(hero.maxHP * s.value * s.stacks);
    if (heal > 0) {
      const actual = Math.min(heal, hero.maxHP - hero.currentHP);
      hero.currentHP += actual;
      total += actual;
    }
  }
  return total;
}
__name(processRegen, "processRegen");
function tickStatusDurations(hero) {
  const expired = [];
  const permaSet = new Set(hero.statusEffects.filter((s) => s.duration === 0));
  for (const s of hero.statusEffects) {
    if (s.duration > 0) {
      s.duration--;
      if (s.duration <= 0) expired.push(s.type);
    }
  }
  hero.statusEffects = hero.statusEffects.filter((s) => s.duration > 0 || permaSet.has(s));
  return expired;
}
__name(tickStatusDurations, "tickStatusDurations");
function tickShieldDurations(hero) {
  hero.shields = hero.shields.map((s) => ({ value: s.value, duration: s.duration - 1, sourceHeroId: s.sourceHeroId })).filter((s) => s.duration > 0 && s.value > 0);
}
__name(tickShieldDurations, "tickShieldDurations");
function getBuffedStats(hero) {
  const base = { ...hero.finalStats };
  base.ATK = Math.max(1, Math.floor(base.ATK * (1 + getStatusValue(hero, "atk_up") - getStatusValue(hero, "atk_down"))));
  base.DEF = Math.max(0, Math.floor(base.DEF * (1 + getStatusValue(hero, "def_up") - getStatusValue(hero, "def_down"))));
  base.SPD = Math.max(1, Math.floor(base.SPD * (1 + getStatusValue(hero, "spd_up") - getStatusValue(hero, "spd_down"))));
  base.CritRate = Math.max(0, Math.min(100, base.CritRate + getStatusValue(hero, "crit_rate_up") * 100 - getStatusValue(hero, "crit_rate_down") * 100));
  return base;
}
__name(getBuffedStats, "getBuffedStats");
function absorbDamageByShields(hero, damage) {
  let remaining = damage;
  let absorbed = 0;
  for (const s of hero.shields) {
    if (remaining <= 0) break;
    const absorb = Math.min(s.value, remaining);
    s.value -= absorb;
    remaining -= absorb;
    absorbed += absorb;
  }
  hero.shields = hero.shields.filter((s) => s.value > 0);
  return [remaining, absorbed];
}
__name(absorbDamageByShields, "absorbDamageByShields");
function calculateDamage(rng, attacker, target, skill) {
  const atkStats = getBuffedStats(attacker);
  const defStats = getBuffedStats(target);
  const dodgeRate = Math.min(getStatusValue(target, "dodge_up"), 0.75);
  if (rng() < dodgeRate) {
    return { damage: 0, isCrit: false, isDodge: true, damageType: "miss", shieldAbsorbed: 0, reflectDamage: 0 };
  }
  const scalingStat = skill?.scalingStat || "ATK";
  const statValue = atkStats[scalingStat] ?? atkStats.ATK;
  const multiplier = skill?.multiplier ?? 1;
  const flatValue = skill?.flatValue ?? 0;
  let dmg = statValue * multiplier + flatValue;
  const defReduction = 100 / (100 + Math.max(0, defStats.DEF));
  dmg *= defReduction;
  const critRate = Math.min(atkStats.CritRate / 100, 1);
  const isCrit = rng() < critRate;
  if (isCrit) dmg *= 1 + atkStats.CritDmg / 100;
  dmg *= 0.95 + rng() * 0.1;
  let targetMult = 1;
  targetMult -= getStatusValue(target, "dmg_reduce");
  if (hasStatus(target, "fear")) targetMult *= 1.2;
  targetMult = Math.max(0.1, targetMult);
  dmg *= targetMult;
  dmg = Math.max(1, Math.floor(dmg));
  const [actualDmg, shieldAbsorbed] = absorbDamageByShields(target, dmg);
  const reflectRate = getStatusValue(target, "reflect");
  const reflectDamage = reflectRate > 0 ? Math.floor(actualDmg * reflectRate) : 0;
  let damageType = "normal";
  if (isCrit) damageType = "crit";
  if (shieldAbsorbed > 0 && actualDmg === 0) damageType = "shield";
  return { damage: actualDmg, isCrit, isDodge: false, damageType, shieldAbsorbed, reflectDamage };
}
__name(calculateDamage, "calculateDamage");
function calculateHeal(rng, healer, target, skill) {
  const healerStats = getBuffedStats(healer);
  const statValue = healerStats[skill.scalingStat || "ATK"] ?? healerStats.ATK;
  let heal = statValue * (skill.multiplier ?? 1) + (skill.flatValue ?? 0);
  if (rng() < Math.min(healerStats.CritRate / 100, 1)) heal *= 1.5;
  heal = Math.min(Math.floor(heal), target.maxHP - target.currentHP);
  return { heal: Math.max(0, heal), isCrit: false };
}
__name(calculateHeal, "calculateHeal");
var FRONT_INDICES = [0, 1, 2];
var BACK_INDICES = [3, 4, 5];
function slotColumn(slot) {
  return slot % 3;
}
__name(slotColumn, "slotColumn");
function pickByColumnProximity(candidates, preferCol) {
  const sameCol = candidates.find((c) => slotColumn(c.slot) === preferCol);
  if (sameCol) return sameCol;
  candidates.sort((a, b) => Math.abs(slotColumn(a.slot) - preferCol) - Math.abs(slotColumn(b.slot) - preferCol));
  return candidates[0] ?? null;
}
__name(pickByColumnProximity, "pickByColumnProximity");
function selectNormalAttackTarget(attacker, enemies) {
  const alive = enemies.filter((e) => e.currentHP > 0);
  if (!alive.length) return null;
  const taunters = alive.filter((e) => hasTaunt(e));
  if (taunters.length) return taunters[0];
  const col = slotColumn(attacker.slot);
  const frontAlive = alive.filter((e) => FRONT_INDICES.includes(e.slot));
  if (frontAlive.length) return pickByColumnProximity(frontAlive, col) ?? frontAlive[0];
  const backAlive = alive.filter((e) => BACK_INDICES.includes(e.slot));
  if (backAlive.length) return pickByColumnProximity(backAlive, col) ?? backAlive[0];
  return alive[0];
}
__name(selectNormalAttackTarget, "selectNormalAttackTarget");
function selectRandomEnemies(rng, enemies, count) {
  if (!enemies.length) return [];
  const results = [];
  for (let i = 0; i < count; i++) results.push(enemies[Math.floor(rng() * enemies.length)]);
  return results;
}
__name(selectRandomEnemies, "selectRandomEnemies");
function selectTargets(rng, targetType, attacker, allies, enemies) {
  const aliveEnemies = enemies.filter((e) => e.currentHP > 0);
  const aliveAllies = allies.filter((a) => a.currentHP > 0);
  switch (targetType) {
    case "single_enemy": {
      const t = selectNormalAttackTarget(attacker, aliveEnemies);
      return t ? [t] : [];
    }
    case "all_enemies":
      return aliveEnemies;
    case "random_enemies_3":
      return selectRandomEnemies(rng, aliveEnemies, 3);
    case "front_row_enemies": {
      const f = aliveEnemies.filter((e) => FRONT_INDICES.includes(e.slot));
      return f.length ? f : aliveEnemies.filter((e) => BACK_INDICES.includes(e.slot));
    }
    case "back_row_enemies": {
      const b = aliveEnemies.filter((e) => BACK_INDICES.includes(e.slot));
      return b.length ? b : aliveEnemies.filter((e) => FRONT_INDICES.includes(e.slot));
    }
    case "single_ally": {
      if (!aliveAllies.length) return [];
      return [aliveAllies.slice().sort((a, b) => a.currentHP / a.maxHP - b.currentHP / b.maxHP)[0]];
    }
    case "all_allies":
      return aliveAllies;
    case "self":
      return [attacker];
    default: {
      const m = targetType.match(/^random_enemies_(\d+)$/);
      if (m) return selectRandomEnemies(rng, aliveEnemies, parseInt(m[1]));
      const fb = selectNormalAttackTarget(attacker, aliveEnemies);
      return fb ? [fb] : [];
    }
  }
}
__name(selectTargets, "selectTargets");
function makeContext(turn, actor, allHeroes, target, isKill = false) {
  return {
    turn,
    attacker: actor,
    target: target ?? null,
    targets: target ? [target] : [],
    allAllies: allHeroes.filter((h) => h.side === actor.side),
    allEnemies: allHeroes.filter((h) => h.side !== actor.side),
    damageDealt: 0,
    isKill,
    isCrit: false,
    isDodge: false
  };
}
__name(makeContext, "makeContext");
function getMaxUsage(passive) {
  if (passive.skillId === "PAS_1_4") return 2;
  if (passive.passiveTrigger === "on_lethal") return 1;
  return 999999;
}
__name(getMaxUsage, "getMaxUsage");
function resolvePassiveTargets(hero, effectType, passiveTarget, context) {
  switch (passiveTarget) {
    case "all_allies":
      return context.allAllies.filter((h) => h.side === hero.side && h.currentHP > 0);
    case "all_enemies":
      return context.allEnemies.filter((h) => h.side !== hero.side && h.currentHP > 0);
    case "self":
    default:
      if (effectType === "debuff" && context.target && context.target.currentHP > 0) return [context.target];
      return [hero];
  }
}
__name(resolvePassiveTargets, "resolvePassiveTargets");
function executePassiveEffect(rng, hero, effect, context, emit, extraTurnQueue) {
  const chance = effect.statusChance ?? 1;
  if (rng() > chance) return;
  const ownerPassive = hero.activePassives.find((p) => p.effects?.includes(effect));
  const passiveTargetType = ownerPassive?.target ?? "self";
  switch (effect.type) {
    case "buff":
    case "debuff": {
      if (!effect.status) return;
      const targets = resolvePassiveTargets(hero, effect.type, passiveTargetType, context);
      for (const t of targets) {
        applyStatus(t, {
          type: effect.status,
          value: effect.statusValue ?? 0,
          duration: effect.statusDuration ?? 0,
          maxStacks: effect.statusMaxStacks ?? 1,
          sourceHeroId: hero.uid
        });
      }
      break;
    }
    case "heal": {
      const targets = resolvePassiveTargets(hero, "buff", passiveTargetType, context);
      for (const ht of targets) {
        if (ht.currentHP <= 0) continue;
        const base = ht.finalStats[effect.scalingStat || "HP"] ?? ht.maxHP;
        const healAmt = Math.floor(base * (effect.multiplier ?? 0.1) + (effect.flatValue ?? 0));
        const actual = Math.min(healAmt, ht.maxHP - ht.currentHP);
        ht.currentHP += actual;
        hero.totalHealingDone += actual;
      }
      break;
    }
    case "energy": {
      const targets = resolvePassiveTargets(hero, "buff", passiveTargetType, context);
      for (const et of targets) {
        if (et.currentHP > 0) addEnergy(et, effect.flatValue ?? 0);
      }
      break;
    }
    case "damage_mult":
      context.damageMult = (context.damageMult ?? 1) * (effect.multiplier ?? 1);
      break;
    case "damage_mult_random": {
      const min = effect.min ?? 0.5;
      const max = effect.max ?? 1.8;
      context.damageMult = (context.damageMult ?? 1) * (min + rng() * (max - min));
      break;
    }
    case "damage": {
      if (context.target && context.target.currentHP > 0) {
        const dmg = calculateDamage(rng, hero, context.target, effect);
        if (!dmg.isDodge) {
          context.target.currentHP = Math.max(0, context.target.currentHP - dmg.damage);
          hero.totalDamageDealt += dmg.damage;
          const killed = context.target.currentHP <= 0;
          emit({ type: "PASSIVE_DAMAGE", attackerUid: hero.uid, targetUid: context.target.uid, damage: dmg.damage, killed });
          if (killed) emit({ type: "DEATH", targetUid: context.target.uid });
        }
      }
      break;
    }
    case "extra_turn":
      extraTurnQueue.push(hero.uid);
      break;
    case "dispel_debuff":
      cleanse(hero, 1);
      break;
    case "reflect":
      applyStatus(hero, { type: "reflect", value: effect.multiplier ?? 0.15, duration: 0, maxStacks: 1, sourceHeroId: hero.uid });
      break;
    default:
      break;
  }
}
__name(executePassiveEffect, "executePassiveEffect");
function triggerPassives(rng, hero, trigger, context, emit, extraTurnQueue) {
  if (hero.currentHP <= 0) return;
  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== trigger) continue;
    const usageKey = passive.skillId;
    const usageCount = hero.passiveUsage[usageKey] || 0;
    if (trigger === "on_lethal" && usageCount >= getMaxUsage(passive)) continue;
    for (const eff of passive.effects) {
      executePassiveEffect(rng, hero, eff, context, emit, extraTurnQueue);
    }
    hero.passiveUsage[usageKey] = usageCount + 1;
    emit({ type: "PASSIVE_TRIGGER", heroUid: hero.uid, skillId: passive.skillId, skillName: passive.name });
  }
}
__name(triggerPassives, "triggerPassives");
function checkHpBelowPassives(rng, hero, turn, allHeroes, emit, extraTurnQueue) {
  if (hero.currentHP <= 0) return;
  const hpPct = hero.currentHP / hero.maxHP;
  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== "hp_below_pct") continue;
    let threshold = 0.3;
    if (passive.description.includes("15%")) threshold = 0.15;
    else if (passive.description.includes("50%")) threshold = 0.5;
    if (hpPct < threshold) {
      const usageKey = passive.skillId + "_hp_below";
      if (hero.passiveUsage[usageKey]) continue;
      for (const eff of passive.effects) {
        executePassiveEffect(rng, hero, eff, makeContext(turn, hero, allHeroes), emit, extraTurnQueue);
      }
      hero.passiveUsage[usageKey] = 1;
      emit({ type: "PASSIVE_TRIGGER", heroUid: hero.uid, skillId: passive.skillId, skillName: passive.name });
    }
  }
}
__name(checkHpBelowPassives, "checkHpBelowPassives");
function executeNormalAttack(rng, attacker, allies, enemies, turn, allHeroes, emit, extraTurnQueue) {
  const target = selectNormalAttackTarget(attacker, enemies);
  if (!target) return;
  const ctx = makeContext(turn, attacker, allHeroes, target);
  triggerPassives(rng, attacker, "on_attack", ctx, emit, extraTurnQueue);
  const result = calculateDamage(rng, attacker, target);
  if (ctx.damageMult != null && ctx.damageMult !== 1 && !result.isDodge) {
    result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult));
  }
  let killed = false;
  let _atkEnergyNew;
  let _tgtEnergyNew;
  if (!result.isDodge) {
    target.currentHP = Math.max(0, target.currentHP - result.damage);
    attacker.totalDamageDealt += result.damage;
    killed = target.currentHP <= 0;
    if (result.reflectDamage > 0) attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage);
    if (onAttackEnergy(attacker) > 0) _atkEnergyNew = attacker.energy;
    if (!killed && onBeAttackedEnergy(target) > 0) _tgtEnergyNew = target.energy;
    if (killed) {
      attacker.killCount++;
      onKillEnergy(attacker);
      _atkEnergyNew = attacker.energy;
    }
  }
  emit({ type: "NORMAL_ATTACK", attackerUid: attacker.uid, targetUid: target.uid, result, killed, _atkEnergyNew, _tgtEnergyNew });
  if (!result.isDodge) {
    if (!killed) {
      triggerPassives(rng, target, "on_be_attacked", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
      triggerPassives(rng, target, "on_take_damage", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
    }
    if (result.isCrit) triggerPassives(rng, attacker, "on_crit", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
    if (killed) triggerPassives(rng, attacker, "on_kill", makeContext(turn, attacker, allHeroes, target, true), emit, extraTurnQueue);
  } else {
    triggerPassives(rng, target, "on_dodge", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
  }
  checkHpBelowPassives(rng, attacker, turn, allHeroes, emit, extraTurnQueue);
  checkHpBelowPassives(rng, target, turn, allHeroes, emit, extraTurnQueue);
}
__name(executeNormalAttack, "executeNormalAttack");
function executeSkill(rng, attacker, skill, allies, enemies, turn, allHeroes, emit, extraTurnQueue) {
  const targets = selectTargets(rng, skill.target, attacker, allies, enemies);
  if (!targets.length) return;
  const ctx = makeContext(turn, attacker, allHeroes, targets[0]);
  triggerPassives(rng, attacker, "on_attack", ctx, emit, extraTurnQueue);
  const skillResults = [];
  const _tgtEnergyMap = {};
  for (const effect of skill.effects) {
    for (const target of targets) {
      if (target.currentHP <= 0 && effect.type === "damage") continue;
      switch (effect.type) {
        case "damage": {
          const result = calculateDamage(rng, attacker, target, effect);
          if (ctx.damageMult != null && ctx.damageMult !== 1 && !result.isDodge) {
            result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult));
          }
          let killed = false;
          if (!result.isDodge) {
            target.currentHP = Math.max(0, target.currentHP - result.damage);
            attacker.totalDamageDealt += result.damage;
            killed = target.currentHP <= 0;
            if (result.reflectDamage > 0) attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage);
            if (!killed) {
              if (onBeAttackedEnergy(target) > 0) _tgtEnergyMap[target.uid] = target.energy;
              triggerPassives(rng, target, "on_be_attacked", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
              triggerPassives(rng, target, "on_take_damage", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
            }
            if (killed) {
              attacker.killCount++;
              onKillEnergy(attacker);
              triggerPassives(rng, attacker, "on_kill", makeContext(turn, attacker, allHeroes, target, true), emit, extraTurnQueue);
            }
            if (result.isCrit) triggerPassives(rng, attacker, "on_crit", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
          } else {
            triggerPassives(rng, target, "on_dodge", makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
          }
          skillResults.push({ uid: target.uid, result, killed });
          break;
        }
        case "heal": {
          const hr = calculateHeal(rng, attacker, target, effect);
          target.currentHP = Math.min(target.maxHP, target.currentHP + hr.heal);
          attacker.totalHealingDone += hr.heal;
          skillResults.push({ uid: target.uid, result: hr });
          break;
        }
        case "buff":
        case "debuff": {
          const chance = effect.statusChance ?? 1;
          if (rng() < chance && effect.status) {
            const success = applyStatus(target, {
              type: effect.status,
              value: effect.statusValue ?? 0,
              duration: effect.statusDuration ?? 2,
              maxStacks: effect.statusMaxStacks ?? 1,
              sourceHeroId: attacker.uid
            });
            if (success) {
              emit({ type: "BUFF_APPLY", targetUid: target.uid, effect: {
                type: effect.status,
                value: effect.statusValue ?? 0,
                duration: effect.statusDuration ?? 2,
                stacks: 1,
                maxStacks: effect.statusMaxStacks ?? 1,
                sourceHeroId: attacker.uid
              } });
            }
          }
          break;
        }
        case "energy":
          addEnergy(target, effect.flatValue ?? 0);
          break;
        case "dispel_debuff":
          cleanse(target, 1);
          break;
        default:
          break;
      }
    }
  }
  consumeEnergy(attacker);
  emit({ type: "SKILL_CAST", attackerUid: attacker.uid, skillId: skill.skillId, skillName: skill.name, targets: skillResults, _atkEnergyNew: attacker.energy, _tgtEnergyMap: Object.keys(_tgtEnergyMap).length ? _tgtEnergyMap : void 0 });
  for (const t of targets) checkHpBelowPassives(rng, t, turn, allHeroes, emit, extraTurnQueue);
  checkHpBelowPassives(rng, attacker, turn, allHeroes, emit, extraTurnQueue);
}
__name(executeSkill, "executeSkill");
function processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, alreadyActedUids, extraTurnQueue) {
  let count = 0;
  let found = true;
  while (found && count < 20) {
    found = false;
    const candidates = allHeroes.filter((h) => h.currentHP > 0 && canCastUltimate(h) && !alreadyActedUids[h.uid]).sort((a, b) => {
      const d = getBuffedStats(b).SPD - getBuffedStats(a).SPD;
      if (d !== 0) return d;
      return a.side === "player" ? -1 : 1;
    });
    for (const hero of candidates) {
      if (hero.currentHP <= 0 || !canCastUltimate(hero)) continue;
      const allies = hero.side === "player" ? players : enemies;
      const foes = hero.side === "player" ? enemies : players;
      executeSkill(rng, hero, hero.activeSkill, allies, foes, turn, allHeroes, emit, extraTurnQueue);
      alreadyActedUids[hero.uid] = true;
      found = true;
      count++;
      if (players.every((p) => p.currentHP <= 0) || enemies.every((e) => e.currentHP <= 0)) return;
      break;
    }
  }
}
__name(processInterruptUltimates, "processInterruptUltimates");
function processExtraTurns(rng, extraTurnQueue, extraTurnUsed, players, enemies, turn, allHeroes, emit) {
  let processed = 0;
  while (extraTurnQueue.length > 0 && processed < 10) {
    const uid = extraTurnQueue.shift();
    processed++;
    if (extraTurnUsed[uid]) continue;
    const hero = allHeroes.find((h) => h.uid === uid);
    if (!hero || hero.currentHP <= 0) continue;
    extraTurnUsed[uid] = true;
    const heroAllies = hero.side === "player" ? players : enemies;
    const heroFoes = hero.side === "player" ? enemies : players;
    emit({ type: "EXTRA_TURN", heroUid: uid, reason: "extra_turn" });
    processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
    if (players.every((p) => p.currentHP <= 0) || enemies.every((e) => e.currentHP <= 0)) return;
    if (hero.currentHP <= 0) continue;
    if (isControlled(hero) || isFeared(hero)) continue;
    executeNormalAttack(rng, hero, heroAllies, heroFoes, turn, allHeroes, emit, extraTurnQueue);
    processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
    if (players.every((p) => p.currentHP <= 0) || enemies.every((e) => e.currentHP <= 0)) return;
  }
}
__name(processExtraTurns, "processExtraTurns");
function runBattleEngine(rng, players, enemies, maxTurns = 50) {
  const actions = [];
  const allHeroes = [...players, ...enemies];
  const emit = /* @__PURE__ */ __name((a) => actions.push(a), "emit");
  for (const hero of allHeroes) {
    hero.statusEffects ??= [];
    hero.shields ??= [];
    hero.passiveUsage ??= {};
    hero.activePassives ??= hero.passives?.slice() ?? [];
    hero.totalDamageDealt ??= 0;
    hero.totalHealingDone ??= 0;
    hero.killCount ??= 0;
  }
  for (const h of allHeroes) {
    if (h.currentHP <= 0) continue;
    triggerPassives(rng, h, "always", makeContext(0, h, allHeroes), emit, []);
    triggerPassives(rng, h, "battle_start", makeContext(0, h, allHeroes), emit, []);
  }
  for (let turn = 1; turn <= maxTurns; turn++) {
    emit({ type: "TURN_START", turn });
    const alivePlayers = players.filter((p) => p.currentHP > 0);
    const aliveEnemies = enemies.filter((e) => e.currentHP > 0);
    if (!alivePlayers.length || !aliveEnemies.length) break;
    const actors = [...alivePlayers, ...aliveEnemies].sort((a, b) => {
      const d = getBuffedStats(b).SPD - getBuffedStats(a).SPD;
      if (d !== 0) return d;
      if (a.slot !== b.slot) return a.slot - b.slot;
      return a.side === "player" ? -1 : 1;
    });
    const extraTurnUsed = {};
    const extraTurnQueue = [];
    for (const actor of actors) {
      if (actor.currentHP <= 0) continue;
      const allies = actor.side === "player" ? players : enemies;
      const foes = actor.side === "player" ? enemies : players;
      const eDelta = turnStartEnergy(actor);
      if (eDelta > 0) emit({ type: "ENERGY_CHANGE", heroUid: actor.uid, delta: eDelta, newValue: actor.energy });
      const dotResults = processDotEffects(actor, allHeroes);
      for (const dr of dotResults) emit({ type: "DOT_TICK", targetUid: actor.uid, dotType: dr.type, damage: dr.damage, sourceUid: dr.sourceUid });
      if (actor.currentHP <= 0) {
        emit({ type: "DEATH", targetUid: actor.uid });
        continue;
      }
      processRegen(actor);
      triggerPassives(rng, actor, "turn_start", makeContext(turn, actor, allHeroes), emit, extraTurnQueue);
      for (const p of actor.activePassives) {
        if (p.passiveTrigger !== "every_n_turns") continue;
        const n = p.description.includes("\u6BCF 2") || p.description.includes("\u6BCF2") ? 2 : 3;
        if (turn % n === 0) {
          for (const eff of p.effects) executePassiveEffect(rng, actor, eff, makeContext(turn, actor, allHeroes), emit, extraTurnQueue);
          emit({ type: "PASSIVE_TRIGGER", heroUid: actor.uid, skillId: p.skillId, skillName: p.name });
        }
      }
      processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
      if (players.every((p) => p.currentHP <= 0) || enemies.every((e) => e.currentHP <= 0)) break;
      if (actor.currentHP <= 0) continue;
      if (isControlled(actor) || isFeared(actor)) continue;
      executeNormalAttack(rng, actor, allies, foes, turn, allHeroes, emit, extraTurnQueue);
      processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
      if (players.every((p) => p.currentHP <= 0) || enemies.every((e) => e.currentHP <= 0)) break;
      processExtraTurns(rng, extraTurnQueue, extraTurnUsed, players, enemies, turn, allHeroes, emit);
      if (players.every((p) => p.currentHP <= 0) || enemies.every((e) => e.currentHP <= 0)) break;
    }
    for (const h of allHeroes) {
      if (h.currentHP <= 0) continue;
      const expired = tickStatusDurations(h);
      for (const e of expired) emit({ type: "BUFF_EXPIRE", targetUid: h.uid, effectType: e });
      tickShieldDurations(h);
      const hpBefore = h.currentHP;
      triggerPassives(rng, h, "turn_end", makeContext(turn, h, allHeroes), emit, extraTurnQueue);
      if (hpBefore > 0 && h.currentHP <= 0) emit({ type: "DEATH", targetUid: h.uid });
    }
    emit({ type: "TURN_END", turn });
    if (players.every((p) => p.currentHP <= 0)) {
      emit({ type: "BATTLE_END", winner: "enemy" });
      return { winner: "enemy", actions };
    }
    if (enemies.every((e) => e.currentHP <= 0)) {
      emit({ type: "BATTLE_END", winner: "player" });
      return { winner: "player", actions };
    }
  }
  if (players.every((p) => p.currentHP <= 0)) {
    emit({ type: "BATTLE_END", winner: "enemy" });
    return { winner: "enemy", actions };
  }
  if (enemies.every((e) => e.currentHP <= 0)) {
    emit({ type: "BATTLE_END", winner: "player" });
    return { winner: "player", actions };
  }
  emit({ type: "BATTLE_END", winner: "draw" });
  return { winner: "draw", actions };
}
__name(runBattleEngine, "runBattleEngine");
function runBattle(players, enemies, maxTurns = 50, seed) {
  const rng = seed != null ? createSeededRng(seed) : Math.random;
  const clonedP = JSON.parse(JSON.stringify(players));
  const clonedE = JSON.parse(JSON.stringify(enemies));
  const result = runBattleEngine(rng, clonedP, clonedE, maxTurns);
  return { ...result, finalPlayers: clonedP, finalEnemies: clonedE };
}
__name(runBattle, "runBattle");

// src/routes/battle.ts
var battle = new Hono2();
var DAILY_LIMITS = {
  daily: 3,
  pvp: 5,
  boss: 3
};
function todayStr() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
__name(todayStr, "todayStr");
function parseDailyCounts(raw2) {
  const fallback = { daily: 0, pvp: 0, boss: 0, date: todayStr() };
  if (!raw2) return fallback;
  const parsed = safeJsonParse(raw2, {});
  const today = todayStr();
  if (parsed.date !== today) return { daily: 0, pvp: 0, boss: 0, date: today };
  return {
    daily: parsed.daily ?? 0,
    pvp: parsed.pvp ?? 0,
    boss: parsed.boss ?? 0,
    date: today
  };
}
__name(parseDailyCounts, "parseDailyCounts");
function checkDailyLimit(counts, mode) {
  const limit = DAILY_LIMITS[mode];
  if (!limit) return { ok: true, used: 0, limit: 0 };
  const used = counts[mode] ?? 0;
  return { ok: used < limit, used, limit };
}
__name(checkDailyLimit, "checkDailyLimit");
var DUNGEON_CLASS_ITEM = {
  power_trial: "asc_class_power",
  agility_trial: "asc_class_agility",
  defense_trial: "asc_class_defense"
};
function getDailyDungeonReward(stageId, tier) {
  const parts = stageId.split("_");
  const tierPart = parts.pop();
  const dungeonId = parts.join("_");
  const actualTier = tier || tierPart;
  const classItem = DUNGEON_CLASS_ITEM[dungeonId] ?? "asc_class_power";
  const configs = {
    easy: {
      exp: 0,
      gold: 500,
      items: [
        { itemId: classItem, quantity: 3, dropRate: 1 }
      ]
    },
    normal: {
      exp: 0,
      gold: 1e3,
      items: [
        { itemId: classItem, quantity: 6, dropRate: 1 }
      ]
    },
    hard: {
      exp: 0,
      gold: 2e3,
      items: [
        { itemId: classItem, quantity: 12, dropRate: 1 }
      ]
    }
  };
  return configs[actualTier] ?? configs["normal"];
}
__name(getDailyDungeonReward, "getDailyDungeonReward");
var BOSS_THRESHOLDS = {
  boss_1: { S: 15e3, A: 1e4, B: 5e3, C: 2e3 },
  boss_2: { S: 25e3, A: 18e3, B: 1e4, C: 4e3 },
  boss_3: { S: 4e4, A: 28e3, B: 15e3, C: 6e3 }
};
function getBossRewardByRank(bossId, rank) {
  const bossIdx = ["boss_1", "boss_2", "boss_3"].indexOf(bossId);
  const bossMult = [1, 1.5, 2][bossIdx] ?? 1;
  const table = {
    S: { exp: 600, gold: 3e3, diamond: 100, items: [{ itemId: "chest_equipment", quantity: 2 }] },
    A: { exp: 400, gold: 2e3, diamond: 50, items: [{ itemId: "chest_equipment", quantity: 1 }] },
    B: { exp: 200, gold: 1e3, diamond: 20, items: [] },
    C: { exp: 100, gold: 500, diamond: 0, items: [] }
  };
  const base = table[rank] ?? table["C"];
  return {
    exp: Math.floor(base.exp * bossMult),
    gold: Math.floor(base.gold * bossMult),
    diamond: Math.floor(base.diamond * bossMult),
    items: base.items.map((it) => ({ ...it, quantity: Math.floor(it.quantity * bossMult) || 1 }))
  };
}
__name(getBossRewardByRank, "getBossRewardByRank");
battle.post("/complete-battle", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const stageMode = body.stageMode;
  const stageId = body.stageId || "";
  const players = body.players;
  const enemies = body.enemies;
  const maxTurns = Number(body.maxTurns) || 50;
  const seed = body.seed;
  if (!stageMode) return c.json({ success: false, error: "missing stageMode" });
  if (!players || !enemies) return c.json({ success: false, error: "missing battle data" });
  const saveData = await db.prepare("SELECT * FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  const isArena = stageMode === "pvp" && stageId.startsWith("arena-");
  const dailyCounts = parseDailyCounts(saveData.dailyCounts);
  if (DAILY_LIMITS[stageMode] && !isArena) {
    const chk = checkDailyLimit(dailyCounts, stageMode);
    if (!chk.ok) {
      return c.json({
        success: false,
        error: "daily_limit_exceeded",
        dailyCounts,
        used: chk.used,
        limit: chk.limit
      });
    }
  }
  const battleResult = runBattle(players, enemies, maxTurns, seed);
  const winner = battleResult.winner;
  if (winner !== "player" && stageMode !== "boss") {
    return c.json({
      success: true,
      winner,
      rewards: { gold: 0, exp: 0, diamond: 0, items: [] },
      isFirstClear: false,
      actions: battleResult.actions,
      dailyCounts
    });
  }
  const rewardItems = [];
  let rewards = { gold: 0, exp: 0, diamond: 0, items: rewardItems };
  let isFirstClear = false;
  let newStoryProgress;
  let newFloor;
  let bossRank;
  let storySettleLastCollect;
  if (stageMode === "story") {
    const parts = stageId.split("-");
    const ch = parseInt(parts[0]) || 1;
    const st = parseInt(parts[1]) || 1;
    const currentProgress = safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 });
    const newProg = (ch - 1) * 8 + st;
    const curProg = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
    isFirstClear = newProg >= curProg;
    const cfgRow = await db.prepare("SELECT rewards FROM stage_configs WHERE stageId = ?").bind(stageId).first();
    if (cfgRow) {
      const cfgRewards = safeJsonParse(cfgRow.rewards, {});
      rewards.gold = cfgRewards.gold ?? 0;
      rewards.exp = cfgRewards.exp ?? 0;
      rewards.diamond = cfgRewards.diamond ?? 0;
    } else {
      rewards.gold = 100 + ch * 50 + st * 20;
      rewards.exp = 50 + ch * 30 + st * 10;
      rewards.diamond = st === 8 ? 20 : 0;
    }
    if (newProg >= curProg) {
      let nextSt = st + 1, nextCh = ch;
      if (nextSt > 8) {
        nextCh = ch + 1;
        nextSt = 1;
      }
      newStoryProgress = { chapter: nextCh, stage: nextSt };
    }
    let offlineGoldSettle = 0;
    let offlineExpSettle = 0;
    const now = isoNow();
    if (newStoryProgress && saveData.resourceTimerLastCollect) {
      const oldStageId = saveData.resourceTimerStage || "1-1";
      const oldParts = oldStageId.split("-");
      const oldCh = parseInt(oldParts[0]) || 1;
      const oldSt = parseInt(oldParts[1]) || 1;
      const oldProgress = (oldCh - 1) * 8 + oldSt;
      const oldGoldPerH = 100 + oldProgress * 50;
      const oldExpPerH = Math.max(100, oldProgress * 50);
      const elapsed = (Date.now() - new Date(saveData.resourceTimerLastCollect).getTime()) / (3600 * 1e3);
      const hours = Math.min(24, Math.max(0, elapsed));
      offlineGoldSettle = Math.floor(oldGoldPerH * hours);
      offlineExpSettle = Math.floor(oldExpPerH * hours);
    }
    if (newStoryProgress) storySettleLastCollect = now;
    await db.prepare(
      `UPDATE save_data SET
        gold = gold + ?, diamond = diamond + ?, exp = exp + ?,
        storyProgress = COALESCE(?, storyProgress),
        resourceTimerStage = COALESCE(?, resourceTimerStage),
        resourceTimerLastCollect = COALESCE(?, resourceTimerLastCollect),
        lastSaved = ?
       WHERE playerId = ?`
    ).bind(
      rewards.gold + offlineGoldSettle,
      rewards.diamond,
      rewards.exp + offlineExpSettle,
      newStoryProgress ? JSON.stringify(newStoryProgress) : null,
      newStoryProgress ? stageId : null,
      newStoryProgress ? now : null,
      now,
      playerId
    ).run();
  } else if (stageMode === "tower") {
    const floor = Number(stageId) || 1;
    const currentFloor = saveData.towerFloor || 0;
    if (floor > currentFloor + 1) {
      return c.json({ success: false, error: `wrong_floor: expected ${currentFloor + 1} got ${floor}` });
    }
    const isBoss = floor % 10 === 0;
    rewards.gold = 100 + floor * 20;
    rewards.exp = 50 + floor * 10;
    rewards.diamond = isBoss ? 50 : 0;
    if (isBoss) {
      rewards.items.push({ itemId: "chest_equipment", quantity: 1 });
    } else if (floor % 5 === 0) {
      if (Math.random() < 0.5) rewards.exp += 500;
    }
    newFloor = floor + 1;
    const grantList = [
      { itemId: "gold", quantity: rewards.gold },
      { itemId: "diamond", quantity: rewards.diamond },
      { itemId: "exp", quantity: rewards.exp },
      ...rewards.items
    ];
    const stmts = grantRewardsStmts(db, playerId, grantList);
    stmts.push(
      db.prepare("UPDATE save_data SET towerFloor = ?, lastSaved = ? WHERE playerId = ?").bind(floor + 1, isoNow(), playerId)
    );
    await db.batch(stmts);
  } else if (stageMode === "pvp") {
    const isArena2 = stageId.startsWith("arena-");
    if (!isArena2) {
      const sp = safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 });
      const progress = (sp.chapter - 1) * 8 + sp.stage;
      const diffIdx = parseInt(stageId.split("_").pop() ?? "0") || 0;
      const diffMult = [1, 1.5, 2][diffIdx] ?? 1;
      rewards.gold = Math.floor((200 + progress * 40) * diffMult);
      rewards.exp = Math.floor((80 + progress * 10) * diffMult);
      rewards.diamond = Math.floor(10 * diffMult);
      const pvpCoinQty = Math.floor((3 + Math.floor(progress / 4)) * diffMult);
      rewards.items.push({ itemId: "pvp_coin", quantity: pvpCoinQty });
      const grantList = [
        { itemId: "gold", quantity: rewards.gold },
        { itemId: "diamond", quantity: rewards.diamond },
        { itemId: "exp", quantity: rewards.exp },
        { itemId: "pvp_coin", quantity: pvpCoinQty }
      ];
      const stmts = grantRewardsStmts(db, playerId, grantList);
      dailyCounts.pvp += 1;
      stmts.push(
        db.prepare("UPDATE save_data SET dailyCounts = ?, lastSaved = ? WHERE playerId = ?").bind(JSON.stringify(dailyCounts), isoNow(), playerId)
      );
      await db.batch(stmts);
    } else {
    }
  } else if (stageMode === "boss") {
    const totalDamage = (battleResult.finalPlayers ?? []).reduce((sum, h) => sum + (h.totalDamageDealt ?? 0), 0);
    const thresholds = BOSS_THRESHOLDS[stageId];
    let rank = "C";
    if (thresholds) {
      if (totalDamage >= thresholds.S) rank = "S";
      else if (totalDamage >= thresholds.A) rank = "A";
      else if (totalDamage >= thresholds.B) rank = "B";
    }
    bossRank = rank;
    const bossReward = getBossRewardByRank(stageId, rank);
    rewards.gold = bossReward.gold;
    rewards.exp = bossReward.exp;
    rewards.diamond = bossReward.diamond;
    rewards.items = bossReward.items;
    dailyCounts.boss += 1;
    const grantList = [
      { itemId: "gold", quantity: rewards.gold },
      { itemId: "diamond", quantity: rewards.diamond },
      { itemId: "exp", quantity: rewards.exp },
      ...bossReward.items
    ];
    const stmts = grantRewardsStmts(db, playerId, grantList);
    stmts.push(
      db.prepare("UPDATE save_data SET dailyCounts = ?, lastSaved = ? WHERE playerId = ?").bind(JSON.stringify(dailyCounts), isoNow(), playerId)
    );
    await db.batch(stmts);
  } else if (stageMode === "daily") {
    const tier = body.dungeonTier || "normal";
    const dungeonReward = getDailyDungeonReward(stageId, tier);
    rewards.gold = dungeonReward.gold;
    rewards.exp = dungeonReward.exp;
    for (const item of dungeonReward.items) {
      if (item.dropRate >= 1 || Math.random() < item.dropRate) {
        rewards.items.push({ itemId: item.itemId, quantity: item.quantity });
      }
    }
    dailyCounts.daily += 1;
    const grantList = [
      { itemId: "gold", quantity: rewards.gold },
      { itemId: "exp", quantity: rewards.exp },
      ...rewards.items
    ];
    const stmts = grantRewardsStmts(db, playerId, grantList);
    stmts.push(
      db.prepare("UPDATE save_data SET dailyCounts = ?, lastSaved = ? WHERE playerId = ?").bind(JSON.stringify(dailyCounts), isoNow(), playerId)
    );
    await db.batch(stmts);
  }
  const currencies = await getCurrencies(db, playerId);
  return c.json({
    success: true,
    winner,
    rewards,
    isFirstClear,
    newStoryProgress,
    newFloor,
    bossRank,
    actions: battleResult.actions,
    currencies,
    dailyCounts,
    // story 推關時伺服器已重置 lastCollect，回傳給前端同步
    ...newStoryProgress ? { resourceTimerLastCollect: storySettleLastCollect } : {}
  });
});
battle.post("/complete-stage", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const stageId = body.stageId;
  if (!stageId) return c.json({ success: false, error: "missing stageId" });
  const saveData = await db.prepare("SELECT * FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  const parts = stageId.split("-");
  const ch = parseInt(parts[0]) || 1;
  const st = parseInt(parts[1]) || 1;
  const currentProgress = safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 });
  const newProg = (ch - 1) * 8 + st;
  const curProg = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
  const isFirstClear = newProg >= curProg;
  const rewards = { gold: 0, exp: 0, diamond: 0 };
  const cfgRow = await db.prepare("SELECT rewards FROM stage_configs WHERE stageId = ?").bind(stageId).first();
  if (cfgRow) {
    const cfgRewards = safeJsonParse(cfgRow.rewards, {});
    rewards.gold = cfgRewards.gold ?? 0;
    rewards.exp = cfgRewards.exp ?? 0;
    rewards.diamond = cfgRewards.diamond ?? 0;
  } else {
    rewards.gold = 100 + ch * 50 + st * 20;
    rewards.exp = 50 + ch * 30 + st * 10;
    rewards.diamond = st === 8 ? 20 : 0;
  }
  let newStoryProgress2;
  if (newProg >= curProg) {
    let nextSt = st + 1, nextCh = ch;
    if (nextSt > 8) {
      nextCh++;
      nextSt = 1;
    }
    newStoryProgress2 = { chapter: nextCh, stage: nextSt };
  }
  let offlineGoldSettle2 = 0;
  let offlineExpSettle2 = 0;
  const now2 = isoNow();
  if (newStoryProgress2 && saveData.resourceTimerLastCollect) {
    const oldStageId = saveData.resourceTimerStage || "1-1";
    const oldParts = oldStageId.split("-");
    const oldCh2 = parseInt(oldParts[0]) || 1;
    const oldSt2 = parseInt(oldParts[1]) || 1;
    const oldProgress = (oldCh2 - 1) * 8 + oldSt2;
    const oldGoldPerH = 100 + oldProgress * 50;
    const oldExpPerH = Math.max(100, oldProgress * 50);
    const elapsed = (Date.now() - new Date(saveData.resourceTimerLastCollect).getTime()) / (3600 * 1e3);
    const hours = Math.min(24, Math.max(0, elapsed));
    offlineGoldSettle2 = Math.floor(oldGoldPerH * hours);
    offlineExpSettle2 = Math.floor(oldExpPerH * hours);
  }
  await db.prepare(
    `UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?,
     storyProgress = COALESCE(?, storyProgress), resourceTimerStage = COALESCE(?, resourceTimerStage),
     resourceTimerLastCollect = COALESCE(?, resourceTimerLastCollect),
     lastSaved = ? WHERE playerId = ?`
  ).bind(
    rewards.gold + offlineGoldSettle2,
    rewards.diamond,
    (rewards.exp ?? 0) + offlineExpSettle2,
    newStoryProgress2 ? JSON.stringify(newStoryProgress2) : null,
    newStoryProgress2 ? stageId : null,
    newStoryProgress2 ? now2 : null,
    now2,
    playerId
  ).run();
  return c.json({
    success: true,
    rewards,
    isFirstClear,
    newStoryProgress: newStoryProgress2,
    // story 推關時伺服器已重置 lastCollect，回傳給前端同步
    ...newStoryProgress2 ? { resourceTimerLastCollect: now2 } : {}
  });
});
battle.post("/complete-tower", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const floor = Number(body.floor);
  if (!floor || floor < 1) return c.json({ success: false, error: "invalid floor" });
  const saveData = await c.env.DB.prepare("SELECT towerFloor FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  if (floor > (saveData.towerFloor || 0) + 1) {
    return c.json({ success: false, error: "wrong_floor" });
  }
  const isBoss = floor % 10 === 0;
  const rewards = {
    gold: 100 + floor * 20,
    diamond: isBoss ? 50 : 0,
    exp: 50 + floor * 10
  };
  await c.env.DB.prepare(
    "UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?, towerFloor = ?, lastSaved = ? WHERE playerId = ?"
  ).bind(rewards.gold, rewards.diamond, rewards.exp, floor + 1, isoNow(), playerId).run();
  return c.json({ success: true, rewards, newFloor: floor + 1 });
});
battle.post("/complete-daily", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const tier = body.tier || "normal";
  const tierMult = { easy: 1, normal: 1.5, hard: 2 };
  const mult = tierMult[tier] ?? 1;
  const rewards = { gold: Math.floor(500 * mult), exp: Math.floor(200 * mult) };
  await c.env.DB.prepare(
    "UPDATE save_data SET gold = gold + ?, exp = exp + ?, lastSaved = ? WHERE playerId = ?"
  ).bind(rewards.gold, rewards.exp, isoNow(), playerId).run();
  return c.json({ success: true, rewards });
});
var ZOMBIE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = s * 1103515245 + 12345 & 2147483647;
    return s / 2147483647;
  };
}
__name(seededRandom, "seededRandom");
battle.post("/pvp-opponents", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const saveData = await db.prepare("SELECT storyProgress FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  const sp = safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 });
  const progress = (sp.chapter - 1) * 8 + sp.stage;
  const today = /* @__PURE__ */ new Date();
  const daySeed = today.getUTCFullYear() * 1e4 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
  const rng = seededRandom(daySeed + progress * 7);
  const names = ["\u6697\u5F71\u7375\u4EBA", "\u672B\u65E5\u884C\u8005", "\u8150\u8755\u4E4B\u738B", "\u6BAD\u5C4D\u9818\u4E3B", "\u761F\u75AB\u4F7F\u8005", "\u6DF1\u6DF5\u5B88\u671B\u8005"];
  const opponents = [];
  for (let i = 0; i < 3; i++) {
    const enemyCount = Math.min(6, 3 + Math.floor(progress / 6) + i);
    const hpMult = 1 + progress * 0.1 + i * 0.3;
    const atkMult = 1 + progress * 0.06 + i * 0.2;
    const spdMult = 1 + progress * 0.01;
    const enemies = [];
    for (let j = 0; j < enemyCount; j++) {
      enemies.push({
        heroId: ZOMBIE_IDS[Math.floor(rng() * ZOMBIE_IDS.length)],
        slot: j,
        levelMultiplier: 1,
        hpMultiplier: hpMult,
        atkMultiplier: atkMult,
        speedMultiplier: spdMult
      });
    }
    const nameIdx = Math.floor(rng() * names.length);
    const power = Math.floor((hpMult + atkMult) * 1e3 + enemyCount * 500);
    opponents.push({
      opponentId: `pvp_${i}`,
      name: names[nameIdx],
      power,
      enemies
    });
  }
  return c.json({ success: true, opponents });
});
battle.post("/daily-counts", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const row = await db.prepare("SELECT dailyCounts FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!row) return c.json({ success: false, error: "save_not_found" });
  const counts = parseDailyCounts(row.dailyCounts);
  return c.json({ success: true, dailyCounts: counts, limits: DAILY_LIMITS });
});
battle.post("/run-battle", async (c) => {
  const body = await c.req.json();
  if (!body.players?.length || !body.enemies?.length) {
    return c.json({ success: false, error: "players and enemies arrays are required" });
  }
  const result = runBattle(body.players, body.enemies, body.maxTurns, body.seed);
  return c.json({ success: true, winner: result.winner, actions: result.actions });
});
var battle_default = battle;

// src/routes/gacha.ts
var gacha = new Hono2();
var RATE_SSR = 0.015;
var RATE_SR = 0.1;
var RATE_R = 0.35;
var HERO_SINGLE_DIAMOND = 160;
var EQUIP_DIAMOND_SINGLE = 200;
var EQUIP_DIAMOND_TEN = 2e3;
function getTaipeiDateStr() {
  const now = /* @__PURE__ */ new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 6e4;
  const taipei = new Date(utc + 8 * 36e5);
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, "0");
  const d = String(taipei.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
__name(getTaipeiDateStr, "getTaipeiDateStr");
async function getItemQuantity(db, playerId, itemId) {
  const row = await db.prepare("SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?").bind(playerId, itemId).first();
  return row?.quantity ?? 0;
}
__name(getItemQuantity, "getItemQuantity");
function generateGachaEntries(heroPool, startPity, count) {
  const entries = [];
  let pullsSinceSSR = startPity.pullsSinceLastSSR || 0;
  let guaranteedFeatured = startPity.guaranteedFeatured || false;
  for (let i = 0; i < count; i++) {
    let effectiveSSR = RATE_SSR;
    if (pullsSinceSSR + 1 >= 90) effectiveSSR = 1;
    else if (pullsSinceSSR + 1 >= 75) effectiveSSR = RATE_SSR + (pullsSinceSSR + 1 - 75) * 0.05;
    const roll = Math.random();
    let rarity;
    if (roll < effectiveSSR) rarity = "SSR";
    else if (roll < effectiveSSR + RATE_SR) rarity = "SR";
    else if (roll < effectiveSSR + RATE_SR + RATE_R) rarity = "R";
    else rarity = "N";
    const candidates = heroPool.filter((hp) => hp.rarity === rarity);
    const pool = candidates.length > 0 ? candidates : heroPool;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    const isFeatured = false;
    if (rarity === "SSR") {
      pullsSinceSSR = 0;
      guaranteedFeatured = !isFeatured;
    } else {
      pullsSinceSSR++;
    }
    entries.push({ h: selected.heroId, r: rarity, f: isFeatured });
  }
  return { entries, endPity: { pullsSinceLastSSR: pullsSinceSSR, guaranteedFeatured } };
}
__name(generateGachaEntries, "generateGachaEntries");
var upsertItemInternal = upsertItemStmt;
gacha.post("/gacha-pull", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const count = Number(body.count) || 1;
  if (![1, 10, 100].includes(count)) return c.json({ success: false, error: "invalid_count" });
  const isFree = body.isFree === true;
  const saveData = await db.prepare("SELECT diamond, gachaPity, lastHeroFreePull FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  let diamondCost = 0;
  let ticketsUsed = 0;
  let freePullUsed = false;
  if (isFree && count === 1) {
    const today = getTaipeiDateStr();
    const lastFree = saveData.lastHeroFreePull || "";
    if (lastFree === today) return c.json({ success: false, error: "free_pull_already_used" });
    freePullUsed = true;
  } else {
    const tickets = await getItemQuantity(db, playerId, "gacha_ticket_hero");
    if (count === 1) {
      if (tickets >= 1) {
        ticketsUsed = 1;
      } else {
        diamondCost = HERO_SINGLE_DIAMOND;
      }
    } else {
      const use = Math.min(tickets, count);
      ticketsUsed = use;
      const remaining = count - use;
      const bulkCost = count * HERO_SINGLE_DIAMOND;
      diamondCost = remaining > 0 ? remaining === count ? bulkCost : remaining * HERO_SINGLE_DIAMOND : 0;
    }
    if (diamondCost > 0 && (saveData.diamond || 0) < diamondCost) {
      return c.json({ success: false, error: "insufficient_diamond" });
    }
  }
  const pityState = safeJsonParse(saveData.gachaPity, { pullsSinceLastSSR: 0, guaranteedFeatured: false });
  const heroPoolRows = await db.prepare("SELECT heroId, rarity FROM heroes").all();
  const heroPool = heroPoolRows.results || [];
  if (heroPool.length === 0) return c.json({ success: false, error: "no_heroes_in_pool" });
  const gen = generateGachaEntries(heroPool, pityState, count);
  const heroInstRows = await db.prepare("SELECT heroId FROM hero_instances WHERE playerId = ?").bind(playerId).all();
  const ownedSet = new Set((heroInstRows.results || []).map((h) => h.heroId));
  const heroRarityMap = new Map(heroPool.map((h) => [h.heroId, h.rarity]));
  const results = [];
  const newHeroes = [];
  const writeStmts = [];
  for (let p = 0; p < gen.entries.length; p++) {
    const entry = gen.entries[p];
    const heroId = entry.h;
    const rarity = entry.r;
    const isFeatured = entry.f || false;
    const isNew = !ownedSet.has(heroId);
    let stardust = 0;
    let fragments = 0;
    if (isNew) {
      const instId = `${playerId}_${heroId}_${Date.now()}_${p}`;
      writeStmts.push(db.prepare(
        `INSERT INTO hero_instances (playerId, instanceId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
         VALUES (?, ?, ?, 1, 0, 0, '{}', ?, 0)`
      ).bind(playerId, instId, heroId, isoNow()));
      ownedSet.add(heroId);
      newHeroes.push({ heroId, instanceId: instId });
    } else {
      const dustMap = { SSR: 25, SR: 5, R: 1, N: 1 };
      const fragMap = { N: 5, R: 5, SR: 15, SSR: 40 };
      const heroRar = heroRarityMap.get(heroId) || "N";
      stardust = dustMap[rarity] || 0;
      fragments = fragMap[heroRar] || 5;
      if (stardust > 0) writeStmts.push(upsertItemInternal(db, playerId, "currency_stardust", stardust));
      if (fragments > 0) writeStmts.push(upsertItemInternal(db, playerId, `asc_fragment_${heroId}`, fragments));
    }
    results.push({ heroId, rarity, isNew, isFeatured, stardust, fragments });
  }
  const newPityState = gen.endPity;
  if (diamondCost > 0) {
    writeStmts.push(db.prepare(
      `UPDATE save_data SET diamond = diamond - ?, gachaPity = ?, lastSaved = ? WHERE playerId = ?`
    ).bind(diamondCost, JSON.stringify(newPityState), isoNow(), playerId));
  } else {
    writeStmts.push(db.prepare(
      `UPDATE save_data SET gachaPity = ?, lastSaved = ? WHERE playerId = ?`
    ).bind(JSON.stringify(newPityState), isoNow(), playerId));
  }
  if (ticketsUsed > 0) {
    writeStmts.push(upsertItemInternal(db, playerId, "gacha_ticket_hero", -ticketsUsed));
  }
  if (freePullUsed) {
    writeStmts.push(db.prepare(
      `UPDATE save_data SET lastHeroFreePull = ? WHERE playerId = ?`
    ).bind(getTaipeiDateStr(), playerId));
  }
  await db.batch(writeStmts);
  const currencies = await getCurrencies(db, playerId);
  return c.json({
    success: true,
    results,
    diamondCost,
    ticketsUsed,
    freePullUsed,
    newPityState,
    currencies,
    newHeroes
  });
});
gacha.post("/reset-gacha-pool", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const cleanPity = { pullsSinceLastSSR: 0, guaranteedFeatured: false };
  await db.prepare(
    `UPDATE save_data SET gachaPity = ?, lastSaved = ? WHERE playerId = ?`
  ).bind(JSON.stringify(cleanPity), isoNow(), playerId).run();
  return c.json({ success: true, pityReset: true, startPity: cleanPity });
});
gacha.post("/equip-gacha-pull", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const count = Number(body.count) || 1;
  if (![1, 10, 100].includes(count)) return c.json({ success: false, error: "invalid_count" });
  const poolType = body.poolType;
  if (poolType !== "gold" && poolType !== "diamond") return c.json({ success: false, error: "invalid_pool_type" });
  const isFree = body.isFree === true;
  const saveData = await db.prepare("SELECT gold, diamond, lastEquipFreePull FROM save_data WHERE playerId = ?").bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  let cost;
  let currencyField;
  let ticketsUsed = 0;
  let freePullUsed = false;
  if (isFree && count === 1 && poolType === "diamond") {
    const today = getTaipeiDateStr();
    const lastFree = saveData.lastEquipFreePull || "";
    if (lastFree === today) return c.json({ success: false, error: "free_pull_already_used" });
    freePullUsed = true;
    cost = 0;
    currencyField = "diamond";
  } else if (poolType === "gold") {
    cost = count === 100 ? 9e5 : count === 10 ? 9e4 : 1e4;
    currencyField = "gold";
    if ((saveData.gold || 0) < cost) return c.json({ success: false, error: "insufficient_gold" });
  } else {
    const tickets = await getItemQuantity(db, playerId, "gacha_ticket_equip");
    currencyField = "diamond";
    if (count === 1) {
      if (tickets >= 1) {
        ticketsUsed = 1;
        cost = 0;
      } else {
        cost = EQUIP_DIAMOND_SINGLE;
      }
    } else {
      const use = Math.min(tickets, count);
      ticketsUsed = use;
      const remaining = count - use;
      const bulkCost = count === 100 ? 2e4 : EQUIP_DIAMOND_TEN;
      cost = remaining > 0 ? remaining === count ? bulkCost : remaining * EQUIP_DIAMOND_SINGLE : 0;
    }
    if (cost > 0 && (saveData.diamond || 0) < cost) {
      return c.json({ success: false, error: "insufficient_diamond" });
    }
  }
  const eqStmts = [];
  if (cost > 0) {
    eqStmts.push(db.prepare(
      `UPDATE save_data SET ${currencyField} = ${currencyField} - ?, lastSaved = ? WHERE playerId = ?`
    ).bind(cost, isoNow(), playerId));
  } else {
    eqStmts.push(db.prepare(
      `UPDATE save_data SET lastSaved = ? WHERE playerId = ?`
    ).bind(isoNow(), playerId));
  }
  if (ticketsUsed > 0) {
    eqStmts.push(upsertItemStmt(db, playerId, "gacha_ticket_equip", -ticketsUsed));
  }
  if (freePullUsed) {
    eqStmts.push(db.prepare(
      `UPDATE save_data SET lastEquipFreePull = ? WHERE playerId = ?`
    ).bind(getTaipeiDateStr(), playerId));
  }
  const rawEquip = body.equipment;
  const newEquips = Array.isArray(rawEquip) ? rawEquip : typeof rawEquip === "string" ? (() => {
    try {
      return JSON.parse(rawEquip);
    } catch {
      return [];
    }
  })() : [];
  for (const eq of newEquips) {
    eqStmts.push(db.prepare(
      `INSERT OR IGNORE INTO equipment_instances
       (playerId, equipId, templateId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy, locked, obtainedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      playerId,
      eq.equipId || `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eq.templateId || "",
      eq.setId || "",
      eq.slot || "",
      eq.rarity || "N",
      eq.mainStat || "",
      eq.mainStatValue ?? eq.mainValue ?? 0,
      eq.enhanceLevel ?? eq.level ?? 0,
      JSON.stringify(eq.subStats || []),
      "",
      eq.locked ? 1 : 0,
      isoNow()
    ));
  }
  await db.batch(eqStmts);
  const currencies = await getCurrencies(db, playerId);
  return c.json({
    success: true,
    poolType,
    count: newEquips.length,
    currencyCost: cost,
    ticketsUsed,
    freePullUsed,
    currencies
  });
});
var gacha_default = gacha;

// src/routes/arena.ts
var arena = new Hono2();
var ARENA_MAX_RANK = 500;
var ARENA_DAILY_REFRESHES = 5;
var ARENA_OPPONENT_COUNT = 10;
var NPC_PREFIXES = ["\u6697\u5F71", "\u672B\u65E5", "\u9435\u8840", "\u8352\u91CE", "\u5E7D\u9748", "\u72C2\u66B4", "\u51B0\u971C", "\u70C8\u7130", "\u93FD\u8755", "\u9ECE\u660E", "\u8840\u6708", "\u8FF7\u9727"];
var NPC_SUFFIXES = ["\u7375\u4EBA", "\u5016\u5B58\u8005", "\u6230\u58EB", "\u6307\u63EE\u5B98", "\u8B77\u885B", "\u904A\u8569\u8005", "\u6F5B\u4F0F\u8005", "\u6536\u5272\u8005", "\u5B88\u671B\u8005", "\u6D41\u6D6A\u8005"];
var MILESTONES = [
  { rank: 400, diamond: 20, gold: 5e3, pvpCoin: 10, exp: 200 },
  { rank: 300, diamond: 30, gold: 1e4, pvpCoin: 20, exp: 400 },
  { rank: 200, diamond: 50, gold: 2e4, pvpCoin: 30, exp: 600 },
  { rank: 100, diamond: 100, gold: 5e4, pvpCoin: 50, exp: 1e3 },
  { rank: 50, diamond: 150, gold: 8e4, pvpCoin: 80, exp: 1500 },
  { rank: 20, diamond: 200, gold: 1e5, pvpCoin: 100, exp: 2e3 },
  { rank: 10, diamond: 300, gold: 15e4, pvpCoin: 150, exp: 3e3 },
  { rank: 1, diamond: 500, gold: 3e5, pvpCoin: 300, exp: 5e3 }
];
var CP_W = { HP: 0.5, ATK: 3, DEF: 2.5, SPD: 8, CritRate: 5, CritDmg: 2 };
var RARITY_NUM = { N: 1, R: 2, SR: 3, SSR: 4 };
var RARITY_GROWTH = { 1: 0.03, 2: 0.035, 3: 0.04, 4: 0.05 };
var ASC_MULT = {
  1: { 0: 1, 1: 1.03, 2: 1.06, 3: 1.09, 4: 1.12, 5: 1.18 },
  2: { 0: 1, 1: 1.04, 2: 1.08, 3: 1.12, 4: 1.16, 5: 1.24 },
  3: { 0: 1, 1: 1.05, 2: 1.1, 3: 1.15, 4: 1.2, 5: 1.3 },
  4: { 0: 1, 1: 1.07, 2: 1.14, 3: 1.22, 4: 1.3, 5: 1.42 }
};
var STAR_MUL = {
  1: { 0: 0.9, 1: 1, 2: 1.03, 3: 1.06, 4: 1.09, 5: 1.13, 6: 1.18 },
  2: { 0: 0.9, 1: 1, 2: 1.04, 3: 1.08, 4: 1.12, 5: 1.17, 6: 1.24 },
  3: { 0: 0.9, 1: 1, 2: 1.05, 3: 1.1, 4: 1.15, 5: 1.2, 6: 1.3 },
  4: { 0: 0.9, 1: 1, 2: 1.07, 3: 1.14, 4: 1.22, 5: 1.3, 6: 1.42 }
};
var STAR_PASSIVE = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4 };
var ULT_BASE = 100;
var PASSIVE_EACH = 50;
var SET2_POWER = 80;
var SET4_POWER = 200;
var EQ_ENHANCE = { N: 0.06, R: 0.08, SR: 0.1, SSR: 0.12 };
var EQ_SETS = [
  { setId: "berserker", req: 2, bonusType: "ATK_percent", bonusValue: 15 },
  { setId: "ironwall", req: 2, bonusType: "DEF_percent", bonusValue: 20 },
  { setId: "gale", req: 2, bonusType: "SPD_flat", bonusValue: 15 },
  { setId: "vampire", req: 2, bonusType: "lifesteal", bonusValue: 12 },
  { setId: "critical", req: 2, bonusType: "CritRate_percent", bonusValue: 12 },
  { setId: "lethal", req: 2, bonusType: "CritDmg_percent", bonusValue: 25 },
  { setId: "vitality", req: 2, bonusType: "HP_percent", bonusValue: 20 },
  { setId: "counter", req: 2, bonusType: "counter", bonusValue: 20 },
  { setId: "berserker", req: 4, bonusType: "CritDmg_percent", bonusValue: 20 },
  { setId: "ironwall", req: 4, bonusType: "HP_percent", bonusValue: 15 },
  { setId: "gale", req: 4, bonusType: "ATK_percent", bonusValue: 10 },
  { setId: "vampire", req: 4, bonusType: "lifesteal", bonusValue: 8 },
  { setId: "critical", req: 4, bonusType: "CritDmg_percent", bonusValue: 20 },
  { setId: "lethal", req: 4, bonusType: "ATK_percent", bonusValue: 15 },
  { setId: "vitality", req: 4, bonusType: "DEF_percent", bonusValue: 15 },
  { setId: "counter", req: 4, bonusType: "counter", bonusValue: 15 }
];
function cpAddFlat(s, stat, v) {
  if (stat === "HP") s.HP += v;
  else if (stat === "ATK") s.ATK += v;
  else if (stat === "DEF") s.DEF += v;
  else if (stat === "SPD") s.SPD += v;
  else if (stat === "CritRate") s.CritRate += v;
  else if (stat === "CritDmg") s.CritDmg += v;
}
__name(cpAddFlat, "cpAddFlat");
function cpApplyPct(s, stat, pct) {
  const m = pct / 100;
  if (stat === "HP") s.HP = Math.floor(s.HP * (1 + m));
  else if (stat === "ATK") s.ATK = Math.floor(s.ATK * (1 + m));
  else if (stat === "DEF") s.DEF = Math.floor(s.DEF * (1 + m));
  else if (stat === "SPD") s.SPD = Math.floor(s.SPD * (1 + m));
  else if (stat === "CritRate") s.CritRate = Math.floor(s.CritRate * (1 + m));
  else if (stat === "CritDmg") s.CritDmg = Math.floor(s.CritDmg * (1 + m));
}
__name(cpApplyPct, "cpApplyPct");
async function calcDefensePower(db, playerId, formArr) {
  const validIds = formArr.filter((id) => !!id);
  if (validIds.length === 0) return 0;
  const heroIdNums = validIds.map(Number);
  const instRows = await db.prepare(
    `SELECT instanceId, heroId, level, ascension, stars FROM hero_instances WHERE playerId = ? AND heroId IN (${heroIdNums.map(() => "?").join(",")})`
  ).bind(playerId, ...heroIdNums).all();
  const instances = instRows.results || [];
  if (instances.length === 0) return 0;
  const instMap = /* @__PURE__ */ new Map();
  for (const inst of instances) instMap.set(inst.heroId, inst);
  const hIds = [...instMap.keys()];
  const hRows = await db.prepare(
    `SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, critRate, critDmg, rarity FROM heroes WHERE heroId IN (${hIds.map(() => "?").join(",")})`
  ).bind(...hIds).all();
  const heroMap = /* @__PURE__ */ new Map();
  for (const h of hRows.results || []) heroMap.set(h.heroId, h);
  const instanceIds = instances.map((i) => i.instanceId);
  let equipRows = [];
  if (instanceIds.length > 0) {
    const eqResult = await db.prepare(
      `SELECT equipId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy
       FROM equipment_instances WHERE playerId = ? AND equippedBy IN (${instanceIds.map(() => "?").join(",")})`
    ).bind(playerId, ...instanceIds).all();
    equipRows = eqResult.results || [];
  }
  const equipByHero = /* @__PURE__ */ new Map();
  for (const eq of equipRows) {
    const list = equipByHero.get(eq.equippedBy) || [];
    list.push(eq);
    equipByHero.set(eq.equippedBy, list);
  }
  let totalPower = 0;
  for (const heroId of heroIdNums) {
    const inst = instMap.get(heroId);
    if (!inst) continue;
    const base = heroMap.get(heroId);
    if (!base) continue;
    const rarNum = RARITY_NUM[base.rarity] ?? 3;
    const growth = RARITY_GROWTH[rarNum] ?? 0.04;
    const lvMult = 1 + (inst.level - 1) * growth;
    const ascMul = ASC_MULT[rarNum]?.[inst.ascension] ?? 1;
    const starMul = STAR_MUL[rarNum]?.[inst.stars] ?? 1;
    const s = {
      HP: Math.floor((base.baseHP || 100) * lvMult * ascMul * starMul),
      ATK: Math.floor((base.baseATK || 10) * lvMult * ascMul * starMul),
      DEF: Math.floor((base.baseDEF || 5) * lvMult * ascMul * starMul),
      SPD: base.baseSPD || 100,
      CritRate: base.critRate ?? 5,
      CritDmg: base.critDmg ?? 50
    };
    const equips = equipByHero.get(inst.instanceId) || [];
    for (const eq of equips) {
      const eRate = EQ_ENHANCE[eq.rarity] ?? 0.1;
      const mainVal = Math.floor((eq.mainStatValue || 0) * (1 + (eq.enhanceLevel || 0) * eRate));
      cpAddFlat(s, eq.mainStat, mainVal);
      let subs = [];
      try {
        subs = typeof eq.subStats === "string" ? JSON.parse(eq.subStats) : eq.subStats || [];
      } catch {
        subs = [];
      }
      for (const sub of subs) {
        if (!sub.isPercent) cpAddFlat(s, sub.stat, sub.value);
      }
    }
    const pctBon = {};
    for (const eq of equips) {
      let subs = [];
      try {
        subs = typeof eq.subStats === "string" ? JSON.parse(eq.subStats) : eq.subStats || [];
      } catch {
        subs = [];
      }
      for (const sub of subs) {
        if (sub.isPercent) {
          if (sub.stat === "CritRate" || sub.stat === "CritDmg") cpAddFlat(s, sub.stat, sub.value);
          else pctBon[sub.stat] = (pctBon[sub.stat] || 0) + sub.value;
        }
      }
    }
    const setCounts = {};
    for (const eq of equips) {
      if (eq.setId) setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1;
    }
    const actSets = [];
    for (const [sid, cnt] of Object.entries(setCounts)) {
      for (const def of EQ_SETS) {
        if (def.setId === sid && cnt >= def.req) actSets.push(def);
      }
    }
    for (const set of actSets) {
      if (set.bonusType.endsWith("_percent")) {
        const st = set.bonusType.replace("_percent", "");
        if (st === "CritRate" || st === "CritDmg") cpAddFlat(s, st, set.bonusValue);
        else pctBon[st] = (pctBon[st] || 0) + set.bonusValue;
      } else if (set.bonusType === "SPD_flat") {
        s.SPD += set.bonusValue;
      }
    }
    for (const [st, pct] of Object.entries(pctBon)) cpApplyPct(s, st, pct);
    const bp = s.HP * CP_W.HP + s.ATK * CP_W.ATK + s.DEF * CP_W.DEF + s.SPD * CP_W.SPD + s.CritRate * CP_W.CritRate + s.CritDmg * CP_W.CritDmg;
    const skB = ULT_BASE + (STAR_PASSIVE[inst.stars] ?? 0) * PASSIVE_EACH;
    let stB = 0;
    for (const a of actSets) stB += a.req >= 4 ? SET4_POWER : SET2_POWER;
    totalPower += Math.floor(bp + skB + stB);
  }
  return totalPower;
}
__name(calcDefensePower, "calcDefensePower");
function getChallengeRange(myRank) {
  if (myRank <= 5) return 5;
  if (myRank <= 20) return 15;
  if (myRank <= 100) return 50;
  return 200;
}
__name(getChallengeRange, "getChallengeRange");
async function getOpponentData(db, opponentIds) {
  if (opponentIds.length === 0) return [];
  const rows = await db.prepare(
    `SELECT playerId, rank, displayName, isNPC, power FROM arena_rankings
     WHERE playerId IN (${opponentIds.map(() => "?").join(",")}) ORDER BY rank`
  ).bind(...opponentIds).all();
  return (rows.results || []).map((r) => ({
    playerId: r.playerId,
    rank: r.rank,
    displayName: r.displayName,
    power: r.power ?? 0,
    isNPC: !!r.isNPC
  }));
}
__name(getOpponentData, "getOpponentData");
async function refreshAndStoreOpponents(db, playerId, myRank) {
  const range = getChallengeRange(myRank);
  const minRank = Math.max(1, myRank - range);
  const maxRank = myRank - 1;
  if (maxRank < minRank) return [];
  const rows = await db.prepare(
    `SELECT playerId FROM arena_rankings WHERE rank >= ? AND rank <= ? AND playerId != ?
     ORDER BY RANDOM() LIMIT ?`
  ).bind(minRank, maxRank, playerId, ARENA_OPPONENT_COUNT).all();
  const ids = (rows.results || []).map((r) => r.playerId);
  await db.prepare("UPDATE save_data SET arenaOpponents = ? WHERE playerId = ?").bind(JSON.stringify(ids), playerId).run();
  return getOpponentData(db, ids);
}
__name(refreshAndStoreOpponents, "refreshAndStoreOpponents");
async function ensureArenaInit(db) {
  const count = await db.prepare("SELECT COUNT(*) as c FROM arena_rankings").first();
  if (count && count.c >= ARENA_MAX_RANK) return;
  const now = isoNow();
  const stmts = [];
  for (let r = 1; r <= ARENA_MAX_RANK; r++) {
    const seed = r * 31337;
    const pi = seed % NPC_PREFIXES.length;
    const si = (seed * 7 + 13) % NPC_SUFFIXES.length;
    const name = NPC_PREFIXES[pi] + NPC_SUFFIXES[si];
    const power = Math.floor(500 + (ARENA_MAX_RANK - r) * 20);
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO arena_rankings (rank, playerId, displayName, isNPC, power, defenseFormation, lastUpdated)
         VALUES (?, ?, ?, 1, ?, '[]', ?)`
      ).bind(r, `npc_${r}`, name, power, now)
    );
  }
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}
__name(ensureArenaInit, "ensureArenaInit");
arena.post("/arena-get-rankings", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  await ensureArenaInit(db);
  const myRow = await db.prepare("SELECT rank, power, defenseFormation FROM arena_rankings WHERE playerId = ?").bind(playerId).first();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;
  let myPower = myRow?.power ?? 0;
  if (myRow && myRow.rank <= ARENA_MAX_RANK) {
    try {
      let formArr = [];
      try {
        formArr = JSON.parse(myRow.defenseFormation || "[]");
      } catch {
        formArr = [];
      }
      if (!formArr.some(Boolean)) {
        const saveRow = await db.prepare("SELECT formation FROM save_data WHERE playerId = ?").bind(playerId).first();
        try {
          formArr = JSON.parse(saveRow?.formation || "[]");
        } catch {
          formArr = [];
        }
      }
      if (formArr.some(Boolean)) {
        const recalced = await calcDefensePower(db, playerId, formArr);
        if (recalced > 0 && recalced !== myPower) {
          myPower = recalced;
          await db.prepare("UPDATE arena_rankings SET power = ? WHERE playerId = ?").bind(myPower, playerId).run();
        }
      }
    } catch {
    }
  }
  const topRows = await db.prepare(
    `SELECT rank, playerId, displayName, isNPC, power FROM arena_rankings
     WHERE rank <= 10 ORDER BY rank`
  ).all();
  let challengesLeft = 5;
  let highestRank = ARENA_MAX_RANK;
  let refreshesLeft = ARENA_DAILY_REFRESHES;
  let opponentIds = [];
  const saveData = await db.prepare(
    "SELECT arenaChallengesLeft, arenaHighestRank, arenaLastReset, arenaOpponents, arenaRefreshCount FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if (saveData) {
    const today = todayUTC8();
    const lastReset = (saveData.arenaLastReset || "").split("T")[0];
    if (lastReset !== today) {
      challengesLeft = 5;
      refreshesLeft = ARENA_DAILY_REFRESHES;
      await db.prepare(
        "UPDATE save_data SET arenaChallengesLeft = 5, arenaRefreshCount = 0, arenaOpponents = ?, arenaLastReset = ? WHERE playerId = ?"
      ).bind("[]", isoNow(), playerId).run();
      opponentIds = [];
    } else {
      challengesLeft = saveData.arenaChallengesLeft ?? 5;
      refreshesLeft = Math.max(0, ARENA_DAILY_REFRESHES - (saveData.arenaRefreshCount ?? 0));
      try {
        opponentIds = JSON.parse(saveData.arenaOpponents || "[]");
      } catch {
        opponentIds = [];
      }
    }
    highestRank = saveData.arenaHighestRank ?? ARENA_MAX_RANK;
  }
  let opponents;
  if (opponentIds.length === 0) {
    opponents = await refreshAndStoreOpponents(db, playerId, myRank);
  } else {
    opponents = await getOpponentData(db, opponentIds);
    opponents = opponents.filter((o) => o.rank < myRank);
  }
  return c.json({
    success: true,
    rankings: (topRows.results || []).map((r) => ({
      rank: r.rank,
      playerId: r.playerId,
      displayName: r.displayName,
      isNPC: !!r.isNPC,
      power: r.power ?? 0
    })),
    opponents,
    myRank,
    myPower,
    challengesLeft,
    highestRank,
    refreshesLeft
  });
});
arena.post("/arena-challenge-start", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const targetUserId = body.targetUserId;
  const legacyTargetRank = Number(body.targetRank);
  await ensureArenaInit(db);
  const myRow = await db.prepare("SELECT rank FROM arena_rankings WHERE playerId = ?").bind(playerId).first();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;
  let defender = null;
  let targetRank;
  if (targetUserId) {
    defender = await db.prepare(
      "SELECT rank, playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE playerId = ?"
    ).bind(targetUserId).first();
    if (!defender) return c.json({ success: false, error: "target_not_found" });
    targetRank = defender.rank;
    if (targetRank >= myRank) {
      const newOpponents = await refreshAndStoreOpponents(db, playerId, myRank);
      return c.json({
        success: false,
        error: "rank_changed",
        message: "\u5C0D\u624B\u6392\u540D\u5DF2\u8B8A\u52D5\uFF0C\u5DF2\u81EA\u52D5\u5237\u65B0\u5C0D\u624B\u6E05\u55AE",
        opponents: newOpponents
      });
    }
  } else {
    if (!legacyTargetRank || legacyTargetRank < 1) return c.json({ success: false, error: "invalid_rank" });
    defender = await db.prepare(
      "SELECT rank, playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?"
    ).bind(legacyTargetRank).first();
    targetRank = legacyTargetRank;
  }
  if (!defender) return c.json({ success: false, error: "rank_not_found" });
  let formation = [];
  try {
    formation = JSON.parse(defender.defenseFormation || "[]");
  } catch {
    formation = [];
  }
  const heroes = [];
  if (defender.isNPC) {
    const allHeroes = await db.prepare("SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, rarity FROM heroes").all();
    const heroPool = allHeroes.results || [];
    if (heroPool.length > 0) {
      const npcPower = defender.power || 500;
      const scale = Math.max(1, npcPower / 500);
      const npcCount = targetRank <= 50 ? 5 : targetRank <= 150 ? 4 : targetRank <= 300 ? 3 : 2;
      const seed = targetRank * 31337;
      for (let i = 0; i < npcCount; i++) {
        const idx = (seed + i * 7919) % heroPool.length;
        const h = heroPool[idx];
        heroes.push({
          heroId: h.heroId,
          HP: Math.floor((h.baseHP || 100) * scale),
          ATK: Math.floor((h.baseATK || 10) * scale),
          DEF: Math.floor((h.baseDEF || 5) * scale),
          Speed: h.baseSPD || 100,
          CritRate: h.critRate ?? 5,
          CritDmg: h.critDmg ?? 50,
          ModelID: h.modelId || String(h.heroId),
          slot: i
        });
      }
    }
  } else {
    const validIds = formation.filter((id) => !!id);
    if (validIds.length > 0) {
      const instances = await db.prepare(
        `SELECT instanceId, heroId, level, ascension, stars FROM hero_instances WHERE playerId = ? AND instanceId IN (${validIds.map(() => "?").join(",")})`
      ).bind(defender.playerId, ...validIds).all();
      const instMap = /* @__PURE__ */ new Map();
      for (const inst of instances.results || []) instMap.set(inst.instanceId, inst);
      const heroIds = [...new Set((instances.results || []).map((r) => r.heroId))];
      const heroMap = /* @__PURE__ */ new Map();
      if (heroIds.length > 0) {
        const heroRows = await db.prepare(
          `SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, rarity FROM heroes WHERE heroId IN (${heroIds.map(() => "?").join(",")})`
        ).bind(...heroIds).all();
        for (const h of heroRows.results || []) heroMap.set(h.heroId, h);
      }
      const instanceIds = (instances.results || []).map((r) => r.instanceId);
      let equipRows = [];
      if (instanceIds.length > 0) {
        const eqResult = await db.prepare(
          `SELECT equipId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy
           FROM equipment_instances WHERE playerId = ? AND equippedBy IN (${instanceIds.map(() => "?").join(",")})`
        ).bind(defender.playerId, ...instanceIds).all();
        equipRows = eqResult.results || [];
      }
      const equipByInst = /* @__PURE__ */ new Map();
      for (const eq of equipRows) {
        const list = equipByInst.get(eq.equippedBy) || [];
        list.push(eq);
        equipByInst.set(eq.equippedBy, list);
      }
      formation.forEach((instId, slot) => {
        if (!instId) return;
        const inst = instMap.get(instId);
        if (!inst) return;
        const base = heroMap.get(inst.heroId);
        if (!base) return;
        const rn = RARITY_NUM[base.rarity] ?? 3;
        const growth = RARITY_GROWTH[rn] ?? 0.04;
        const lvScale = 1 + (inst.level - 1) * growth;
        const ascMult = ASC_MULT[rn]?.[inst.ascension] ?? 1;
        const starMult = STAR_MUL[rn]?.[inst.stars ?? 0] ?? 1;
        const s = {
          HP: Math.floor((base.baseHP || 100) * lvScale * ascMult * starMult),
          ATK: Math.floor((base.baseATK || 10) * lvScale * ascMult * starMult),
          DEF: Math.floor((base.baseDEF || 5) * lvScale * ascMult * starMult),
          SPD: base.baseSPD || 100,
          CritRate: base.critRate ?? 5,
          CritDmg: base.critDmg ?? 50
        };
        const equips = equipByInst.get(inst.instanceId) || [];
        for (const eq of equips) {
          const eRate = EQ_ENHANCE[eq.rarity] ?? 0.1;
          const mainVal = Math.floor((eq.mainStatValue || 0) * (1 + (eq.enhanceLevel || 0) * eRate));
          cpAddFlat(s, eq.mainStat, mainVal);
          let subs = [];
          try {
            subs = typeof eq.subStats === "string" ? JSON.parse(eq.subStats) : eq.subStats || [];
          } catch {
            subs = [];
          }
          for (const sub of subs) {
            if (!sub.isPercent) cpAddFlat(s, sub.stat, sub.value);
          }
        }
        const pctBon = {};
        for (const eq of equips) {
          let subs = [];
          try {
            subs = typeof eq.subStats === "string" ? JSON.parse(eq.subStats) : eq.subStats || [];
          } catch {
            subs = [];
          }
          for (const sub of subs) {
            if (sub.isPercent) {
              if (sub.stat === "CritRate" || sub.stat === "CritDmg") cpAddFlat(s, sub.stat, sub.value);
              else pctBon[sub.stat] = (pctBon[sub.stat] || 0) + sub.value;
            }
          }
        }
        const setCounts = {};
        for (const eq of equips) {
          if (eq.setId) setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1;
        }
        const actSets = [];
        for (const [sid, cnt] of Object.entries(setCounts)) {
          for (const def of EQ_SETS) {
            if (def.setId === sid && cnt >= def.req) actSets.push(def);
          }
        }
        for (const set of actSets) {
          if (set.bonusType.endsWith("_percent")) {
            const st = set.bonusType.replace("_percent", "");
            if (st === "CritRate" || st === "CritDmg") cpAddFlat(s, st, set.bonusValue);
            else pctBon[st] = (pctBon[st] || 0) + set.bonusValue;
          } else if (set.bonusType === "SPD_flat") {
            s.SPD += set.bonusValue;
          }
        }
        for (const [st, pct] of Object.entries(pctBon)) cpApplyPct(s, st, pct);
        heroes.push({
          heroId: inst.heroId,
          HP: s.HP,
          ATK: s.ATK,
          DEF: s.DEF,
          Speed: s.SPD,
          CritRate: s.CritRate,
          CritDmg: s.CritDmg,
          ModelID: base.modelId || String(inst.heroId),
          slot,
          level: inst.level,
          stars: inst.stars || 0
        });
      });
    }
  }
  return c.json({
    success: true,
    targetRank,
    defenderData: {
      displayName: defender.displayName,
      power: defender.power || 0,
      isNPC: !!defender.isNPC,
      heroes
    }
  });
});
arena.post("/arena-challenge-complete", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const body = getBody(c);
  const targetRank = Number(body.targetRank);
  const won = body.won === true || body.won === "true";
  const displayName = body.displayName || "\u5016\u5B58\u8005";
  await ensureArenaInit(db);
  let challengerRow = await db.prepare("SELECT rank FROM arena_rankings WHERE playerId = ?").bind(playerId).first();
  if (!challengerRow) {
    const lastNpc = await db.prepare(
      "SELECT rank, playerId FROM arena_rankings WHERE isNPC = 1 ORDER BY rank DESC LIMIT 1"
    ).first();
    if (lastNpc) {
      let playerPower = 0;
      try {
        const sd = await db.prepare("SELECT formation FROM save_data WHERE playerId = ?").bind(playerId).first();
        const form = sd?.formation ? JSON.parse(sd.formation) : [];
        const validIds = form.filter((id) => !!id);
        if (validIds.length > 0) {
          const insts = await db.prepare(
            `SELECT heroId, level FROM hero_instances WHERE playerId = ? AND instanceId IN (${validIds.map(() => "?").join(",")})`
          ).bind(playerId, ...validIds).all();
          const hIds = [...new Set((insts.results || []).map((r) => r.heroId))];
          if (hIds.length > 0) {
            const hRows = await db.prepare(
              `SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, critRate, critDmg FROM heroes WHERE heroId IN (${hIds.map(() => "?").join(",")})`
            ).bind(...hIds).all();
            const hMap = /* @__PURE__ */ new Map();
            for (const h of hRows.results || []) hMap.set(h.heroId, h);
            for (const inst of insts.results || []) {
              const i = inst;
              const base = hMap.get(i.heroId);
              if (!base) continue;
              const lvScale = 1 + (i.level - 1) * 0.03;
              playerPower += Math.floor((base.baseHP || 100) * lvScale * 0.5 + (base.baseATK || 10) * lvScale * 3 + (base.baseDEF || 5) * lvScale * 2.5 + (base.baseSPD || 100) * 8 + (base.critRate || 5) * 5 + (base.critDmg || 50) * 2 + 100);
            }
          }
        }
      } catch {
      }
      await db.prepare(
        "UPDATE arena_rankings SET playerId = ?, displayName = ?, isNPC = 0, power = ?, lastUpdated = ? WHERE rank = ?"
      ).bind(playerId, displayName, playerPower, isoNow(), lastNpc.rank).run();
      challengerRow = { rank: lastNpc.rank };
    }
  }
  const challengerRank = challengerRow?.rank ?? ARENA_MAX_RANK;
  const saveData = await db.prepare(
    "SELECT arenaChallengesLeft, arenaHighestRank FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  const challengesLeft = Math.max(0, (saveData?.arenaChallengesLeft ?? 5) - 1);
  const rewards = won ? { diamond: 0, gold: 2e3, pvpCoin: 5, exp: 150 } : { diamond: 0, gold: 500, pvpCoin: 1, exp: 50 };
  let milestoneReward = null;
  let newRank = challengerRank;
  const writeStmts = [];
  const now = isoNow();
  if (won && targetRank < challengerRank) {
    newRank = targetRank;
    const defenderRow = await db.prepare(
      "SELECT playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?"
    ).bind(targetRank).first();
    const challengerRow2 = await db.prepare(
      "SELECT playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?"
    ).bind(challengerRank).first();
    if (defenderRow && challengerRow2) {
      writeStmts.push(
        db.prepare(
          "UPDATE arena_rankings SET playerId=?, displayName=?, isNPC=?, power=?, defenseFormation=?, lastUpdated=? WHERE rank=?"
        ).bind(
          challengerRow2.playerId,
          challengerRow2.displayName,
          challengerRow2.isNPC,
          challengerRow2.power,
          challengerRow2.defenseFormation,
          now,
          targetRank
        ),
        db.prepare(
          "UPDATE arena_rankings SET playerId=?, displayName=?, isNPC=?, power=?, defenseFormation=?, lastUpdated=? WHERE rank=?"
        ).bind(
          defenderRow.playerId,
          defenderRow.displayName,
          defenderRow.isNPC,
          defenderRow.power,
          defenderRow.defenseFormation,
          now,
          challengerRank
        )
      );
    }
    const prevHighest2 = saveData?.arenaHighestRank ?? ARENA_MAX_RANK;
    if (newRank < prevHighest2) {
      const acc = { diamond: 0, gold: 0, pvpCoin: 0, exp: 0 };
      let hit = false;
      for (const m of MILESTONES) {
        if (newRank <= m.rank && prevHighest2 > m.rank) {
          acc.diamond += m.diamond;
          acc.gold += m.gold;
          acc.pvpCoin += m.pvpCoin;
          acc.exp += m.exp;
          hit = true;
        }
      }
      if (hit) milestoneReward = acc;
    }
  }
  const setParts = ["arenaChallengesLeft = ?"];
  const bindVals = [challengesLeft];
  const prevHighest = saveData?.arenaHighestRank ?? ARENA_MAX_RANK;
  if (newRank < prevHighest) {
    setParts.push("arenaHighestRank = ?");
    bindVals.push(newRank);
  }
  const totalGold = rewards.gold + (milestoneReward?.gold || 0);
  const totalDiamond = rewards.diamond + (milestoneReward?.diamond || 0);
  const totalExp = rewards.exp + (milestoneReward?.exp || 0);
  if (totalGold > 0) {
    setParts.push("gold = gold + ?");
    bindVals.push(totalGold);
  }
  if (totalDiamond > 0) {
    setParts.push("diamond = diamond + ?");
    bindVals.push(totalDiamond);
  }
  if (totalExp > 0) {
    setParts.push("exp = exp + ?");
    bindVals.push(totalExp);
  }
  setParts.push("lastSaved = ?");
  bindVals.push(now);
  bindVals.push(playerId);
  writeStmts.push(
    db.prepare(`UPDATE save_data SET ${setParts.join(", ")} WHERE playerId = ?`).bind(...bindVals)
  );
  const pvpCoinTotal = rewards.pvpCoin + (milestoneReward?.pvpCoin || 0);
  if (pvpCoinTotal > 0) {
    writeStmts.push(upsertItemStmt(db, playerId, "pvp_coin", pvpCoinTotal));
  }
  await db.batch(writeStmts);
  const currencies = await getCurrencies(db, playerId);
  let opponents;
  if (won && newRank < challengerRank) {
    opponents = await refreshAndStoreOpponents(db, playerId, newRank);
  }
  return c.json({ success: true, won, newRank, challengesLeft, rewards, milestoneReward, currencies, opponents });
});
arena.post("/arena-set-defense", async (c) => {
  const playerId = c.get("playerId");
  const body = getBody(c);
  const defenseFormation = typeof body.defenseFormation === "string" ? body.defenseFormation : JSON.stringify(body.defenseFormation || []);
  const now = isoNow();
  let formArr = [];
  try {
    formArr = JSON.parse(defenseFormation);
  } catch {
    formArr = [];
  }
  const power = await calcDefensePower(c.env.DB, playerId, formArr);
  const result = await c.env.DB.prepare(
    "UPDATE arena_rankings SET defenseFormation = ?, power = ?, lastUpdated = ? WHERE playerId = ?"
  ).bind(defenseFormation, power, now, playerId).run();
  if (result.meta.changes === 0) {
    const playerRow = await c.env.DB.prepare(
      "SELECT displayName FROM players WHERE playerId = ?"
    ).bind(playerId).first();
    const dName = playerRow?.displayName || "";
    const maxRow = await c.env.DB.prepare(
      "SELECT MAX(rank) as maxRank FROM arena_rankings"
    ).first();
    const newRank = (maxRow?.maxRank ?? 500) + 1;
    await c.env.DB.prepare(
      `INSERT INTO arena_rankings (rank, playerId, displayName, isNPC, power, defenseFormation, lastUpdated)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    ).bind(newRank, playerId, dName, power, defenseFormation, now).run();
  }
  return c.json({ success: true, power });
});
arena.post("/arena-get-defense", async (c) => {
  const playerId = c.get("playerId");
  const row = await c.env.DB.prepare("SELECT defenseFormation FROM arena_rankings WHERE playerId = ?").bind(playerId).first();
  return c.json({ success: true, defenseFormation: row?.defenseFormation || "[]" });
});
arena.post("/arena-refresh-opponents", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  await ensureArenaInit(db);
  const myRow = await db.prepare("SELECT rank FROM arena_rankings WHERE playerId = ?").bind(playerId).first();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;
  const saveRow = await db.prepare(
    "SELECT arenaRefreshCount, arenaLastReset FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  let refreshCount = saveRow?.arenaRefreshCount ?? 0;
  const today = todayUTC8();
  const lastReset = (saveRow?.arenaLastReset || "").split("T")[0];
  if (lastReset !== today) refreshCount = 0;
  if (refreshCount >= ARENA_DAILY_REFRESHES) {
    return c.json({ success: false, error: "no_refreshes_left", message: "\u4ECA\u65E5\u514D\u8CBB\u5237\u65B0\u6B21\u6578\u5DF2\u7528\u5B8C" });
  }
  const opponents = await refreshAndStoreOpponents(db, playerId, myRank);
  refreshCount += 1;
  await db.prepare("UPDATE save_data SET arenaRefreshCount = ? WHERE playerId = ?").bind(refreshCount, playerId).run();
  return c.json({
    success: true,
    opponents,
    refreshesLeft: Math.max(0, ARENA_DAILY_REFRESHES - refreshCount)
  });
});
var arena_default = arena;

// src/routes/checkin.ts
var checkin = new Hono2();
var CHECKIN_REWARDS = [
  /* Day 1 */
  { gold: 5e3 },
  /* Day 2 */
  { gold: 8e3, items: [{ itemId: "exp", quantity: 500 }] },
  /* Day 3 */
  { diamond: 50, items: [{ itemId: "gacha_ticket_hero", quantity: 1 }] },
  /* Day 4 */
  { gold: 12e3, items: [{ itemId: "chest_bronze", quantity: 1 }] },
  /* Day 5 */
  { diamond: 80, items: [{ itemId: "exp", quantity: 1500 }, { itemId: "gacha_ticket_equip", quantity: 1 }] },
  /* Day 6 */
  { gold: 2e4, items: [{ itemId: "chest_silver", quantity: 1 }, { itemId: "gacha_ticket_hero", quantity: 1 }] },
  /* Day 7 */
  { diamond: 200, items: [{ itemId: "chest_gold", quantity: 1 }, { itemId: "gacha_ticket_hero", quantity: 2 }, { itemId: "gacha_ticket_equip", quantity: 2 }] }
];
checkin.post("/daily-checkin", async (c) => {
  const playerId = c.get("playerId");
  const db = c.env.DB;
  const saveData = await db.prepare(
    "SELECT checkinDay, checkinLastDate, gold, diamond FROM save_data WHERE playerId = ?"
  ).bind(playerId).first();
  if (!saveData) return c.json({ success: false, error: "save_not_found" });
  const today = todayUTC8();
  const checkinDay = saveData.checkinDay || 0;
  const lastDate = saveData.checkinLastDate || "";
  if (lastDate === today) {
    return c.json({ success: false, error: "already_checked_in", checkinDay, checkinLastDate: lastDate });
  }
  const yesterdayDate = new Date(Date.now() - 864e5);
  const utc8offset = 8 * 60 * 60 * 1e3;
  const yd = new Date(Date.now() - 864e5 + utc8offset);
  const yesterdayStr = `${yd.getUTCFullYear()}-${String(yd.getUTCMonth() + 1).padStart(2, "0")}-${String(yd.getUTCDate()).padStart(2, "0")}`;
  let newDay;
  if (lastDate === yesterdayStr && checkinDay < 7) {
    newDay = checkinDay + 1;
  } else if (checkinDay >= 7) {
    newDay = 1;
  } else {
    newDay = 1;
  }
  const reward = CHECKIN_REWARDS[newDay - 1];
  const goldGain = reward.gold || 0;
  const diamondGain = reward.diamond || 0;
  const rewardItems = reward.items || [];
  const stmts = [
    db.prepare(
      `UPDATE save_data SET
        gold = gold + ?, diamond = diamond + ?,
        checkinDay = ?, checkinLastDate = ?, lastSaved = ?
       WHERE playerId = ?`
    ).bind(goldGain, diamondGain, newDay, today, isoNow(), playerId)
  ];
  for (const item of rewardItems) {
    stmts.push(upsertItemStmt(db, playerId, item.itemId, item.quantity));
  }
  await db.batch(stmts);
  const currencies = await getCurrencies(db, playerId);
  return c.json({
    success: true,
    checkinDay: newDay,
    checkinLastDate: today,
    reward: { gold: goldGain, diamond: diamondGain, items: rewardItems },
    currencies
  });
});
var checkin_default = checkin;

// src/routes/data.ts
var data = new Hono2();
async function readHeroes(db) {
  const rows = await db.prepare(`
    SELECT heroId AS HeroID, modelId AS ModelID, name AS Name, type AS Type,
           rarity AS Rarity, baseHP AS HP, baseATK AS ATK, baseDEF AS DEF,
           baseSPD AS Speed, critRate AS CritRate, critDmg AS CritDmg,
           description AS Description
    FROM heroes ORDER BY heroId
  `).all();
  return rows.results ?? [];
}
__name(readHeroes, "readHeroes");
async function readSkillTemplates(db) {
  const rows = await db.prepare(`
    SELECT skillId, name, type, target, description,
           effects, passive_trigger, icon
    FROM skill_templates ORDER BY skillId
  `).all();
  return rows.results ?? [];
}
__name(readSkillTemplates, "readSkillTemplates");
async function readHeroSkills(db) {
  const rows = await db.prepare(`
    SELECT heroId, activeSkillId, passive1_skillId, passive2_skillId,
           passive3_skillId, passive4_skillId
    FROM hero_skills ORDER BY heroId
  `).all();
  return rows.results ?? [];
}
__name(readHeroSkills, "readHeroSkills");
var DEDICATED_READERS = {
  heroes: readHeroes,
  skill_templates: readSkillTemplates,
  hero_skills: readHeroSkills
};
data.post("/readSheet", async (c) => {
  const { sheet } = getBody(c);
  if (!sheet) {
    return c.json({ success: false, error: "missing_sheet_name" }, 400);
  }
  const db = c.env.DB;
  const reader = DEDICATED_READERS[sheet];
  if (reader) {
    const rows = await reader(db);
    return c.json({ success: true, data: rows });
  }
  return c.json({ success: true, data: [] });
});
var data_default = data;

// src/routes/stage.ts
var stage = new Hono2();
stage.post("/list-stages", async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(
    "SELECT stageId, chapter, stage, enemies, rewards, extra FROM stage_configs ORDER BY chapter, stage"
  ).all();
  const safeParse = /* @__PURE__ */ __name((val, fallback) => {
    try {
      return JSON.parse(val || fallback);
    } catch (e) {
      console.error("[list-stages] JSON.parse failed for value:", val, e);
      return JSON.parse(fallback);
    }
  }, "safeParse");
  const stages = (rows.results ?? []).map((r) => ({
    stageId: r.stageId,
    chapter: r.chapter,
    stage: r.stage,
    enemies: safeParse(r.enemies, "[]"),
    rewards: safeParse(r.rewards, "{}"),
    extra: safeParse(r.extra, "{}")
  }));
  return c.json({ success: true, stages });
});
stage.post("/stage-config", async (c) => {
  const db = c.env.DB;
  const body = getBody(c);
  const stageId = body.stageId;
  if (!stageId) return c.json({ success: false, error: "missing stageId" });
  const row = await db.prepare(
    "SELECT stageId, chapter, stage, enemies, rewards, extra FROM stage_configs WHERE stageId = ?"
  ).bind(stageId).first();
  if (!row) return c.json({ success: false, error: "stage_not_found" });
  const safeParse = /* @__PURE__ */ __name((val, fb) => {
    try {
      return JSON.parse(val || fb);
    } catch {
      return JSON.parse(fb);
    }
  }, "safeParse");
  return c.json({
    success: true,
    config: {
      stageId: row.stageId,
      chapter: row.chapter,
      stage: row.stage,
      enemies: safeParse(row.enemies, "[]"),
      rewards: safeParse(row.rewards, "{}"),
      extra: safeParse(row.extra, "{}")
    }
  });
});
var stage_default = stage;

// src/index.ts
var app = new Hono2();
app.use("*", cors({
  origin: /* @__PURE__ */ __name((origin) => {
    if (origin.startsWith("http://localhost:")) return origin;
    const allowed = [
      "https://globalganlan.pages.dev",
      "https://globalganlan.github.io"
    ];
    return allowed.includes(origin) ? origin : allowed[0];
  }, "origin"),
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 86400
}));
app.get("/", (c) => c.json({ status: "ok", service: "globalganlan-api" }));
app.route("/api/auth", auth_default);
var protectedApi = new Hono2();
protectedApi.use("*", authMiddleware);
protectedApi.route("/", save_default);
protectedApi.route("/", inventory_default);
protectedApi.route("/", progression_default);
protectedApi.route("/", battle_default);
protectedApi.route("/", gacha_default);
protectedApi.route("/", mail_default);
protectedApi.route("/", arena_default);
protectedApi.route("/", checkin_default);
protectedApi.route("/", data_default);
protectedApi.route("/", stage_default);
app.route("/api", protectedApi);
app.notFound((c) => c.json({ success: false, error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("[API Error]", err.message, err.stack);
  return c.json({ success: false, error: "internal_error", message: err.message }, 500);
});
var ARENA_DAILY_REWARDS = [
  { minRank: 1, maxRank: 1, diamond: 100, gold: 3e4, pvpCoin: 50, exp: 500 },
  { minRank: 2, maxRank: 5, diamond: 80, gold: 25e3, pvpCoin: 40, exp: 400 },
  { minRank: 6, maxRank: 10, diamond: 60, gold: 2e4, pvpCoin: 35, exp: 350 },
  { minRank: 11, maxRank: 30, diamond: 40, gold: 15e3, pvpCoin: 25, exp: 250 },
  { minRank: 31, maxRank: 50, diamond: 30, gold: 1e4, pvpCoin: 20, exp: 200 },
  { minRank: 51, maxRank: 100, diamond: 20, gold: 8e3, pvpCoin: 15, exp: 150 },
  { minRank: 101, maxRank: 200, diamond: 15, gold: 5e3, pvpCoin: 10, exp: 100 },
  { minRank: 201, maxRank: 500, diamond: 10, gold: 3e3, pvpCoin: 5, exp: 50 }
];
async function arenaDailyReward(db) {
  let mailsSent = 0;
  for (const tier of ARENA_DAILY_REWARDS) {
    const rows = await db.prepare(
      "SELECT rank, playerId, isNPC FROM arena_rankings WHERE rank >= ? AND rank <= ? AND isNPC = 0"
    ).bind(tier.minRank, tier.maxRank).all();
    for (const row of rows.results || []) {
      const rewards = [
        { itemId: "diamond", quantity: tier.diamond },
        { itemId: "gold", quantity: tier.gold },
        { itemId: "pvp_coin", quantity: tier.pvpCoin },
        { itemId: "exp", quantity: tier.exp }
      ];
      await insertMail(
        db,
        row.playerId,
        `\u2694\uFE0F \u7AF6\u6280\u5834\u6BCF\u65E5\u734E\u52F5 (\u7B2C${row.rank}\u540D)`,
        `\u606D\u559C\uFF01\u60A8\u7684\u7AF6\u6280\u5834\u6392\u540D\u70BA\u7B2C ${row.rank} \u540D\uFF0C\u9019\u662F\u4ECA\u65E5\u7684\u6392\u540D\u734E\u52F5\u3002`,
        rewards
      );
      mailsSent++;
    }
  }
  console.log(`[Cron] arenaDailyReward: sent ${mailsSent} mails`);
}
__name(arenaDailyReward, "arenaDailyReward");
async function arenaWeeklyReset(db) {
  const now = isoNow();
  const humanRows = await db.prepare(
    "SELECT rank, playerId FROM arena_rankings WHERE isNPC = 0"
  ).all();
  const PREFIXES = ["\u6697\u5F71", "\u672B\u65E5", "\u9435\u8840", "\u8352\u91CE", "\u5E7D\u9748", "\u72C2\u66B4", "\u51B0\u971C", "\u70C8\u7130", "\u93FD\u8755", "\u9ECE\u660E", "\u8840\u6708", "\u8FF7\u9727"];
  const SUFFIXES = ["\u7375\u4EBA", "\u5016\u5B58\u8005", "\u6230\u58EB", "\u6307\u63EE\u5B98", "\u8B77\u885B", "\u904A\u8569\u8005", "\u6F5B\u4F0F\u8005", "\u6536\u5272\u8005", "\u5B88\u671B\u8005", "\u6D41\u6D6A\u8005"];
  for (const row of humanRows.results || []) {
    const seed = row.rank * 31337;
    const pi = seed % PREFIXES.length;
    const si = (seed * 7 + 13) % SUFFIXES.length;
    const npcName = PREFIXES[pi] + SUFFIXES[si];
    const power = Math.floor(500 + (500 - row.rank) * 20);
    await db.prepare(
      `UPDATE arena_rankings SET playerId = ?, displayName = ?, isNPC = 1, power = ?, defenseFormation = '[]', lastUpdated = ? WHERE rank = ?`
    ).bind(`npc_${row.rank}`, npcName, power, now, row.rank).run();
  }
  await db.prepare("UPDATE save_data SET arenaHighestRank = 500").run();
  console.log(`[Cron] arenaWeeklyReset: reset ${(humanRows.results || []).length} human ranks`);
}
__name(arenaWeeklyReset, "arenaWeeklyReset");
var index_default = {
  fetch: app.fetch,
  scheduled: /* @__PURE__ */ __name(async (event, env, ctx) => {
    const cron = event.cron;
    console.log(`[Cron] triggered: ${cron}`);
    if (cron === "5 16 * * *") {
      await arenaDailyReward(env.DB);
    } else if (cron === "0 16 * * 1") {
      await arenaWeeklyReset(env.DB);
    }
  }, "scheduled")
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
