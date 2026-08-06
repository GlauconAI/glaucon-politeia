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
});
