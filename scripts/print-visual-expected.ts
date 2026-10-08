// Usage: npm run -s visual:expected
// Prints the visual baselines the specs produce ((gallery + VISUAL_PAGES) x VISUAL_PROJECTS),
// one per line, relative to tests/visual/__screenshots__/ (the layout of the CI
// "visual-baselines" artifact) and sorted like `LC_ALL=C sort`. The rebaseline commands in
// the Visual regression job summary compare a downloaded artifact against this list.
import { artifactEntries } from "./visual-baselines.ts";
import { expectedBaselinePaths } from "../tests/helpers/visual-pages.ts";

for (const entry of artifactEntries(expectedBaselinePaths())) console.log(entry);
