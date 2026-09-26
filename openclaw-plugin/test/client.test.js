import assert from "node:assert/strict";
import test from "node:test";

import {
  ConcertoClientError,
  createConcertoRequest,
  parseAgentTokens,
} from "../src/client.js";

test("accepts only bounded canonical Agent token entries", () => {
  assert.deepEqual(
    parseAgentTokens(
      JSON.stringify({
        plato: "owner-supplied-token-value",
        "bad id": "owner-supplied-token-value",
        socrates: "short",
        nested: { token: "owner-supplied-token-value" },
      }),
    ),
    { plato: "owner-supplied-token-value" },
  );
  assert.deepEqual(parseAgentTokens("not-json"), {});
});

test("maps network failures to a stable error without leaking the token", async () => {
  const request = createConcertoRequest({
    baseUrl: "https://402v.com",
    fetchImpl: async () => {
      throw new Error("network failed with owner-supplied-token-value");
    },
  });

  await assert.rejects(
    request({
      method: "GET",
      path: "/api/concerto/work-items",
      token: "owner-supplied-token-value",
    }),
    (error) => {
      assert.ok(error instanceof ConcertoClientError);
      assert.equal(error.code, "UNAVAILABLE");
      assert.doesNotMatch(String(error), /owner-supplied-token-value/u);
      return true;
    },
  );
});

test("preserves structured API error codes without returning response details", async () => {
  const request = createConcertoRequest({
    baseUrl: "https://402v.com",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ error: "VERSION_CONFLICT", details: "sensitive" }),
        { status: 409 },
      ),
  });

  await assert.rejects(
    request({
      method: "PATCH",
      path: "/api/concerto/work-items/11111111-1111-4111-8111-111111111111",
      token: "owner-supplied-token-value",
      body: {},
    }),
    (error) => {
      assert.ok(error instanceof ConcertoClientError);
      assert.equal(error.code, "VERSION_CONFLICT");
      assert.equal(error.status, 409);
      assert.doesNotMatch(String(error), /sensitive/u);
      return true;
    },
  );
});

test("requires HTTPS before any request is attempted", () => {
  assert.throws(
    () => createConcertoRequest({ baseUrl: "http://402v.com" }),
    /must use HTTPS/u,
  );
});
