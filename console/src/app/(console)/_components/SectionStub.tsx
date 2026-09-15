export function SectionStub({
  title,
  lead,
  sprint,
}: {
  title: string;
  lead: string;
  sprint: number;
}) {
  return (
    <>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      <div className="pane">
        <p className="lead" style={{ margin: 0 }}>
          Coming in Sprint {sprint} of the roadmap.
        </p>
      </div>
    </>
  );
}
