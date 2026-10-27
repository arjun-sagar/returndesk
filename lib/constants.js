// Shared constants for the server, the API tests and the browser forms. Pure data: no Node, DB or Next imports.

export const STATUSES = ['Open', 'In Review', 'Approved', 'Rejected', 'Completed'];
export const REASONS = ['Damaged', 'Wrong Item', 'Size Issue', 'Not As Described', 'Changed Mind'];
export const RESOLUTIONS = ['Refund', 'Replacement', 'Store Credit'];

// List sorting: the only values the API accepts for ?sort= and ?order=.
export const SORT_FIELDS = ['createdAt', 'updatedAt', 'customerName', 'status'];
export const SORT_ORDERS = ['asc', 'desc'];
export const DEFAULT_SORT = 'createdAt';
export const DEFAULT_ORDER = 'desc';

// List paging.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [10, 20, 50];

// Maximum lengths (in characters). They mirror the CHECK constraints in the database migration.
export const FIELD_LIMITS = {
  customerName: 100,
  itemName: 200,
  email: 254,
  phone: 20,
  code: 40,
  author: 80,
  noteBody: 2000,
  search: 100,
};

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 999;
export const REFUND_MAX = 1000000;
export const CURRENCY = 'INR';
