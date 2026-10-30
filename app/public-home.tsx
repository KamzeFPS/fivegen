import {ArrowRight,Check} from 'lucide-react';
import Link from 'next/link';
import {Brand} from './ui-brand';
import {PublicLaunchExample} from './public-launch-example';
import {PublicHomeComposer,PublicHomeHeader,PublicHomeShowcase} from './public-home-composer';
import './public-home.css';

const guides='https://docs.fivegen.ai';

export function PublicHome() {
  return <div className="public-home">
    <a className="public-home-skip" href="#main-content">Skip to content</a>
    <div className="public-home-studio-backdrop" aria-hidden="true"/>
    <PublicHomeHeader/>
    <main id="main-content">
      <section className="public-home-hero" aria-labelledby="public-home-title">
        <h1 id="public-home-title">Turn your ideas into<br/><span>digital products.</span></h1>
        <p className="public-home-intro">Create ebooks, invitations and colouring books. Then build a plan to sell them.</p>
        <PublicHomeComposer/>
      </section>

      <PublicHomeShowcase/>

      <section id="how-it-works" className="public-home-launch" aria-labelledby="public-home-launch-title">
        <div className="public-home-launch-heading"><div><p className="public-home-eyebrow">How it works</p><h2 id="public-home-launch-title">From your first idea<br/>to your next chapter.</h2></div><div><p>FiveGen helps you create, publish and sell digital products. Shape your idea, make the product, then build the page and plan around it.</p><a className="public-home-text-link" href="#create">Start with your idea <ArrowRight size={16}/></a></div></div>
        <div id="product" className="public-home-example"><PublicLaunchExample/></div>
      </section>

      <section className="public-home-connected" aria-labelledby="public-home-connected-title">
        <div className="public-home-connected-heading"><p className="public-home-eyebrow">Make it. Share it. Grow it.</p><h2 id="public-home-connected-title">Your creative work.<br/>A place to grow.</h2><p>Explain who you help and what you want to make. Carry that context into the work around your product.</p><a className="public-home-text-link" href={guides+'/marketing/growth-plan'}>Explore the marketing workflow <ArrowRight size={16}/></a></div>
        <ol className="public-home-connected-list">
          <li><span>01</span><div><h3>Start with what is yours.</h3><p>Your recordings, notes, stories and experience. Keep approved sources in your Creator Library, then choose what AI can use.</p><a href={guides+'/marketing/creator-voice'}>Creator Library <ArrowRight size={14}/></a></div></li>
          <li><span>02</span><div><h3>Give people a reason to care.</h3><p>Shape the offer in Offer Lab. Prepare a sales video, map a visual funnel and coordinate campaigns around the same product brief.</p><a href={guides+'/marketing/funnel-builder'}>Funnel Builder <ArrowRight size={14}/></a></div></li>
          <li><span>03</span><div><h3>Know the next person to help.</h3><p>Keep leads, applications and customers together in CRM. Plan your content in Calendar and use Results to see what needs attention.</p><a href={guides+'/workspace/calendar'}>Calendar and planning <ArrowRight size={14}/></a></div></li>
        </ol>
      </section>

      <section className="public-home-formats" aria-labelledby="public-home-formats-title"><p className="public-home-eyebrow">Make it your own</p><h2 id="public-home-formats-title">A course. A guide. A fresh idea.<br/><span>There’s a format for it.</span></h2><p>Books, courses, editable designs, downloads, communities and coaching. Choose the format that fits your idea, and make it your own.</p><ul><li><Check size={16}/>Your original content</li><li><Check size={16}/>Customizable sales pages</li><li><Check size={16}/>A customer portal for access</li></ul><a className="public-home-text-link" href={guides+'/create/choose-a-format'}>Find your format <ArrowRight size={16}/></a></section>

      <section className="public-home-faq" aria-labelledby="public-home-faq-title"><div><p className="public-home-eyebrow">Before you begin</p><h2 id="public-home-faq-title">A few useful<br/><em>answers.</em></h2><p>Need a hand? Start with <a href={guides}>FiveGen Docs</a>.</p></div><div>
        <details><summary>What is FiveGen?</summary><p>FiveGen is a workspace for creators to build and sell digital products, with optional AI growth assistance. Your product, sales page, visual funnel, marketing, CRM and Calendar work together around your expertise.</p></details>
        <details><summary>What can I make with FiveGen?</summary><p>Create written products such as ebooks and course drafts, or use Design studio for editable invitations, colouring pages, worksheets and planners. Bring your own recordings and resources. Review AI drafts and artwork before exporting or publishing.</p></details>
        <details><summary>What happens when I click Make it?</summary><p>Your idea and selected files stay in this browser while you sign in. You can review and send them to Gen in your workspace. Gen helps you choose the next step; your product stays private until you publish.</p></details>
        <details><summary>Is FiveGen free to start?</summary><p>Yes. FiveGen has a Free plan, paid creator plans and optional AI credit top-ups. Selling fees and payment processing may apply. <a href="/pricing">See current plans, limits and fees</a> before choosing.</p></details>
        <details><summary>How do I accept payments?</summary><p>Connect your seller account with Stripe Connect, set your price and access terms, then complete the launch checks. Payment availability depends on your account and region. Your FiveGen plan and your customers’ purchases are separate. <a href={guides+'/sell/connect-payments'}>Read the seller payment guide</a>.</p></details>
        <details><summary>Will Calendar publish my posts automatically?</summary><p>Calendar organizes content plans and reminders across your account profiles. Adding a profile does not connect its social platform or publish a post. You choose when and where to publish.</p></details>
        <details><summary>Can FiveGen send emails for me?</summary><p>Prepare a sequence, review its audience and sending rules, and connect a ready sender. You approve and activate the sequence. Sales emails stop when a contact buys the product.</p></details>
      </div></section>

      <section className="public-home-final" aria-labelledby="public-home-final-title"><p className="public-home-eyebrow">Your next chapter starts here</p><h2 id="public-home-final-title">Your idea deserves<br/><span>a beginning.</span></h2><p>Start with one idea. See what you can make.</p><a className="public-home-primary" href="#create">Create your first product <ArrowRight size={19}/></a><span>No need to have it all figured out.</span></section>
    </main>
    <footer className="public-home-footer"><div><Link href="/" aria-label="FiveGen home"><Brand/></Link><p>Your expertise. Your next chapter.</p></div><nav aria-label="Resources"><a href="/pricing">Pricing</a><a href={guides}>Documentation</a><a href="mailto:kamzewac@gmail.com">Contact support</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refund policy</a></nav></footer>
  </div>;
}
