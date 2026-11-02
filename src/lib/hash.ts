import { createHash } from "node:crypto";

// Hash del archivo tal como se subió (antes de redimensionar/convertir), para
// detectar si exactamente la misma imagen ya fue escaneada antes.
export function hashImagen(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
