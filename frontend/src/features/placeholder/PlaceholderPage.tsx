import { strings } from "../../shared/strings";

interface PlaceholderPageProps {
  navKey: keyof typeof strings.nav;
}

export function PlaceholderPage({ navKey }: PlaceholderPageProps) {
  const label = strings.nav[navKey] ?? navKey;
  return (
    <section className="placeholder-page">
      <article className="placeholder-card border-gradient reveal">
        <h2>{label}</h2>
        <p>{strings.actions.page_under_construction}</p>
      </article>
    </section>
  );
}
