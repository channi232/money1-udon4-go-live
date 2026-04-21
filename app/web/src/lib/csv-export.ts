function isAllDigits(value: string) {
  return value !== "" && /^[0-9]+$/.test(value);
}

/**
 * Excel will auto-convert long numeric strings into scientific notation unless we force text.
 * Using a leading "=" formula is the most reliable CSV-only approach.
 */
function excelTextNumberToken(raw: string) {
  const inner = raw.replaceAll('"', '""');
  return `="${inner}"`;
}

function escapeCsvCell(value: unknown) {
  const s = String(value);
  // Guard long digit-only identifiers (IDs, masked IDs, employee codes, etc.)
  if (isAllDigits(s) && s.length >= 10) {
    // IMPORTANT: do not wrap this in an extra CSV quote-pair.
    // Excel expects the field itself to be like: ="1234567890123"
    return excelTextNumberToken(s);
  }
  return `"${s.replaceAll('"', '""')}"`;
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build CSV in chunks to avoid long main-thread stalls on large tables.
 * Yields to the browser between chunks via setTimeout(0).
 */
export async function exportCsvChunked(options: {
  filename: string;
  header: string[];
  rows: unknown[][];
  chunkSize?: number;
}): Promise<void> {
  const chunkSize = typeof options.chunkSize === "number" && options.chunkSize > 0 ? options.chunkSize : 250;
  const lines: string[] = [];
  lines.push(options.header.map(escapeCsvCell).join(","));

  for (let i = 0; i < options.rows.length; i += chunkSize) {
    const slice = options.rows.slice(i, i + chunkSize);
    for (const row of slice) {
      lines.push(row.map(escapeCsvCell).join(","));
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  const csv = lines.join("\n");
  downloadTextFile(options.filename, "\uFEFF" + csv, "text/csv;charset=utf-8;");
}
