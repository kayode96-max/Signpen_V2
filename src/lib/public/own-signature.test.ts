import { describe, expect, it } from "vitest";
import {
  clearEditsClosed,
  clearOwnSignature,
  readEditsClosed,
  readOwnSignature,
  saveEditsClosed,
  saveOwnSignature,
  type KeyValueStore,
} from "@/lib/public/own-signature";

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("own signature session", () => {
  it("remembers the signer's row and closes edits", () => {
    const store = memoryStore();
    expect(readOwnSignature(store, "board")).toBeNull();
    saveOwnSignature(store, "board", {
      id: "sig",
      signatoryName: "Tolu",
      signatoryNote: "Hello",
      privateBySigner: true,
    });
    expect(readOwnSignature(store, "board")?.signatoryNote).toBe("Hello");
    expect(readEditsClosed(store, "board")).toBe(false);
    saveEditsClosed(store, "board");
    expect(readEditsClosed(store, "board")).toBe(true);
    clearEditsClosed(store, "board");
    expect(readEditsClosed(store, "board")).toBe(false);
    clearOwnSignature(store, "board");
    expect(readOwnSignature(store, "board")).toBeNull();
  });
});
