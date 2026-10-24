// F5-12 negative scan fixture: every impurity the parser folder may never use.
import { readFileSync } from "node:fs";
import { lookup } from "node:dns";
import { connect } from "node:net";
import { get } from "node:https";

export async function impure(): Promise<unknown> {
  const t = Date.now() + Math.random();
  const d = new Date();
  const token = process.env["X"];
  return [await fetch("https://feeds.example.invalid/"), readFileSync, lookup, connect, get, t, d, token];
}
