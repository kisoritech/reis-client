import { describe, expect, it } from "vitest";
import {
  apiRequestSchema,
  apiUploadSchema,
  isAllowedExternalUrl,
  parseDeepLink,
} from "./validation";

describe("desktop security boundaries", () => {
  it("accepts an allowed deep link without transporting tokens", () => {
    expect(
      parseDeepLink("reis://atendimentos/123e4567-e89b-12d3-a456-426614174000"),
    ).toBe("/atendimentos/123e4567-e89b-12d3-a456-426614174000");
    expect(parseDeepLink("https://evil.example/token")).toBeNull();
  });

  it("blocks arbitrary external URLs", () => {
    const hosts = new Set(["app.seudominio.com"]);
    expect(
      isAllowedExternalUrl("https://app.seudominio.com/ajuda", hosts),
    ).toBe(true);
    expect(isAllowedExternalUrl("http://app.seudominio.com/ajuda", hosts)).toBe(
      false,
    );
    expect(isAllowedExternalUrl("https://evil.example/", hosts)).toBe(false);
    expect(isAllowedExternalUrl("tel:+5565999999999", hosts)).toBe(true);
    expect(isAllowedExternalUrl("tel:9999;evil", hosts)).toBe(false);
  });

  it("requires idempotency for mutations and restricts endpoints", () => {
    expect(
      apiRequestSchema.safeParse({ method: "GET", path: "/crm/atendimentos" })
        .success,
    ).toBe(true);
    expect(
      apiRequestSchema.safeParse({
        method: "POST",
        path: "/crm/atendimentos",
      }).success,
    ).toBe(false);
    expect(
      apiRequestSchema.safeParse({ method: "GET", path: "/admin/secrets" })
        .success,
    ).toBe(false);
    expect(
      apiRequestSchema.safeParse({ method: "GET", path: "/health-malicious" })
        .success,
    ).toBe(false);
  });

  it("accepts only bounded attendance image uploads", () => {
    expect(
      apiUploadSchema.safeParse({
        path: "/crm/atendimentos/123e4567-e89b-12d3-a456-426614174000/foto/upload",
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "foto.jpg",
        mimeType: "image/jpeg",
      }).success,
    ).toBe(true);
    expect(
      apiUploadSchema.safeParse({
        path: "/crm/atendimentos/123e4567-e89b-12d3-a456-426614174000/foto/upload",
        bytes: new Uint8Array([1]),
        fileName: "script.svg",
        mimeType: "image/svg+xml",
      }).success,
    ).toBe(false);
  });
});
