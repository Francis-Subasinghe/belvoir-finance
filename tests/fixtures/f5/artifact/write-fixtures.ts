// Regenerate the committed artifact zips: node tests/fixtures/f5/artifact/write-fixtures.ts
// tests/unit/intake-import.test.ts fails if a committed zip differs from its spec.
import { writeFileSync } from "node:fs";
import { buildZip } from "../../../helpers/zip.ts";
import { ARTIFACT_FIXTURES } from "./fixtures.ts";

for (const [file, f] of Object.entries(ARTIFACT_FIXTURES))
  writeFileSync(new URL(file, import.meta.url), buildZip(f.specs));
