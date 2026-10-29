import assert from "node:assert/strict";
import test from "node:test";

import {
  ConcertoClientError,
  createConcertoRequest,
  parseAgentTokens,
  resolveContextToken,
} from "../src/client.js";

test("uses only current Agent prepared SecretRef; unresolved explicit refs never fall back", () => {
  const calls=[];
  const config={agentTokens:{main:{source:"store",provider:"default",id:"CONCERTO_MAIN_API_TOKEN"}}};
  const readPrepared=(plugin,path)=>{calls.push([plugin,path]);return {value:"prepared-main-secret-value",revision:1};};
  assert.equal(resolveContextToken({agentId:"main",config,readPrepared,env:{}}),"prepared-main-secret-value");
  assert.deepEqual(calls,[["openclaw-concerto","agentTokens.main"]]);
  const env={CONCERTO_AGENT_API_TOKENS:JSON.stringify({main:"legacy-main-token-value",plato:"legacy-plato-token-value"})};
  assert.equal(resolveContextToken({agentId:"main",config,readPrepared:()=>({revision:2}),env}),null);
  assert.equal(resolveContextToken({agentId:"plato",config,readPrepared,env}),"legacy-plato-token-value");
  assert.equal(calls.length,1);
  assert.equal(resolveContextToken({agentId:"../main",config,readPrepared,env}),null);
});

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
