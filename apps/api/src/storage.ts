// Wiring production R2 cho kết xuất (U7). Ghi/đọc object qua binding `env.RAW`. KHÔNG
// test-cover (test tiêm R2 giả trong bộ nhớ); cần kiểm chứng với R2 thật khi deploy (như
// Hyperdrive ở U6 — probe khi deploy). Ghi bằng stream/bytes → không giữ file lớn trong RAM.
import type { Env, StorageHandle } from "./types";

export function getStorageFromR2(env: Env): StorageHandle {
  return {
    put: async (key, body) => {
      await env.RAW.put(key, body);
    },
    get: async (key) => {
      const obj = await env.RAW.get(key);
      if (!obj) return null;
      return new Uint8Array(await obj.arrayBuffer());
    },
  };
}
