export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  next: number | null;
  prev: number | null;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
