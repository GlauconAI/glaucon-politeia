import { describe, expect, it } from "vitest";

import {
  DATA_BLOCK_ID,
  canonicalizeJson,
  computeSourceHash,
  extractDataBlocks,
  serializeDataBlocks,
  stableJson,
} from "../lib/html-note-kit/data-blocks.mjs";
import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";

function expectInvalidDataBlock(run: () => unknown) {
  try {
    run();
    throw new Error("Expected an INVALID_DATA_BLOCK error");
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactBuildError);
    expect(error).toMatchObject({
      name: "ArtifactBuildError",
      code: "INVALID_DATA_BLOCK",
    });
    expect((error as Error).message).toMatch(/^INVALID_DATA_BLOCK: /);
  }
}

describe("HTML artifact data blocks", () => {
  it("serializes canonical, safely embedded JSON and round-trips it", () => {
    const blocks = new Map([
      [
        "payload",
        {
          z: "</script>\u2028&>",
          a: { y: 2, x: 1 },
        },
      ],
    ]);

    const html = serializeDataBlocks(blocks);

    expect(html).toBe(
      '<script type="application/json" id="payload">\n' +
        "{\n" +
        '  "a": {\n' +
        '    "x": 1,\n' +
        '    "y": 2\n' +
        "  },\n" +
        '  "z": "\\u003c/script\\u003e\\u2028\\u0026\\u003e"\n' +
        "}\n" +
        "</script>",
    );
    expect(html).not.toContain("</script>\u2028");
    expect(extractDataBlocks(html)).toEqual(
      new Map([
        [
          "payload",
          {
            a: { x: 1, y: 2 },
            z: "</script>\u2028&>",
          },
        ],
      ]),
    );
  });

  it("sorts blocks and recognizes data-block attributes in harmless orders", () => {
    const html = serializeDataBlocks(
      new Map([
        ["zeta", 2],
        ["alpha", 1],
      ]),
    );
    expect(html.indexOf('id="alpha"')).toBeLessThan(html.indexOf('id="zeta"'));

    const extracted = extractDataBlocks(
      '<script>window.payload = "ordinary";</script>\n' +
        '<script id = "reordered" data-note="ok" type = \'application/json\' >\n' +
        '{"works":true}\n' +
        "</script>",
    );
    expect(extracted).toEqual(new Map([["reordered", { works: true }]]));
  });

  it("produces the same source hash for equivalent object key order", () => {
    const first = new Map([
      ["beta", { z: 3, a: [2, 1] }],
      ["alpha", { nested: { y: true, x: null } }],
    ]);
    const second = new Map([
      ["alpha", { nested: { x: null, y: true } }],
      ["beta", { a: [2, 1], z: 3 }],
    ]);

    expect(computeSourceHash(first)).toBe(computeSourceHash(second));
    expect(computeSourceHash(first)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("exposes a stable structured artifact error", () => {
    const error = new ArtifactBuildError(
      "INVALID_DATA_BLOCK",
      "Data block is invalid",
      { id: "bad id" },
    );

    expect(error.message).toBe("INVALID_DATA_BLOCK: Data block is invalid");
    expect(error.toJSON()).toEqual({
      ok: false,
      error: {
        code: "INVALID_DATA_BLOCK",
        message: "Data block is invalid",
        details: { id: "bad id" },
      },
    });
    expect(
      new ArtifactBuildError("INVALID_DATA_BLOCK", "No details").toJSON(),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_DATA_BLOCK",
        message: "No details",
      },
    });
  });

  it("rejects invalid ids, duplicate ids, malformed JSON, and non-JSON values", () => {
    expect(DATA_BLOCK_ID.test("valid.block:1-name")).toBe(true);
    expect(DATA_BLOCK_ID.test("bad id")).toBe(false);

    expectInvalidDataBlock(() =>
      serializeDataBlocks(new Map([["bad id", { ok: true }]])),
    );
    expectInvalidDataBlock(() =>
      extractDataBlocks(
        '<script type="application/json" id="bad id">null</script>',
      ),
    );
    expectInvalidDataBlock(() =>
      extractDataBlocks(
        '<script type="application/json" id="same">1</script>' +
          '<script id="same" type="application/json">2</script>',
      ),
    );
    expectInvalidDataBlock(() =>
      extractDataBlocks(
        '<script type="application/json" id="broken">{"x":}</script>',
      ),
    );
    expectInvalidDataBlock(() => stableJson(Number.NaN));
    expectInvalidDataBlock(() => canonicalizeJson({ value: undefined }));
    expectInvalidDataBlock(() => canonicalizeJson(() => "nope"));
  });

  it("rejects cycles and sparse arrays", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = Array(2);
    sparse[1] = "present";

    expectInvalidDataBlock(() => canonicalizeJson(cyclic));
    expectInvalidDataBlock(() => canonicalizeJson(sparse));
  });

  it("rejects arrays whose prototype is not exactly Array.prototype", () => {
    class JsonArray extends Array<unknown> {
      toJSON() {
        return ["rewritten"];
      }
    }

    const customPrototype = Object.create(Array.prototype, {
      toJSON: {
        value: () => ["rewritten"],
      },
    });
    const customArray = ["original"];
    Object.setPrototypeOf(customArray, customPrototype);

    expectInvalidDataBlock(() => canonicalizeJson(new JsonArray("original")));
    expectInvalidDataBlock(() => canonicalizeJson(customArray));
  });

  it("ignores script-like text outside actual script elements", () => {
    const extracted = extractDataBlocks(
      '<!-- <script type="application/json" id="comment">1</script> -->' +
        '<textarea><script type="application/json" id="textarea">2</script></textarea>' +
        '<script-foo type="application/json" id="custom">3</script>',
    );

    expect(extracted).toEqual(new Map());
  });

  it("uses the first occurrence of duplicate HTML attributes", () => {
    const extracted = extractDataBlocks(
      '<script type="text/javascript" type="application/json" id="fake">0</script>' +
        '<script type="application/json" id="first" id="second">1</script>',
    );

    expect(extracted).toEqual(new Map([["first", 1]]));
  });

  it("round-trips Unicode payload text without changing HTML indices", () => {
    const blocks = new Map([["payload", { text: "İ" }]]);

    expect(extractDataBlocks(serializeDataBlocks(blocks))).toEqual(blocks);
  });

  it("uses HTML whitespace and decodes bounded attribute references", () => {
    const extracted = extractDataBlocks(
      '<script \u00a0type="application/json" id="nbsp">0</script>' +
        '<script type="application&#47;json" id="numeric">1</script>' +
        '<script type="application&sol;json" ' +
        'id="payload&hyphen;one&period;v&colon;1&lowbar;x">2</script>',
    );

    expect(extracted).toEqual(
      new Map([
        ["numeric", 1],
        ["payload-one.v:1_x", 2],
      ]),
    );
  });

  it("ignores scripts inside noscript and template contexts", () => {
    const extracted = extractDataBlocks(
      '<noscript><script type="application/json" id="noscript">0</script></noscript>' +
        '<template><script type="application/json" id="template">1</script></template>' +
        '<script type="application/json" id="live">2</script>',
    );

    expect(extracted).toEqual(new Map([["live", 2]]));
  });

  it(
    "advances monotonically through large malformed start tags",
    () => {
      expect(extractDataBlocks("<x".repeat(8_000))).toEqual(new Map());
    },
    750,
  );

  it("rejects accessors without invoking them", () => {
    let getterCalls = 0;
    const object = {};
    Object.defineProperty(object, "value", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "object";
      },
    });
    const array = ["initial"];
    Object.defineProperty(array, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "array";
      },
    });

    let objectError;
    let arrayError;
    try {
      canonicalizeJson(object);
    } catch (error) {
      objectError = error;
    }
    try {
      canonicalizeJson(array);
    } catch (error) {
      arrayError = error;
    }

    expect(getterCalls).toBe(0);
    expect(objectError).toBeInstanceOf(ArtifactBuildError);
    expect(arrayError).toBeInstanceOf(ArtifactBuildError);
  });

  it("rejects JSON deeper than the explicit bound with a coded error", () => {
    let nested: unknown = "leaf";
    for (let depth = 0; depth < 300; depth += 1) nested = [nested];

    expectInvalidDataBlock(() => canonicalizeJson(nested));
  });

  it("normalizes structured error details without invoking accessors", () => {
    let getterCalls = 0;
    const details: Record<PropertyKey, unknown> = {};
    Object.defineProperty(details, "accessor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "invoked";
      },
    });
    details.big = 1n;
    details.fn = () => "function";
    details.symbol = Symbol("token");
    details.self = details;
    let deep: Record<string, unknown> = { end: true };
    for (let depth = 0; depth < 20; depth += 1) deep = { next: deep };
    details.deep = deep;

    const output = new ArtifactBuildError("E_DETAILS", "Unsafe details", details).toJSON();
    let encoded;
    let stringifyError;
    try {
      encoded = JSON.stringify(output);
    } catch (error) {
      stringifyError = error;
    }

    expect(getterCalls).toBe(0);
    expect(stringifyError).toBeUndefined();
    expect(encoded).toContain('"accessor":"[Accessor]"');
    expect(encoded).toContain('"big":"1"');
    expect(encoded).toContain('"fn":"[function]"');
    expect(encoded).toContain('"symbol":"Symbol(token)"');
    expect(encoded).toContain('"self":"[Circular]"');
    expect(encoded).toContain("[MaxDepth]");

    let invalidIdError;
    try {
      serializeDataBlocks(new Map<unknown, unknown>([[1n, null]]));
    } catch (error) {
      invalidIdError = error;
    }
    expect(invalidIdError).toBeInstanceOf(ArtifactBuildError);
    expect((invalidIdError as ArtifactBuildError).toJSON()).toMatchObject({
      error: { details: { id: "1" } },
    });
    expect(() =>
      JSON.stringify((invalidIdError as ArtifactBuildError).toJSON()),
    ).not.toThrow();
  });

  it("pins the source hash byte contract", () => {
    const blocks = new Map([
      ["beta", [true, null]],
      ["alpha", { z: 2, a: 1 }],
    ]);

    expect(computeSourceHash(blocks)).toBe(
      "sha256:8caddb789ec8639f5a81fe65a04c5b0d855d57c109273dc5b7e72baa36305262",
    );
  });
});
