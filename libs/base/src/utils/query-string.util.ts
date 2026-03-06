import { FindManyOptions } from '../lib/base.service';

export type QueryStringParams = {
  page?: number;
  limit?: number;
  sort?: string;
  [key: string]: string | number | boolean | undefined;
};

/**
 * Parse query string parameters into FindManyOptions.
 * Supports filtering, sorting, pagination with MongoDB operators.
 *
 * Examples:
 * - Filtering: ?name=John&age:gt=18
 * - Sorting: ?sort=createdAt:desc,name:asc
 * - Pagination: ?page=1&limit=20
 * - Operators: :gt, :gte, :lt, :lte, :ne, :in, :nin, :regex
 * - In operator: ?status:in=draft,published → { status: { $in: ['draft', 'published'] } }
 */
export function parseQueryString(query: QueryStringParams): FindManyOptions {
  const findManyOptions: FindManyOptions = {
    filter: {},
    sort: {
      createdAt: -1,
    },
    page: query.page ? Math.max(1, parseInt(String(query.page), 10)) : 1,
    limit: query.limit ? parseInt(String(query.limit), 10) : 10,
  };

  // Ensure filter is initialized
  if (!findManyOptions.filter) {
    findManyOptions.filter = {};
  }

  for (const key in query) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const value = query[key]?.toString() || '';
      if (key !== 'page' && key !== 'limit' && key !== 'sort') {
        const fields = key.split(':').map((f) => f.trim());
        if (fields.length === 2) {
          const operator = fields[1];
          switch (operator) {
            case 'gt':
              findManyOptions.filter[fields[0]] = { $gt: value };
              break;
            case 'gte':
              findManyOptions.filter[fields[0]] = { $gte: value };
              break;
            case 'lt':
              findManyOptions.filter[fields[0]] = { $lt: value };
              break;
            case 'lte':
              findManyOptions.filter[fields[0]] = { $lte: value };
              break;
            case 'ne':
              findManyOptions.filter[fields[0]] = { $ne: value };
              break;
            case 'in':
              findManyOptions.filter[fields[0]] = { $in: value.split(',') };
              break;
            case 'nin':
              findManyOptions.filter[fields[0]] = { $nin: value.split(',') };
              break;
            case 'regex':
              findManyOptions.filter[fields[0]] = {
                $regex: value.trim(),
                $options: 'i',
              };
              break;
            default:
              break;
          }
          continue;
        }
        findManyOptions.filter[key] = value;
      }
    }
  }

  if (query.sort) {
    if (!findManyOptions.sort) {
      findManyOptions.sort = {};
    }
    const sortFields = query.sort.split(',').map((f: string) => f.trim());
    sortFields.forEach((field: string) => {
      const fieldValues = field.split(':').map((f: string) => f.trim());
      if (
        fieldValues.length === 2 &&
        (fieldValues[1] === 'asc' || fieldValues[1] === 'desc')
      ) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        findManyOptions.sort![fieldValues[0]] =
          fieldValues[1] === 'asc' ? 1 : -1;
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      findManyOptions.sort![field] = 1;
    });
  }

  return findManyOptions;
}
