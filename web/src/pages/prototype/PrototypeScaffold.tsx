type Stat = {
  label: string;
  value: string;
  detail?: string;
};

type Panel = {
  eyebrow: string;
  title: string;
  content: string[];
};

type PrototypeScaffoldProps = {
  routeId: string;
  title: string;
  subtitle: string;
  stats: Stat[];
  panels: Panel[];
};

export const PrototypeScaffold = ({ routeId, title, subtitle, stats, panels }: PrototypeScaffoldProps) => {
  return (
    <section className={`page-card prototype-page prototype-page--${routeId}`} data-route-page={routeId} data-page-entry={`${routeId}-prototype`}>
      <header className="prototype-page__hero">
        <div>
          <p className="page-eyebrow">Open Kraken Prototype</p>
          <h1>{title}</h1>
          <p className="prototype-page__subtitle">{subtitle}</p>
        </div>
      </header>

      <div className="page-toolbar prototype-page__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="page-toolbar__metric">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            {stat.detail ? <span>{stat.detail}</span> : null}
          </div>
        ))}
      </div>

      <div className="route-page__grid prototype-page__grid">
        {panels.map((panel) => (
          <section key={panel.title} className="route-page__panel">
            <header className="route-page__panel-header">
              <div>
                <p className="page-eyebrow">{panel.eyebrow}</p>
                <h2>{panel.title}</h2>
              </div>
            </header>
            <div className="prototype-page__list">
              {panel.content.map((item) => (
                <p key={item} className="prototype-page__item">
                  {item}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};
