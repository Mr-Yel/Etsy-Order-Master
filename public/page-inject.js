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
          } else if (init && typeof init.body === "string") {
            bodyPromise = Promise.resolve(init.body);
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
            window.postMessage(
              requestPayload,
              "*"
            );
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
                  window.postMessage(
                    responsePayload,
                    "*"
                  );
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
              typeof body === "string" ? body : null
            );
            traceLog("page-inject.xhr.request.raw", {
              requestId: requestId,
              type: requestPayload && requestPayload.type,
              method: _method,
              url: _url,
            });
            window.postMessage(
              requestPayload,
              "*"
            );
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
                xhr.responseText,
                requestPayload
              );
              traceLog("page-inject.xhr.response.raw", {
                requestId: requestId,
                type: responsePayload && responsePayload.type,
                status: xhr.status,
                ok: xhr.status >= 200 && xhr.status < 300,
                url: _url,
              });
              window.postMessage(
                responsePayload,
                "*"
              );
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
   */
  function dispatchValueEvents(element, value) {
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
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
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

      // 宿主是自定义元素时，先写它的对外 value，再写内部真实 input
      if (!(host instanceof HTMLInputElement) && !(host instanceof HTMLTextAreaElement)) {
        try {
          host.value = value;
        } catch (e) {
          // 宿主没有 value setter，忽略
        }
      }

      var editable = resolveEditableElement(host);
      if (editable) {
        setNativeValue(editable, value);
      } else if (host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement) {
        setNativeValue(host, value);
        editable = host;
      }

      if (triggerEvents !== false) {
        if (editable) {
          dispatchValueEvents(editable, value);
        }
        if (editable !== host) {
          dispatchValueEvents(host, value);
        }
      }

      var readback = String((editable || host).value == null ? "" : (editable || host).value);

      return {
        success: true,
        verified: readback === String(value),
        readback: readback,
      };
    } catch (error) {
      return { success: false, error: error.message || "未知错误" };
    }
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
