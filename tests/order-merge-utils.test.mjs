import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  collectOrderIdsForMerge,
  mergeOrderRowsForExport,
} from "../lib/order-merge-utils.mjs";

test("collects distinct order IDs in first-seen order", () => {
  assert.deepEqual(
    collectOrderIdsForMerge([
      { "Order ID": "4239212745" },
      { "Order ID": "4239212745" },
      { "Order ID": "4239319234" },
    ]),
    ["4239212745", "4239319234"]
  );
});

test("merges Order ID without changing row count or other columns", () => {
  const rows = [
    { "Order ID": "4239212745", SKU: "A", "Number of Items": "1" },
    { "Order ID": "4239319234", SKU: "B", "Number of Items": "1" },
    { "Order ID": "4239319234", SKU: "C", "Number of Items": "1" },
    { "Order ID": "4239319234", SKU: "D", "Number of Items": "1" },
  ];
  const original = structuredClone(rows);

  const merged = mergeOrderRowsForExport(rows);

  assert.equal(merged.length, rows.length);
  assert.deepEqual(
    merged.map((row) => row["Order ID"]),
    Array(4).fill("4239212745/4239319234")
  );
  assert.deepEqual(
    merged.map(({ "Order ID": _orderId, ...row }) => row),
    rows.map(({ "Order ID": _orderId, ...row }) => row)
  );
  assert.deepEqual(rows, original);
});

test("merged rows keep the same four Excel rows", () => {
  const merged = mergeOrderRowsForExport([
    { "Order ID": "4239212745", SKU: "A", "Number of Items": "1" },
    { "Order ID": "4239319234", SKU: "B", "Number of Items": "1" },
    { "Order ID": "4239319234", SKU: "C", "Number of Items": "1" },
    { "Order ID": "4239319234", SKU: "D", "Number of Items": "1" },
  ]);
  const worksheet = XLSX.utils.json_to_sheet(merged);
  const excelRows = XLSX.utils.sheet_to_json(worksheet);

  assert.equal(excelRows.length, 4);
  assert.deepEqual(
    excelRows.map((row) => row["Order ID"]),
    Array(4).fill("4239212745/4239319234")
  );
});
