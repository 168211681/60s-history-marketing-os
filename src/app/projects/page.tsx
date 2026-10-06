import { PageHeading, Panel } from "@/components/ui";

export const metadata = { title: "Projects" };

const plannedProjects = [
  {
    name: "History in 60s",
    detail: "Short-form history. This is a planned project name, not a saved record.",
  },
  {
    name: "Chronicles of Suvarnabhumi",
    detail: "Planned series workspace. Nothing is stored for it yet.",
  },
  {
    name: "Affiliate",
    detail: "Planned affiliate workspace. Nothing is stored for it yet.",
  },
];

export default function ProjectsPage() {
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Projects"
        description="Named workspaces for channels and series. Creating and storing projects is not available yet."
        action={<span className="badge neutral">Not yet implemented</span>}
      />
      <Panel
        title="Planned projects"
        description="Names only. There is no project database, status workflow, or content tree in this version."
      >
        <ul className="planned-list">
          {plannedProjects.map((project) => (
            <li key={project.name}>
              <div>
                <h3>{project.name}</h3>
                <p className="muted">{project.detail}</p>
              </div>
              <span className="badge neutral">Not yet implemented</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
