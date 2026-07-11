"""
Client kết nối trực tiếp tới Hệ thống Hóa đơn điện tử của Tổng cục Thuế
(hoadondientu.gdt.gov.vn).

Luồng hoạt động giống hệt trình duyệt khi bạn đăng nhập trên portal thuế:
  1. Lấy ảnh captcha (GET /captcha)         -> trả về {key, ảnh SVG}
  2. Đăng nhập (POST /security-taxpayer/authenticate) -> trả về JWT token
  3. Dùng token gọi các API tra cứu hóa đơn (mua vào / bán ra)
  4. Lấy chi tiết từng hóa đơn (các dòng hàng hóa, thuế suất...)

Toàn bộ dữ liệu là dữ liệu THUỘC THẨM QUYỀN của chính doanh nghiệp đăng nhập.
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import requests
import urllib3

logger = logging.getLogger("vatcrawlbot.gdt_client")

# Portal dùng cổng 30000 cho API. Một số môi trường mạng nội bộ VN gặp lỗi
# xác thực chuỗi chứng chỉ -> tắt cảnh báo, nhưng mặc định vẫn verify=True.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = "https://hoadondientu.gdt.gov.vn:30000"

# Hai "họ" endpoint:
#   query      -> hóa đơn điện tử thông thường
#   sco-query  -> hóa đơn khởi tạo từ máy tính tiền (SCO)
INVOICE_ENDPOINTS = {
    "purchase": {  # HÓA ĐƠN ĐẦU VÀO (mua vào)
        "normal": "/query/invoices/purchase",
        "sco": "/sco-query/invoices/purchase",
    },
    "sold": {  # HÓA ĐƠN ĐẦU RA (bán ra)
        "normal": "/query/invoices/sold",
        "sco": "/sco-query/invoices/sold",
    },
}
DETAIL_ENDPOINTS = {
    "normal": "/query/invoices/detail",
    "sco": "/sco-query/invoices/detail",
}

# ---------------------------------------------------------------------- #
# Hợp đồng (contract) với API GDT — nguồn chân lý duy nhất để phát hiện
# khi Tổng cục Thuế đổi cấu trúc phản hồi. Xem .claude/rules/gdt-adapter.md
# và backend/tests/contract/test_gdt_contract.py.
# ---------------------------------------------------------------------- #
_SCHEMA_PATH = Path(__file__).parent / "gdt_contract_schema.json"
try:
    with _SCHEMA_PATH.open(encoding="utf-8") as _f:
        CONTRACT_SCHEMA: Dict[str, Dict[str, Any]] = json.load(_f)
except FileNotFoundError:  # pragma: no cover - chỉ xảy ra nếu file bị xoá nhầm
    CONTRACT_SCHEMA = {}

# Số lần lệch hợp đồng liên tiếp trước khi circuit breaker mở (dừng gọi tiếp).
MAX_CONSECUTIVE_CONTRACT_FAILURES = 3

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) "
        "Gecko/20100101 Firefox/131.0"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "vi",
    "Origin": "https://hoadondientu.gdt.gov.vn",
    "Referer": "https://hoadondientu.gdt.gov.vn/",
}


class GdtError(Exception):
    """Lỗi trả về từ hệ thống Tổng cục Thuế."""


class GdtContractDriftError(GdtError):
    """
    Phản hồi từ API GDT thiếu trường so với hợp đồng đã biết
    (backend/gdt_contract_schema.json). Đây là tín hiệu Tổng cục Thuế có thể
    đã đổi cấu trúc API — KHÔNG được âm thầm bỏ qua hay tự nới lỏng để "cho
    qua". Dừng đồng bộ, kiểm tra thủ công.
    """


def _check_contract(data: Dict[str, Any], schema_key: str, context: str) -> None:
    """Đối chiếu `data` với required_keys trong CONTRACT_SCHEMA[schema_key].

    Không raise nếu schema_key chưa được định nghĩa (fail-open cho phần
    chưa có hợp đồng), nhưng raise GdtContractDriftError nếu có định nghĩa
    mà thiếu trường bắt buộc.
    """
    schema = CONTRACT_SCHEMA.get(schema_key)
    if not schema:
        return
    required = schema.get("required_keys", [])
    missing = [k for k in required if not isinstance(data, dict) or k not in data]
    if missing:
        raise GdtContractDriftError(
            f"Phản hồi từ {context} thiếu trường {missing} so với hợp đồng đã biết "
            f"(schema '{schema_key}'). Tổng cục Thuế có thể đã đổi API."
        )


class GdtClient:
    def __init__(self, verify_ssl: bool = True, timeout: int = 60):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.verify_ssl = verify_ssl
        self.timeout = timeout
        self.token: Optional[str] = None
        # Circuit breaker cho lệch hợp đồng API — xem _note_contract_result().
        self._consecutive_contract_failures = 0

    def _note_contract_result(self, ok: bool, context: str = "") -> None:
        """Cập nhật bộ đếm circuit breaker sau mỗi lần kiểm tra hợp đồng.

        3 lần lệch hợp đồng liên tiếp -> mở circuit breaker, chặn gọi tiếp
        cho tới khi client được tạo lại (tức người vận hành đã can thiệp).
        """
        if ok:
            self._consecutive_contract_failures = 0
            return
        self._consecutive_contract_failures += 1
        logger.critical(
            "GDT contract drift #%d tại %s",
            self._consecutive_contract_failures,
            context,
        )
        if self._consecutive_contract_failures >= MAX_CONSECUTIVE_CONTRACT_FAILURES:
            raise GdtContractDriftError(
                f"Circuit breaker: {self._consecutive_contract_failures} lần liên tiếp "
                "lệch hợp đồng API GDT. Dừng đồng bộ tự động — cần xác nhận thủ công "
                "trước khi tiếp tục."
            )

    # ------------------------------------------------------------------ #
    # 1 & 2. Xác thực
    # ------------------------------------------------------------------ #
    def get_captcha(self) -> Dict[str, str]:
        """Trả về {'key': <ckey>, 'content': <chuỗi SVG ảnh captcha>}."""
        r = self.session.get(f"{BASE}/captcha", verify=self.verify_ssl, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        try:
            _check_contract(data, "captcha", "/captcha")
        except GdtContractDriftError:
            self._note_contract_result(False, context="/captcha")
            raise
        self._note_contract_result(True)
        return data

    def login(self, username: str, password: str, ckey: str, cvalue: str) -> str:
        """
        Đăng nhập bằng tài khoản MST của doanh nghiệp.

        username : Mã số thuế (hoặc tài khoản người dùng con nếu dùng sub-user).
        password : Mật khẩu tài khoản thuế.
        ckey     : 'key' lấy từ get_captcha().
        cvalue   : Chuỗi captcha người dùng đọc và nhập.
        """
        payload = {
            "ckey": ckey,
            "cvalue": cvalue,
            "username": username,
            "password": password,
        }
        r = self.session.post(
            f"{BASE}/security-taxpayer/authenticate",
            json=payload,
            verify=self.verify_ssl,
            timeout=self.timeout,
        )
        try:
            data = r.json()
        except ValueError:
            raise GdtError(f"Phản hồi không hợp lệ từ máy chủ thuế (HTTP {r.status_code}).")

        if r.status_code != 200 or not data.get("token"):
            # Đăng nhập sai (captcha/mật khẩu sai) là lỗi nghiệp vụ bình
            # thường, KHÔNG phải lệch hợp đồng — GDT vẫn có thể trả HTTP 200
            # kèm message lỗi mà không có token. Không được đưa nhánh này
            # vào kiểm tra hợp đồng, nếu không 3 lần gõ sai captcha của
            # người dùng thật sẽ tự mở circuit breaker.
            msg = data.get("message") or data.get("error_description") or "Đăng nhập thất bại."
            raise GdtError(msg)

        # Tới đây coi là đăng nhập thành công (đã có token) — xác nhận thêm
        # một lần rằng hình dạng response vẫn khớp hợp đồng đã biết.
        try:
            _check_contract(data, "authenticate", "/security-taxpayer/authenticate")
        except GdtContractDriftError:
            self._note_contract_result(False, context="/security-taxpayer/authenticate")
            raise
        self._note_contract_result(True)

        self.token = data["token"]
        self.session.headers["Authorization"] = f"Bearer {self.token}"
        return self.token

    def set_token(self, token: str) -> None:
        self.token = token
        self.session.headers["Authorization"] = f"Bearer {token}"

    # ------------------------------------------------------------------ #
    # 3. Tra cứu danh sách hóa đơn
    # ------------------------------------------------------------------ #
    @staticmethod
    def _build_search(date_from: str, date_to: str, ttxly: Optional[int]) -> str:
        """
        Dựng chuỗi truy vấn RSQL giống portal.
        date_from / date_to định dạng dd/mm/yyyy.
        ttxly: trạng thái xử lý (None = không lọc theo trạng thái).
        """
        parts = [
            f"tdlap=ge={date_from}T00:00:00",
            f"tdlap=le={date_to}T23:59:59",
        ]
        if ttxly is not None:
            parts.append(f"ttxly=={ttxly}")
        return ";".join(parts)

    def _query_one(
        self,
        endpoint: str,
        search: str,
        size: int = 50,
        sort: str = "tdlap:desc,khmshdon:asc,shdon:desc",
    ) -> List[Dict[str, Any]]:
        """Gọi 1 endpoint và tự động phân trang tới khi hết dữ liệu."""
        if not self.token:
            raise GdtError("Chưa đăng nhập. Hãy gọi login() trước.")

        results: List[Dict[str, Any]] = []
        state: Optional[str] = None
        guard = 0
        while True:
            guard += 1
            if guard > 2000:  # chặn vòng lặp vô hạn
                break
            params: Dict[str, Any] = {"sort": sort, "size": size, "search": search}
            if state:
                params["state"] = state
            r = self.session.get(
                f"{BASE}{endpoint}",
                params=params,
                verify=self.verify_ssl,
                timeout=self.timeout,
            )
            if r.status_code == 401:
                raise GdtError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
            r.raise_for_status()
            data = r.json()
            # Kiểm tra hợp đồng ở mức "mềm" (chỉ log, không raise/không tính
            # vào circuit breaker): chưa có bằng chứng thực tế xác nhận GDT
            # luôn trả 'datas' kể cả khi rỗng — .get(...) or [] trong code
            # gốc vốn đã coi việc thiếu 'datas' là hợp lệ. Tự ý raise ở đây
            # có thể tự mở circuit breaker vì một kết quả rỗng bình thường,
            # đúng thứ "Khi gặp mơ hồ" của gdt-adapter.md muốn tránh (không
            # tự giả định nghiêm ngặt khi chưa xác nhận thủ công).
            try:
                _check_contract(data, "invoice_envelope", endpoint)
            except GdtContractDriftError as drift:
                logger.warning(
                    "Phong bì hóa đơn từ %s không khớp hợp đồng kỳ vọng (%s). "
                    "Coi là rỗng, KHÔNG mở circuit breaker vì đây là điểm còn mơ hồ "
                    "chưa xác nhận thủ công — xem .claude/rules/gdt-adapter.md.",
                    endpoint,
                    drift,
                )
            else:
                self._note_contract_result(True)
            datas = data.get("datas") or []
            results.extend(datas)
            state = data.get("state")
            if len(datas) < size or not state:
                break
        return results

    def query_invoices(
        self,
        direction: str,  # 'purchase' (đầu vào) | 'sold' (đầu ra)
        date_from: str,  # dd/mm/yyyy
        date_to: str,  # dd/mm/yyyy
        statuses: Optional[Iterable[int]] = (5, 6, 8),
        include_sco: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Lấy toàn bộ hóa đơn trong khoảng thời gian.

        statuses: các trạng thái xử lý (ttxly) cần lấy. Mặc định 5,6,8 bao phủ
                  hóa đơn đã cấp mã / tổng hợp. Truyền None để không lọc.
        include_sco: có lấy thêm hóa đơn máy tính tiền không.
        """
        if direction not in INVOICE_ENDPOINTS:
            raise ValueError("direction phải là 'purchase' hoặc 'sold'.")

        eps = INVOICE_ENDPOINTS[direction]
        kinds = ["normal"] + (["sco"] if include_sco else [])
        status_list: List[Optional[int]] = list(statuses) if statuses else [None]

        seen: set = set()
        merged: List[Dict[str, Any]] = []
        for kind in kinds:
            for st in status_list:
                search = self._build_search(date_from, date_to, st)
                try:
                    rows = self._query_one(eps[kind], search)
                except requests.HTTPError:
                    # endpoint sco có thể không áp dụng với 1 số tài khoản -> bỏ qua
                    if kind == "sco":
                        continue
                    raise
                for row in rows:
                    key = (
                        row.get("nbmst"),
                        row.get("khhdon"),
                        row.get("khmshdon"),
                        row.get("shdon"),
                        row.get("tdlap"),
                    )
                    if key in seen:
                        continue
                    seen.add(key)
                    row["_source"] = kind  # normal / sco
                    row["_direction"] = direction
                    merged.append(row)
        return merged

    # ------------------------------------------------------------------ #
    # 4. Chi tiết 1 hóa đơn (các dòng hàng hóa, thuế suất...)
    # ------------------------------------------------------------------ #
    def invoice_detail(self, row: Dict[str, Any]) -> Dict[str, Any]:
        kind = row.get("_source", "normal")
        endpoint = DETAIL_ENDPOINTS.get(kind, DETAIL_ENDPOINTS["normal"])
        params = {
            "nbmst": row.get("nbmst"),
            "khhdon": row.get("khhdon"),
            "khmshdon": row.get("khmshdon"),
            "shdon": row.get("shdon"),
            "tdlap": row.get("tdlap"),
        }
        r = self.session.get(
            f"{BASE}{endpoint}",
            params=params,
            verify=self.verify_ssl,
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------- #
# Tên hiển thị tiếng Việt cho các trường dữ liệu chính
# ---------------------------------------------------------------------- #
FIELD_LABELS = {
    "nbmst": "MST người bán",
    "nbten": "Tên người bán",
    "nmmst": "MST người mua",
    "nmten": "Tên người mua",
    "khmshdon": "Ký hiệu mẫu số",
    "khhdon": "Ký hiệu hóa đơn",
    "shdon": "Số hóa đơn",
    "tdlap": "Ngày lập",
    "ncnhat": "Ngày cập nhật",
    "tgtcthue": "Tổng tiền chưa thuế",
    "tgtthue": "Tổng tiền thuế",
    "tgtttbso": "Tổng thanh toán",
    "tgtttbchu": "Tổng thanh toán (chữ)",
    "ttcktmai": "Chiết khấu TM",
    "dvtte": "Đơn vị tiền tệ",
    "tgia": "Tỷ giá",
    "ttxly": "Trạng thái xử lý",
    "tthai": "Trạng thái HĐ",
    "hdon": "Loại HĐ",
}

# Thứ tự cột khi xuất bảng / Excel
EXPORT_COLUMNS = [
    ("tdlap", "Ngày lập"),
    ("khmshdon", "Ký hiệu mẫu số"),
    ("khhdon", "Ký hiệu HĐ"),
    ("shdon", "Số HĐ"),
    ("nbmst", "MST người bán"),
    ("nbten", "Tên người bán"),
    ("nmmst", "MST người mua"),
    ("nmten", "Tên người mua"),
    ("tgtcthue", "Tiền chưa thuế"),
    ("tgtthue", "Tiền thuế"),
    ("tgtttbso", "Tổng thanh toán"),
    ("dvtte", "Tiền tệ"),
    ("ttxly_text", "Trạng thái"),
    ("_source_text", "Nguồn"),
]

TTXLY_TEXT = {
    1: "Mới",
    5: "Đã cấp mã hóa đơn",
    6: "Tổng hợp dữ liệu",
    8: "Hóa đơn có mã đã gửi",
}

SOURCE_TEXT = {"normal": "HĐĐT", "sco": "Máy tính tiền"}


def normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Bổ sung các trường 'đọc được' để hiển thị/xuất Excel."""
    out = dict(row)
    out["ttxly_text"] = TTXLY_TEXT.get(row.get("ttxly"), str(row.get("ttxly", "")))
    out["_source_text"] = SOURCE_TEXT.get(row.get("_source", "normal"), "")
    # Chuẩn hóa ngày cho dễ đọc
    tdlap = row.get("tdlap")
    if isinstance(tdlap, str) and "T" in tdlap:
        try:
            out["tdlap"] = _dt.datetime.fromisoformat(tdlap.replace("Z", "")).strftime(
                "%d/%m/%Y"
            )
        except ValueError:
            pass
    return out
