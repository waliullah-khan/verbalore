import { test } from "node:test";
import assert from "node:assert/strict";

// next/headers is only needed by captureBase, so the pure helpers are loaded through a stub-free import path
import { pickBase } from "./capture";

test("localhost becomes the LAN address with the same port", () => {
  assert.equal(pickBase("localhost:3000", "http", { lan: "192.168.1.20" }), "http://192.168.1.20:3000");
  assert.equal(pickBase("127.0.0.1:3001", "http", { lan: "10.0.0.5" }), "http://10.0.0.5:3001");
});

test("a real host is left alone", () => {
  assert.equal(pickBase("verbalore.vercel.app", "https", { lan: "192.168.1.20" }), "https://verbalore.vercel.app");
});

test("an explicit public URL always wins", () => {
  assert.equal(pickBase("localhost:3000", "http", { override: "https://abc.ngrok.app/", lan: "192.168.1.20" }), "https://abc.ngrok.app");
});

test("without a LAN address localhost stays as is", () => {
  assert.equal(pickBase("localhost:3000", "http", { lan: null }), "http://localhost:3000");
});

import { pickLan } from "./capture";

const v4 = (address: string, internal = false) => ({ family: "IPv4", address, internal });

test("the real Wi-Fi beats virtual adapters, whatever order they are listed in", () => {
  assert.equal(pickLan({ "vEthernet (Default Switch)": [v4("172.26.160.1")], "Wi-Fi": [v4("100.65.5.237")], Loopback: [v4("127.0.0.1", true)] }), "100.65.5.237");
  assert.equal(pickLan({ "Wi-Fi": [v4("192.168.1.20")], "vEthernet (WSL)": [v4("172.20.0.1")] }), "192.168.1.20");
});

test("a private address is preferred when the names tell us nothing", () => {
  assert.equal(pickLan({ a: [v4("8.8.4.4")], b: [v4("192.168.0.9")] }), "192.168.0.9");
});

test("link-local and loopback addresses are never used", () => {
  assert.equal(pickLan({ "Wi-Fi": [v4("169.254.3.4")], lo: [v4("127.0.0.1", true)] }), null);
});
