// Lets plain `tsc --noEmit` type-check .ts files that import .astro
// components (e.g. tests using the Astro container). `astro check` resolves
// .astro files itself and ignores this wildcard.
declare module "*.astro" {
  const Component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default Component;
}
