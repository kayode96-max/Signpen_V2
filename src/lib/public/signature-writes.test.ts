import { describe, expect, it, vi } from "vitest";
import {
  EDITS_CLOSED_COPY,
  HIDE_UPDATE_FAILED_COPY,
  deleteOwnSignature,
  patchHiddenByOwner,
  patchOwnSignature,
} from "@/lib/public/signature-writes";

const id = "11111111-1111-4111-8111-111111111111";

describe("signature writes", () => {
  it("hides with a body that only sets hidden_by_owner", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }));
    await expect(patchHiddenByOwner(id, true, "token", fetchImpl as typeof fetch)).resolves.toEqual({
      ok: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/signatures/${id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ hidden_by_owner: true }),
      })
    );
    expect(HIDE_UPDATE_FAILED_COPY).toBe("Couldn't update. Check your connection and try again.");
  });

  it("patches the signer's fields and deletes through the signature route", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await patchOwnSignature(
      id,
      { signatoryName: "Tolu", signatoryNote: "Hello", privateBySigner: true },
      "token",
      fetchImpl as typeof fetch
    );
    await deleteOwnSignature(id, "token", fetchImpl as typeof fetch);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      signatoryName: "Tolu",
      signatoryNote: "Hello",
      privateBySigner: true,
    });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(fetchImpl.mock.calls[1][1].body).toBeUndefined();
  });

  it("marks a 403 as the closed edit window", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(deleteOwnSignature(id, "token", fetchImpl as typeof fetch)).resolves.toEqual({
      ok: false,
      closed: true,
    });
    expect(EDITS_CLOSED_COPY).toBe("Edits close 24 hours after signing");
  });
});
