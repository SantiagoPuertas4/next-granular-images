import path from 'path';
import { pathToFileURL } from 'url';
import ts from 'typescript';

const repoRoot = path.resolve(__dirname, '..', '..');
const typesDir = path.join(repoRoot, 'node_modules', '@types');

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  esModuleInterop: true,
  typeRoots: [typesDir],
  types: ['node'],
  paths: {
    'next-granular-images': [path.join(repoRoot, 'src', 'client', 'index.ts')],
    react: [path.join(typesDir, 'react', 'index.d.ts')],
    'react/jsx-runtime': [path.join(typesDir, 'react', 'jsx-runtime.d.ts')],
  },
};

export interface CompileResult {
  diagnostics: string[];
  /** Export names per file, in declaration order. */
  exportsOf: (file: string) => string[];
}

/** Type-checks the given files together and reports every diagnostic as text. */
export const compile = (files: string[]): CompileResult => {
  const program = ts.createProgram(files, compilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file ? `${path.basename(d.file.fileName)}: ` : '';
    return `${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
  const checker = program.getTypeChecker();
  return {
    diagnostics,
    exportsOf: (file) => {
      const source = program.getSourceFile(file);
      if (!source) throw new Error(`not in program: ${file}`);
      const symbol = checker.getSymbolAtLocation(source);
      return symbol ? checker.getExportsOfModule(symbol).map((s) => s.getName()) : [];
    },
  };
};

/**
 * True when `name` lexes as a single identifier that is not a reserved word
 * (contextual keywords such as `type` or `of` are valid identifiers).
 */
export const isPlainIdentifier = (name: string): boolean => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, name);
  const kind = scanner.scan();
  if (scanner.getTokenEnd() !== name.length) return false;
  if (kind === ts.SyntaxKind.Identifier) return true;
  return kind > ts.SyntaxKind.LastFutureReservedWord && kind <= ts.SyntaxKind.LastKeyword;
};

/** Imports a generated `.ts` module (transformed by Vitest). */
export const importGenerated = async <T = Record<string, unknown>>(file: string): Promise<T> =>
  import(/* @vite-ignore */ `${pathToFileURL(file).href}?t=${Date.now()}`) as Promise<T>;
