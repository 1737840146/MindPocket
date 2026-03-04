import CallToAction from "@/components/call-to-action"
import ContentSection from "@/components/content-1"
import Features from "@/components/features-1"
import FooterSection from "@/components/footer"
import HeroSection from "@/components/hero-section"
import IntegrationsSection from "@/components/integrations-7"
import StatsSection from "@/components/stats"
import Testimonials from "@/components/testimonials"

export default function Home() {
  return (
    <div>
      <HeroSection />
      <Features />
      <IntegrationsSection />
      <ContentSection />
      <StatsSection />
      <Testimonials />
      <CallToAction />
      <FooterSection />
    </div>
  )
}
