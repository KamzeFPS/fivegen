'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, CircleCheck, CircleDashed, Loader2, RefreshCw } from 'lucide-react';
import type { GrowthDashboardData } from '@/lib/growth-analytics';

const number = (value: number) => value.toLocaleString('en-US');
const count = (value: number, singular: string, plural = `${singular}s`) => `${number(value)} ${value === 1 ? singular : plural}`;
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'code',
}).format(amount / 100);
const date = (day: string, includeYear = false) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' as const } : {}), timeZone: 'UTC',
}).format(new Date(`${day}T00:00:00Z`));

export function GrowthDashboard() {
  const [days, setDays] = useState(30);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<GrowthDashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/growth/dashboard?days=${days}`, { signal: controller.signal });
        const result = await response.json() as GrowthDashboardData & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Could not load your activity.');
        if (result.days !== days) throw new Error('The reporting period did not match. Please try again.');
        if (active) setData(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your activity.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [days, refresh]);

  function reload() {
    setLoading(true);
    setError('');
    setRefresh(value => value + 1);
  }

  // Hide the old figures as soon as the period changes, before the next request starts.
  const report = !loading && !error && data?.days === days ? data : null;
  const published = report?.products.filter(product => product.published).length || 0;
  const firstProduct = report?.products[0];
  const nextStep = report?.actions[0] || (firstProduct ? {
    title: 'Share your product with your audience',
    reason: 'Open your product to prepare and share its landing page.',
    label: 'Open product', href: `/?project=${firstProduct.id}&area=content`,
  } : {
    title: 'Create your first product',
    reason: 'Add your expertise, then build a landing page to share it with your audience.',
    label: 'Create your product', href: '/?view=create',
  });
  const firstDay = report?.trend[0]?.day;
  const lastDay = report?.trend.at(-1)?.day;
  const dateRange = firstDay && lastDay ? `${date(firstDay)} – ${date(lastDay, true)}` : '';

  return <section className="overview-dashboard" aria-busy={loading}>
    <header className="overview-heading">
      <div><h1>Overview</h1><p>Your products, your results, and what to do next.</p></div>
      <div className="overview-period-tools">
        <label htmlFor="dashboard-period"><span>Reporting period</span><select id="dashboard-period" value={days} onChange={event => {
          setLoading(true);
          setError('');
          setDays(Number(event.target.value));
        }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
        <button className="overview-refresh" disabled={loading} onClick={reload} aria-label="Refresh overview" title="Refresh overview"><RefreshCw size={17} /></button>
      </div>
    </header>

    {error ? <div className="overview-load-state overview-load-error" role="alert"><h2>Your overview couldn’t load</h2><p>{error}</p><button className="button secondary" onClick={reload}>Try again <RefreshCw size={15} /></button></div>
      : loading ? <div className="overview-load-state" role="status"><Loader2 className="spin" size={22} /><p>Loading your last {days} days…</p></div> : null}

    {report && <>
      {report.mode === 'test' && <p className="overview-test-notice"><strong>Test payments are on.</strong> Sales, revenue, and bookings below use test records.</p>}

      <section className="overview-next-step" aria-labelledby="overview-next-heading">
        <div className="overview-next-copy"><span className="overview-kicker">Recommended next step · your workspace</span><h2 id="overview-next-heading">{nextStep.title}</h2><p>{nextStep.reason}</p></div>
        <a className="button primary" href={nextStep.href}>{nextStep.label}<ArrowRight size={17} /></a>
      </section>

      <section className="overview-results" aria-labelledby="overview-results-heading">
        <div className="overview-section-heading"><h2 id="overview-results-heading">Your results</h2><p>Last {report.days} days{dateRange && <span> · {dateRange}</span>}</p></div>
        <div className="overview-metrics">
          <article className="overview-metric"><h3>Page visits</h3><strong>{number(report.visits)}</strong><p>Recorded visits to your landing pages.</p></article>
          <article className="overview-metric"><h3>New contacts</h3><strong>{number(report.leads)}</strong><p>New signups from your landing pages.</p></article>
          <article className="overview-metric"><h3>Product sales</h3><strong>{number(report.purchases)}</strong><p>Paid orders for your products.</p></article>
          <article className="overview-metric overview-revenue"><h3>Revenue</h3>{report.revenue.length ? <div className="overview-revenue-values">{report.revenue.map(item => <strong key={item.currency}>{money(item.amount, item.currency)}</strong>)}</div> : <strong className="overview-no-sales">No sales in this period</strong>}<p>{report.revenue.length > 1 ? 'Product sales, shown separately by currency.' : 'Money from your paid product orders.'}</p></article>
        </div>
        {report.visits === 0 && report.leads === 0 && report.purchases === 0 && <p className="overview-results-hint">{!report.products.length ? 'Create a product to start. Visits, contacts, and sales will appear here as your audience responds.' : published ? 'Share a published landing page with your audience. Visits, contacts, and sales will appear here as they come in.' : 'Publish a product’s landing page, then share it with your audience to start seeing results.'}</p>}
      </section>

      <section className="overview-products" aria-labelledby="overview-products-heading">
        <div className="overview-section-heading"><div><h2 id="overview-products-heading">Recent products</h2><p>Landing page status and results for the last {report.days} days.</p></div><a className="overview-text-link" href="/?view=library">All products <ArrowRight size={15} /></a></div>
        {report.products.length ? <div className="overview-product-list">{report.products.slice(0,4).map(product => <article className="overview-product" key={product.id}>
          <div className="overview-product-info"><h3><a href={`/?project=${product.id}&area=content`}>{product.title}</a></h3><span className={`overview-product-status ${product.published ? 'published' : ''}`}>{product.published ? <CircleCheck size={14} /> : <CircleDashed size={14} />}{product.published ? 'Landing page published' : 'Landing page not published'}</span></div>
          <p className="overview-product-activity" aria-label={`Last ${report.days} days: ${count(product.visits, 'visit')}, ${count(product.leads, 'contact')}, ${count(product.purchases, 'sale')}`}><span>{count(product.visits, 'visit')}</span><span>{count(product.leads, 'contact')}</span><span>{count(product.purchases, 'sale')}</span></p>
          <a className="overview-product-open" href={`/?project=${product.id}&area=content`}>Open product<ArrowRight size={16} /></a>
        </article>)}</div> : <div className="overview-products-empty"><h3>Everything starts with one product.</h3><p>Add your lessons, downloads, or mentorship. Your marketing tools will be inside the product.</p><a className="overview-text-link" href="/?view=create">Create your product <ArrowRight size={16} /></a></div>}
      </section>

      <details className="overview-details">
        <summary><span><strong>More details</strong><span>Daily activity, campaigns, and how your results are counted</span></span><ChevronDown size={19} /></summary>
        <div className="overview-details-content">
          {report.actions.length > 1 && <section className="overview-other-actions"><h3>Other next steps <span>· your workspace</span></h3><div>{report.actions.slice(1).map(action => <article key={action.title}><h4>{action.title}</h4><p>{action.reason}</p><a className="overview-text-link" href={action.href}>{action.label}<ArrowRight size={15} /></a></article>)}</div></section>}
          <section><h3>More activity <span>· Last {report.days} days</span></h3><dl className="overview-secondary-metrics"><div><dt>Bookings</dt><dd><strong>{number(report.bookings)}</strong><p>Confirmed bookings created in this period.</p></dd></div><div><dt>Video plays</dt><dd><strong>{number(report.plays)}</strong><p>Plays of your landing page video.</p></dd></div><div><dt>Button clicks</dt><dd><strong>{number(report.clicks)}</strong><p>Clicks on your landing page’s main button.</p></dd></div></dl></section>
          <div className="overview-detail-columns">
            <section><h3>Daily activity</h3><div className="overview-table-wrap overview-daily-table"><table><caption>Last {report.days} days, most recent first. Dates use UTC.</caption><thead><tr><th scope="col">Date</th><th scope="col">Visits</th><th scope="col">Contacts</th><th scope="col">Sales</th></tr></thead><tbody>{[...report.trend].reverse().map(day => <tr key={day.day}><th scope="row">{date(day.day)}</th><td>{number(day.visits)}</td><td>{number(day.leads)}</td><td>{number(day.purchases)}</td></tr>)}</tbody></table></div></section>
            <section><h3>Campaign traffic</h3><p className="overview-detail-intro">Share a campaign’s tracked link to see which messages bring visitors.</p>{report.sources.length ? <div className="overview-table-wrap"><table><caption>Last {report.days} days</caption><thead><tr><th scope="col">Campaign</th><th scope="col">Visits</th><th scope="col">Clicks</th></tr></thead><tbody>{report.sources.map(source => <tr key={source.campaign}><th scope="row">{source.campaign === 'direct' ? 'Direct / no campaign tag' : source.campaign}</th><td>{number(source.visits)}</td><td>{number(source.clicks)}</td></tr>)}</tbody></table></div> : <p className="overview-detail-empty">No recorded campaign visits in this period.</p>}</section>
          </div>
          <section className="overview-counting-notes"><h3>How these numbers work</h3><ul><li>All results use the selected period, including today, with days counted in UTC. Product publishing status shows its current state.</li><li>Visits are anonymous daily sessions, so they are not a count of individual people. Browsers with Do Not Track enabled are not recorded.</li><li>A contact is counted once per email address for each product. Contacts and sales are counted separately from visits; they do not form a conversion rate.</li><li>Product sales include orders that are currently paid. Refunded or revoked orders and purchases of FiveGen credits are excluded.</li><li>Revenue is the total on those paid product orders, before deducting fees or taxes. Different currencies are kept separate.</li><li>Bookings are counted by when they were created, rather than the appointment date.</li></ul></section>
        </div>
      </details>
    </>}
  </section>;
}
