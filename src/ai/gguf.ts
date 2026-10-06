// GGUF files start with the ASCII magic "GGUF".
const MAGIC = [0x47, 0x47, 0x55, 0x46];

export const isGguf = (head: Uint8Array) => head.length >= 4 && MAGIC.every((b, i) => head[i] === b);
