function bufferToVectorLiteral(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.join(",")}]`;

  if (Buffer.isBuffer(value)) {
    const floatArray = new Float32Array(
      value.buffer,
      value.byteOffset,
      value.byteLength / Float32Array.BYTES_PER_ELEMENT
    );
    return `[${Array.from(floatArray).join(",")}]`;
  }

  throw new Error("Unsupported embedding format. Expected Buffer, string, or number array.");
}

module.exports = { bufferToVectorLiteral };
