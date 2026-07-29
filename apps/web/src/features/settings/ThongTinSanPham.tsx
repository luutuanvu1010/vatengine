// U20 §5 — Thông tin sản phẩm, pháp lý và quyền lợi. Bốn card hiển thị dưới hồ sơ tenant
// trong trang Cài đặt.
//
// Đây là VĂN BẢN PHÁP LÝ hiển thị cho doanh nghiệp thật, không phải chữ trang trí. Câu chữ
// do chủ dự án cấp và duyệt; Claude chỉ biên tập cho khớp hành vi thật của hệ thống.
//
// 🔴 RÀNG BUỘC CỐT LÕI (QĐ-8, chủ dự án duyệt 2026-07-21): bản gốc viết "không lưu thông
// tin kết nối đã cung cấp". Thực tế kỹ thuật (U14) là hệ thống **CÓ lưu token GDT, đã mã
// hoá**, để chạy đồng bộ nền — và **không** lưu mật khẩu thuế thô. Câu dưới đây đã điều
// chỉnh để nói ĐÚNG hành vi đó. Không được đổi ngược lại: một tuyên bố sai lệch với thực
// tế trong văn bản pháp lý là rủi ro thật, không phải chuyện chữ nghĩa.
import { Card, SectionTitle } from "../../components/ui/primitives";
import { ORG } from "../../lib/orgInfo";
import { OrgIdentity } from "../about/OrgIdentity";

/** Đoạn văn để ĐỌC — luôn `--fs-base`, không bao giờ `--fs-sm` (QĐ-9). */
const doanVan: React.CSSProperties = {
  fontSize: "var(--fs-base)",
  lineHeight: 1.65,
  margin: "0 0 var(--sp-3)",
};

export function ThongTinSanPham() {
  return (
    <>
      <Card>
        <SectionTitle style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
          Về phần mềm
        </SectionTitle>
        <p style={doanVan}>
          <strong>{ORG.sanPham} — phiên bản v1.0.</strong> {ORG.sanPham} giúp doanh nghiệp trích
          xuất đầy đủ hóa đơn điện tử <strong>đầu vào (mua vào)</strong> và{" "}
          <strong>đầu ra (bán ra)</strong> trực tiếp từ tài khoản chính thức của doanh nghiệp trên
          Hệ thống Hóa đơn điện tử của Tổng cục Thuế.
        </p>
        <p style={doanVan}>
          <strong>Mục tiêu cao nhất:</strong> giúp doanh nghiệp tự chủ dữ liệu hóa đơn của mình,
          phục vụ đối chiếu — kê khai — tích hợp kế toán.
        </p>
        <p style={{ ...doanVan, marginBottom: 0 }}>
          Phần mềm phục vụ <strong>miễn phí</strong> cho doanh nghiệp Việt Nam.
        </p>
      </Card>

      <Card>
        <SectionTitle style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
          Chính sách sử dụng và điều khoản bảo mật
        </SectionTitle>
        <p style={doanVan}>
          Người dùng cần tuân thủ Chính sách sử dụng và Điều khoản bảo mật khi dùng {ORG.sanPham}.
        </p>
        <p style={doanVan}>
          Khi cung cấp tài khoản để kết nối mã số thuế, người dùng{" "}
          <strong>cam kết mình được ủy quyền hợp pháp</strong> sử dụng tài khoản đó.
        </p>
        {/* QĐ-8 — câu này nói ĐÚNG hành vi thật. Đừng sửa thành "không lưu thông tin kết
            nối": hệ thống có lưu token, đã mã hoá, để đồng bộ nền hoạt động. */}
        <p style={doanVan}>
          <strong>Chúng tôi không lưu mật khẩu tài khoản thuế của người dùng.</strong> Phiên kết nối
          (token) do cơ quan thuế cấp được <strong>mã hóa khi lưu trữ</strong> và chỉ dùng để đồng
          bộ hóa đơn theo yêu cầu của chính người dùng.
        </p>
        <p style={{ ...doanVan, marginBottom: 0 }}>
          Dữ liệu của mỗi doanh nghiệp được cách ly hoàn toàn theo mã số thuế. Chúng tôi không chịu
          trách nhiệm pháp lý đối với các vấn đề khác phát sinh ngoài phạm vi phần mềm.
        </p>
      </Card>

      {/* Tác giả phần mềm — DÙNG LẠI `OrgIdentity` (U32) thay vì viết card riêng.
          Component đó đã hiển thị danh tính pháp nhân trên Dashboard; chép thêm một bản ở
          đây là tạo nguồn HIỂN THỊ thứ hai — hai đoạn markup cùng nói một thứ sẽ lệch nhau
          khi công ty đổi địa chỉ, và sai một chữ ở thông tin pháp nhân là sai pháp lý. */}
      <OrgIdentity />

      <Card>
        <SectionTitle style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
          Quyền lợi tài khoản
        </SectionTitle>
        {/* CỐ Ý KHÔNG lặp lại "Gói dịch vụ" ở đây: card hồ sơ phía trên đã hiện nó, lấy
            ĐỘNG từ `/me`. Nhắc lại bằng chuỗi tĩnh vừa thừa, vừa sẽ NÓI DỐI ngay khi có
            tenant dùng gói khác Free — hai chỗ hiển thị cùng một thứ thì chỗ tĩnh luôn là
            chỗ sai trước.
            Chỉ liệt kê những gì hồ sơ KHÔNG nói: hạn mức và kênh hỗ trợ. */}
        <ul style={{ ...doanVan, marginBottom: 0, paddingLeft: "1.25rem" }}>
          <li>
            Số mã số thuế được kết nối: <strong>01</strong>
          </li>
          <li>Hỗ trợ: qua trang Giới thiệu &amp; Hỗ trợ</li>
        </ul>
      </Card>
    </>
  );
}
