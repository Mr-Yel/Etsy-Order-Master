import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKstProxyChunkIterator,
  createKstProxyPortAssembler,
  createKstProxyPortChunkMessage,
  getKstProxyChunkCount,
  shouldUseKstProxyPortTransfer,
} from "../lib/kst-proxy-transfer.mjs";

test("uses port transfer for blob files and large base64", () => {
  assert.equal(shouldUseKstProxyPortTransfer(null), false);
  assert.equal(
    shouldUseKstProxyPortTransfer({ base64: "a".repeat(10) }),
    false
  );
  assert.equal(
    shouldUseKstProxyPortTransfer({ blob: { size: 8 } }),
    true
  );
  assert.equal(
    shouldUseKstProxyPortTransfer(
      { base64: "a".repeat(20) },
      { base64Threshold: 16 }
    ),
    true
  );
});

test("splits and reassembles binary chunks in order", () => {
  const source = Uint8Array.from({ length: 10 }, (_, index) => index + 1);
  const iterator = createKstProxyChunkIterator(source, 4);
  assert.equal(iterator.total, 3);
  assert.equal(getKstProxyChunkCount(source.byteLength, 4), 3);

  const assembler = createKstProxyPortAssembler({
    totalChunks: iterator.total,
    byteLength: source.byteLength,
  });
  for (const chunk of iterator) {
    assembler.add(chunk.index, chunk.bytes);
  }

  assert.equal(assembler.isComplete(), true);
  assert.deepEqual(Array.from(assembler.assemble()), Array.from(source));
});

test("encodes port chunks as base64 strings", () => {
  const source = new Uint8Array([1, 2, 3, 4, 5]);
  const iterator = createKstProxyChunkIterator(source, 3);
  const assembler = createKstProxyPortAssembler({
    totalChunks: iterator.total,
    byteLength: source.byteLength,
  });
  for (const chunk of iterator) {
    const message = createKstProxyPortChunkMessage(chunk.index, chunk.bytes);
    assert.equal(typeof message.bytes, "string");
    assembler.add(message.index, message.bytes);
  }
  assert.deepEqual(Array.from(assembler.assemble()), [1, 2, 3, 4, 5]);
});

test("reassembles chunks received out of order", () => {
  const source = new Uint8Array([9, 8, 7, 6, 5]);
  const iterator = createKstProxyChunkIterator(source, 2);
  const chunks = [...iterator].reverse();
  const assembler = createKstProxyPortAssembler({
    totalChunks: iterator.total,
    byteLength: source.byteLength,
  });
  for (const chunk of chunks) {
    assembler.add(chunk.index, chunk.bytes);
  }
  assert.deepEqual(Array.from(assembler.assemble()), [9, 8, 7, 6, 5]);
});

test("assembles an empty file from one empty chunk", () => {
  const source = new Uint8Array();
  const iterator = createKstProxyChunkIterator(source, 4);
  const assembler = createKstProxyPortAssembler({
    totalChunks: iterator.total,
    byteLength: 0,
  });
  for (const chunk of iterator) {
    const message = createKstProxyPortChunkMessage(chunk.index, chunk.bytes);
    assembler.add(message.index, message.bytes);
  }
  assert.equal(assembler.isComplete(), true);
  assert.equal(assembler.assemble().byteLength, 0);
});

test("rejects duplicate or oversized chunks", () => {
  const assembler = createKstProxyPortAssembler({
    totalChunks: 2,
    byteLength: 3,
  });
  assembler.add(0, new Uint8Array([1, 2]));
  assert.throws(() => assembler.add(0, new Uint8Array([1, 2])), /重复的分片/);
  assert.throws(
    () => assembler.add(1, new Uint8Array([3, 4])),
    /文件分片超出声明大小/
  );
});
