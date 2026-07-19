import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconcilePage } from "../../src/features/reconcile/ReconcilePage";
import type { ReconcileReport } from "../../src/types/api";
import { json, renderWithProviders } from "../helpers/renderApp";

const report: ReconcileReport = {
  findings: [
    {
      kind: "lech_thue",
      hoaDonId: "h1",
      shdon: "0001510",
      tgtcthue: "287500000",
      ttcktmai: null,
      tgtthue: "28750000",
      tgtttbso: "316250500",
      lech: "500",
    },
    { kind: "thieu_so_dau_ra", nbmst: "4201568932", khhdon: "K26TTT", shdonThieu: 105 },
    { kind: "huy", hoaDonId: "h2", shdon: "0000104", tthai: 9, ttxly: null },
    { kind: "thay_the", hoaDonId: "h3", shdon: "0001284", tthai: 3, ttxly: null },
  ],
  summary: { lechThue: 1, thieuSoDauRa: 1, huy: 1, thayThe: 1 },
};

describe("U15.5 — đối chiếu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("render 4 loại finding đúng bản chất", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, report));
    renderWithProviders(<ReconcilePage />);
    // Banner + lệch thuế đúng số.
    expect(await screen.findByText(/Phát hiện 1 hóa đơn nghi lệch thuế/)).toBeInTheDocument();
    expect(screen.getByText("Lệch 500 đ")).toBeInTheDocument();
    expect(screen.getByText("HĐ 0001510")).toBeInTheDocument();
    // B2: nghi thiếu = khoảng trống dãy số (shdonThieu + khhdon + nbmst), nhãn "chưa khẳng định".
    expect(screen.getByText("chưa khẳng định")).toBeInTheDocument();
    expect(screen.getByText(/Số 105/)).toBeInTheDocument();
    expect(screen.getByText(/K26TTT/)).toBeInTheDocument();
    // B3: hủy/thay thế = shdon + mã (chưa rõ), KHÔNG "thay bằng HĐ".
    expect(screen.getByText("HĐ 0000104")).toBeInTheDocument();
    expect(screen.getByText(/9 \(chưa rõ\)/)).toBeInTheDocument();
  });

  it("KHÔNG có logic bịa: '% kỳ trước' và 'thay bằng HĐ'", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, report));
    renderWithProviders(<ReconcilePage />);
    await screen.findByText("HĐ 0001510");
    expect(screen.queryByText(/kỳ trước/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/thay bằng/i)).not.toBeInTheDocument();
  });

  it("rỗng → không phát hiện bất thường", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(200, { findings: [], summary: { lechThue: 0, thieuSoDauRa: 0, huy: 0, thayThe: 0 } }),
    );
    renderWithProviders(<ReconcilePage />);
    expect(await screen.findByText(/Không phát hiện bất thường/)).toBeInTheDocument();
  });
});
