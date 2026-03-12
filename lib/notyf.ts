/**
 * Notyf 单例 — 供 content script、popup、Vue 等非/含 Vue 环境共用
 * 样式在此处统一引入，保证任意入口首次使用时生效
 */
import { Notyf } from "notyf";
import "notyf/notyf.min.css";

let notyfInstance: Notyf | null = null;

const defaultOptions: ConstructorParameters<typeof Notyf>[0] = {
  duration: 2000,
  position: { x: "center", y: "top" },
  types: [
    { type: "success", background: "#67C23A", icon: false },
    { type: "error", background: "#F56C6C", icon: false },
  ],
};

export function getNotyf(opts?: ConstructorParameters<typeof Notyf>[0]): Notyf {
  if (!notyfInstance) {
    notyfInstance = new Notyf(opts ?? defaultOptions);
  }
  return notyfInstance;
}
