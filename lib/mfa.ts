// Supabase returns an SVG data URI containing raw markup. Encode '#' and other
// reserved URL characters so browsers do not truncate the QR's SVG as a fragment.
export function normalizeTotpQr(value: string): string {
  if (value.startsWith("data:image/svg+xml;base64,")) return value;
  let svg = value.trim();
  if (svg.startsWith("data:image/svg+xml")) {
    const comma = svg.indexOf(",");
    if (comma < 0) return "";
    svg = svg.slice(comma + 1);
    if (!svg.trimStart().startsWith("<")) {
      try {
        svg = decodeURIComponent(svg);
      } catch {
        return "";
      }
    }
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return "";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
