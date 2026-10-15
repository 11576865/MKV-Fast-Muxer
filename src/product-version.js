import manifest from '../package.json';

// One product-release authority for the UI, generated bundles and mux reports.
// npm uses three-component semver; product labels omit only a trailing ".0".
export const PRODUCT_PACKAGE_VERSION = manifest.version;
export const PRODUCT_VERSION = PRODUCT_PACKAGE_VERSION.replace(/\.0$/, '');
export const PRODUCT_LABEL = `软封${PRODUCT_VERSION}版本`;
