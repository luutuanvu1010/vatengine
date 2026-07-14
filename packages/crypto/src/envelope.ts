// U12 — Mã hóa bí mật TẠI NGHỈ bằng envelope encryption (security.md): mật khẩu
// thuế KHÔNG lưu; token JWT GDT mã hóa tại nghỉ. Dùng WebCrypto (`crypto.subtle`) —
// tương thích workerd (KHÔNG Node crypto), cùng nền với `apps/api/src/password.ts`.
//
// Envelope: KEK (Key-Encryption-Key, nạp từ Workers Secret) KHÔNG mã hóa trực tiếp
// dữ liệu; mỗi bản ghi sinh một DEK (Data-Encryption-Key) ngẫu nhiên mã hóa plaintext,
// rồi KEK "bọc" (wrap) DEK. Lợi ích: xoay vòng KEK chỉ cần bọc lại DEK, không giải
// toàn bộ dữ liệu; hai bản ghi cùng plaintext cho ciphertext khác nhau.
//
// Định dạng chuỗi TỰ MÔ TẢ (như `password.ts`): `v1$aesgcm$<wrapIv>$<wrappedDek>$<dataIv>$<ct>`
// — version tag `v1` mở đường rotation (quyết định #2: 1 KEK + version-tag). Mọi field b64.

const VERSION = "v1";
const ALG = "aesgcm";
const IV_BYTES = 12; // GCM IV chuẩn 96-bit.

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Kiểu CryptoKey suy ra từ chính WebCrypto (không đặt tên global `CryptoKey` — để
// package biên dịch được cả dưới lib workers-types LẪN @types/node ở các consumer).
type CryptoKeyT = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

// Nhập KEK từ chuỗi base64 (32 byte = AES-256) thành khóa bọc/mở DEK.
async function importKek(kekB64: string): Promise<CryptoKeyT> {
  const raw = fromB64(kekB64);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Mã hóa `plaintext` tại nghỉ dưới `kekB64`. Trả chuỗi sealed tự mô tả. */
export async function sealSecret(plaintext: string, kekB64: string): Promise<string> {
  const kek = await importKek(kekB64);

  // DEK ngẫu nhiên mỗi bản ghi → không tất định, cô lập bán kính rò rỉ. AES-GCM đối
  // xứng nên generateKey trả CryptoKey (không phải CryptoKeyPair); workers-types khai
  // báo union rộng → thu hẹp tường minh.
  const dek = (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
  ])) as CryptoKeyT;
  const dekRaw = new Uint8Array((await crypto.subtle.exportKey("raw", dek)) as ArrayBuffer);

  const dataIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: dataIv },
      dek,
      new TextEncoder().encode(plaintext),
    ),
  );

  // Bọc DEK bằng KEK (AES-GCM encrypt trên raw bytes của DEK).
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, kek, dekRaw),
  );

  return [VERSION, ALG, toB64(wrapIv), toB64(wrappedDek), toB64(dataIv), toB64(ct)].join("$");
}

/** Giải mã chuỗi sealed dưới `kekB64`. Ném lỗi nếu KEK sai hoặc chuỗi hỏng. */
export async function openSecret(sealed: string, kekB64: string): Promise<string> {
  const parts = sealed.split("$");
  if (parts.length !== 6) throw new Error("crypto: định dạng sealed không hợp lệ");
  const [version, alg, wrapIvB64, wrappedDekB64, dataIvB64, ctB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION || alg !== ALG) {
    throw new Error(`crypto: version/alg không hỗ trợ (${version}/${alg})`);
  }

  const kek = await importKek(kekB64);

  // Mở DEK (AES-GCM tự xác thực tag → KEK sai sẽ ném ở đây).
  const dekRaw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(wrapIvB64) },
      kek,
      fromB64(wrappedDekB64),
    ),
  );
  const dek = await crypto.subtle.importKey("raw", dekRaw, "AES-GCM", false, ["decrypt"]);

  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(dataIvB64) },
    dek,
    fromB64(ctB64),
  );
  return new TextDecoder().decode(pt);
}
