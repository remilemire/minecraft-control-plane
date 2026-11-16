import type { Rule } from "eslint";
import { relative, resolve } from "node:path";
const sourceRoot = resolve(import.meta.dirname, "src");
const shared = new Set(["filesystem", "data"]);
export const boundaryRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      private: "Import the other module's public service contract instead of its implementation.",
      consumer:
        "Cross-module operations belong in a service; routes and helpers use their own module's service.",
    },
  },
  create(context) {
    const file = relative(sourceRoot, context.getFilename()).replaceAll("\\", "/");
    if (
      file.startsWith("..") ||
      file.endsWith(".test.ts") ||
      ["composition.ts", "server.ts", "http/routes.ts"].includes(file)
    )
      return {};
    const owner = file.includes("/") ? file.split("/")[0] : "";
    const inspect: (node: Rule.Node) => void = (node) => {
      if (
        !("source" in node) ||
        !node.source ||
        !("value" in node.source) ||
        typeof node.source.value !== "string" ||
        !node.source.value.startsWith("@/")
      )
        return;
      const target = node.source.value.slice(2),
        parts = target.split("/"),
        module = parts[0];
      if (parts.length < 2 || module === owner || shared.has(module!)) return;
      if (parts.length !== 2 || parts[1] !== "service.js") {
        context.report({ node, messageId: "private" });
        return;
      }
      const typeOnly =
        ("importKind" in node && node.importKind === "type") ||
        ("exportKind" in node && node.exportKind === "type");
      if (!typeOnly && !file.endsWith("/service.ts") && !file.endsWith(".service.ts"))
        context.report({ node, messageId: "consumer" });
    };
    return {
      ImportDeclaration: inspect,
      ExportNamedDeclaration: inspect,
      ExportAllDeclaration: inspect,
    };
  },
};
