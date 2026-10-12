import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui/icons.tsx'
import { Page } from '../../ui/Page.tsx'
import { IMAGERY_ATTRIBUTION } from '../map/credits.ts'

function Row({ href, icon, tone, title, sub }: { href: string; icon: IconName; tone: string; title: string; sub: string }) {
  return (
    <a className="info-row" href={href} target="_blank" rel="noopener noreferrer">
      <span className="info-icon" data-tone={tone}>
        <Icon name={icon} size={22} />
      </span>
      <span className="row-text">
        <strong>{title}</strong>
        <span className="muted">{sub}</span>
      </span>
      <Icon name="external" size={22} className="chev" />
    </a>
  )
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h2 className="eyebrow-lg">{title}</h2>
    <div className="card-stack">{children}</div>
  </section>
)

export function ContributePage() {
  return (
    <Page title="Contribute" back={false}>
      <div className="hero">
        <span className="hero-icon">
          <Icon name="contribute" size={36} />
          <i>
            <Icon name="heart" size={14} />
          </i>
        </span>
        <h2>Help Improve UTM Move</h2>
        <p>Your contributions make this app better for everyone in the campus</p>
      </div>
      <Section title="Contribute to Map">
        <Row href="https://www.openstreetmap.org/edit#map=16/1.56063/103.64036" icon="map" tone="orange" title="Edit on OpenStreetMap" sub="Help improve campus map data" />
      </Section>
      <Section title="About">
        <Row href="https://github.com/r64genji/UTM-Move" icon="code" tone="gray" title="View on GitHub" sub="Check out the source code" />
        <Row href="mailto:tabe259@yahoo.com" icon="mail" tone="blue" title="Contact Developer" sub="Send an email directly" />
      </Section>
      <Section title="Credits">
        <p className="credits">
          Map data{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            © OpenStreetMap contributors
          </a>
          . Basemap by{' '}
          <a href="https://protomaps.com" target="_blank" rel="noopener noreferrer">
            Protomaps
          </a>
          . {IMAGERY_ATTRIBUTION}. Bus timetables from UTM Transport Services.
        </p>
      </Section>
      <footer className="made-by">
        <p>Made by Abraham Tan, with love, for UTM students</p>
      </footer>
    </Page>
  )
}
