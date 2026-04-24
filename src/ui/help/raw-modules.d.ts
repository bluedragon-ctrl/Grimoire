// Ambient types for Vite's ?raw import.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
