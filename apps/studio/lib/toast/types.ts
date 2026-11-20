export const ToastType = {
  error: "error",
  info: "info",
  success: "success",
  warning: "warning"
} as const;

export type ToastType = (typeof ToastType)[keyof typeof ToastType];

export type ToastMessage = {
  message: string;
  type: ToastType;
};
