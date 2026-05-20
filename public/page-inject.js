/**
 * 注入到页面主世界的脚本
 * 用于直接访问页面的 window 对象，获取 Etsy 相关数据
 *
 * 注意：此脚本运行在页面主世界，与页面脚本共享同一个 JavaScript 上下文
 * 因此可以直接访问 window.Etsy 等页面对象
 */

(function () {
  "use strict";

  var ETSY_BRIDGE_REQUEST_TYPE = "ETSY_BRIDGE_REQUEST";
  var ETSY_BRIDGE_RESPONSE_TYPE = "ETSY_BRIDGE_RESPONSE";
  var ETSY_BRIDGE_EVENT_TYPE = "ETSY_BRIDGE_EVENT";
  var ETSY_BRIDGE_VERSION = 1;

  var ETSY_BRIDGE_ACTIONS = {
    contextGet: "context.get",
    domSelectSet: "dom.select.set",
    domInputSet: "dom.input.set",
    imagesFetchAsBase64: "images.fetchAsBase64",
  };

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
   * 在主世界劫持 window.fetch，拦截 Etsy move-orders 接口
   */
  function patchFetchForEtsyMoveOrders() {
    if (typeof window.fetch !== "function") return;
    if (window.__etsyMoveOrdersFetchPatched) return;
    window.__etsyMoveOrdersFetchPatched = true;

    var originalFetch = window.fetch;

    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url);
      var method = (init && init.method) || (input && input.method) || "GET";

      var needIntercept = shouldInterceptEtsyMoveOrders(url, method);
      var requestId = needIntercept
        ? "etsy-move-orders-" + Date.now() + "-" + Math.random()
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
        if (needIntercept) {
          try {
            window.postMessage(
              {
                type: "etsy-move-orders-request",
                requestId: requestId,
                url: url,
                method: method,
                body: requestBodyText,
                source: "page-inject"
              },
              "*"
            );
            postBridgeEvent("moveOrders.requested", {
              requestId: requestId,
              url: url,
              method: method,
              body: requestBodyText,
            });
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
                  window.postMessage(
                    {
                      type: "etsy-move-orders-response",
                      requestId: requestId,
                      url: url,
                      status: response.status,
                      ok: response.ok,
                      body: respText,
                      source: "page-inject"
                    },
                    "*"
                  );
                  postBridgeEvent("moveOrders.responded", {
                    requestId: requestId,
                    url: url,
                    status: response.status,
                    ok: response.ok,
                    body: respText,
                  });
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
   * 在主世界劫持 XMLHttpRequest，拦截 Etsy move-orders 接口
   */
  function patchXHRForEtsyMoveOrders() {
    if (typeof window.XMLHttpRequest !== "function") return;
    if (window.__etsyMoveOrdersXHRPatched) return;
    window.__etsyMoveOrdersXHRPatched = true;

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
        var needIntercept = shouldInterceptEtsyMoveOrders(_url, _method);
        var requestId = needIntercept
          ? "etsy-move-orders-xhr-" + Date.now() + "-" + Math.random()
          : null;

        if (needIntercept) {
          try {
            window.postMessage(
              {
                type: "etsy-move-orders-request",
                requestId: requestId,
                url: _url,
                method: _method,
                body: typeof body === "string" ? body : null,
                source: "page-inject"
              },
              "*"
            );
            postBridgeEvent("moveOrders.requested", {
              requestId: requestId,
              url: _url,
              method: _method,
              body: typeof body === "string" ? body : null,
            });
          } catch (e) {
            // 忽略 postMessage 错误
          }

          xhr.addEventListener("loadend", function () {
            try {
              window.postMessage(
                {
                  type: "etsy-move-orders-response",
                  requestId: requestId,
                  url: _url,
                  status: xhr.status,
                  ok: xhr.status >= 200 && xhr.status < 300,
                  body: xhr.responseText,
                  source: "page-inject"
                },
                "*"
              );
              postBridgeEvent("moveOrders.responded", {
                requestId: requestId,
                url: _url,
                status: xhr.status,
                ok: xhr.status >= 200 && xhr.status < 300,
                body: xhr.responseText,
              });
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
   * 在主世界中修改 select 下拉框的选中选项
   * 这样可以确保事件能被页面主世界的监听器捕获
   */
  function changeSelectOptionInMainWorld(orderNumber, optionValue) {
    try {
      const selectElement = document.getElementsByName(`carrierNameSelect-${orderNumber}`)[0];
      
      if (!selectElement) {
        return { success: false, error: "未找到 select 元素" };
      }

      const options = selectElement.options;
      
      // 遍历所有选项，按文本不区分大小写匹配
      for (let i = 0; i < options.length; i++) {
        if (options[i].text.toLowerCase() === optionValue.toLowerCase()) {
          // 设置值
          selectElement.value = options[i].value;
          
          // 在主世界中触发事件，确保能被页面监听器捕获
          // 使用多种事件类型确保兼容性
          const changeEvent = new Event("change", { bubbles: true, cancelable: true });
          selectElement.dispatchEvent(changeEvent);
          
          // 也触发 input 事件（某些框架可能需要）
          const inputEvent = new Event("input", { bubbles: true, cancelable: true });
          selectElement.dispatchEvent(inputEvent);
          
          return { success: true, value: options[i].value };
        }
      }
      
      return { success: false, error: "未找到匹配的选项" };
    } catch (error) {
      console.error("❌ [主世界] 修改 select 选项时发生错误:", error);
      return { success: false, error: error.message || "未知错误" };
    }
  }

  /**
   * 在主世界中修改 input 输入框的值
   */
  function changeInputValueInMainWorld(selector, value, triggerEvents) {
    try {
      const input = document.querySelector(selector);
      
      if (!input) {
        return { success: false, error: "未找到 input 元素" };
      }

      // 设置值
      input.value = value;

      // 触发事件
      if (triggerEvents !== false) {
        const events = ["focus", "input", "change", "blur"];
        events.forEach(eventType => {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          input.dispatchEvent(event);
        });
      }

      return { success: true };
    } catch (error) {
      console.error("❌ [主世界] 修改 input 值时发生错误:", error);
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

  // 启用对 Etsy move-orders 接口的劫持
  patchFetchForEtsyMoveOrders();
  patchXHRForEtsyMoveOrders();

  console.log("✅ [主世界] page-inject.js 已加载，可以访问 window.Etsy 对象和 DOM 操作");
})();
