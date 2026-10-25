import {ArrowRight,BookOpen,CalendarDays,Check,FileText,Globe,MessagesSquare,Route,Sparkles,Users} from 'lucide-react';
import Link from 'next/link';
import {Brand} from './ui-brand';
import './public-home.css';

const startHref='/signin-with-chatgpt?return_to=%2F%3Fview%3Dcreate';
const guides='https://docs.fivegen.ai';

export function PublicHome() {
  return <div className="public-home">
    <a className="public-home-skip" href="#main-content">Skip to content</a>
    <header className="public-home-header">
      <Link href="/" aria-label="FiveGen home"><Brand/></Link>
      <nav aria-label="Main navigation"><a href="#features">Features</a><a href="/pricing">Pricing</a><a href={guides}>Docs</a></nav>
      <a className="public-home-signin" href={startHref}>Sign in <ArrowRight size={16}/></a>
    </header>
    <main id="main-content">
      <section className="public-home-hero" aria-labelledby="public-home-title">
        <div className="public-home-hero-copy">
          <p className="public-home-eyebrow"><Sparkles size={15}/> An AI growth operator for creators</p>
          <h1 id="public-home-title">Your expertise.<br/><span>A clearer way to launch.</span></h1>
          <p className="public-home-intro">FiveGen helps you create, publish and sell digital products, with AI assistance for the work around them: sales pages, video scripts, funnel strategy and customer follow-up.</p>
          <p className="public-home-hero-note">Bring your own teaching, recordings and experience. Build the business around your voice.</p>
          <div className="public-home-actions"><a className="public-home-primary" href={startHref}>Start creating free <ArrowRight size={17}/></a><a className="public-home-text-link" href={guides+'/getting-started'}>See how FiveGen works <ArrowRight size={16}/></a></div>
          <p className="public-home-small">Start with a private draft. Review before you publish.</p>
        </div>
        <div className="public-home-journey" aria-label="How a product comes together in FiveGen">
          <div className="public-home-journey-heading"><span className="public-home-journey-mark"><Brand/></span><span>YOUR NEXT CHAPTER</span></div>
          <div className="public-home-journey-product"><span><BookOpen size={25}/></span><div><small>Start with what you know</small><strong>Your original product</strong><p>Lessons, resources or a service</p></div></div>
          <div className="public-home-journey-line" aria-hidden="true"/>
          <ol>
            <li><span className="public-home-journey-icon"><Globe size={20}/></span><div><strong>Give it a home</strong><p>A customizable sales page</p></div><Check size={16}/></li>
            <li><span className="public-home-journey-icon"><Route size={20}/></span><div><strong>Find your next move</strong><p>A visual funnel and content plan</p></div><Check size={16}/></li>
            <li><span className="public-home-journey-icon"><Users size={20}/></span><div><strong>Build the relationship</strong><p>Leads, customers and follow-up</p></div><Check size={16}/></li>
          </ol>
          <p className="public-home-journey-caption">One product brief. Connected tools. Your decisions.</p>
        </div>
      </section>

      <section className="public-home-formats" aria-labelledby="public-home-formats-title"><h2 id="public-home-formats-title">A workspace for what you teach, make and share.</h2><p>Build courses, books, guides, downloadable resources, communities, coaching or consulting offers.</p><a href={guides+'/create/choose-a-format'}>Find the right product format <ArrowRight size={16}/></a></section>

      <section id="features" className="public-home-features" aria-labelledby="public-home-features-title">
        <div className="public-home-section-heading"><p className="public-home-eyebrow">From first draft to customer</p><h2 id="public-home-features-title">The tools around your expertise.<br/>Working together.</h2><p>Keep your product, marketing and customer relationships in the same workspace. Start with the next useful step and add the tools you need.</p></div>
        <div className="public-home-feature-grid">
          <article><BookOpen size={24}/><h3>Create your product</h3><p>Write a lesson, upload a recording or organize resources. Build your own curriculum and give buyers a clear place to learn or access their purchase.</p><a href={guides+'/create/courses'}>Courses and lessons <ArrowRight size={15}/></a></article>
          <article><Globe size={24}/><h3>Publish your sales page</h3><p>Choose a page template and customize the sections, imagery and brand. Preview your offer on desktop and mobile, then publish when you are ready.</p><a href={guides+'/pages/design'}>Sales page design <ArrowRight size={15}/></a></article>
          <article><Route size={24}/><h3>Map a visual funnel</h3><p>Describe your audience, niche and content style. Explore ideas for getting discovered, building trust and inviting action, with hooks and recording steps to review.</p><a href={guides+'/marketing/funnel-builder'}>Funnel Builder <ArrowRight size={15}/></a></article>
          <article><FileText size={24}/><h3>Prepare your marketing</h3><p>Reuse one product brief across sales video scripts, lead pages and campaigns. Bring approved stories and source material from your Creator Library into your drafts.</p><a href={guides+'/marketing/sales-video'}>Sales video scripts <ArrowRight size={15}/></a></article>
          <article><MessagesSquare size={24}/><h3>Know who to follow up with</h3><p>Keep leads, applications and customers together in CRM. Prepare email sequences, review the audience and sending rules, then activate when your sender is ready.</p><a href={guides+'/marketing/campaigns-and-emails'}>Campaigns and email <ArrowRight size={15}/></a></article>
          <article><CalendarDays size={24}/><h3>See the plan in Calendar</h3><p>Plan content across your account profiles and products in one shared Calendar. See scheduled reminders alongside campaigns, then review visits, inquiries and purchases in Results.</p><a href={guides+'/workspace/calendar'}>Calendar and planning <ArrowRight size={15}/></a></article>
        </div>
      </section>

      <section className="public-home-how" aria-labelledby="public-home-how-title">
        <div><p className="public-home-eyebrow">Your work. Your voice.</p><h2 id="public-home-how-title">You bring the experience.<br/>FiveGen helps with the launch.</h2><p>Your expertise gives the product its value. AI can help you shape an offer or prepare marketing drafts, while you decide what is accurate and ready to share.</p><a className="public-home-text-link" href={guides+'/marketing/creator-voice'}>Explore the Creator Library <ArrowRight size={16}/></a></div>
        <ol><li><span>01</span><div><h3>Make something useful</h3><p>Start manually, upload existing content or ask AI to help you plan. Your draft stays private.</p></div></li><li><span>02</span><div><h3>Review your offer and page</h3><p>Check the content, set the price and access terms, and connect seller payments through Stripe Connect.</p></div></li><li><span>03</span><div><h3>Launch, learn and improve</h3><p>Publish your page, plan a campaign and follow up with interested people. Use recorded activity to choose your next action.</p></div></li></ol>
      </section>

      <section className="public-home-faq" aria-labelledby="public-home-faq-title"><div><p className="public-home-eyebrow">Before you begin</p><h2 id="public-home-faq-title">A few useful answers.</h2><p>Detailed guides are available in <a href={guides}>FiveGen Docs</a>.</p></div><div>
        <details><summary>What is FiveGen?</summary><p>FiveGen is a workspace for creators to build and sell digital products, with optional AI growth assistance. It brings product content, customizable sales pages, funnel planning, marketing drafts, CRM and a shared Calendar together.</p></details>
        <details><summary>Can I use FiveGen without AI?</summary><p>Yes. You can create your product manually, upload your own files or recordings, and edit your pages yourself. AI assistance is optional; generation uses the credits and limits shown before you run it.</p></details>
        <details><summary>Is FiveGen free to start?</summary><p>FiveGen has a Free plan, paid creator plans and optional AI credit top-ups. Selling fees and payment processing may apply. <a href="/pricing">See current plans, limits and fees</a> before choosing.</p></details>
        <details><summary>How do I accept payments for my products?</summary><p>Connect your seller account with Stripe Connect, configure your offer and complete the launch checks. Payment availability depends on your account and region. Your FiveGen subscription and your customers’ product purchases are separate. <a href={guides+'/sell/connect-payments'}>Read the seller payment guide</a>.</p></details>
        <details><summary>Does Calendar automatically publish to social media?</summary><p>No. Calendar organizes content plans and reminders across your account profiles. Adding an account profile does not connect its social platform or publish a post. You choose when and where to publish.</p></details>
      </div></section>

      <section className="public-home-final" aria-labelledby="public-home-final-title"><p className="public-home-eyebrow">Your next chapter starts here</p><h2 id="public-home-final-title">Give your expertise a place to grow.</h2><p>Start with one product. Build the next step around it.</p><div className="public-home-actions"><a className="public-home-primary" href={startHref}>Create your first product <ArrowRight size={17}/></a><a className="public-home-text-link" href="/pricing">Explore plans <ArrowRight size={16}/></a></div></section>
    </main>
    <footer className="public-home-footer"><div><Link href="/" aria-label="FiveGen home"><Brand/></Link><p>Create, publish and sell digital products.</p></div><nav aria-label="Resources"><a href="/pricing">Pricing</a><a href={guides}>Documentation</a><a href="mailto:kamzewac@gmail.com">Contact support</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refund policy</a></nav></footer>
  </div>;
}
