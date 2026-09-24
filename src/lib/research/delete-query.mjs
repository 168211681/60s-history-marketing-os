export const deleteResearchProjectSql = `
  delete from public.research_projects r
  using public.channels c
  where r.id = $1 and c.id = r.channel_id and c.owner_id = $2
  returning r.id
`;

/** @param {Array<{ id: string }>} rows */
export function researchProjectDeleteResult(rows) {
  const id = rows[0]?.id;
  return id
    ? { status: 200, body: { deleted: true, id } }
    : { status: 404, body: { error: "Project not found" } };
}
