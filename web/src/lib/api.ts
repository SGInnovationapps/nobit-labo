import { DEMO } from "./config";
import { supabase } from "./supabase";
import { errorMessage } from "./format";

export class ApiError extends Error {
  constructor(public code: string) {
    super(errorMessage(code));
  }
}

/** DB の RPC を呼ぶ。見本モードでは見本データを返す */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (DEMO) {
    const { demoRpc } = await import("../demo/fixtures");
    return demoRpc(fn, args ?? {}) as T;
  }
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = /([a-z_]+)$/.exec(error.message.trim())?.[1] ?? error.message;
    throw new ApiError(code);
  }
  return data as T;
}

export const newRequestId = () => crypto.randomUUID();
