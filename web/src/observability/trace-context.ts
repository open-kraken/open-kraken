/**
 * W3C traceparent for OpenTelemetry propagation (browser → backend → Langfuse).
 * Does not use Langfuse secrets; only public trace context.
 * @see https://www.w3.org/TR/trace-context/
 */

const randomHex = (byteLength: number): string => {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Returns a traceparent value suitable for the `traceparent` header (sampled). */
export function newTraceparentValue(): string {
  const version = '00';
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const flags = '01';
  return `${version}-${traceId}-${spanId}-${flags}`;
}
