// Tải Blob về máy (tạo object URL tạm → anchor → thu hồi). Dùng cho file kết xuất
// (GET /exports/:id, có Authorization → phải fetch blob, không mở URL trực tiếp).
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
