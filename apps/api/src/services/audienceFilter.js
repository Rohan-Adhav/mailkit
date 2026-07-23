/**
 * Turns a saved audience filter (jsonb) into a SQL WHERE fragment + params.
 * Filter shapes supported:
 *   { "tag": "vip" }                                  -> custom_fields.tags contains "vip"
 *   { "field": "city", "op": "eq", "value": "Mumbai" }  -> custom_fields.city = "Mumbai" (or a fixed column)
 * Starting param index lets callers compose this into a larger query.
 */
export function filterToSql(filter, workspaceId, startIndex = 1) {
  const params = [workspaceId];
  let clause = "workspace_id = $1";

  if (filter?.tag) {
    params.push(filter.tag);
    clause += ` AND custom_fields->'tags' @> to_jsonb($${params.length}::text)`;
  } else if (filter?.field && filter?.value !== undefined) {
    if (filter.field === "name" || filter.field === "email" || filter.field === "phone") {
      params.push(filter.value);
      clause += ` AND ${filter.field} = $${params.length}`;
    } else {
      params.push(filter.value);
      clause += ` AND custom_fields->>'${filter.field.replace(/[^a-zA-Z0-9_]/g, "")}' = $${params.length}`;
    }
  }

  return { clause, params };
}
