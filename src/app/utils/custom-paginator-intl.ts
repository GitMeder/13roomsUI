import { MatPaginatorIntl } from '@angular/material/paginator';

export function CustomMatPaginatorIntl(): MatPaginatorIntl {
  const paginatorIntl = new MatPaginatorIntl();

  paginatorIntl.itemsPerPageLabel = 'Einträge pro Seite'; // <- dein Text
  paginatorIntl.nextPageLabel = 'Nächste Seite';
  paginatorIntl.previousPageLabel = 'Vorherige Seite';
  paginatorIntl.firstPageLabel = 'Erste Seite';
  paginatorIntl.lastPageLabel = 'Letzte Seite';

  paginatorIntl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 von ${length}`;
    }
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, length);
    return `${startIndex + 1} – ${endIndex} von ${length}`;
  };

  return paginatorIntl;
}