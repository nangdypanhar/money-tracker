// Lets Node run the app's TypeScript directly (Node >= 22.18 strips types):
// resolves "@/x" to src/x.ts and extensionless relative imports to .ts.
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

export async function resolve(specifier, context, next) {
  let target;
  if (specifier.startsWith("@/")) target = `${SRC}/${specifier.slice(2)}`;
  else if (specifier.startsWith(".") && context.parentURL) target = fileURLToPath(new URL(specifier, context.parentURL));
  else return next(specifier, context);

  const match = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find(isFile);
  return next(match ? pathToFileURL(match).href : specifier, context);
}
