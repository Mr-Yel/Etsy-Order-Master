/**
 * 注入到页面主世界的脚本
 * 用于直接访问页面的 window 对象，获取 Etsy 相关数据
 *
 * 注意：此脚本运行在页面主世界，与页面脚本共享同一个 JavaScript 上下文
 * 因此可以直接访问 window.Etsy 等页面对象
 */

(function () {
  "use strict";

  var currentScriptSrc =
    (document.currentScript && document.currentScript.src) || "";
  var EOM_RUNTIME_CHANNEL =
    /[?&]eom_channel=test(?:&|$)/.test(currentScriptSrc)
      ? "test"
      : "production";
  var EOM_MESSAGE_SUFFIX = EOM_RUNTIME_CHANNEL === "test" ? "_TEST" : "";

  function getRuntimeScopedMessageType(productionType) {
    return productionType + EOM_MESSAGE_SUFFIX;
  }

  var ETSY_BRIDGE_REQUEST_TYPE = getRuntimeScopedMessageType("ETSY_BRIDGE_REQUEST");
  var ETSY_BRIDGE_RESPONSE_TYPE = getRuntimeScopedMessageType("ETSY_BRIDGE_RESPONSE");
  var ETSY_BRIDGE_EVENT_TYPE = getRuntimeScopedMessageType("ETSY_BRIDGE_EVENT");
  var ETSY_BRIDGE_VERSION = 1;

  var ETSY_BRIDGE_ACTIONS = {
    contextGet: "context.get",
    domSelectSet: "dom.select.set",
    domInputSet: "dom.input.set",
    domScan: "dom.scan",
    domOrderFill: "dom.order.fill",
    domCarrierNamesFill: "dom.carrierNames.fill",
    imagesFetchAsBase64: "images.fetchAsBase64",
  };
  var DUP_SYNC_TRACE_PREFIX = "[DUP-SYNC-TRACE]";

  function traceLog(eventName, details) {
    try {
      var parts = [];
      Object.keys(details || {}).forEach(function (key) {
        var value = details[key];
        if (value === undefined || value === null || value === "") return;
        parts.push(key + "=" + String(value).replace(/\s+/g, "_"));
      });
      console.log(DUP_SYNC_TRACE_PREFIX + " " + eventName + (parts.length ? " " + parts.join(" ") : ""));
    } catch (e) {
      // 忽略日志错误
    }
  }

  function postBridgeSuccess(requestId, data) {
    window.postMessage(
      {
        type: ETSY_BRIDGE_RESPONSE_TYPE,
        requestId: requestId,
        success: true,
        data: data,
      },
      "*"
    );
  }

  function postBridgeError(requestId, code, message, details) {
    window.postMessage(
      {
        type: ETSY_BRIDGE_RESPONSE_TYPE,
        requestId: requestId,
        success: false,
        error: {
          code: code,
          message: message,
          details: details,
        },
      },
      "*"
    );
  }

  function postBridgeEvent(eventName, payload) {
    traceLog("page-inject.bridge-event", {
      eventName: eventName,
      requestId: payload && payload.requestId,
      source: payload && payload.source,
      type: payload && payload.type,
      status: payload && payload.status,
      ok: payload && payload.ok,
    });
    window.postMessage(
      {
        type: ETSY_BRIDGE_EVENT_TYPE,
        event: eventName,
        payload: payload,
        meta: {
          source: "page",
          version: ETSY_BRIDGE_VERSION,
          timestamp: Date.now(),
        },
      },
      "*"
    );
  }

  /**
   * 判断是否为需要拦截的 Etsy move-orders 接口
   * 例如：
   * https://www.etsy.com/api/v3/ajax/shop/26833914/mission-control/order-state/move-orders
   */
  function shouldInterceptEtsyMoveOrders(url, method) {
    if (!url) return false;
    try {
      var u = new URL(url, window.location.origin);
      if (u.hostname !== "www.etsy.com") return false;
      if (!/\/api\/v3\/ajax\/shop\/\d+\/mission-control\/order-state\/move-orders$/.test(u.pathname)) {
        return false;
      }
      var m = (method || "GET").toUpperCase();
      // 一般为 POST，请求方法不匹配则忽略
      return m === "POST";
    } catch (e) {
      return false;
    }
  }

  /**
   * 判断是否为需要拦截的 Etsy 修改 ship-by-date 接口
   * 例如：
   * https://www.etsy.com/api/v3/ajax/shop/26833914/mission-control/orders/fulfillment/update-ship-by-date/4068847770
   */
  function getEtsyUpdateShipByDateMatch(url, method) {
    if (!url) return null;
    try {
      var u = new URL(url, window.location.origin);
      if (u.hostname !== "www.etsy.com") return null;
      var match = u.pathname.match(
        /^\/api\/v3\/ajax\/shop\/(\d+)\/mission-control\/orders\/fulfillment\/update-ship-by-date\/(\d+)$/
      );
      if (!match) return null;
      var m = (method || "GET").toUpperCase();
      if (m !== "POST") return null;
      return {
        shopId: match[1],
        orderId: match[2],
      };
    } catch (e) {
      return null;
    }
  }

  function getEtsyCancelOrderMatch(url, method) {
    if (!url) return null;
    try {
      var u = new URL(url, window.location.origin);
      if (u.hostname !== "www.etsy.com") return null;
      var match = u.pathname.match(
        /^\/api\/v3\/ajax\/shop\/(\d+)\/order\/refund-and-cancel\/(\d+)$/
      );
      if (!match) return null;
      var m = (method || "GET").toUpperCase();
      if (m !== "POST") return null;
      return {
        shopId: match[1],
        orderId: match[2],
      };
    } catch (e) {
      return null;
    }
  }

  function getEtsyBatchCompleteMatch(url, method) {
    if (!url) return null;
    try {
      var u = new URL(url, window.location.origin);
      if (u.hostname !== "www.etsy.com") return null;
      var match = u.pathname.match(
        /^\/api\/v3\/ajax\/bespoke\/shop\/(\d+)\/mission-control\/order-state\/batch-complete$/
      );
      if (!match) return null;
      var m = (method || "GET").toUpperCase();
      if (m !== "POST") return null;
      return {
        shopId: match[1],
      };
    } catch (e) {
      return null;
    }
  }

  function parseUpdateShipByDateBody(bodyText) {
    if (typeof bodyText !== "string" || !bodyText.trim()) {
      return { newShipByDate: null };
    }
    try {
      var parsed = JSON.parse(bodyText);
      return {
        newShipByDate:
          typeof parsed.new_ship_by_date === "number"
            ? parsed.new_ship_by_date
            : null,
      };
    } catch (e) {
      return { newShipByDate: null };
    }
  }

  function readRequestBodyText(body) {
    if (typeof body === "string") return body;
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return body.toString();
    }
    return null;
  }

  function readXhrResponseText(xhr) {
    try {
      if (xhr.responseType === "json") {
        return xhr.response == null ? "" : JSON.stringify(xhr.response);
      }
      if (xhr.responseType === "" || xhr.responseType === "text") {
        return xhr.responseText;
      }
      if (typeof xhr.response === "string") return xhr.response;
      return xhr.response == null ? "" : JSON.stringify(xhr.response);
    } catch (e) {
      return "";
    }
  }

  function getEtsyInterceptDescriptor(url, method, transport) {
    if (shouldInterceptEtsyMoveOrders(url, method)) {
      return {
        kind: "moveOrders",
        requestType: getRuntimeScopedMessageType("etsy-move-orders-request"),
        responseType: getRuntimeScopedMessageType("etsy-move-orders-response"),
        requestedEvent: "moveOrders.requested",
        respondedEvent: "moveOrders.responded",
        requestIdPrefix: transport === "xhr" ? "etsy-move-orders-xhr" : "etsy-move-orders",
        extra: {},
      };
    }

    var updateShipByDateMatch = getEtsyUpdateShipByDateMatch(url, method);
    if (updateShipByDateMatch) {
      return {
        kind: "updateShipByDate",
        requestType: getRuntimeScopedMessageType("etsy-update-ship-by-date-request"),
        responseType: getRuntimeScopedMessageType("etsy-update-ship-by-date-response"),
        requestedEvent: "updateShipByDate.requested",
        respondedEvent: "updateShipByDate.responded",
        requestIdPrefix:
          transport === "xhr"
            ? "etsy-update-ship-by-date-xhr"
            : "etsy-update-ship-by-date",
        extra: updateShipByDateMatch,
      };
    }

    var cancelOrderMatch = getEtsyCancelOrderMatch(url, method);
    if (cancelOrderMatch) {
      return {
        kind: "cancelOrder",
        requestType: getRuntimeScopedMessageType("etsy-cancel-order-request"),
        responseType: getRuntimeScopedMessageType("etsy-cancel-order-response"),
        requestedEvent: "cancelOrder.requested",
        respondedEvent: "cancelOrder.responded",
        requestIdPrefix:
          transport === "xhr" ? "etsy-cancel-order-xhr" : "etsy-cancel-order",
        emitLegacyMessage: false,
        extra: cancelOrderMatch,
      };
    }

    var batchCompleteMatch = getEtsyBatchCompleteMatch(url, method);
    if (batchCompleteMatch) {
      return {
        kind: "batchComplete",
        requestType: getRuntimeScopedMessageType("etsy-batch-complete-request"),
        responseType: getRuntimeScopedMessageType("etsy-batch-complete-response"),
        requestedEvent: "batchComplete.requested",
        respondedEvent: "batchComplete.responded",
        requestIdPrefix:
          transport === "xhr" ? "etsy-batch-complete-xhr" : "etsy-batch-complete",
        emitLegacyMessage: false,
        extra: batchCompleteMatch,
      };
    }

    return null;
  }

  function buildRequestPayload(descriptor, requestId, url, method, bodyText) {
    var payload = {
      type: descriptor.requestType,
      requestId: requestId,
      url: url,
      method: method,
      body: bodyText,
      source: "page-inject",
    };

    if (descriptor.kind === "updateShipByDate") {
      var parsedBody = parseUpdateShipByDateBody(bodyText);
      payload.shopId = descriptor.extra.shopId;
      payload.orderId = descriptor.extra.orderId;
      payload.newShipByDate = parsedBody.newShipByDate;
    }

    if (descriptor.kind === "cancelOrder") {
      payload.shopId = descriptor.extra.shopId;
      payload.orderId = descriptor.extra.orderId;
    }

    if (descriptor.kind === "batchComplete") {
      payload.shopId = descriptor.extra.shopId;
    }

    return payload;
  }

  function buildResponsePayload(descriptor, requestId, url, status, ok, bodyText, requestPayload) {
    var payload = {
      type: descriptor.responseType,
      requestId: requestId,
      url: url,
      status: status,
      ok: ok,
      body: bodyText,
      source: "page-inject",
    };

    if (descriptor.kind === "updateShipByDate") {
      payload.shopId = descriptor.extra.shopId;
      payload.orderId = descriptor.extra.orderId;
      payload.newShipByDate = requestPayload ? requestPayload.newShipByDate : null;
    }

    if (descriptor.kind === "cancelOrder") {
      payload.shopId = descriptor.extra.shopId;
      payload.orderId = descriptor.extra.orderId;
    }

    if (descriptor.kind === "batchComplete") {
      payload.shopId = descriptor.extra.shopId;
    }

    return payload;
  }

  /**
   * 在主世界劫持 window.fetch，拦截 Etsy 目标接口
   */
  function patchFetchForEtsyRequests() {
    if (typeof window.fetch !== "function") return;
    var patchFlag = "__etsyRequestFetchPatched" + EOM_MESSAGE_SUFFIX;
    if (window[patchFlag]) return;
    window[patchFlag] = true;

    var originalFetch = window.fetch;

    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url);
      var method = (init && init.method) || (input && input.method) || "GET";

      var descriptor = getEtsyInterceptDescriptor(url, method, "fetch");
      var needIntercept = descriptor != null;
      var requestId = descriptor
        ? descriptor.requestIdPrefix + "-" + Date.now() + "-" + Math.random()
        : null;

      var bodyPromise = Promise.resolve(null);

      if (needIntercept) {
        try {
          if (typeof Request !== "undefined" && input instanceof Request) {
            var clonedReq = input.clone();
            bodyPromise = clonedReq.text()["catch"](function () {
              return null;
            });
          } else if (init) {
            bodyPromise = Promise.resolve(readRequestBodyText(init.body));
          }
        } catch (e) {
          bodyPromise = Promise.resolve(null);
        }
      }

      return bodyPromise.then(function (requestBodyText) {
        var requestPayload = null;
        if (needIntercept) {
          try {
            requestPayload = buildRequestPayload(
              descriptor,
              requestId,
              url,
              method,
              requestBodyText
            );
            traceLog("page-inject.fetch.request.raw", {
              requestId: requestId,
              type: requestPayload && requestPayload.type,
              method: method,
              url: url,
            });
            if (descriptor.emitLegacyMessage !== false) {
              window.postMessage(
                requestPayload,
                "*"
              );
            }
            postBridgeEvent(descriptor.requestedEvent, requestPayload);
          } catch (e) {
            // 忽略 postMessage 错误
          }
        }

        return originalFetch(input, init).then(function (response) {
          if (!needIntercept) return response;

          try {
            var clonedResp = response.clone();
            return clonedResp
              .text()
              .then(function (respText) {
                try {
                  var responsePayload = buildResponsePayload(
                    descriptor,
                    requestId,
                    url,
                    response.status,
                    response.ok,
                    respText,
                    requestPayload
                  );
                  traceLog("page-inject.fetch.response.raw", {
                    requestId: requestId,
                    type: responsePayload && responsePayload.type,
                    status: response.status,
                    ok: response.ok,
                    url: url,
                  });
                  if (descriptor.emitLegacyMessage !== false) {
                    window.postMessage(
                      responsePayload,
                      "*"
                    );
                  }
                  postBridgeEvent(descriptor.respondedEvent, responsePayload);
                } catch (e) {
                  // 忽略 postMessage 错误
                }
                return response;
              })["catch"](function () {
                return response;
              });
          } catch (e) {
            return response;
          }
        });
      });
    };
  }

  /**
   * 在主世界劫持 XMLHttpRequest，拦截 Etsy 目标接口
   */
  function patchXHRForEtsyRequests() {
    if (typeof window.XMLHttpRequest !== "function") return;
    var patchFlag = "__etsyRequestXHRPatched" + EOM_MESSAGE_SUFFIX;
    if (window[patchFlag]) return;
    window[patchFlag] = true;

    var OriginalXHR = window.XMLHttpRequest;

    function PatchedXHR() {
      var xhr = new OriginalXHR();
      var _url = "";
      var _method = "GET";

      var originalOpen = xhr.open;
      xhr.open = function (method, url, async, user, password) {
        _method = method;
        _url = url;
        return originalOpen.apply(xhr, arguments);
      };

      var originalSend = xhr.send;
      xhr.send = function (body) {
        var descriptor = getEtsyInterceptDescriptor(_url, _method, "xhr");
        var needIntercept = descriptor != null;
        var requestId = descriptor
          ? descriptor.requestIdPrefix + "-" + Date.now() + "-" + Math.random()
          : null;

        var requestPayload = null;
        if (needIntercept) {
          try {
            requestPayload = buildRequestPayload(
              descriptor,
              requestId,
              _url,
              _method,
              readRequestBodyText(body)
            );
            traceLog("page-inject.xhr.request.raw", {
              requestId: requestId,
              type: requestPayload && requestPayload.type,
              method: _method,
              url: _url,
            });
            if (descriptor.emitLegacyMessage !== false) {
              window.postMessage(
                requestPayload,
                "*"
              );
            }
            postBridgeEvent(descriptor.requestedEvent, requestPayload);
          } catch (e) {
            // 忽略 postMessage 错误
          }

          xhr.addEventListener("loadend", function () {
            try {
              var responsePayload = buildResponsePayload(
                descriptor,
                requestId,
                _url,
                xhr.status,
                xhr.status >= 200 && xhr.status < 300,
                readXhrResponseText(xhr),
                requestPayload
              );
              traceLog("page-inject.xhr.response.raw", {
                requestId: requestId,
                type: responsePayload && responsePayload.type,
                status: xhr.status,
                ok: xhr.status >= 200 && xhr.status < 300,
                url: _url,
              });
              if (descriptor.emitLegacyMessage !== false) {
                window.postMessage(
                  responsePayload,
                  "*"
                );
              }
              postBridgeEvent(descriptor.respondedEvent, responsePayload);
            } catch (e) {
              // 忽略 postMessage 错误
            }
          });
        }

        return originalSend.apply(xhr, arguments);
      };

      return xhr;
    }

    window.XMLHttpRequest = PatchedXHR;
  }

  /**
   * 承运商文本归一化：NFKC（全角转半角）+ 不换行空格/全角空格归一 + 折叠连续空白 + trim + 小写
   * 例：「 china  post 」与 "China Post" 视为同一项
   */
  function normalizeCarrierText(value) {
    var text = value == null ? "" : String(value);
    try {
      text = text.normalize("NFKC");
    } catch (e) {
      // 老内核没有 normalize，退化为原串
    }
    return text
      .replace(/[\u00a0\u3000]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * 用原型链上的原生 setter 写值，并重置 React 的 valueTracker。
   * 直接 el.value = x 会被 tracker 判定为「值没变」，导致 onChange 不触发。
   */
  function setNativeValue(element, value) {
    var proto =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    var previous = element.value;

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    var tracker = element._valueTracker;
    if (tracker && typeof tracker.setValue === "function") {
      tracker.setValue(previous);
    }
  }

  /**
   * clg-text-input 这类自定义元素：真实可编辑节点在内部（light DOM 或 open shadow root）
   */
  function resolveEditableElement(host) {
    if (!host) return null;
    if (host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement) {
      return host;
    }

    var inner = null;
    try {
      if (host.shadowRoot) {
        inner = host.shadowRoot.querySelector("input, textarea");
      }
    } catch (e) {
      inner = null;
    }
    if (!inner && typeof host.querySelector === "function") {
      inner = host.querySelector("input, textarea");
    }
    return inner || null;
  }

  /**
   * 派发一套让 React / 自定义元素都能识别的值变更事件
   * includeInput=false 用于真实键入（execCommand）之后，原生 input 事件已自动触发，只需补 change / blur
   */
  function dispatchValueEvents(element, value, includeInput) {
    if (includeInput !== false) {
      try {
        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "insertText",
            data: value,
          })
        );
      } catch (e) {
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
    }
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  /**
   * 读取宿主或内部可编辑节点的当前值。
   * 自定义元素在没有 value accessor 时，宿主上的 value 只是一个普通 JS 属性，
   * 读它得到的永远是「自己刚写进去的东西」，所以必须优先读内部真实 input。
   */
  function readAppliedValue(host) {
    var node = resolveEditableElement(host) || host;
    var raw = node && node.value;
    return raw == null ? "" : String(raw);
  }

  /**
   * 用真实键入替换可编辑节点的内容。
   *
   * 为什么不能只用原生 setter + 合成事件：clg-text-input 是受控组件，
   * 合成 input 事件不会更新它的 React state；同一批里紧接着改承运商下拉框会
   * 触发整卡片重渲染，受控 value 仍然是旧的空值，刚写进去的运单号被抹掉。
   * execCommand("insertText") 走浏览器真实编辑路径，会派发原生 input 事件，
   * 组件 state 才能真正同步。
   */
  function typeIntoEditable(editable, value) {
    var text = value == null ? "" : String(value);
    if (!editable || editable.readOnly || editable.disabled) return false;
    // 空串无法用 insertText 表达，交给原生 setter
    if (!text) return false;

    try {
      if (typeof editable.focus === "function") {
        editable.focus({ preventScroll: true });
      }
      if (typeof editable.select === "function") {
        editable.select();
      } else if (typeof editable.setSelectionRange === "function") {
        var current = editable.value == null ? "" : String(editable.value);
        editable.setSelectionRange(0, current.length);
      }

      var applied = document.execCommand("insertText", false, text);
      return applied !== false && readAppliedValue(editable) === text;
    } catch (e) {
      return false;
    }
  }

  /** 让出若干帧，等 Etsy 的 React 完成重渲染（受控值回填/清空都发生在这一帧之后） */
  function waitRenderFrames(count) {
    var remaining = typeof count === "number" ? count : 2;

    return new Promise(function (resolve) {
      function step() {
        if (remaining <= 0) {
          setTimeout(resolve, 0);
          return;
        }
        remaining -= 1;
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(step);
        } else {
          setTimeout(step, 16);
        }
      }
      step();
    });
  }

  /**
   * 在主世界中修改 select 下拉框的选中选项
   * 匹配规则：归一化后忽略大小写与首尾/多余空格；都不命中则回落到 Other（value="-1"）
   */
  function changeSelectOptionInMainWorld(orderNumber, optionValue) {
    try {
      var selectElement = document.getElementsByName(
        "carrierNameSelect-" + orderNumber
      )[0];

      if (!selectElement) {
        return { success: false, error: "未找到 select 元素" };
      }

      var targetText = normalizeCarrierText(optionValue);
      if (!targetText) {
        return { success: false, error: "承运商为空" };
      }

      var options = selectElement.options;
      var matchedOption = null;
      var otherOption = null;

      for (var i = 0; i < options.length; i++) {
        var option = options[i];
        if (option.value === "-1") {
          otherOption = option;
          continue;
        }
        if (!matchedOption && normalizeCarrierText(option.text) === targetText) {
          matchedOption = option;
        }
      }

      var target = matchedOption || otherOption;
      if (!target) {
        return { success: false, error: "未找到匹配项，也没有 Other 可选" };
      }

      // 必须用原生 setter，否则 React 认为值未变化，不触发 onChange
      setNativeValue(selectElement, target.value);
      selectElement.dispatchEvent(
        new Event("change", { bubbles: true, composed: true })
      );
      selectElement.dispatchEvent(
        new Event("input", { bubbles: true, composed: true })
      );

      return {
        success: true,
        value: selectElement.value,
        text: target.text,
        matched: !!matchedOption,
        fallbackToOther: !matchedOption,
      };
    } catch (error) {
      return { success: false, error: error.message || "未知错误" };
    }
  }

  /**
   * 在主世界中修改输入框的值（兼容 clg-text-input 宿主元素），写入后回读校验
   */
  function changeInputValueInMainWorld(selector, value, triggerEvents) {
    try {
      var host = document.querySelector(selector);

      if (!host) {
        return { success: false, error: "未找到 input 元素" };
      }

      return applyInputValueToHost(host, value, triggerEvents);
    } catch (error) {
      return { success: false, error: error.message || "未知错误" };
    }
  }

  /**
   * 对已取到的宿主元素写入值。
   * 自定义元素（clg-text-input 等）优先走真实键入，保证受控组件的内部 state 同步，
   * 否则后续任何一次重渲染都会把值抹掉；键入不可用时才退回原生 setter + 合成事件。
   */
  function applyInputValueToHost(host, value, triggerEvents) {
    try {
      var text = value == null ? "" : String(value);
      var editable = resolveEditableElement(host);
      var isNativeInput =
        host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement;
      var method = "setter";

      if (editable && editable !== host) {
        // 自定义元素：真实键入优先
        if (typeIntoEditable(editable, text)) {
          method = "type";
        } else {
          setNativeValue(editable, text);
        }
      } else if (isNativeInput) {
        editable = host;
        setNativeValue(host, text);
      } else {
        // 连内部 input 都找不到，只能写宿主本身（自定义元素通常有 value accessor 转发）
        try {
          host.value = text;
        } catch (e) {
          // 宿主没有 value setter，忽略
        }
      }

      if (triggerEvents !== false) {
        if (editable) {
          // 真实键入已由 execCommand 触发原生 input 事件，这里只补 change / blur
          dispatchValueEvents(editable, text, method !== "type");
        }
        if (editable !== host) {
          dispatchValueEvents(host, text, method !== "type");
        }
      }

      var readback = readAppliedValue(host);

      return {
        success: true,
        verified: readback === text,
        readback: readback,
        method: method,
      };
    } catch (error) {
      return { success: false, error: error.message || "未知错误" };
    }
  }

  var TRACKING_NAME_PREFIX = "trackingCode-";
  var CARRIER_SELECT_NAME_PREFIX = "carrierNameSelect-";
  var CARRIER_NAME_PREFIX = "carrierName-";

  /** 按 name 精确定位，避免订单号里的引号/反斜杠破坏属性选择器 */
  function findElementByName(name) {
    var nodes = document.getElementsByName(name);
    return nodes && nodes.length ? nodes[0] : null;
  }

  /** 一次 querySelectorAll 取出某前缀下的全部订单号（去重） */
  function collectOrderNumbersByPrefix(prefix) {
    var result = [];
    var seen = Object.create(null);
    var nodes = document.querySelectorAll('[name^="' + prefix + '"]');

    for (var i = 0; i < nodes.length; i++) {
      var name = nodes[i].getAttribute("name") || "";
      if (name.indexOf(prefix) !== 0) continue;
      var orderNumber = name.slice(prefix.length);
      if (!orderNumber || seen[orderNumber]) continue;
      seen[orderNumber] = true;
      result.push(orderNumber);
    }

    return result;
  }

  /** 扫描页面当前可回填的订单行，供 content 侧一次性建立索引 */
  function scanOrderRowsInMainWorld() {
    var trackingOrderNumbers = collectOrderNumbersByPrefix(TRACKING_NAME_PREFIX);
    var selectOrderNumbers = collectOrderNumbersByPrefix(CARRIER_SELECT_NAME_PREFIX);
    var carrierNameOrderNumbers = collectOrderNumbersByPrefix(CARRIER_NAME_PREFIX);

    var orderNumbers = [];
    var seen = Object.create(null);
    [trackingOrderNumbers, selectOrderNumbers].forEach(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (seen[list[i]]) continue;
        seen[list[i]] = true;
        orderNumbers.push(list[i]);
      }
    });

    return {
      orderNumbers: orderNumbers,
      trackingOrderNumbers: trackingOrderNumbers,
      selectOrderNumbers: selectOrderNumbers,
      carrierNameOrderNumbers: carrierNameOrderNumbers,
    };
  }

  /**
   * 批量回填第一阶段：运单号 + 承运商下拉框。
   * 同一批在同一个同步块里写完，但**不能**在同步块内就判定成功：
   * 写承运商会让 Etsy 重渲染整张卡片，受控组件（clg-text-input）若没拿到新值，
   * 会把刚写进去的运单号抹掉，而同步回读发生在抹掉之前。
   */
  async function fillOrdersBatchInMainWorld(orders) {
    var list = orders && orders.length ? orders : [];
    var results = [];
    /** 需要在重渲染之后复检运单号的订单 */
    var trackingChecks = [];

    for (var i = 0; i < list.length; i++) {
      var order = list[i] || {};
      var orderNumber = order.orderNumber ? String(order.orderNumber) : "";
      var item = { orderNumber: orderNumber };

      if (!orderNumber) {
        item.tracking = { ok: false, reason: "缺少订单号" };
        results.push(item);
        continue;
      }

      var trackingBlocked = false;

      if (order.trackingNumber) {
        var trackingHost = findElementByName(TRACKING_NAME_PREFIX + orderNumber);
        if (!trackingHost) {
          item.tracking = { ok: false, reason: "未找到运单号输入框" };
          trackingBlocked = true;
        } else {
          var trackingText = String(order.trackingNumber);
          var trackingResult = applyInputValueToHost(trackingHost, trackingText, true);
          var trackingOk = !!(trackingResult && trackingResult.success && trackingResult.verified);
          item.tracking = {
            ok: trackingOk,
            readback: trackingResult && trackingResult.readback,
            reason: trackingOk
              ? undefined
              : (trackingResult && trackingResult.error) || "写入后回读不一致",
          };
          trackingBlocked = !trackingOk;
          if (trackingOk) {
            trackingChecks.push({
              orderNumber: orderNumber,
              host: trackingHost,
              expected: trackingText,
              item: item,
              retried: false,
            });
          }
        }
      }

      // 运单号没写进去时不碰承运商，避免留下半填状态
      if (!trackingBlocked && order.carrierText) {
        var selectResult = changeSelectOptionInMainWorld(orderNumber, order.carrierText);
        if (selectResult && selectResult.success) {
          item.carrier = {
            ok: true,
            matched: !!selectResult.matched,
            fallbackToOther: !!selectResult.fallbackToOther,
            text: selectResult.text,
          };
        } else {
          item.carrier = {
            ok: false,
            reason: (selectResult && selectResult.error) || "设置承运商失败",
          };
        }
      }

      results.push(item);
    }

    if (trackingChecks.length > 0) {
      await settleTrackingChecks(trackingChecks);
    }

    return { results: results };
  }

  /**
   * 运单号落地复检：等 React 重渲染 → 读实际值 → 丢了就用真实键入重写 → 再判一次。
   * 承运商下拉框的 change 会重渲染整张卡片，只有重渲染之后读到的值才是真的。
   */
  async function settleTrackingChecks(checks) {
    await waitRenderFrames(2);

    var lost = [];
    for (var i = 0; i < checks.length; i++) {
      if (readAppliedValue(checks[i].host) !== checks[i].expected) {
        lost.push(checks[i]);
      }
    }

    if (lost.length > 0) {
      traceLog("tracking-rollback", {
        count: lost.length,
        orders: lost
          .map(function (check) {
            return check.orderNumber;
          })
          .join(","),
      });

      for (var j = 0; j < lost.length; j++) {
        lost[j].retried = true;
        applyInputValueToHost(lost[j].host, lost[j].expected, true);
      }
      await waitRenderFrames(2);
    }

    for (var k = 0; k < checks.length; k++) {
      var check = checks[k];
      var actual = readAppliedValue(check.host);

      if (actual === check.expected) {
        check.item.tracking = { ok: true, readback: actual };
        continue;
      }

      check.item.tracking = {
        ok: false,
        readback: actual,
        reason: check.retried
          ? "写入后被页面重渲染清空"
          : "写入后回读不一致",
      };

      // 运单号最终没留住，承运商即使选上也判失败，避免面板报成功而页面是半填状态
      if (check.item.carrier && check.item.carrier.ok) {
        check.item.carrier = {
          ok: false,
          matched: check.item.carrier.matched,
          fallbackToOther: false,
          reason: "运单号未保留，承运商结果不可靠",
        };
      }
    }
  }

  /**
   * 批量回填第二阶段：承运商名称输入框（选中 Other 后才会渲染出来）
   */
  async function fillCarrierNamesBatchInMainWorld(items) {
    var list = items && items.length ? items : [];
    var results = [];
    /** 需要跨帧复检的写入 */
    var checks = [];

    for (var i = 0; i < list.length; i++) {
      var entry = list[i] || {};
      var orderNumber = entry.orderNumber ? String(entry.orderNumber) : "";
      var host = orderNumber ? findElementByName(CARRIER_NAME_PREFIX + orderNumber) : null;

      if (!host) {
        results.push({
          orderNumber: orderNumber,
          ok: false,
          reason: "未找到承运商名称输入框",
        });
        continue;
      }

      var expected = entry.carrierName == null ? "" : String(entry.carrierName);
      var result = applyInputValueToHost(host, expected, true);
      var itemResult = {
        orderNumber: orderNumber,
        ok: !!(result && result.success && result.verified),
        readback: result && result.readback,
        reason: undefined,
      };
      if (!itemResult.ok) {
        itemResult.reason = (result && result.error) || "写入后回读不一致";
      } else if (expected) {
        checks.push({ host: host, expected: expected, result: itemResult });
      }

      results.push(itemResult);
    }

    // 同批后续写入可能重渲染，用重渲染后的值定论
    if (checks.length > 0) {
      await waitRenderFrames(2);

      var lost = [];
      for (var j = 0; j < checks.length; j++) {
        if (readAppliedValue(checks[j].host) !== checks[j].expected) {
          lost.push(checks[j]);
        }
      }
      for (var k = 0; k < lost.length; k++) {
        applyInputValueToHost(lost[k].host, lost[k].expected, true);
      }
      if (lost.length > 0) {
        await waitRenderFrames(2);
      }

      for (var m = 0; m < checks.length; m++) {
        var check = checks[m];
        var actual = readAppliedValue(check.host);
        if (actual === check.expected) {
          check.result.readback = actual;
          continue;
        }
        check.result.ok = false;
        check.result.readback = actual;
        check.result.reason = "写入后被页面重渲染清空";
      }
    }

    return { results: results };
  }

  function getEtsyContextDataForBridge() {
    var contextData = window.Etsy && window.Etsy.Context
      ? window.Etsy.Context.data
      : null;

    if (!contextData) {
      throw new Error("无法获取 Etsy 数据，请确保在 Etsy 店铺管理页面打开此扩展");
    }

    return {
      raw: contextData,
      shopId: contextData.shop_id,
      orderStates: contextData.order_states,
    };
  }

  function fetchImagesAsBase64(urls, onSuccess, onError) {
    function arrayBufferToBase64(buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = "";
      for (var i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    Promise.all(
      (urls || []).map(function (url) {
        return fetch(url)
          .then(function (res) {
            if (!res.ok) throw new Error("fetch " + res.status);
            return res.arrayBuffer();
          })
          .then(arrayBufferToBase64);
      })
    )
      .then(onSuccess)
      .catch(onError);
  }

  function handleBridgeRequest(data) {
    var requestId = data && data.requestId;
    var action = data && data.action;
    var payload = data && data.payload ? data.payload : {};

    if (!requestId || !action) {
      return;
    }

    try {
      if (action === ETSY_BRIDGE_ACTIONS.contextGet) {
        postBridgeSuccess(requestId, getEtsyContextDataForBridge());
        return;
      }

      if (action === ETSY_BRIDGE_ACTIONS.domSelectSet) {
        var selectResult = changeSelectOptionInMainWorld(
          payload.orderNumber,
          payload.optionValue
        );
        if (selectResult && selectResult.success) {
          postBridgeSuccess(requestId, selectResult);
        } else {
          postBridgeError(
            requestId,
            "DOM_SELECT_SET_FAILED",
            (selectResult && selectResult.error) || "设置 select 失败",
            selectResult
          );
        }
        return;
      }

      if (action === ETSY_BRIDGE_ACTIONS.domInputSet) {
        var inputResult = changeInputValueInMainWorld(
          payload.selector,
          payload.value,
          payload.triggerEvents
        );
        if (inputResult && inputResult.success) {
          postBridgeSuccess(requestId, inputResult);
        } else {
          postBridgeError(
            requestId,
            "DOM_INPUT_SET_FAILED",
            (inputResult && inputResult.error) || "设置 input 失败",
            inputResult
          );
        }
        return;
      }

      if (action === ETSY_BRIDGE_ACTIONS.domScan) {
        postBridgeSuccess(requestId, scanOrderRowsInMainWorld());
        return;
      }

      if (action === ETSY_BRIDGE_ACTIONS.domOrderFill) {
        // 跨帧复检是异步的，必须等它返回再回包
        fillOrdersBatchInMainWorld(payload.orders).then(
          function (data) {
            postBridgeSuccess(requestId, data);
          },
          function (error) {
            postBridgeError(
              requestId,
              "DOM_ORDER_FILL_FAILED",
              (error && error.message) || "批量回填运单号失败"
            );
          }
        );
        return;
      }

      if (action === ETSY_BRIDGE_ACTIONS.domCarrierNamesFill) {
        fillCarrierNamesBatchInMainWorld(payload.items).then(
          function (data) {
            postBridgeSuccess(requestId, data);
          },
          function (error) {
            postBridgeError(
              requestId,
              "DOM_CARRIER_NAMES_FILL_FAILED",
              (error && error.message) || "批量回填承运商名称失败"
            );
          }
        );
        return;
      }

      if (action === ETSY_BRIDGE_ACTIONS.imagesFetchAsBase64) {
        fetchImagesAsBase64(
          payload.urls,
          function (images) {
            postBridgeSuccess(requestId, { images: images });
          },
          function (err) {
            postBridgeError(
              requestId,
              "IMAGE_FETCH_FAILED",
              err && err.message ? err.message : "拉取图片失败"
            );
          }
        );
        return;
      }

      postBridgeError(
        requestId,
        "UNKNOWN_ACTION",
        "未知 Etsy bridge action: " + action
      );
    } catch (error) {
      postBridgeError(
        requestId,
        "BRIDGE_HANDLER_ERROR",
        error && error.message ? error.message : "桥接处理失败"
      );
    }
  }

  // 监听来自隔离世界（ISOLATED world）的 content script 的消息
  window.addEventListener("message", function (event) {
    // 确保消息来自当前窗口
    if (event.source !== window) return;

    if (event.data && event.data.type === ETSY_BRIDGE_REQUEST_TYPE) {
      handleBridgeRequest(event.data);
    }

  });

  // 启用对 Etsy 目标接口的劫持
  patchFetchForEtsyRequests();
  patchXHRForEtsyRequests();
})();
