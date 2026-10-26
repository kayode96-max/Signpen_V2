import { describe, expect, it } from "vitest";
import {
  BOARD_CACHE_CONTROL,
  BOARD_INVALID_ID_CACHE_CONTROL,
  BOARD_NO_STORE,
  BOARD_REDIRECT_CACHE_CONTROL,
  SIGNATURE_REFRESH_DEBOUNCE_MS,
  boardCacheControl,
  graduateFirstName,
  mapSignaturesPublic,
  privateNoteLine,
  signatureChannelFailed,
  signatureDetail,
} from "@/lib/public/board-signatures";

const image = "data:image/png;base64,aaaa";

describe("signatures_public rows", () => {
  it("maps signatoryNote and is_private, ignoring message and private", () => {
    expect(
      mapSignaturesPublic([
        {
          id: "sig-1",
          signatoryName: "Tolu",
          signatureImageUrl: image,
          signatoryNote: "You did it",
          is_private: false,
          message: "wrong field",
          private: true,
          position: { x: 10, y: 20 },
        },
      ])
    ).toEqual([
      {
        id: "sig-1",
        signatoryName: "Tolu",
        signatureImageUrl: image,
        signatoryNote: "You did it",
        isPrivate: false,
        position: { x: 10, y: 20 },
      },
    ]);
  });

  it("renders a private row without the note", () => {
    const [row] = mapSignaturesPublic([
      {
        id: "sig-2",
        signatoryName: "Tolu",
        signatureImageUrl: image,
        signatoryNote: "secret",
        is_private: true,
        position: { x: 1, y: 2 },
      },
    ]);
    expect(row.isPrivate).toBe(true);
    expect(row.signatoryNote).toBeNull();
    expect(row.signatureImageUrl).toBe(image);
    expect(signatureDetail(row, "Ada Lovelace")).toEqual({
      name: "Tolu",
      text: "Message for Ada only",
    });
  });

  it("keeps a null note public when is_private is false and drops hidden rows", () => {
    const rows = mapSignaturesPublic([
      {
        id: "sig-3",
        signatoryName: "Bo",
        signatureImageUrl: image,
        signatoryNote: null,
        is_private: false,
        position: { x: 3, y: 4 },
      },
      {
        id: "sig-4",
        signatoryName: "Hidden",
        signatureImageUrl: image,
        signatoryNote: "nope",
        is_private: false,
        hidden_by_owner: true,
        position: { x: 8, y: 9 },
        ipHash: "nope",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("sig-3");
    expect(rows[0].isPrivate).toBe(false);
    expect(rows[0].signatoryNote).toBeNull();
    expect(rows[0]).not.toHaveProperty("ipHash");
  });
});

describe("private message copy", () => {
  it("uses the graduate's first name under the signer's name", () => {
    expect(graduateFirstName("Ada Lovelace")).toBe("Ada");
    expect(privateNoteLine("Ada Lovelace")).toBe("Message for Ada only");
    expect(privateNoteLine("Chinwe Okafor")).toBe("Message for Chinwe only");
    expect(
      signatureDetail(
        { signatoryName: "Tolu", signatoryNote: null, isPrivate: true },
        "Chinwe Okafor"
      ).text
    ).toBe("Message for Chinwe only");
  });
});

describe("board cache", () => {
  it("publishes a one-minute edge cache and treats subscription loss as a poll", () => {
    expect(BOARD_CACHE_CONTROL).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(boardCacheControl("success")).toBe(BOARD_CACHE_CONTROL);
    expect(boardCacheControl("error")).toBe(BOARD_NO_STORE);
    expect(boardCacheControl("unknown-board")).toBe(BOARD_NO_STORE);
    expect(boardCacheControl("invalid-id")).toBe(BOARD_INVALID_ID_CACHE_CONTROL);
    expect(BOARD_INVALID_ID_CACHE_CONTROL).toBe("public, s-maxage=60");
    expect(BOARD_NO_STORE).toBe("no-store");
    expect(BOARD_REDIRECT_CACHE_CONTROL).toBe("public, max-age=60");
    expect(BOARD_REDIRECT_CACHE_CONTROL).not.toContain("s-maxage");
    expect(SIGNATURE_REFRESH_DEBOUNCE_MS).toBe(2000);
    expect(signatureChannelFailed("CHANNEL_ERROR")).toBe(true);
    expect(signatureChannelFailed("TIMED_OUT")).toBe(true);
    expect(signatureChannelFailed("SUBSCRIBED")).toBe(false);
    expect(signatureChannelFailed("CLOSED")).toBe(false);
  });
});
