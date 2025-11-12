import { Injectable } from '@angular/core';

/**
 * Centralized service for CSV export functionality.
 * Ensures consistent UTF-8 encoding, proper escaping, and DRY architecture.
 *
 * @example
 * ```typescript
 * const data = users.map(user => [
 *   user.fullName,
 *   user.email,
 *   this.getRoleLabel(user.role)
 * ]);
 * const headers = ['Name', 'Email', 'Role'];
 * this.csvExportService.exportToCsv(data, 'users-export', headers);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CsvExportService {

  /**
   * Exports data to CSV file with UTF-8 BOM for proper character encoding.
   * Uses semicolon (;) as delimiter for Excel compatibility.
   *
   * @param data - Array of row arrays, where each inner array contains the cell values for that row
   * @param filename - Filename without extension (e.g., 'users-export')
   * @param headers - Column headers for the CSV file
   */
  public exportToCsv(data: any[][], filename: string, headers: string[]): void {
    // Validate data
    if (!data || data.length === 0) {
      console.warn('CSV Export: No data to export.');
      return;
    }

    // Validate headers
    if (!headers || headers.length === 0) {
      console.error('CSV Export: No headers provided.');
      return;
    }

    try {
      // Process each row: escape and join values
      const rows = data.map(row =>
        row.map(value => this.escapeValue(value)).join(';')
      );

      // Combine headers and rows
      const csvContent = [headers.join(';'), ...rows].join('\n');

      // CRITICAL: Add UTF-8 BOM for Excel compatibility (especially for German Umlaute)
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;'
      });

      // Create download link
      this.downloadBlob(blob, `${filename}.csv`);

    } catch (error) {
      console.error('CSV Export: Failed to generate CSV file.', error);
    }
  }

  /**
   * Escapes and quotes a CSV value to handle special characters.
   *
   * @param value - Value to escape
   * @returns Quoted and escaped value
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return '""';
    }

    const stringValue = String(value);

    // If the value contains quotes, semicolons, or newlines, we need to quote and escape it
    if (stringValue.includes('"') || stringValue.includes(';') || stringValue.includes('\n')) {
      // Escape quotes by doubling them
      const escaped = stringValue.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    // Always quote values for consistency
    return `"${stringValue}"`;
  }

  /**
   * Triggers browser download of a blob.
   *
   * @param blob - Blob to download
   * @param filename - Name of the file
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);

    try {
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);

      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } finally {
      // Always revoke the object URL to free memory
      URL.revokeObjectURL(url);
    }
  }
}
