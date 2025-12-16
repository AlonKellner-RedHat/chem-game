/**
 * TypeScript declarations for WESL imports
 *
 * The wesl-plugin provides two import suffixes:
 * - ?static: Build-time linking, returns WGSL string directly
 * - ?link: Runtime linking config, must be used with link() from wesl
 */

declare module '*.wesl?static' {
  const wgsl: string;
  export default wgsl;
}

declare module '*.wesl?link' {
  import type { LinkParams } from 'wesl';
  const linkConfig: LinkParams;
  export default linkConfig;
}

declare module '*.wgsl?raw' {
  const wgsl: string;
  export default wgsl;
}
