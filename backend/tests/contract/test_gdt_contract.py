"""
Contract test cho lớp GDT Adapter (backend/gdt_client.py).

Mục tiêu: phát hiện sớm khi Tổng cục Thuế đổi cấu trúc phản hồi API, thay vì
để việc đó âm thầm làm hỏng dữ liệu đồng bộ. Xem .claude/rules/gdt-adapter.md.

Hai nhóm test:
- `unit` (mặc định, chạy trong `make test`): mock HTTP, kiểm tra logic đối
  chiếu hợp đồng (_check_contract) và circuit breaker hoạt động đúng khi
  response giả lập bị thiếu trường.
- `contract` (chỉ chạy qua `make test-contract`): gọi thật endpoint công
  khai `/captcha` của GDT (không cần đăng nhập) để xác nhận hợp đồng vẫn
  đúng với môi trường thật. Không chạy trong CI mặc định vì phụ thuộc mạng
  và tôn trọng nguyên tắc "không gọi dồn dập máy chủ thuế".
"""

from __future__ import annotations

import pytest

from backend.gdt_client import (
    BASE,
    CONTRACT_SCHEMA,
    GdtClient,
    GdtContractDriftError,
)


def test_contract_schema_defines_captcha_and_invoice_envelope():
    """Hợp đồng phải định nghĩa tối thiểu các schema mà gdt_client.py dựa vào."""
    assert "captcha" in CONTRACT_SCHEMA
    assert "key" in CONTRACT_SCHEMA["captcha"]["required_keys"]
    assert "content" in CONTRACT_SCHEMA["captcha"]["required_keys"]
    assert "invoice_envelope" in CONTRACT_SCHEMA
    assert "datas" in CONTRACT_SCHEMA["invoice_envelope"]["required_keys"]


def test_get_captcha_succeeds_when_response_matches_contract(requests_mock):
    requests_mock.get(f"{BASE}/captcha", json={"key": "abc123", "content": "<svg>...</svg>"})

    client = GdtClient()
    data = client.get_captcha()

    assert data["key"] == "abc123"
    assert client._consecutive_contract_failures == 0


def test_get_captcha_raises_drift_error_when_field_missing(requests_mock):
    """Nếu GDT bỏ trường 'content' khỏi response /captcha, phải phát hiện ngay,
    không được coi ảnh captcha rỗng là hợp lệ."""
    requests_mock.get(f"{BASE}/captcha", json={"key": "abc123"})  # thiếu 'content'

    client = GdtClient()
    with pytest.raises(GdtContractDriftError, match="thiếu trường"):
        client.get_captcha()


def test_circuit_breaker_opens_after_three_consecutive_drifts(requests_mock):
    """3 lần lệch hợp đồng liên tiếp trên cùng 1 client -> circuit breaker mở,
    thông điệp lỗi phải nêu rõ 'Circuit breaker' để phân biệt với lỗi đơn lẻ."""
    requests_mock.get(f"{BASE}/captcha", json={"key": "abc123"})  # luôn thiếu 'content'
    client = GdtClient()

    for _ in range(2):
        with pytest.raises(GdtContractDriftError, match="thiếu trường"):
            client.get_captcha()

    with pytest.raises(GdtContractDriftError, match="Circuit breaker"):
        client.get_captcha()

    assert client._consecutive_contract_failures == 3


def test_contract_failure_counter_resets_after_success(requests_mock):
    client = GdtClient()

    requests_mock.get(f"{BASE}/captcha", json={"key": "abc123"})  # lệch
    with pytest.raises(GdtContractDriftError):
        client.get_captcha()
    assert client._consecutive_contract_failures == 1

    requests_mock.get(f"{BASE}/captcha", json={"key": "abc123", "content": "<svg/>"})  # đúng
    client.get_captcha()
    assert client._consecutive_contract_failures == 0


def test_login_failure_with_wrong_captcha_is_not_a_contract_drift(requests_mock):
    """GDT có thể trả HTTP 200 kèm message lỗi khi captcha/mật khẩu sai, mà
    không có 'token'. Đây là lỗi nghiệp vụ bình thường (GdtError), KHÔNG
    được hiểu nhầm thành lệch hợp đồng — nếu không, người dùng gõ sai
    captcha 3 lần sẽ tự mở circuit breaker."""
    requests_mock.post(
        f"{BASE}/security-taxpayer/authenticate",
        status_code=200,
        json={"message": "Mã xác thực không đúng."},
    )
    client = GdtClient()

    with pytest.raises(Exception) as exc_info:
        client.login("0123456789", "pw", "ckey", "wrong-captcha")

    from backend.gdt_client import GdtError

    assert isinstance(exc_info.value, GdtError)
    assert not isinstance(exc_info.value, GdtContractDriftError)
    assert client._consecutive_contract_failures == 0


def test_login_success_passes_contract_check(requests_mock):
    requests_mock.post(
        f"{BASE}/security-taxpayer/authenticate",
        status_code=200,
        json={"token": "jwt.token.value"},
    )
    client = GdtClient()

    token = client.login("0123456789", "pw", "ckey", "correct-captcha")

    assert token == "jwt.token.value"
    assert client._consecutive_contract_failures == 0


def test_invoice_envelope_missing_datas_is_soft_and_does_not_raise(requests_mock):
    """Điểm còn mơ hồ (chưa xác nhận thủ công): thiếu 'datas' chỉ log cảnh
    báo, không raise và không tính vào circuit breaker — theo tinh thần
    'Khi gặp mơ hồ' của .claude/rules/gdt-adapter.md."""
    requests_mock.get(
        f"{BASE}/query/invoices/purchase",
        json={"state": None},  # thiếu 'datas'
    )
    client = GdtClient()
    client.token = "fake-token"
    client.session.headers["Authorization"] = "Bearer fake-token"

    rows = client._query_one("/query/invoices/purchase", search="tdlap=ge=01/01/2024T00:00:00")

    assert rows == []
    assert client._consecutive_contract_failures == 0


@pytest.mark.contract
def test_captcha_live_contract():
    """Gọi thật /captcha (endpoint công khai) để xác nhận GDT chưa đổi API.

    Chạy: `make test-contract`. Không chạy trong `make test` mặc định.
    """
    client = GdtClient()
    data = client.get_captcha()  # tự raise GdtContractDriftError nếu lệch hợp đồng
    assert isinstance(data, dict)
