## Project Structure

- `src/`: core plugin logic and bundler adapters
- `src/core/`: shared logic (wrappers, banners, resolves, tracing helpers)
- `src/bundlers/`: bundler-specific hooks (esbuild/rollup/vite/webpack/rspack/rolldown)
- `src/*.ts`: package entrypoints (vite/rollup/esbuild/etc.)
- `src/init.ts`: runtime init entry used by banners/wrappers
- `tests/`: unit, bundler, and integration tests
- `examples/`: runnable example apps
- `dist/`: build output (generated)

## pnpm Scripts

- `pnpm build`: build the library with `tsdown`
- `pnpm dev`: watch build with `tsdown --watch`
- `pnpm lint`: run all lint steps (types, eslint, format)
- `pnpm lint:types`: typecheck only (`tsc --noEmit`)
- `pnpm lint:eslint`: run eslint
- `pnpm lint:format`: check formatting via prettier
- `pnpm format`: apply prettier formatting
- `pnpm test`: run vitest in watch mode
- `pnpm test:coverage`: run vitest with coverage
- `pnpm changeset`: create a changeset entry
- `pnpm release`: build + publish via changesets
- `pnpm prepublishOnly`: build before publish

## Docstring Requirements

- Add JSDoc to every function or method (including private helpers).
- Prefer concise, clear descriptions.
- Include `@param`/`@returns` where applicable.
- When a function mirrors `dd-trace` or `dd-trace/esbuild` behavior, include a `@see` link to the relevant upstream file.
