/** Saves text as a file. CSV gets a UTF-8 BOM so spreadsheet apps read Georgian text correctly (decoding the API's answer drops its BOM). */
export function downloadText(text: string, fileName: string, type = 'text/csv;charset=utf-8'): void {
  const body = type.startsWith('text/csv') && !text.startsWith('﻿') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
