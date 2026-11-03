// Minimal typings for the two test-only helpers that draw the fake label.
declare module 'bwip-js' {
  const bwipjs: { toBuffer(options: Record<string, unknown>): Promise<Buffer> };
  export default bwipjs;
}
declare module 'pngjs' {
  export const PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
}
