import { PageHeading, Panel } from "@/components/ui";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeading
        eyebrow="CLIPFORGE"
        title="Calendar"
        description="A publishing calendar is not available. No dates, slots, or schedules are stored or shown."
        action={<span className="badge neutral">Not yet implemented</span>}
      />
      <Panel
        title="Nothing scheduled"
        description="This is not a calendar view. Adding a date here would be fictional, so the page stays empty."
      >
        <p className="muted">
          Planning across YouTube, Facebook, TikTok, and Instagram belongs to a later sprint.
        </p>
      </Panel>
    </>
  );
}
