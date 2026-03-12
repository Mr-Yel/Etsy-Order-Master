/**
 * Notyf 轻提示 — 在 WXT/Vue 中单例使用，用于 success/error 等 toast
 */
import { Notyf } from "notyf";
import "notyf/notyf.min.css";

let notyfInstance: Notyf | null = null;

function getNotyf(): Notyf {
  if (!notyfInstance) {
    notyfInstance = new Notyf({
      duration: 2000,
      position: {
        x: "center",
        y: "top",
      },
      types: [
        {
          type: "success",
          background: "#67C23A",
          icon: false,
        },
        {
          type: "error",
          background: "#F56C6C",
          icon: false,
        },
      ],
    });
  }
  return notyfInstance;
}

export function useNotyf() {
  const notyf = getNotyf();
  return {
    success: (message: string) => notyf.success(message),
    error: (message: string) => notyf.error(message),
    open: (options: { type: string; message: string; duration?: number }) =>
      notyf.open(options),
  };
}
