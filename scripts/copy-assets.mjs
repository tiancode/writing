import { cpSync } from "node:fs";

cpSync("src/scenarios", "dist/scenarios", {
  recursive: true,
  filter: (src) => !src.endsWith(".ts"),
});
