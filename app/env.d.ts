/// <reference types="vite/client" />

// Vite ?raw imports — yaml/text/etc. resolved at build time as a string.
declare module "*.yaml?raw" {
  const content: string;
  export default content;
}
declare module "*.yml?raw" {
  const content: string;
  export default content;
}
